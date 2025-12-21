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

// FIXED: Using Gemini 1.5 Pro (The current high-end frontier model)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-pro", 
  systemInstruction:
    "You are a high-end AI assistant. The user will speak in English. You must ALWAYS respond in HEBREW. " +
    "Keep responses short, natural, and professional. Do NOT use emojis, asterisks, or any markdown symbols."
});

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const sessions = new Map();

/**
 * FIXED: This function removes asterisks (*) and other symbols 
 * that cause Twilio Error 13520.
 */
function cleanTextForTwilio(text) {
  return text
    .replace(/\*/g, "")  // Remove asterisks
    .replace(/#/g, "")   // Remove hashtags
    .replace(/_/g, "")   // Remove underscores
    .trim();
}

app.post("/twiml", (req, res) => {
  const response = new VoiceResponse();
  
  // Respond in Hebrew
  response.say(
    { language: "he-IL", voice: "Polly.Carmit" },
    "שלום, אני מופעל על ידי ג'מיני פרו. אני מקשיב באנגלית ואענה לך בעברית."
  );

  // FIXED: Listen in English (en-US) to solve Error 13512
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

app.post("/gather", async (req, res) => {
  const response = new VoiceResponse();
  const callSid = req.body.CallSid;
  const userText = req.body.SpeechResult;

  if (!userText) {
    response.say({ language: "he-IL", voice: "Polly.Carmit" }, "לא שמעתי, תוכל לחזור על השאלה?");
    response.gather({
      input: "speech",
      action: "/gather",
      method: "POST",
      language: "en-US"
    });
    return res.type("text/xml").send(response.toString());
  }

  console.log(`User (EN): ${userText}`);

  let chat = sessions.get(callSid);
  if (!chat) {
    chat = model.startChat({ history: [] });
    sessions.set(callSid, chat);
  }

  let reply = "סליחה, יש לי תקלה טכנית.";
  try {
    const result = await chat.sendMessage(userText);
    const rawReply = result.response.text();
    
    // FIXED: Sanitize the text to solve Error 13520
    reply = cleanTextForTwilio(rawReply);
    
    console.log(`AI (HE): ${reply}`);
  } catch (e) {
    console.error("Gemini Error:", e);
  }

  // Voice output in Hebrew
  response.say({ language: "he-IL", voice: "Polly.Carmit" }, reply);

  // FIXED: Continue listening in English
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
app.listen(PORT, () => console.log(`🚀 High-End AI Server running on port ${PORT}`));
