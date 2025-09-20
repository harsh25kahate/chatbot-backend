// --- Load Environment Variables ---
import dotenv from "dotenv";
dotenv.config();

// --- Dependencies ---
import express from "express";
import cors from "cors";
import axios from "axios";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";

// --- App Setup ---
const app = express();
const PORT = process.env.PORT || 5000;
const YOJANA_API = "https://mocki.io/v1/b30e9cf8-f692-4715-b2fc-81523b67f6c7";

// Middleware
app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin: [
      "http://localhost:5173", // Vite
      "http://localhost:3000", // CRA
      "http://localhost:44308", // ASP.NET MVC local
      "http://192.168.1.41:44308", // MVC on LAN
      /\.railway\.app$/, // Any Railway frontend (regex)
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
    })
    .optional(),
});

// --- Resource Catalog ---
const linkCatalog = [
  {
    message: "You can register here",
    links: [
      {
        label: "Register",
        url: "https://divyangparbhani.altwise.in/home/newregistration",
      },
    ],
  },
  {
    message: "You can log in using this link:",
    links: [
      {
        label: "Login",
        url: "https://divyangparbhani.altwise.in/home/login",
      },
    ],
  },
  {
    message:
      "I can help with divyang portal related issues only. I can't help with that.",
  },
];

// --- Helper: Build system prompt ---
function buildSystemPrompt(context) {
  return `You are a helpful assistant for a Disability Yojana chatbot.
Rules:
1. User may ask in Hindi, Marathi, or English. Reply in the same language.
2. If user asks about Yojana, extract these details if possible:
   - Age (1–100)
   - Disability type (from 21 categories provided)
   - Disability percentage (1–100)
3. If details are missing, politely ask. But do not get stuck in loops.
4. Always filter Yojanas based on API dataset.
5. Never invent URLs, only use known resource links.
6. Only answer about Disability Portal (Yojanas, login, register). Reject unrelated queries.

Context: ${JSON.stringify(context || {}, null, 2)}
Available resources: ${JSON.stringify(linkCatalog, null, 2)}

Respond with valid JSON:
{
  "message": "string",
  "age": "number or null",
  "disabilityType": "string or null",
  "percentage": "number or null",
  "links": [ { "label": "string", "url": "string" } ]
}`;
}

// --- Helper: Coerce AI output to valid JSON ---
function coerceGeminiJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return { message: text };
      }
    }
    return { message: text };
  }
}

// --- Route: Chat ---
app.post("/api/chat", async (req, res) => {
  const parsed = ChatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const { message, context = {} } = parsed.data;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.json({
      message: "Developer mode: Set GEMINI_API_KEY to enable AI responses.",
      links: linkCatalog,
    });
  }

  try {
    // --- Step 1: Ask Gemini to extract user info ---
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const system = buildSystemPrompt(context);
    const prompt = `${system}\n\nUser: ${message}\nAssistant:`;

    const result = await model.generateContent([{ text: prompt }]);

    let text = "";
    try {
      text = result.response.text();
    } catch (e) {
      console.error("⚠️ Gemini returned no text:", e);
    }

    if (!text) {
      return res.json({
        message: "I couldn’t generate a response, please try again.",
        links: [],
      });
    }

    const json = coerceGeminiJson(text);

    // --- Step 2: Fetch Yojanas from API ---
    let yojanas = [];
    try {
      const apiRes = await axios.get(YOJANA_API);
      yojanas = apiRes.data;
    } catch (err) {
      console.error("❌ Error fetching Yojanas API:", err.message);
      return res.status(500).json({
        message: "Unable to fetch Yojana data. Please try later.",
        links: [],
      });
    }

    // --- Step 3: Filter Yojanas ---
    const { age, disabilityType, percentage } = json;

    let filtered = yojanas;

    if (age) {
      filtered = filtered.filter(
        (y) => age >= y.Start_Age && age <= y.UpTo_Age
      );
    }
    if (percentage) {
      filtered = filtered.filter(
        (y) => percentage >= y.tblYojanaDivyangTypePercentages
      );
    }
    if (disabilityType) {
      filtered = filtered.filter((y) =>
        y.tblDivyangTypes.includes(disabilityType)
      );
    }

    // If nothing matched, suggest top 3 anyway
    if (filtered.length === 0) {
      filtered = yojanas.slice(0, 3);
    }

    // --- Step 4: Ensure only known links ---
    const links = Array.isArray(json.links)
      ? json.links.filter((out) =>
          linkCatalog.some((known) =>
            known.links?.some((l) => l.url === out.url)
          )
        )
      : [];

    // --- Step 5: Respond ---
    return res.json({
      message: String(json.message || "Here are some Yojanas.").trim(),
      yojanas: filtered.slice(0, 3), // only top 3 suggestions
      links,
      context, // just for debugging, not for memory
    });
  } catch (err) {
    console.error("❌ Error in /api/chat:", err);
    return res.status(500).json({
      message: "Sorry, there was an issue processing your request.",
      links: [],
    });
  }
});

// --- Health Check ---
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// --- Start Server ---
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Chatbot backend listening on port ${PORT}`);
});
