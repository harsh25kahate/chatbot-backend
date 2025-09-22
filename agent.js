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
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching Yojanas:', error);
    return [];
  }
}

// Stage 1: Smart Filtering Functions

// Detect age from message
function detectAge(message) {
  const agePatterns = [
    /\b(\d{1,2})\s*(?:year|years|वर्ष|साल)/i,
    /age\s*(?:is\s*)?(\d{1,2})/i,
    /वय\s*(\d{1,2})/i,
    /\b(\d{1,2})\s*वर्षाच्या/i
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

// Detect disability type from message
function detectDisabilityType(message) {
  const lowerMessage = message.toLowerCase();
  
  const disabilityKeywords = {
    vision: ['blind', 'blindness', 'vision', 'visual', 'sight', 'अंध', 'दृष्टी', 'नेत्र'],
    hearing: ['deaf', 'hearing', 'audio', 'ear', 'कर्णबधीर', 'श्रवण', 'कान'],
    physical: ['physical', 'locomotor', 'mobility', 'limb', 'अस्थिव्यंग', 'शारीरिक'],
    mental: ['mental', 'intellectual', 'cognitive', 'brain', 'मानसिक', 'बौद्धिक'],
    speech: ['speech', 'language', 'speaking', 'वाचा', 'भाषा']
  };
  
  for (const [type, keywords] of Object.entries(disabilityKeywords)) {
    if (keywords.some(keyword => lowerMessage.includes(keyword))) {
      return type;
    }
  }
  return null;
}

// Detect category/purpose from message
function detectCategory(message) {
  const lowerMessage = message.toLowerCase();
  
  const categoryKeywords = {
    education: ['education', 'study', 'school', 'college', 'learning', 'शिक्षण', 'अभ्यास'],
    employment: ['job', 'employment', 'work', 'career', 'business', 'रोजगार', 'काम'],
    healthcare: ['health', 'medical', 'treatment', 'therapy', 'आरोग्य', 'वैद्यकीय'],
    financial: ['money', 'financial', 'pension', 'allowance', 'आर्थिक', 'पेन्शन'],
    social: ['social', 'marriage', 'family', 'सामाजिक', 'विवाह']
  };
  
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(keyword => lowerMessage.includes(keyword))) {
      return category;
    }
  }
  return null;
}

// Stage 1: Smart Pre-filtering
function applySmartFilters(yojanas, message) {
  let filteredYojanas = [...yojanas];
  
  // Filter by age if detected
  const age = detectAge(message);
  if (age) {
    filteredYojanas = filteredYojanas.filter(yojana => {
      const startAge = yojana.Start_Age || 0;
      const upToAge = yojana.UpTo_Age || 100;
      return age >= startAge && age <= upToAge;
    });
  }
  
  // Filter by disability type if detected
  const disabilityType = detectDisabilityType(message);
  if (disabilityType) {
    filteredYojanas = filteredYojanas.filter(yojana => {
      const yojanaDisability = (yojana.DisabilityType || '').toLowerCase();
      return yojanaDisability.includes(disabilityType) || 
             disabilityType === 'physical' && yojanaDisability.includes('locomotor') ||
             disabilityType === 'vision' && yojanaDisability.includes('blind') ||
             disabilityType === 'hearing' && yojanaDisability.includes('deaf');
    });
  }
  
  // Filter by category/purpose if detected
  const category = detectCategory(message);
  if (category) {
    filteredYojanas = filteredYojanas.filter(yojana => {
      const description = (yojana.Description || '').toLowerCase();
      const yojanaName = (yojana.YojanaName || '').toLowerCase();
      const searchText = description + ' ' + yojanaName;
      
      switch(category) {
        case 'education':
          return searchText.includes('education') || searchText.includes('study') || 
                 searchText.includes('school') || searchText.includes('शिक्षण');
        case 'employment':
          return searchText.includes('employment') || searchText.includes('job') || 
                 searchText.includes('work') || searchText.includes('रोजगार');
        case 'healthcare':
          return searchText.includes('health') || searchText.includes('medical') || 
                 searchText.includes('treatment') || searchText.includes('आरोग्य');
        case 'financial':
          return searchText.includes('pension') || searchText.includes('allowance') || 
                 searchText.includes('financial') || searchText.includes('आर्थिक');
        default:
          return true;
      }
    });
  }
  
  // Limit results for cost efficiency (max 15 yojanas to Gemini)
  return filteredYojanas.slice(0, 15);
}

// Stage 2: Gemini Processing with conversation memory
async function processWithGemini(message, filteredYojanas, conversationHistory, context) {
  if (!genAI) {
    return {
      message: 'AI service is currently unavailable. Please try again later.',
      links: [...linkCatalog.login, ...linkCatalog.register, ...linkCatalog.contact]
    };
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    // Build comprehensive system prompt
    const systemPrompt = `
You are a helpful assistant for the Divyang (Disability) Portal chatbot. Be natural and conversational.

CONVERSATION HISTORY:
${conversationHistory.length > 0 ? conversationHistory.map(h => `${h.sender}: ${h.message}`).join('\n') : 'No previous conversation'}

AVAILABLE RESOURCES:
- Login: ${JSON.stringify(linkCatalog.login)}
- Register: ${JSON.stringify(linkCatalog.register)}
- Contact: ${JSON.stringify(linkCatalog.contact)}

YOJANA DATA (Pre-filtered based on user query):
${JSON.stringify(filteredYojanas, null, 2)}

INSTRUCTIONS:
1. Respond naturally and conversationally in the user's preferred language (detect from their message)
2. If user asks about schemes/yojanas, use the provided filtered data
3. If user needs help with login/registration, provide guidance and include relevant links
4. If user needs contact support, include the contact link
5. Be helpful, friendly, and informative
6. Don't mention that you're an AI or chatbot unless asked
7. If no relevant yojanas found, explain politely and suggest alternatives

USER MESSAGE: ${message}

Respond in this JSON format:
{
  "message": "your conversational response",
  "links": [{"label": "link name", "url": "url"}] // include relevant links when helpful,
  "yojanas": [list of relevant yojana objects] // include if discussing specific schemes
}
`;

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    let aiResponse = response.text();

    // Parse AI response
    let parsedResponse;
    try {
      // Clean up markdown formatting
      aiResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedResponse = JSON.parse(aiResponse);
    } catch (parseError) {
      // Fallback if JSON parsing fails
      parsedResponse = {
        message: aiResponse || 'I understand your query. How can I assist you further?',
        links: [],
        yojanas: filteredYojanas.length > 0 ? filteredYojanas.slice(0, 5) : []
      };
    }

    // Validate and clean response
    if (!parsedResponse.message) {
      parsedResponse.message = 'I understand your query. How can I assist you further?';
    }
    
    // Ensure links are valid
    const validLinks = [];
    if (parsedResponse.links && Array.isArray(parsedResponse.links)) {
      const allKnownLinks = [...linkCatalog.login, ...linkCatalog.register, ...linkCatalog.contact];
      parsedResponse.links.forEach(link => {
        const knownLink = allKnownLinks.find(known => 
          known.url === link.url || known.label === link.label
        );
        if (knownLink) {
          validLinks.push(knownLink);
        }
      });
    }
    
    return {
      message: parsedResponse.message,
      links: validLinks,
      yojanas: parsedResponse.yojanas || []
    };

  } catch (error) {
    console.error('Gemini AI error:', error);
    return {
      message: 'I apologize, but I\'m having trouble processing your request right now. Please try again or contact support for assistance.',
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

    // Initialize or get session for conversation memory
    if (!userSessions.has(userId)) {
      userSessions.set(userId, { conversationHistory: [] });
    }
    
    const session = userSessions.get(userId);
    
    // Add user message to conversation history
    session.conversationHistory.push({ sender: 'user', message });
    
    // Keep only last 10 messages to control costs
    if (session.conversationHistory.length > 10) {
      session.conversationHistory = session.conversationHistory.slice(-10);
    }

    // Always fetch fresh Yojana data
    const allYojanas = await fetchYojanas();
    
    // Stage 1: Apply smart pre-filtering
    const filteredYojanas = applySmartFilters(allYojanas, message);
    
    console.log(`Filtered yojanas: ${filteredYojanas.length} out of ${allYojanas.length}`);
    
    // Stage 2: Process with Gemini for conversational response
    const response = await processWithGemini(
      message, 
      filteredYojanas, 
      session.conversationHistory.slice(0, -1), // Don't include current message
      context
    );
    
    // Add bot response to conversation history
    session.conversationHistory.push({ sender: 'bot', message: response.message });
    
    return res.json(response);

  } catch (error) {
    console.error('Chat API error:', error);
    return res.status(500).json({
      message: 'I apologize, but something went wrong. Please try again later or contact our support team.',
      links: linkCatalog.contact
    });
  }
});

// Clean up old sessions periodically to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of userSessions.entries()) {
    // Remove sessions older than 2 hours
    if (!session.lastActivity || now - session.lastActivity > 2 * 60 * 60 * 1000) {
      userSessions.delete(userId);
    }
  }
}, 30 * 60 * 1000); // Clean every 30 minutes

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Disability Yojana Chatbot Backend started on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🤖 Chat endpoint: http://localhost:${PORT}/api/chat`);
  console.log(`🔑 Gemini AI: ${genAI ? '✅ Enabled' : '❌ Disabled (Set GEMINI_API_KEY)'}`);
  console.log(`💾 Session cleanup: Every 30 minutes`);
});