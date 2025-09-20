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
    })
    .optional(),
});

// --- Resource Catalog (fixed links only) ---
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
      { label: "Login", url: "https://divyangparbhani.altwise.in/home/login" },
    ],
  },
];

// --- Helper: Coerce Gemini output to valid JSON ---
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

// --- Fetch Yojanas from API ---
async function fetchYojanas() {
  try {
    const res = await fetch(
      "https://mocki.io/v1/b30e9cf8-f692-4715-b2fc-81523b67f6c7"
    );
    if (!res.ok) throw new Error(`Yojana API error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("❌ Failed to fetch Yojanas:", err);
    return [];
  }
}

// --- Detect if message is casual small talk ---
function isSmallTalk(msg) {
  return /^(hi|hello|hey|namaste|नमस्कार|हाय|कसे आहात|how are you)/i.test(msg);
}

// --- Extract intent from message ---
function detectIntent(message, yojanas) {
  const msg = message.toLowerCase();

  // Field-specific queries
  if (msg.includes("last date") || msg.includes("शेवटची तारीख")) {
    return { type: "lastDate" };
  }
  if (msg.includes("publish date") || msg.includes("प्रकाशित")) {
    return { type: "publishDate" };
  }
  if (msg.includes("published by") || msg.includes("कोण प्रकाशित")) {
    return { type: "publishedBy" };
  }
  if (msg.includes("description") || msg.includes("तपशील") || msg.includes("माहिती")) {
    return { type: "description" };
  }

  // If query contains yojana name
  const found = yojanas.find((y) =>
    msg.includes(y.YojanaName.toLowerCase())
  );
  if (found) {
    return { type: "yojanaByName", yojana: found };
  }

  // If query about schemes
  if (msg.includes("yojana") || msg.includes("scheme") || msg.includes("योजना")) {
    return { type: "yojanaList" };
  }

  // Default → small talk or fallback
  return { type: "other" };
}

// --- Routes ---
app.post("/api/chat", async (req, res) => {
  const parsed = ChatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const { message, context = {} } = parsed.data;
  const apiKey = process.env.GEMINI_API_KEY;

  // ✅ If casual talk → Gemini AI (short reply)
  if (isSmallTalk(message)) {
    if (!apiKey) {
      return res.json({ message: "Hello 👋", links: [] });
    }
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent([
        { text: `Reply shortly to this user greeting in Marathi/Hindi/English: "${message}"` },
      ]);
      return res.json({ message: result.response.text(), links: [] });
    } catch (err) {
      console.error("⚠️ Gemini error:", err);
      return res.json({ message: "Hello 👋", links: [] });
    }
  }

  // ✅ Yojana-related queries
  const yojanas = await fetchYojanas();
  const intent = detectIntent(message, yojanas);

  switch (intent.type) {
    case "yojanaByName":
      return res.json({
        message: `${intent.yojana.YojanaName}: ${intent.yojana.YojanaDescription}`,
        yojanas: [intent.yojana],
      });

    case "lastDate":
      return res.json({
        message: yojanas
          .map((y) => `${y.YojanaName}: Apply before ${y.YojanaApplayLastDate}`)
          .join("\n"),
        yojanas,
      });

    case "publishDate":
      return res.json({
        message: yojanas
          .map((y) => `${y.YojanaName}: Published on ${y.YojanaPublishDate}`)
          .join("\n"),
        yojanas,
      });

    case "publishedBy":
      return res.json({
        message: yojanas
          .map((y) => `${y.YojanaName}: Published by ${y.PublishedBy}`)
          .join("\n"),
        yojanas,
      });

    case "description":
      return res.json({
        message: yojanas
          .map((y) => `${y.YojanaName}: ${y.YojanaDescription}`)
          .join("\n"),
        yojanas,
      });

    case "yojanaList":
      return res.json({
        message: "Here are the available Yojanas:",
        yojanas,
      });

    default:
      // Not yojana → Gemini fallback
      if (!apiKey) {
        return res.json({
          message: "I can only answer about the Disability Portal and Yojanas.",
          links: linkCatalog,
        });
      }
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent([
          {
            text: `You are a chatbot for Disability Portal. Reply concisely (Marathi/Hindi/English) to: "${message}"`,
          },
        ]);
        const text = result.response.text();
        return res.json({ message: text, links: linkCatalog });
      } catch (err) {
        console.error("❌ Gemini error:", err);
        return res.json({
          message: "Sorry, there was an issue. Please try again.",
          links: [],
        });
      }
  }
});

// --- Health Check ---
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// --- Start Server ---
app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ Chatbot backend listening on port ${PORT}`)
);
