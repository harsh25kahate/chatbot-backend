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
    locale: z.string().optional()
  }).optional()
});

const linkCatalog = {
  login: [{ label: 'Login to Divyang Portal', url: 'https://divyangparbhani.altwise.in/home/login' }],
  register: [{ label: 'Register on Divyang Portal', url: 'https://divyangparbhani.altwise.in/home/newregistration' }],
  fallback: "I can help only with Divyang Portal queries (login, registration, or yojanas)."
};

// In-memory session
const userContext = new Map();

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Fetch Yojanas
async function fetchYojanas() {
  try {
    const res = await fetch('https://mocki.io/v1/b30e9cf8-f692-4715-b2fc-81523b67f6c7');
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(err);
    return [];
  }
}

// Detect age
function detectAge(msg) {
  const match = msg.match(/\b(\d{1,2})\b/);
  if (!match) return null;
  const age = parseInt(match[1]);
  return age >= 1 && age <= 100 ? age : null;
}

// Detect disability
function detectDisability(msg) {
  const text = msg.toLowerCase();
  if (['blind','vision','अंध'].some(k => text.includes(k))) return 'vision';
  if (['deaf','hearing','कर्णबधीर'].some(k => text.includes(k))) return 'hearing';
  if (['physical','locomotor','अस्थिव्यंग'].some(k => text.includes(k))) return 'physical';
  return null;
}

// Parse structured message
function parseStructuredQuery(msg) {
  const match = msg.match(/Age: (\d+), Disability: (.+?), Percentage: (\d+)/i);
  if (!match) return null;
  return { age: parseInt(match[1]), disabilityType: match[2].trim(), percentage: parseInt(match[3]) };
}

// Filter Yojanas
function filterYojanas(yojanas, criteria) {
  const { age, disabilityType } = criteria;
  return yojanas.filter(y => {
    const start = y.Start_Age || 0, end = y.UpTo_Age || 100;
    const ageMatch = age >= start && age <= end;
    if (!disabilityType) return ageMatch;
    const yDis = (y.DisabilityType || '').toLowerCase();
    return yDis.includes(disabilityType.toLowerCase()) || disabilityType.toLowerCase().includes(yDis);
  });
}

// Main chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const validation = chatRequestSchema.safeParse(req.body);
    if (!validation.success) return res.status(400).json({ message: 'Invalid request', errors: validation.error.errors });

    const { message, context = {} } = validation.data;
    const userId = context.userId || 'default';

    if (!userContext.has(userId)) userContext.set(userId, { age: null, disability: null });
    const session = userContext.get(userId);

    const lowerMsg = message.toLowerCase();

    // Quick responses for login/register
    if (lowerMsg.includes('login')) return res.json({ message: 'Login here:', links: linkCatalog.login, yojanas: [] });
    if (lowerMsg.includes('register')) return res.json({ message: 'Register here:', links: linkCatalog.register, yojanas: [] });

    // Structured query
    const structured = parseStructuredQuery(message);
    const allYojanas = await fetchYojanas();
    if (structured) {
      const filtered = filterYojanas(allYojanas, structured).slice(0,3);
      const msg = filtered.length > 0 ? `Found ${filtered.length} schemes matching your criteria.` : "No schemes found for your criteria.";
      return res.json({ message: msg, links: [], yojanas: filtered });
    }

    // Detect age/disability from message
    const age = detectAge(message);
    const disability = detectDisability(message);
    if (age) session.age = age;
    if (disability) session.disability = disability;

    const isYojanaQuery = ['yojana','scheme','योजना'].some(k => lowerMsg.includes(k));

    // Ask age if missing
    if (isYojanaQuery && !session.age) return res.json({ message: 'Please provide your age to suggest suitable schemes.', links: [], yojanas: [] });

    // Return filtered Yojanas if age known
    if (session.age && isYojanaQuery) {
      const filtered = filterYojanas(allYojanas, { age: session.age, disabilityType: session.disability }).slice(0,3);
      const msg = filtered.length > 0 ? `Based on your age (${session.age})${session.disability ? ' and disability ('+session.disability+')' : ''}, here are suitable schemes:` : 'No schemes found for your criteria.';
      return res.json({ message: msg, links: [], yojanas: filtered });
    }

    // If not a Yojana query → fallback to Gemini AI
    if (!genAI) return res.json({ message: linkCatalog.fallback, links: [...linkCatalog.login, ...linkCatalog.register], yojanas: [] });

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `
You are an assistant for Divyang Portal.
Focus only on portal queries (login, registration, yojanas). If outside scope, politely say you can't answer.
Respond concisely and in JSON:
{
  "message": "...",
  "links": [{"label": "...", "url":"..."}],
  "yojanas": []
}
User message: ${message}
`;
      const result = await model.generateContent(prompt);
      let aiResponse = result.response.text();
      let parsed;
      try { 
        aiResponse = aiResponse.replace(/```json\n?/g,'').replace(/```\n?/g,'');
        parsed = JSON.parse(aiResponse);
      } catch {
        parsed = { message: linkCatalog.fallback, links: [...linkCatalog.login, ...linkCatalog.register], yojanas: [] };
      }

      // Validate links
      const validLinks = (parsed.links || []).filter(l => [...linkCatalog.login, ...linkCatalog.register].some(k => k.url === l.url));

      return res.json({ message: parsed.message || linkCatalog.fallback, links: validLinks, yojanas: [] });

    } catch (aiErr) {
      console.error(aiErr);
      return res.json({ message: linkCatalog.fallback, links: [...linkCatalog.login, ...linkCatalog.register], yojanas: [] });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error', links: [], yojanas: [] });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🟢 Health: http://localhost:${PORT}/api/health`);
});
