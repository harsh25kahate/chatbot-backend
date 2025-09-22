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
    console.log('Yojana Data:', JSON.stringify(data, null, 2)); // Log to inspect API response
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Error fetching yojanas:', err);
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
  const disabilityMap = [
    { type: 'blindness', keywords: ['पूर्णतः अंध', 'blindness', 'blind'] },
    { type: 'low vision', keywords: ['अंशतः अंध', 'low vision', 'partially blind'] },
    { type: 'hearing impairment', keywords: ['कर्णबधीर', 'hearing impairment', 'deaf'] },
    { type: 'speech and language disability', keywords: ['वाचा दोष', 'speech disability', 'language disability'] },
    { type: 'locomotor disability', keywords: ['अस्थिव्यंग', 'locomotor disability', 'physical disability'] },
    { type: 'mental illness', keywords: ['मानसिक आजार', 'mental illness'] },
    { type: 'learning disability', keywords: ['अध्ययन अक्षम', 'learning disability'] },
    { type: 'cerebral palsy', keywords: ['मेंदूचा पक्षाघात', 'cerebral palsy'] },
    { type: 'autism', keywords: ['स्वमग्न', 'autism'] },
    { type: 'multiple disability', keywords: ['बहुविकलांग', 'multiple disability'] },
    { type: 'leprosy cured', keywords: ['कुष्ठरोग', 'leprosy cured'] },
    { type: 'dwarfism', keywords: ['बुटकेपणा', 'dwarfism'] },
    { type: 'intellectual disability', keywords: ['बौद्धिक अक्षमता', 'intellectual disability'] },
    { type: 'muscular disability', keywords: ['माशपेशीय क्षरण', 'muscular disability', 'muscular dystrophy'] },
    { type: 'chronic neurological conditions', keywords: ['मज्जासंस्थेचे तीव्र आजार', 'chronic neurological conditions'] },
    { type: 'multiple sclerosis', keywords: ['मल्टिपल स्क्लेरोसिस', 'multiple sclerosis'] },
    { type: 'thalassemia', keywords: ['थॅलेसिमिया', 'thalassemia'] },
    { type: 'hemophilia', keywords: ['अधिक रक्तस्त्राव', 'hemophilia'] },
    { type: 'sickle cell disease', keywords: ['सिकल सेल', 'sickle cell disease', 'sickle cell'] },
    { type: 'acid attack victim', keywords: ['अॅसिड अटॅक', 'acid attack victim', 'acid attack'] },
    { type: 'parkinson\'s disease', keywords: ['कंपवात रोग', 'parkinson\'s disease', 'parkinson'] }
  ];

  for (const { type, keywords } of disabilityMap) {
    if (keywords.some(keyword => text.includes(keyword.toLowerCase()))) {
      return type;
    }
  }
  return null;
}

// Parse structured message
function parseStructuredQuery(msg) {
  const match = msg.match(/Age: (\d+), Disability: (.+?), Percentage: (\d+)/i);
  if (!match) return null;
  const disabilityInput = match[2].trim().toLowerCase();
  const disabilityMap = [
    { type: 'blindness', keywords: ['पूर्णतः अंध', 'blankness', 'blind'] },
    { type: 'low vision', keywords: ['अंशतः अंध', 'low vision', 'partially blind'] },
    { type: 'hearing impairment', keywords: ['कर्णबधीर', 'hearing impairment', 'deaf'] },
    { type: 'speech and language disability', keywords: ['वाचा दोष', 'speech disability', 'language disability'] },
    { type: 'locomotor disability', keywords: ['अस्थिव्यंग', 'locomotor disability', 'physical disability'] },
    { type: 'mental illness', keywords: ['मानसिक आजार', 'mental illness'] },
    { type: 'learning disability', keywords: ['अध्ययन अक्षम', 'learning disability'] },
    { type: 'cerebral palsy', keywords: ['मेंदूचा पक्षाघात', 'cerebral palsy'] },
    { type: 'autism', keywords: ['स्वमग्न', 'autism'] },
    { type: 'multiple disability', keywords: ['बहुविकलांग', 'multiple disability'] },
    { type: 'leprosy cured', keywords: ['कुष्ठरोग', 'leprosy cured'] },
    { type: 'dwarfism', keywords: ['बुटकेपणा', 'dwarfism'] },
    { type: 'intellectual disability', keywords: ['बौद्धिक अक्षमता', 'intellectual disability'] },
    { type: 'muscular disability', keywords: ['माशपेशीय क्षरण', 'muscular disability', 'muscular dystrophy'] },
    { type: 'chronic neurological conditions', keywords: ['मज्जासंस्थेचे तीव्र आजार', 'chronic neurological conditions'] },
    { type: 'multiple sclerosis', keywords: ['मल्टिपल स्क्लेरोसिस', 'multiple sclerosis'] },
    { type: 'thalassemia', keywords: ['थॅलेसिमिया', 'thalassemia'] },
    { type: 'hemophilia', keywords: ['अधिक रक्तस्त्राव', 'hemophilia'] },
    { type: 'sickle cell disease', keywords: ['सिकल सेल', 'sickle cell disease', 'sickle cell'] },
    { type: 'acid attack victim', keywords: ['अॅसिड अटॅक', 'acid attack victim', 'acid attack'] },
    { type: 'parkinson\'s disease', keywords: ['कंपवात रोग', 'parkinson\'s disease', 'parkinson'] }
  ];
  const matchedDisability = disabilityMap.find(d => d.keywords.some(k => disabilityInput.includes(k.toLowerCase())));
  return {
    age: parseInt(match[1]),
    disabilityType: matchedDisability ? matchedDisability.type : match[2].trim(),
    percentage: parseInt(match[3])
  };
}

// Filter Yojanas
function filterYojanas(yojanas, criteria) {
  const { age, disabilityType, percentage, publisher } = criteria;
  return yojanas.filter(y => {
    // Age filter
    const start = y.Start_Age || 0, end = y.UpTo_Age || 100;
    const ageMatch = age ? age >= start && age <= end : true;

    // Disability filter
    let disabilityMatch = true;
    if (disabilityType) {
      const yDis = (y.tblDivyangTypes || '').toLowerCase();
      const match = yDis.match(/\((.*?)\)/); // Extract English type (e.g., "Blindness")
      const normalizedDisability = match ? match[1].toLowerCase() : yDis;
      disabilityMatch = normalizedDisability.includes(disabilityType.toLowerCase()) || 
                       disabilityType.toLowerCase().includes(normalizedDisability);
    }

    // Percentage filter
    const percentageMatch = percentage ? y.tblYojanaDivyangTypePercentages >= percentage : true;

    // Publisher filter
    const publisherMatch = publisher ? y.PublishedBy.toLowerCase() === publisher.toLowerCase() : true;

    return ageMatch && disabilityMatch && percentageMatch && publisherMatch;
  }).map(y => ({
    ...y,
    Disability: y.tblDivyangTypes // Include tblDivyangTypes as Disability in response
  }));
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

    // Structured query (e.g., "Age: 20, Disability: अध्ययन अक्षम, Percentage: 74")
    const structured = parseStructuredQuery(message);
    const allYojanas = await fetchYojanas();
    if (structured) {
      const filtered = filterYojanas(allYojanas, structured);
      const msg = filtered.length > 0 ? `Found ${filtered.length} schemes matching your criteria.` : "No schemes found for your criteria.";
      return res.json({ message: msg, links: [], yojanas: filtered });
    }

    // Field-specific queries (e.g., "What is the description of Abhyas Sahayog Yojana?")
    const fieldKeywords = {
      name: ['name', 'yojana name', 'नाव'],
      description: ['description', 'वर्णन'],
      age: ['age', 'वय', 'age range'],
      percentage: ['percentage', 'प्रतिशत'],
      publisher: ['published by', 'प्रकाशक']
    };
    const matchedField = Object.keys(fieldKeywords).find(field => 
      fieldKeywords[field].some(keyword => lowerMsg.includes(keyword.toLowerCase()))
    );
    if (matchedField) {
      const yojanaNameMatch = lowerMsg.match(/(.+?)(?=\s*(name|description|age|percentage|published by|$))/i);
      if (yojanaNameMatch) {
        const yojanaName = yojanaNameMatch[1].trim().toLowerCase();
        const yojana = allYojanas.find(y => y.YojanaName.toLowerCase() === yojanaName);
        if (yojana) {
          let responseMsg;
          switch (matchedField) {
            case 'name':
              responseMsg = `The name of the scheme is ${yojana.YojanaName}.`;
              break;
            case 'description':
              responseMsg = `Description: ${yojana.YojanaDescription}`;
              break;
            case 'age':
              responseMsg = `Age range: ${yojana.Start_Age}–${yojana.UpTo_Age}`;
              break;
            case 'percentage':
              responseMsg = `Disability percentage: ${yojana.tblYojanaDivyangTypePercentages}%`;
              break;
            case 'publisher':
              responseMsg = `Published by: ${yojana.PublishedBy}`;
              break;
            default:
              responseMsg = 'Field not recognized.';
          }
          return res.json({ 
            message: responseMsg, 
            links: [], 
            yojanas: [{ ...yojana, Disability: yojana.tblDivyangTypes }] 
          });
        } else {
          return res.json({ message: 'Yojana not found.', links: [], yojanas: [] });
        }
      }
    }

    // Publisher-based query (e.g., "Tell yojana which are by nagar panchayat" or "all yojna under nagar panchayat")
    if (lowerMsg.includes('nagar panchayat') && (lowerMsg.includes('yojana') || lowerMsg.includes('under') || lowerMsg.includes('by'))) {
      const filtered = filterYojanas(allYojanas, { publisher: 'nagar panchayat' });
      const msg = filtered.length > 0 ? `Found ${filtered.length} schemes published by nagar panchayat.` : "No schemes found published by nagar panchayat.";
      return res.json({ message: msg, links: [], yojanas: filtered });
    }

    // Detect age/disability from message
    const age = detectAge(message);
    const disability = detectDisability(message);
    if (age) session.age = age;
    if (disability) session.disability = disability;

    // General yojana query (e.g., "I am 20 years old with learning disability. Show me yojanas.")
    const isYojanaQuery = ['yojana', 'scheme', 'योजना'].some(k => lowerMsg.includes(k.toLowerCase()));
    if (isYojanaQuery) {
      // Handle disability-only queries (e.g., "if i am blind is there any yojna")
      if (disability || session.disability) {
        const queryDisability = disability || session.disability;
        const filtered = filterYojanas(allYojanas, { disabilityType: queryDisability });
        const msg = filtered.length > 0 ? `Found ${filtered.length} schemes for ${queryDisability}.` : `No schemes found for ${queryDisability}.`;
        return res.json({ message: msg, links: [], yojanas: filtered });
      }
      // Handle age-only queries (e.g., "my age is 32 is there any yojna")
      if (age || session.age) {
        const queryAge = age || session.age;
        if (session.disability) {
          const filtered = filterYojanas(allYojanas, { age: queryAge, disabilityType: session.disability });
          const msg = filtered.length > 0 ? `Based on your age (${queryAge}) and disability (${session.disability}), here are suitable schemes:` : 'No schemes found for your criteria.';
          return res.json({ message: msg, links: [], yojanas: filtered });
        } else {
          return res.json({ 
            message: 'Please provide your disability type to suggest suitable schemes. For example, mention if you have blindness, hearing impairment, etc.', 
            links: [], 
            yojanas: [] 
          });
        }
      }
      // Ask for age if missing
      return res.json({ message: 'Please provide your age and disability type to suggest suitable schemes.', links: [], yojanas: [] });
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
        aiResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        parsed = JSON.parse(aiResponse);
      } catch {
        parsed = { message: linkCatalog.fallback, links: [...linkCatalog.login, ...linkCatalog.register], yojanas: [] };
      }

      // Validate links
      const validLinks = (parsed.links || []).filter(l => [...linkCatalog.login, ...linkCatalog.register].some(k => k.url === l.url));

      return res.json({ message: parsed.message || linkCatalog.fallback, links: validLinks, yojanas: [] });

    } catch (aiErr) {
      console.error('Gemini AI error:', aiErr);
      return res.json({ message: linkCatalog.fallback, links: [...linkCatalog.login, ...linkCatalog.register], yojanas: [] });
    }

  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ message: 'Internal server error', links: [], yojanas: [] });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🟢 Health: http://localhost:${PORT}/api/health`);
});