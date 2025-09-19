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
            awaitingAge: z.boolean().optional(), // ✅ track if bot is waiting for age
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
Follow these rules strictly:
1. If the query is about Yojana or scheme and no age is provided, ask for the user's age.
2. If an age is given, filter from the Yojana dataset and return the top 3 matching schemes.
3. For any other queries, respond concisely and factually. 
4. Include resource links only from the catalog, never invent URLs.

Context: ${JSON.stringify(context || {}, null, 2)}
Available resources: ${JSON.stringify(linkCatalog, null, 2)}

Output JSON with keys: message (string), optional links (array), and optional yojanas (array).`;
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
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    }

    const userContext = new Map();
    const { message, context = {} } = parsed.data;
    const apiKey = process.env.GEMINI_API_KEY;

    const userId = context?.userId || "default";

    // Get user session (store age & disability)
    if (!userContext.has(userId)) {
        userContext.set(userId, { age: null, disability: null });
    }
    const session = userContext.get(userId);

    // --- 1. Detect Age from message ---
    const ageMatch = message.match(/\b(\d{1,2})\b/); // finds numbers like 25, 55
    if (ageMatch) {
        session.age = parseInt(ageMatch[1]);
    }

    // --- 2. Detect disability type from keywords ---
    if (/vision|blind|eyes?/i.test(message)) session.disability = "vision disability";
    if (/hearing|deaf|ear/i.test(message)) session.disability = "hearing disability";
    if (/hand|arm|limb/i.test(message)) session.disability = "physical disability";


    // ✅ Step 1: Detect Yojana/scheme query
    if (/yojana|scheme/i.test(message) && !session.age) {
        return res.json({ message: "Please tell me your age so I can suggest the best schemes for you.", links: [] });
    }

    // --- 4. If we have age → filter schemes ---
    if (session.age) {
        const eligible = yojanas.filter(y => session.age >= y.Start_Age && session.age <= y.UpTo_Age);
        const top3 = eligible.slice(0, 3);

        if (top3.length > 0) {
            return res.json({
                message: `Based on your age (${session.age}) ${session.disability ? "and " + session.disability : ""}, here are some Yojanas:`,
                yojanas: top3,
                links: []
            });
        } else {
            return res.json({ message: `Sorry, no Yojana is available for your age (${session.age}).`, links: [] });
        }
    }

    // ✅ Step 3: Fallback to Gemini
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
            yojanas: json.yojanas || [],
            context, // maintain context
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
