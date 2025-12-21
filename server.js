import express from "express";
import dotenv from "dotenv";
import twilio from "twilio";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const { twiml } = twilio;
const VoiceResponse = twiml.VoiceResponse;

// 1. HIGH-END MODEL: Using Gemini 1.5 Pro (The stable flagship)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-pro", 
  systemInstruction: 
    "You are a smart assistant. The user will speak English. " +
    "You must ALWAYS respond in Hebrew. Use professional, natural Hebrew. " +
    "No asterisks (*), no markdown, no emojis. Just clean Hebrew text."
});

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const sessions = new Map();

// Helper to clean text so the iw-IL voice doesn't crash (Fixes Error 13520)
function cleanTextForTwilio(text) {
  if (!text) return "מצטער, חלה שגיאה.";
  return text.replace(/[*#_]/g, "").trim();
}

app.post("/twiml", (req, res) => {
  const response = new VoiceResponse();
  
  // SPEAK HEBREW - Using iw-IL as per your documentation
  response.say(
    { language: "iw-IL", voice: "Polly.Carmit" },
    "שלום. אני מופעל על ידי ג'מיני. אני מקשיב באנגלית ואענה לך בעברית."
  );

  // GATHER ENGLISH - Using en-us to ensure Error 13512 is solved
  response.gather({
    input: "speech",
    action: "/gather",
    method: "POST",
    timeout: 5,
    speechTimeout: "auto",
    language: "en-us" 
  });

  res.type("text/xml").send(response.toString());
});

app.post("/gather", async (req, res) => {
  const response = new VoiceResponse();
  const callSid = req.body.CallSid;
  const userText = req.body.SpeechResult;

  if (!userText) {
    response.say({ language: "iw-IL", voice: "Polly.Carmit" }, "לא שמעתי, תוכל לחזור על זה?");
    response.gather({ input: "speech", action: "/gather", method: "POST", language: "en-us" });
    return res.type("text/xml").send(response.toString());
  }

  let chat = sessions.get(callSid);
  if (!chat) {
    chat = model.startChat({ history: [] });
    sessions.set(callSid, chat);
  }

  try {
    const result = await chat.sendMessage(userText);
    const rawReply = result.response.text();
    
    // FIX: Clean the text before passing to the Hebrew voice
    const reply = cleanTextForTwilio(rawReply);

    // SPEAK HEBREW (iw-IL)
    response.say({ language: "iw-IL", voice: "Polly.Carmit" }, reply);

  } catch (e) {
    console.error("Gemini Error:", e);
    response.say({ language: "iw-IL", voice: "Polly.Carmit" }, "מצטער, המערכת לא זמינה.");
  }

  // CONTINUE GATHERING IN ENGLISH
  response.gather({
    input: "speech",
    action: "/gather",
    method: "POST",
    timeout: 5,
    language: "en-us"
  });

  res.type("text/xml").send(response.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 AI Server Fixed | Output: iw-IL | Port ${PORT}`));
