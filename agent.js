// --- Load Environment Variables ---
import dotenv from "dotenv";
dotenv.config();

// --- Dependencies ---
import express from "express";
import cors from "cors";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";

// --- App Setup ---
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json({ limit: "1mb" }));

// ✅ Allow React/MVC frontend + Railway frontend to connect
app.use(
  cors({
    origin: [
      "http://localhost:5173",      // Vite
      "http://localhost:3000",      // CRA
      "http://localhost:44308",     // ASP.NET MVC local
      "http://192.168.1.41:44308",  // MVC on LAN
      /\.railway\.app$/,            // Any Railway frontend (regex)
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
Respond with concise, factual guidance. When appropriate, include relevant resource links by naming them in a JSON array under the key "links", where each item has {label, url}. Use only the resources listed below; do not invent URLs or labels. 

Context: ${JSON.stringify(context || {}, null, 2)}
Available resources: ${JSON.stringify(linkCatalog, null, 2)}

Output JSON with keys: message (string) and optional links (array).`;
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

// --- Routes ---
app.post("/api/chat", async (req, res) => {
  const parsed = ChatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const { message, context } = parsed.data;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.json({
      message: "Developer mode: Set GEMINI_API_KEY to enable AI responses.",
      links: linkCatalog,
    });
  }

  try {
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

    // ✅ Ensure only known links are returned
    const links = Array.isArray(json.links)
      ? json.links.filter((out) =>
          linkCatalog.some((known) =>
            known.links?.some((l) => l.url === out.url)
          )
        )
      : [];

    return res.json({
      message: String(json.message || text).trim(),
      links,
    });
  } catch (err) {
    console.error("❌ Error in /api/chat:", err);
    return res.status(500).json({
      message:
        "Sorry, there was an issue processing your request. Please try again.",
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
