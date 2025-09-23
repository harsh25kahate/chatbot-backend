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

    const { message } = validation.data;

    // Fetch all yojanas
    const allYojanas = await fetchYojanas();

    // Prepare prompt for Gemini
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `
You are a helpful assistant for the Divyang Portal in India. 
Respond appropriately in the user's language (Marathi, Hindi, or English).
Focus only on portal-related queries: login, registration, or yojanas (schemes) for disabled persons.
If the query is about login, provide the login link: [{ label: 'Login to Divyang Portal', url: 'https://divyangparbhani.altwise.in/home/login' }]
If the query is about registration, provide the register link: [{ label: 'Register on Divyang Portal', url: 'https://divyangparbhani.altwise.in/home/newregistration' }]
For yojana queries, use the provided yojanas data to filter and respond based on user criteria like age, disability type, percentage, publisher, etc.
Understand and extract criteria from the user message naturally.
If no matching yojanas, say so politely.
If the query is outside scope, respond: "मी फक्त दिव्यांग पोर्टल संबंधी प्रश्न (लॉगिन, नोंदणी, किंवा योजना) यांच्या उत्तरे देऊ शकतो." and provide login/register links.

Yojanas data (JSON array):
${JSON.stringify(allYojanas)}

Each yojana has fields: YojanaId, YojanaName, YojanaDescription, Start_Age, UpTo_Age, YojanaApplayLastDate, YojanaPublishDate, tblYojanaDivyangTypePercentages, tblDivyangTypes, PublishedBy

User message: "${message}"

Respond strictly in this JSON format:
{
  "message": "your response text",
  "links": [] or array of link objects like [{ label: 'text', url: 'url' }],
  "yojanas": [] or array of matching yojana objects (include all fields, add DisabilityType: tblDivyangTypes if needed)
}
Do not add extra text outside JSON.
`;

    const result = await model.generateContent(prompt);
    let aiResponse = result.response.text();

    // Clean and parse AI response
    aiResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(aiResponse);

    return res.json({
      message: parsed.message || 'माफ करा, काहीतरी चुकलं.',
      links: parsed.links || [],
      yojanas: parsed.yojanas || []
    });

  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ 
      message: 'Internal server error',
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