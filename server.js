import express from "express";
import dotenv from "dotenv";
import twilio from "twilio";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// Critical Error Handling
process.on("uncaughtException", err => console.error("UNCAUGHT:", err));
process.on("unhandledRejection", err => console.error("UNHANDLED:", err));

const { twiml } = twilio;
const VoiceResponse = twiml.VoiceResponse;

// 1. FIX: Use gemini-1.5-pro (High-end and stable)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-pro", 
  systemInstruction:
    "You are a helpful assistant. The user will speak English. You MUST respond ONLY in Hebrew. " +
    "Keep responses short. Do not use any special formatting, no asterisks, no bolding, no emojis. Just plain Hebrew text."
});

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const sessions = new Map();

// Helper to clean AI text so Twilio doesn't crash (Fixes Error 13520)
function cleanText(text) {
  return text.replace(/[*#_]/g, "").trim();
}

// 2. Initial Call Entry
app.post("/twiml", (req, res) => {
  const response = new VoiceResponse();
  
  response.say(
    { language: "he-IL", voice: "Polly.Carmit" },
    "שלום. אני מקשיב באנגלית ואענה בעברית."
  );

  // FIX: language must be en-US for Gather to avoid Error 13512
  response.gather({
    input: "speech",
    action: "/gather",
    method: "POST",
    timeout: 5,
    speechTimeout: "auto",
    language: "en-US" 
  });

  res.type("text/xml").send(response.toString());
});

// 3. Processing the AI Logic
app.post("/gather", async (req, res) => {
  const response = new VoiceResponse();
  const callSid = req.body.CallSid;
  const userText = req.body.SpeechResult;

  // Handle Silence
  if (!userText) {
    response.say({ language: "he-IL", voice: "Polly.Carmit" }, "לא שמעתי אותך. תוכל לחזור על זה?");
    response.gather({
      input: "speech",
      action: "/gather",
      method: "POST",
      language: "en-US"
    });
    return res.type("text/xml").send(response.toString());
  }

  console.log(`User (English): ${userText}`);

  let chat = sessions.get(callSid);
  if (!chat) {
    chat = model.startChat({ history: [] });
    sessions.set(callSid, chat);
  }

  let reply = "אירעה שגיאה בחיבור למערכת.";
  try {
    const result = await chat.sendMessage(userText);
    const aiText = result.response.text();
    
    // FIX: Clean text to prevent Error 13520
    reply = cleanText(aiText);
    
    if (!reply) reply = "מצטער, לא הצלחתי להבין.";
    console.log(`AI (Hebrew): ${reply}`);
  } catch (e) {
    console.error("Gemini Error:", e);
  }

  // Response in Hebrew
  response.say({ language: "he-IL", voice: "Polly.Carmit" }, reply);

  // Listen again in English
  response.gather({
    input: "speech",
    action: "/gather",
    method: "POST",
    timeout: 5,
    speechTimeout: "auto",
    language: "en-US"
  });

  res.type("text/xml").send(response.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server Running on ${PORT}`));
