import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { z } from 'zod';
import fetch from 'node-fetch';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Gemini AI
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// Middleware
app.use(express.json({ limit: '1mb' }));

// CORS configuration
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

// Validation schema
const chatRequestSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  context: z.object({
    userId: z.string().optional(),
    locale: z.string().optional(),
    app: z.string().optional(),
    awaitingAge: z.boolean().optional()
  }).optional()
});

// Resource catalog
const linkCatalog = {
  login: [
    { label: 'Login to Divyang Portal', url: 'https://divyangparbhani.altwise.in/home/login' }
  ],
  register: [
    { label: 'Register on Divyang Portal', url: 'https://divyangparbhani.altwise.in/home/newregistration' }
  ],
  contact: [
    { label: 'Contact Support', url: 'https://divyangparbhani.altwise.in/home/contact' }
  ],
  fallback: "I can help with disability schemes, portal navigation, and answer your queries."
};

// Session store for conversation memory
const userSessions = new Map();

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Function to fetch Yojanas from external API
async function fetchYojanas() {
  try {
    const response = await fetch('https://mocki.io/v1/b30e9cf8-f692-4715-b2fc-81523b67f6c7');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    // Normalize field names for consistency
    const normalizedData = Array.isArray(data) ? data.map(yojana => ({
      ...yojana,
      DisabilityType: yojana.tblDivyangTypes || yojana.DisabilityType || '',
      Description: yojana.YojanaDescription || yojana.Description || '',
      PercentageRequired: yojana.tblYojanaDivyangTypePercentages || yojana.PercentageRequired || 0
    })) : [];
    
    return normalizedData;
  } catch (error) {
    console.error('Error fetching Yojanas:', error);
    return [];
  }
}

// Exact disability type mapping for Marathi types
const disabilityTypeMap = {
  "पूर्णतः अंध (Blindness)": ["पूर्णतः अंध", "blindness", "blind"],
  "अंशतः अंध (Low Vision)": ["अंशतः अंध", "low vision", "partial blind"],
  "कर्णबधीर (Hearing Impairment)": ["कर्णबधीर", "hearing", "deaf"],
  "वाचा दोष (Speech and Language Disability)": ["वाचा दोष", "speech", "language"],
  "अस्थिव्यंग (Locomotor Disability)": ["अस्थिव्यंग", "locomotor", "physical"],
  "मानसिक आजार (Mental Illness)": ["मानसिक आजार", "mental illness", "mental"],
  "अध्ययन अक्षम (Learning Disability)": ["अध्ययन अक्षम", "learning disability", "learning"],
  "मेंदूचा पक्षाघात (Cerebral Palsy)": ["मेंदूचा पक्षाघात", "cerebral palsy", "cerebral"],
  "स्वमग्न (Autism)": ["स्वमग्न", "autism", "autistic"],
  "बहुविकलांग (Multiple Disability)": ["बहुविकलांग", "multiple disability", "multiple"],
  "कुष्ठरोग (Leprosy Cured Persons)": ["कुष्ठरोग", "leprosy", "leprosy cured"],
  "बुटकेपणा (Dwarfism)": ["बुटकेपणा", "dwarfism", "dwarf"],
  "बौद्धिक अक्षमता (Intellectual Disability)": ["बौद्धिक अक्षमता", "intellectual disability", "intellectual"],
  "माशपेशीय क्षरण (Muscular Disability)": ["माशपेशीय क्षरण", "muscular disability", "muscular"],
  "मज्जासंस्थेचे तीव्र आजार (Neurological Conditions)": ["मज्जासंस्थेचे तीव्र आजार", "neurological", "neurological conditions"],
  "मल्टिपल स्क्लेरोसिस(Multiple sclerosis)": ["मल्टिपल स्क्लेरोसिस", "multiple sclerosis", "sclerosis"],
  "थॅलेसिमिया (Thalassemia)": ["थॅलेसिमिया", "thalassemia", "thalassemic"],
  "अधिक रक्तस्त्राव (Hemophilia)": ["अधिक रक्तस्त्राव", "hemophilia", "bleeding"],
  "सिकल सेल (Sickle Cell Disease)": ["सिकल सेल", "sickle cell", "sickle"],
  "अॅसिड अटॅक (Acid Attack Victim)": ["अॅसिड अटॅक", "acid attack", "acid"],
  "कंपवात रोग (Parkinson's Disease)": ["कंपवात रोग", "parkinson", "parkinsons"]
};

// Stage 1: Smart Filtering Functions

// Detect age from message
function detectAge(message) {
  const agePatterns = [
    /\bAge:\s*(\d{1,2})\b/i,
    /\b(\d{1,2})\s*(?:year|years|वर्ष|साल)/i,
    /age\s*(?:is\s*)?(\d{1,2})/i,
    /वय\s*(\d{1,2})/i,
    /\b(\d{1,2})\s*वर्षाच्या/i,
    /\b(\d{1,2})\b/
  ];
  
  for (const pattern of agePatterns) {
    const match = message.match(pattern);
    if (match) {
      const age = parseInt(match[1]);
      return (age >= 1 && age <= 100) ? age : null;
    }
  }
  return null;
}

// Detect exact disability type from message
function detectDisabilityType(message) {
  const lowerMessage = message.toLowerCase();
  
  // Check for exact disability types first (for form submissions)
  for (const [exactType, keywords] of Object.entries(disabilityTypeMap)) {
    // Check if message contains the exact disability type
    if (message.includes(exactType)) {
      return exactType;
    }
    
    // Check for keywords
    for (const keyword of keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        return exactType;
      }
    }
  }
  
  return null;
}

// Stage 1: Smart Pre-filtering
function applySmartFilters(yojanas, message) {
  let filteredYojanas = [...yojanas];
  
  console.log(`Starting with ${filteredYojanas.length} yojanas`);
  
  // Filter by age if detected
  const age = detectAge(message);
  if (age) {
    console.log(`Filtering by age: ${age}`);
    filteredYojanas = filteredYojanas.filter(yojana => {
      const startAge = yojana.Start_Age || 0;
      const upToAge = yojana.UpTo_Age || 100;
      const ageMatch = age >= startAge && age <= upToAge;
      if (ageMatch) {
        console.log(`Age match for: ${yojana.YojanaName} (${startAge}-${upToAge})`);
      }
      return ageMatch;
    });
  }
  
  // Filter by disability type if detected
  const disabilityType = detectDisabilityType(message);
  if (disabilityType) {
    console.log(`Filtering by disability: ${disabilityType}`);
    filteredYojanas = filteredYojanas.filter(yojana => {
      const yojanaDisability = yojana.DisabilityType || '';
      
      // Check if yojana disability contains the detected type (remove numbering)
      const cleanYojanaDisability = yojanaDisability.replace(/^\d+\)\s*/, '');
      const cleanDetectedType = disabilityType.replace(/^\d+\)\s*/, '');
      
      const match = cleanYojanaDisability.includes(cleanDetectedType) || 
                   cleanDetectedType.includes(cleanYojanaDisability);
      
      if (match) {
        console.log(`Disability match for: ${yojana.YojanaName} - ${yojanaDisability}`);
      }
      return match;
    });
  }
  
  console.log(`After filtering: ${filteredYojanas.length} yojanas`);
  
  // Limit results for cost efficiency (max 10 yojanas to Gemini)
  return filteredYojanas.slice(0, 10);
}

// Stage 2: Gemini Processing with strict instructions
async function processWithGemini(message, filteredYojanas, conversationHistory, context) {
  if (!genAI) {
    return {
      message: 'AI service unavailable. Try again later.',
      links: [...linkCatalog.contact]
    };
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    // Build concise system prompt
    const systemPrompt = `You are a disability portal assistant. Be CONCISE and DIRECT.

CONVERSATION: ${conversationHistory.slice(-2).map(h => `${h.sender}: ${h.message}`).join('\n')}

LINKS:
Login: {"label": "Login to Divyang Portal", "url": "https://divyangparbhani.altwise.in/home/login"}
Register: {"label": "Register on Divyang Portal", "url": "https://divyangparbhani.altwise.in/home/newregistration"}
Contact: {"label": "Contact Support", "url": "https://divyangparbhani.altwise.in/home/contact"}

FILTERED YOJANAS: ${JSON.stringify(filteredYojanas.map(y => ({
  YojanaId: y.YojanaId,
  YojanaName: y.YojanaName,
  Description: y.Description,
  Start_Age: y.Start_Age,
  UpTo_Age: y.UpTo_Age,
  DisabilityType: y.DisabilityType
})), null, 2)}

RULES:
1. MAX 2 sentences response
2. If yojanas found, return them in yojanas array
3. If user asks for login/register, give only that link
4. Detect user language and respond accordingly
5. Be helpful but brief

USER: ${message}

JSON response:
{
  "message": "brief response",
  "links": [only if relevant],
  "yojanas": [return found yojanas here]
}`;

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    let aiResponse = response.text();

    // Parse AI response
    let parsedResponse;
    try {
      aiResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedResponse = JSON.parse(aiResponse);
    } catch (parseError) {
      // Simple fallback for form submissions
      if (message.includes('Get Yojana for Age:') && filteredYojanas.length > 0) {
        return {
          message: `Found ${filteredYojanas.length} schemes matching your criteria:`,
          links: [],
          yojanas: filteredYojanas
        };
      }
      
      parsedResponse = {
        message: aiResponse || 'How can I help you?',
        links: [],
        yojanas: filteredYojanas.length > 0 ? filteredYojanas : []
      };
    }

    // Ensure we return yojanas if found
    if (filteredYojanas.length > 0 && (!parsedResponse.yojanas || parsedResponse.yojanas.length === 0)) {
      parsedResponse.yojanas = filteredYojanas;
    }

    // Validate links
    const validLinks = [];
    if (parsedResponse.links && Array.isArray(parsedResponse.links)) {
      const allKnownLinks = [...linkCatalog.login, ...linkCatalog.register, ...linkCatalog.contact];
      parsedResponse.links.forEach(link => {
        const knownLink = allKnownLinks.find(known => known.url === link.url);
        if (knownLink) validLinks.push(knownLink);
      });
    }
    
    return {
      message: parsedResponse.message || 'How can I help?',
      links: validLinks,
      yojanas: parsedResponse.yojanas || []
    };

  } catch (error) {
    console.error('Gemini AI error:', error);
    
    // Direct fallback for form submissions
    if (message.includes('Get Yojana for Age:') && filteredYojanas.length > 0) {
      return {
        message: `Found ${filteredYojanas.length} matching schemes:`,
        links: [],
        yojanas: filteredYojanas
      };
    }
    
    return {
      message: 'Sorry, having trouble right now. Try again later.',
      links: [...linkCatalog.contact]
    };
  }
}

// Main chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    // Validate request
    const validation = chatRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        message: 'Invalid request format',
        errors: validation.error.errors
      });
    }

    const { message, context = {} } = validation.data;
    const userId = context.userId || 'default';

    // Initialize or get session
    if (!userSessions.has(userId)) {
      userSessions.set(userId, { conversationHistory: [] });
    }
    
    const session = userSessions.get(userId);
    session.conversationHistory.push({ sender: 'user', message });
    
    // Keep only last 6 messages to control costs
    if (session.conversationHistory.length > 6) {
      session.conversationHistory = session.conversationHistory.slice(-6);
    }

    // Always fetch fresh Yojana data
    const allYojanas = await fetchYojanas();
    
    // Stage 1: Apply smart pre-filtering
    const filteredYojanas = applySmartFilters(allYojanas, message);
    
    console.log(`Message: "${message}"`);
    console.log(`Filtered: ${filteredYojanas.length}/${allYojanas.length} yojanas`);
    
    // Stage 2: Process with Gemini
    const response = await processWithGemini(
      message, 
      filteredYojanas, 
      session.conversationHistory.slice(0, -1),
      context
    );
    
    // Add bot response to history
    session.conversationHistory.push({ sender: 'bot', message: response.message });
    
    return res.json(response);

  } catch (error) {
    console.error('Chat API error:', error);
    return res.status(500).json({
      message: 'Something went wrong. Please try again.',
      links: linkCatalog.contact
    });
  }
});

// Clean up old sessions
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of userSessions.entries()) {
    if (!session.lastActivity || now - session.lastActivity > 2 * 60 * 60 * 1000) {
      userSessions.delete(userId);
    }
  }
}, 30 * 60 * 1000);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Disability Yojana Chatbot Backend started on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🤖 Chat endpoint: http://localhost:${PORT}/api/chat`);
  console.log(`🔑 Gemini AI: ${genAI ? '✅ Enabled' : '❌ Disabled (Set GEMINI_API_KEY)'}`);
});