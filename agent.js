import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { z } from 'zod';
import fetch from 'node-fetch';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
      lastLanguage: 'en' // Default language
    });
  }
  return userSessions.get(userId);
}

// Detect user language from message
function detectLanguage(message) {
  const marathiRegex = /[\u0900-\u097F]/; // Devanagari script for Marathi/Hindi
  const hindiRegex = /[\u0900-\u097F]/; // Same script for Hindi
  if (marathiRegex.test(message)) return 'mr';
  if (hindiRegex.test(message)) return 'hi';
  return 'en';
}

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Fetch Yojanas with error handling
async function fetchYojanas() {
  try {
    const res = await fetch('https://mocki.io/v1/b30e9cf8-f692-4715-b2fc-81523b67f6c7');
    if (!res.ok) throw new Error('API response not ok');
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Error fetching yojanas:', err);
    return [];
  }
}

// Main chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const validation = chatRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        message: 'Invalid request', 
        errors: validation.error.errors,
        links: [],
        yojanas: []
      });
    }

    const { message, context = {} } = validation.data;
    const userId = context.userId || 'default';
    const session = initializeSession(userId);
    
    // Detect user language
    const userLanguage = context.locale || detectLanguage(message);
    session.lastLanguage = userLanguage;

    // Add user message to conversation history
    session.conversationHistory.push({ type: 'user', message, timestamp: new Date() });

    // Fetch all yojanas
    const allYojanas = await fetchYojanas();

    // Prepare prompt for Gemini with optimized conversation logic
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `
You are a friendly assistant for the Divyang Portal in India. 
Always respond in the user's language: Marathi (mr), Hindi (hi), or English (en).
For greetings like "hello," "hi," "नमस्कार," "how are you," or similar, respond conversationally with a matching greeting and offer help without including links (e.g., "हाय! मी ठीक आहे, तुम्हाला कशी मदत करू?").
Focus on portal-related queries: login, registration, or yojanas for disabled persons.
For login queries (e.g., containing "login," "लॉगिन," or "sign in"), provide only: [{ label: 'Login to Divyang Portal', url: 'https://divyangparbhani.altwise.in/home/login' }]
For registration queries (e.g., containing "register," "नोंदणी," or "registration"), provide only: [{ label: 'Register on Divyang Portal', url: 'https://divyangparbhani.altwise.in/home/newregistration' }]
For yojana queries, use the provided yojanas data to filter based on user criteria (age, disability type, percentage, publisher, etc.).
Extract criteria naturally from the user message.
If no matching yojanas, respond politely with no results found.
For out-of-scope queries (e.g., contact info), respond politely without mentioning limits. Gently suggest visiting the portal for more details and offer help with login, registration, or schemes without including links unless explicitly requested. 
Example for out-of-scope: 
- Marathi: "हाय! अधिक माहितीसाठी आमच्या पोर्टलला भेट द्या. तुम्हाला लॉगिन, नोंदणी किंवा योजनांबद्दल मदत हवी आहे का?"
- Hindi: "हाय! अधिक जानकारी के लिए हमारे पोर्टल पर जाएँ। क्या आपको लॉगिन, रजिस्ट्रेशन या योजनाओं के बारे में मदद चाहिए?"
- English: "Hi! For more details, please visit our portal. Can I help with login, registration, or schemes?"
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
  "message": "your friendly response text",
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
        message: userLanguage === 'mr' ? 'हाय! माफ करा, काहीतरी चुकलं. कृपया पुन्हा प्रयत्न करा.' :
                 userLanguage === 'hi' ? 'हाय! माफ करें, कुछ गलत हो गया। कृपया फिर से कोशिश करें।' :
                 'Hi! Sorry, something went wrong. Please try again.',
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
    const errorMessage = session?.lastLanguage === 'mr' ? 'हाय! माफ करा, सर्व्हरमध्ये त्रुटी आली आहे.' :
                        session?.lastLanguage === 'hi' ? 'हाय! माफ करें, सर्वर में त्रुटि हुई है।' :
                        'Hi! Sorry, a server error occurred.';
    res.status(500).json({ 
      message: errorMessage,
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