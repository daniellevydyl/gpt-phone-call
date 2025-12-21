import express from "express";
import dotenv from "dotenv";
import twilio from "twilio";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// Crash logging
process.on("uncaughtException", err => console.error("UNCAUGHT:", err));
process.on("unhandledRejection", err => console.error("UNHANDLED:", err));

const { twiml } = twilio;
const VoiceResponse = twiml.VoiceResponse;

// FIXED: Using a valid high-end model name
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-pro", 
  systemInstruction:
    "אתה עוזר אישי אינטליגנטי. המשתמש מדבר אנגלית. ענה תמיד בעברית בלבד. " +
    "תשובות קצרות, ללא סימוני טקסט, ללא כוכביות, וללא אימוג'י."
});

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const sessions = new Map();

// 1. Initial Entry Point
app.post("/twiml", (req, res) => {
  const response = new VoiceResponse();
  
  // FIXED: Changed language to he-IL (Standard for Polly.Carmit)
  response.say(
    { language: "he-IL", voice: "Polly.Carmit" },
    "שלום, אני מקשיב באנגלית ואענה לך בעברית. במה אוכל לעזור?"
  );

  response.gather({
    input: "speech",
    action: "/gather",
    method: "POST",
    timeout: 5,
    speechTimeout: "auto",
    language: "en-US" // Listening in English
  });

  res.type("text/xml").send(response.toString());
});

// 2. Processing Loop
app.post("/gather", async (req, res) => {
  const response = new VoiceResponse();
  const callSid = req.body.CallSid;
  const userText = req.body.SpeechResult;

  if (!userText) {
    response.say({ language: "he-IL", voice: "Polly.Carmit" }, "לא שמעתי, אפשר לחזור על זה?");
    response.gather({
      input: "speech",
      action: "/gather",
      method: "POST",
      language: "en-US"
    });
    return res.type("text/xml").send(response.toString());
  }

  console.log(`User Input (EN): ${userText}`);

  let chat = sessions.get(callSid);
  if (!chat) {
    chat = model.startChat({ history: [] });
    sessions.set(callSid, chat);
  }

  let reply = "סליחה, יש תקלה קטנה."; 
  try {
    const result = await chat.sendMessage(userText);
    reply = result.response.text();
    
    // CLEANUP: Remove any asterisks or special markdown that Gemini often adds
    // This prevents Error 13520 (Invalid Text)
    reply = reply.replace(/[*#_]/g, ""); 
    
    if (!reply || reply.trim().length === 0) reply = "לא הצלחתי למצוא תשובה.";
    
    console.log(`Gemini Output (HE): ${reply}`);
  } catch (e) {
    console.error("Gemini Error:", e);
    reply = "סליחה, המנוע של ג'מיני לא זמין כרגע.";
  }

  // FIXED: Changed language to he-IL
  response.say({ language: "he-IL", voice: "Polly.Carmit" }, reply);

  // Continue gathering
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
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
