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
  fallback: "I can help with divyang portal related issues only. Please ask about login, registration, or yojana/schemes."
};

// Session store
const userContext = new Map();

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
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching Yojanas:', error);
    return [];
  }
}

// Function to detect age from message
function detectAge(message) {
  const ageMatch = message.match(/\b(\d{1,2})\b/);
  if (ageMatch) {
    const age = parseInt(ageMatch[1]);
    return (age >= 1 && age <= 100) ? age : null;
  }
  return null;
}

// Function to detect disability from message
function detectDisability(message) {
  const lowerMessage = message.toLowerCase();
  
  // Check for vision-related keywords
  if (lowerMessage.includes('blind') || lowerMessage.includes('vision') || lowerMessage.includes('अंध')) {
    return 'vision';
  }
  
  // Check for hearing-related keywords
  if (lowerMessage.includes('deaf') || lowerMessage.includes('hearing') || lowerMessage.includes('कर्णबधीर')) {
    return 'hearing';
  }
  
  // Check for physical disability keywords
  if (lowerMessage.includes('physical') || lowerMessage.includes('locomotor') || lowerMessage.includes('अस्थिव्यंग')) {
    return 'physical';
  }
  
  return null;
}

// Function to parse structured form query
function parseStructuredQuery(message) {
  const regex = /Get Yojana for Age: (\d+), Disability: (.+?), Percentage: (\d+)/;
  const match = message.match(regex);
  
  if (match) {
    return {
      age: parseInt(match[1]),
      disabilityType: match[2].trim(),
      percentage: parseInt(match[3])
    };
  }
  
  return null;
}

// Function to filter Yojanas based on criteria
function filterYojanas(yojanas, criteria) {
  const { age, disabilityType } = criteria;
  
  return yojanas.filter(yojana => {
    // Check age range
    const ageMatch = age >= yojana.Start_Age && age <= yojana.UpTo_Age;
    
    // If no specific disability type or if it matches
    const disabilityMatch = !disabilityType || 
      yojana.DisabilityType.toLowerCase().includes(disabilityType.toLowerCase()) ||
      disabilityType.toLowerCase().includes(yojana.DisabilityType.toLowerCase());
    
    return ageMatch && disabilityMatch;
  });
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

    // Initialize session for user if not exists
    if (!userContext.has(userId)) {
      userContext.set(userId, { age: null, disability: null });
    }

    const session = userContext.get(userId);

    // Handle Login request
    if (message.toLowerCase().includes('login')) {
      return res.json({
        message: 'Here are the login options for Divyang Portal:',
        links: linkCatalog.login
      });
    }

    // Handle Register request
    if (message.toLowerCase().includes('register')) {
      return res.json({
        message: 'Here are the registration options for Divyang Portal:',
        links: linkCatalog.register
      });
    }

    // Check for structured form query first
    const structuredQuery = parseStructuredQuery(message);
    if (structuredQuery) {
      const { age, disabilityType, percentage } = structuredQuery;
      
      // Fetch Yojanas
      const allYojanas = await fetchYojanas();
      
      // Filter Yojanas based on criteria
      const filteredYojanas = filterYojanas(allYojanas, { age, disabilityType });
      
      // Return top 3 results
      const topYojanas = filteredYojanas.slice(0, 3);
      
      let responseMessage = '';
      if (topYojanas.length > 0) {
        responseMessage = `Based on your age (${age}) and disability type (${disabilityType}), here are the suitable schemes:`;
      } else {
        responseMessage = `Sorry, no schemes found for your criteria. Age: ${age}, Disability: ${disabilityType}`;
      }
      
      return res.json({
        message: responseMessage,
        yojanas: topYojanas,
        links: []
      });
    }

    // Detect age and disability from message
    const detectedAge = detectAge(message);
    const detectedDisability = detectDisability(message);

    // Update session if age or disability detected
    if (detectedAge) session.age = detectedAge;
    if (detectedDisability) session.disability = detectedDisability;

    // Check if query mentions Yojana but no age yet
    const isYojanaQuery = message.toLowerCase().includes('yojana') || 
                         message.toLowerCase().includes('scheme') || 
                         message.toLowerCase().includes('योजना');

    if (isYojanaQuery && !session.age && !detectedAge) {
      return res.json({
        message: 'Please tell me your age so I can suggest the best schemes for you.',
        links: []
      });
    }

    // If session has age and it's a Yojana query, fetch Yojanas
    if (session.age && isYojanaQuery) {
      const allYojanas = await fetchYojanas();
      
      // Filter by age and disability if available
      const criteria = { 
        age: session.age, 
        disabilityType: session.disability 
      };
      const filteredYojanas = filterYojanas(allYojanas, criteria);
      
      // Return top 3 results
      const topYojanas = filteredYojanas.slice(0, 3);
      
      let responseMessage = '';
      if (session.disability) {
        responseMessage = `Based on your age (${session.age}) and disability (${session.disability}), here are the suitable schemes:`;
      } else {
        responseMessage = `Based on your age (${session.age}), here are the suitable schemes:`;
      }
      
      if (topYojanas.length === 0) {
        responseMessage = `Sorry, no schemes found for your criteria.`;
      }
      
      return res.json({
        message: responseMessage,
        yojanas: topYojanas,
        links: []
      });
    }

    // If no age and not a Yojana query, use Gemini AI
    if (!genAI) {
      return res.json({
        message: 'Developer mode: Set GEMINI_API_KEY to enable AI responses.',
        links: [...linkCatalog.login, ...linkCatalog.register]
      });
    }

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      // Build system prompt
      const systemPrompt = `
You are a helpful assistant for the Divyang (Disability) Portal. 
Context: ${JSON.stringify(context)}

Available resources:
- Login links: ${JSON.stringify(linkCatalog.login)}
- Register links: ${JSON.stringify(linkCatalog.register)}

Rules:
1. If user asks about Yojana/schemes but no age is provided, ask for age.
2. If age is provided, help filter schemes based on age and disability.
3. Respond concisely and factually.
4. Only use the known links provided above, never invent URLs.
5. Focus on disability portal related queries only.

User message: ${message}

Respond in JSON format with:
{
  "message": "your response message",
  "links": [{"label": "link name", "url": "actual url"}] // only use known URLs
}
`;

      const result = await model.generateContent(systemPrompt);
      const response = await result.response;
      let aiResponse = response.text();

      // Try to parse as JSON, fallback to text
      let parsedResponse;
      try {
        // Remove markdown formatting if present
        aiResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        parsedResponse = JSON.parse(aiResponse);
      } catch (parseError) {
        parsedResponse = {
          message: aiResponse,
          links: []
        };
      }

      // Validate links against known catalog
      const validLinks = [];
      if (parsedResponse.links && Array.isArray(parsedResponse.links)) {
        const allKnownLinks = [...linkCatalog.login, ...linkCatalog.register];
        parsedResponse.links.forEach(link => {
          const knownLink = allKnownLinks.find(known => 
            known.url === link.url || known.label === link.label
          );
          if (knownLink) {
            validLinks.push(knownLink);
          }
        });
      }

      return res.json({
        message: parsedResponse.message || 'I can help you with disability portal related queries.',
        links: validLinks,
        yojanas: []
      });

    } catch (aiError) {
      console.error('Gemini AI error:', aiError);
      return res.json({
        message: linkCatalog.fallback,
        links: [...linkCatalog.login, ...linkCatalog.register]
      });
    }

  } catch (error) {
    console.error('Chat API error:', error);
    return res.status(500).json({
      message: 'Internal server error. Please try again later.',
      links: []
    });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Disability Yojana Chatbot Backend started on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🤖 Chat endpoint: http://localhost:${PORT}/api/chat`);
  console.log(`🔑 Gemini AI: ${genAI ? '✅ Enabled' : '❌ Disabled (Set GEMINI_API_KEY)'}`);
});

export default app;