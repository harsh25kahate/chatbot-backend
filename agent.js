// --- Load Environment Variables ---
import dotenv from "dotenv";
dotenv.config();

// --- Dependencies ---
import express from "express";
import cors from "cors";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import yojanas from "./yojanaData.js";

// --- App Setup ---
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin: [
      "http://localhost:5173", 
      "http://localhost:3000", 
      "http://localhost:44308", 
      "http://192.168.1.41:44308", 
      /\.railway\.app$/,
    ],
    credentials: true,
  })
);

// --- Validation Schema ---
const ChatRequestSchema = z.object({
  message: z.string().min(1),
  context: z
    .object({
      userId: z.string().optional(),
      locale: z.string().optional(),
      app: z.string().optional(),
      awaitingAge: z.boolean().optional(),
      awaitingDisability: z.boolean().optional(),
      awaitingPercentage: z.boolean().optional(),
    })
    .optional(),
});

// --- Resource Catalog ---
const linkCatalog = [
  { message: "You can register here", links: [{ label: "Register", url: "https://divyangparbhani.altwise.in/home/newregistration" }] },
  { message: "You can log in using this link:", links: [{ label: "Login", url: "https://divyangparbhani.altwise.in/home/login" }] },
  { message: "I can help with divyang portal related issues only. I can't help with that." },
];

// --- Helper: Build system prompt (single line) ---
function buildSystemPrompt(context) {
  return `You are a Disability Yojana chatbot. Rules: Ask politely for any missing info (age, disability type, percentage). Once all info is provided, filter Yojanas and return top 3 matches with name and description. Only use known resource links. Answer only about Disability Portal (Yojanas, login, register); ignore unrelated queries. Context: ${JSON.stringify(context || {})}. Resources: ${linkCatalog.map(r=>({message:r.message,links:r.links}))}. Respond in JSON with keys: message (string), links (optional array of {label,url}), yojanas (optional array of {YojanaName, Description})`;
}

// --- Helper: Coerce AI output to valid JSON ---
function coerceGeminiJson(text) {
  try { return JSON.parse(text); } 
  catch { const match = text.match(/\{[\s\S]*\}/); if(match){ try{ return JSON.parse(match[0]); } catch { return { message: text }; } } return { message: text }; }
}

// --- Routes ---
app.post("/api/chat", async (req, res) => {
  const parsed = ChatRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });

  const { message, context = {} } = parsed.data;
  const apiKey = process.env.GEMINI_API_KEY;

  // --- Session storage in-memory (simple) ---
  context.age = context.age || null;
  context.disability = context.disability || null;
  context.percentage = context.percentage || null;

  // --- 1. Check if message asks about Yojana ---
  if (/yojana|scheme/i.test(message)) {
    // Ask for missing details
    if (!context.age) return res.json({ message: "Please tell me your age so I can suggest suitable Yojanas.", links: [] });
    if (!context.disability) return res.json({ message: "Please tell me your disability type.", links: [] });
    if (!context.percentage) return res.json({ message: "Please tell me your disability percentage.", links: [] });

    // Filter yojanas
    let filtered = yojanas.filter(y => context.age >= y.Start_Age && context.age <= y.UpTo_Age);
    filtered = filtered.filter(y => context.percentage >= y.tblYojanaDivyangTypePercentages);
    filtered = filtered.filter(y => y.tblDivyangTypes.includes(context.disability));

    if (filtered.length === 0) filtered = yojanas.slice(0, 3);

    return res.json({
      message: `Based on your details (age: ${context.age}, disability: ${context.disability}, percentage: ${context.percentage}), here are some Yojanas:`,
      yojanas: filtered.slice(0,3),
      links: []
    });
  }

  // --- 2. Fallback to Gemini AI ---
  if (!apiKey) return res.json({ message: "Developer mode: Set GEMINI_API_KEY to enable AI responses.", links: linkCatalog });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const system = buildSystemPrompt(context);
    const prompt = `${system}\n\nUser: ${message}\nAssistant:`;
    const result = await model.generateContent([{ text: prompt }]);

    let text = "";
    try { text = result.response.text(); } catch(e) { console.error("⚠️ Gemini returned no text:", e); }

    if (!text) return res.json({ message: "I couldn’t generate a response, please try again.", links: [] });

    const json = coerceGeminiJson(text);
    const links = Array.isArray(json.links) ? json.links.filter(out => linkCatalog.some(known => known.links?.some(l => l.url === out.url))) : [];

    return res.json({ message: String(json.message || text).trim(), links, yojanas: json.yojanas || [], context });
  } catch (err) {
    console.error("❌ Error in /api/chat:", err);
    return res.status(500).json({ message: "Sorry, there was an issue processing your request. Please try again.", links: [] });
  }
});

// --- Health Check ---
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// --- Start Server ---
app.listen(PORT, "0.0.0.0", () => console.log(`✅ Chatbot backend listening on port ${PORT}`));
