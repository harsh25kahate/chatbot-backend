import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { z } from 'zod';
import fetch from 'node-fetch';
import { GoogleGenerativeAI } from '@google/generative-ai';
import https from "https";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Gemini AI
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

if (!genAI) {
  console.error('GEMINI_API_KEY is required');
  process.exit(1);
}

app.use(express.json({ limit: '1mb' }));
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:44308',
    'http://192.168.1.41:44308',
    /\.railway\.app$/
  ],
  credentials: true
}));

const chatRequestSchema = z.object({
  message: z.string().min(1),
  context: z.object({
    userId: z.string().optional(),
    locale: z.string().optional(),
    app: z.string().optional()
  }).optional()
});

// In-memory user sessions for conversation context
const userSessions = new Map();

// Initialize user session
function initializeSession(userId) {
  if (!userSessions.has(userId)) {
    userSessions.set(userId, {
      conversationHistory: [],
      lastLanguage: 'mr' // Force Marathi
    });
  }
  return userSessions.get(userId);
}

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Fetch Yojanas with error handling
async function fetchYojanas() {
  try {
    const agent = new https.Agent({ rejectUnauthorized: false });

    const res = await fetch(
      "https://mocki.io/v1/b30e9cf8-f692-4715-b2fc-81523b67f6c7",
      // "https://divyangparbhani.altwise.in/api/value/yojanas",
      { agent }
    );

    if (!res.ok) throw new Error("API response not ok");
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("Error fetching yojanas:", err);
    return [];
  }
}

// Main chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const validation = chatRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        message: 'प्रिय दिव्यांग, अयशस्वी विनंती. कृपया पुन्हा प्रयत्न करा.', 
        errors: validation.error.errors,
        links: [],
        yojanas: []
      });
    }

    const { message, context = {} } = validation.data;
    const userId = context.userId || 'default';
    const session = initializeSession(userId);
    
    // Force Marathi language for all responses
    const userLanguage = 'mr';
    session.lastLanguage = userLanguage;

    // Add user message to conversation history
    session.conversationHistory.push({ type: 'user', message, timestamp: new Date() });

    // Fetch all yojanas
    const allYojanas = await fetchYojanas();

    // Prepare prompt for Gemini with optimized conversation logic
   const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const prompt = `
You are a friendly assistant for the Divyang Portal in India. 
Always respond in Marathi (mr) and address the user respectfully as "प्रिय दिव्यांग" in the response message.
Understand the user's query naturally, regardless of the input language, and respond conversationally in Marathi.
For greetings like "hello," "hi," "नमस्कार," "how are you," or similar, respond conversationally with a matching greeting and offer help without including links (e.g., "प्रिय दिव्यांग, नमस्कार! तुम्हाला कशी मदत करू?").
Focus on portal-related queries: login, registration, or yojanas for disabled persons.
For login queries (e.g., containing "login," "लॉगिन," or "sign in"), provide only: [{ label: 'दिव्यांग पोर्टलवर लॉगिन करा', url: 'https://divyangahilyanagar.altwise.in/home/login' }]
For registration queries (e.g., containing "register," "नोंदणी," or "registration"), provide only: [{ label: 'दिव्यांग पोर्टलवर नोंदणी करा', url: 'https://divyangahilyanagar.altwise.in/home/newregistration' }]
For yojana queries, use the provided yojanas data to filter based on user criteria (age, disability type, percentage, publisher, etc.).
Extract criteria naturally from the user message.
If no matching yojanas, respond politely with no results found (e.g., "प्रिय दिव्यांग, तुमच्या निकषांशी जुळणारी कोणतीही योजना सापडली नाही.").
For out-of-scope queries (e.g., contact info), respond politely without mentioning limits. Gently suggest visiting the portal for more details and offer help with login, registration, or schemes without including links unless explicitly requested. 
Example for out-of-scope: "प्रिय दिव्यांग, अधिक माहितीसाठी आमच्या पोर्टलला भेट द्या. तुम्हाला लॉगिन, नोंदणी किंवा योजनांबद्दल मदत हवी आहे का?"
Do not include links unless the query explicitly mentions login or registration.
Avoid hardcoded responses; understand the user's intent naturally and respond conversationally.
Keep responses concise, friendly, and engaging.

Yojanas data (JSON array):
${JSON.stringify(allYojanas)}

Each yojana has fields: YojanaId, YojanaName, YojanaDescription, Start_Age, UpTo_Age, YojanaApplayLastDate, YojanaPublishDate, tblYojanaDivyangTypePercentages, tblDivyangTypes, PublishedBy

User message: "${message}"
User language: ${userLanguage}
Conversation history: ${JSON.stringify(session.conversationHistory.slice(-3))} // Last 3 messages for context

Respond strictly in this JSON format:
{
  "message": "your friendly response text starting with 'प्रिय दिव्यांग'",
  "links": [] or array of link objects like [{ label: 'text', url: 'url' }],
  "yojanas": [] or array of matching yojana objects (include all fields, add DisabilityType: tblDivyangTypes if needed)
}
Do not add extra text outside JSON.
`;

    const result = await model.generateContent(prompt);
    let aiResponse = result.response.text();

    // Clean and parse AI response
    aiResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(aiResponse);
    } catch (parseError) {
      console.error('AI response parsing error:', parseError);
      parsed = {
        message: 'प्रिय दिव्यांग, माफ करा, काहीतरी चुकलं. कृपया पुन्हा प्रयत्न करा.',
        links: [],
        yojanas: []
      };
    }

    // Add bot response to conversation history
    session.conversationHistory.push({ type: 'bot', message: parsed.message, timestamp: new Date() });

    return res.json({
      message: parsed.message,
      links: parsed.links || [],
      yojanas: parsed.yojanas || []
    });

  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ 
      message: 'प्रिय दिव्यांग, माफ करा, सर्व्हरमध्ये त्रुटी आली आहे.',
      links: [],
      yojanas: []
    });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🟢 Health: http://localhost:${PORT}/api/health`);
});