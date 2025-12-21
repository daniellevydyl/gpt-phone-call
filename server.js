import express from "express";
import dotenv from "dotenv";
import twilio from "twilio";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const { twiml } = twilio;
const VoiceResponse = twiml.VoiceResponse;

// 1. SETUP GEMINI (With strict instructions)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-pro", 
  systemInstruction: 
    "You are a phone assistant. " +
    "User speaks: English. You respond: Hebrew. " +
    "CRITICAL: Do NOT use emojis. Do NOT use markdown (no * or #). " +
    "Keep response under 2 sentences."
});

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const sessions = new Map();

// 2. THE FIX: Aggressive Text Cleaner
// This removes emojis, asterisks, and anything that isn't a letter/number/punctuation
function cleanTextForTwilio(text) {
  if (!text) return "מצטער, לא שמעתי.";
  
  // 1. Remove Markdown (*, _, #, `)
  let clean = text.replace(/[*_#`~]/g, "");
  
  // 2. Remove Emojis (The main cause of Error 13520)
  clean = clean.replace(/[\u{1F600}-\u{1F6FF}]/gu, ""); // Basic emojis
  clean = clean.replace(/[\u{1F300}-\u{1F5FF}]/gu, ""); // Symbols/Pictographs
  
  // 3. Trim whitespace
  return clean.trim();
}

// 3. START CALL
app.post("/twiml", (req, res) => {
  const response = new VoiceResponse();
  
  // ERROR 13520 FIX: Use 'he-IL' (Modern Standard) instead of 'iw-IL'
  response.say(
    { language: "he-IL", voice: "Polly.Carmit" },
    "שלום. אני מקשיב. דבר אליי באנגלית."
  );

  // ERROR 13512 FIX: Use 'he-IL' for Gather too. 
  // If this still fails, change language to 'en-US' temporarily.
  response.gather({
    input: "speech",
    action: "/gather",
    method: "POST",
    timeout: 4,
    language: "he-IL" 
  });

  res.type("text/xml").send(response.toString());
});

// 4. HANDLE RESPONSE
app.post("/gather", async (req, res) => {
  const response = new VoiceResponse();
  const callSid = req.body.CallSid;
  const userText = req.body.SpeechResult;

  if (!userText) {
    response.say({ language: "he-IL", voice: "Polly.Carmit" }, "לא שמעתי.");
    response.gather({ input: "speech", action: "/gather", method: "POST", language: "he-IL" });
    return res.type("text/xml").send(response.toString());
  }

  // Get Chat History
  let chat = sessions.get(callSid);
  if (!chat) {
    chat = model.startChat({ history: [] });
    sessions.set(callSid, chat);
  }

  try {
    const result = await chat.sendMessage(userText);
    const rawReply = result.response.text();
    
    // CRITICAL FIX: Clean the text before sending to Twilio
    const reply = cleanTextForTwilio(rawReply);

    console.log(`Original: ${rawReply} | Cleaned: ${reply}`); // Log to check if emojis are removed

    response.say({ language: "he-IL", voice: "Polly.Carmit" }, reply);

  } catch (e) {
    console.error("Error:", e);
    response.say({ language: "he-IL", voice: "Polly.Carmit" }, "תקלה. נסה שוב.");
  }

  // Loop
  response.gather({
    input: "speech",
    action: "/gather",
    method: "POST",
    timeout: 4,
    language: "he-IL"
  });

  res.type("text/xml").send(response.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on Port ${PORT}`));
