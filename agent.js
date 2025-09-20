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
1. If the query is about Yojana/scheme and age, disability type, or percentage is missing, ask the user politely for the missing info.
2. Once all details are provided, filter Yojanas from dataset and return top 3 matches with name and description.
3. Never invent URLs, only use known links from the catalog.
4. Only answer about Disability Portal (Yojanas, login, register). Reject unrelated queries.

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

// --- Store session per user ---
const userSessions = new Map();

// --- Routes ---
app.post("/api/chat", async (req, res) => {
    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    }

    const { message, context = {} } = parsed.data;
    const userId = context?.userId || "default";

    // Get or initialize session
    if (!userSessions.has(userId)) {
        userSessions.set(userId, { age: null, disability: null, percentage: null });
    }
    const session = userSessions.get(userId);

    // --- 1. Extract info from user message ---
    const ageMatch = message.match(/\b(\d{1,3})\b/);
    if (ageMatch) session.age = parseInt(ageMatch[1]);

    if (/vision|blind|eyes?/i.test(message)) session.disability = "vision disability";
    if (/hearing|deaf|ear/i.test(message)) session.disability = "hearing disability";
    if (/hand|arm|limb/i.test(message)) session.disability = "physical disability";

    const percentMatch = message.match(/(\d{1,3})\s?%/);
    if (percentMatch) session.percentage = parseInt(percentMatch[1]);

    // --- 2. Ask for missing info first ---
    if (!session.age || !session.disability || !session.percentage) {
        return res.json({
            message: "कृपया आपली माहिती भरा / Please provide your details:",
            formFields: {
                age: session.age,
                disabilityType: session.disability,
                percentage: session.percentage,
            },
            links: [],
        });
    }

    // --- 3. Filter Yojanas ---
    let filtered = yojanas.filter(y =>
        session.age >= y.Start_Age &&
        session.age <= y.UpTo_Age &&
        y.tblDivyangTypes.includes(session.disability) &&
        session.percentage >= y.tblYojanaDivyangTypePercentages
    );

    if (filtered.length === 0) filtered = yojanas.slice(0, 3);

    // --- 4. Clear session after responding ---
    userSessions.set(userId, { age: null, disability: null, percentage: null });

    // --- 5. Respond with Yojanas ---
    return res.json({
        message: `Based on your details (Age: ${session.age}, Disability: ${session.disability}, Percentage: ${session.percentage}), here are some Yojanas:`,
        yojanas: filtered.map(y => ({
            name: y.YojanaName,
            description: y.YojanaDescription,
        })),
        links: [],
    });
});

// --- Health Check ---
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// --- Start Server ---
app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Chatbot backend listening on port ${PORT}`);
});
