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

// Using the HIGH-END Pro model
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-pro-latest", // or "gemini-3-pro-latest" for the absolute frontier
  systemInstruction:
    "אתה עוזר אישי אינטליגנטי ברמה הגבוהה ביותר. המשתמש מדבר אליך באנגלית. עליך לענות תמיד בעברית רהוטה, טבעית ומדויקת. " +
    "התשובות צריכות להיות קצרות ולעניין כי זהו שימוש בטלפון. אל תשתמש באימוג'י, סימני כוכביות או פורמט טקסט מיוחד - רק טקסט נקי."
});

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const sessions = new Map();

// Initial Entry Point
app.post("/twiml", (req, res) => {
  const response = new VoiceResponse();
  
  // Carmit is the standard Hebrew voice, but ensures it speaks the intro correctly
  response.say(
    { language: "iw-IL", voice: "Polly.Carmit" },
    "שלום, הגעת לשירות הבינה המלאכותית. אני מקשיב באנגלית ואענה לך בעברית. במה אוכל לעזור?"
  );

  // Set language to en-US so Twilio's Speech-to-Text listens for English
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

// Processing Loop
app.post("/gather", async (req, res) => {
  const response = new VoiceResponse();
  const callSid = req.body.CallSid;
  const userText = req.body.SpeechResult;

  if (!userText) {
    response.say({ language: "iw-IL", voice: "Polly.Carmit" }, "לא שמעתי, תוכל לחזור על כך?");
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

  let reply = "סליחה, יש לי בעיה בחיבור.";
  try {
    const result = await chat.sendMessage(userText);
    reply = result.response.text();
    console.log(`Gemini Output (HE): ${reply}`);
  } catch (e) {
    console.error("Gemini Error:", e);
  }

  // Voice output in Hebrew
  response.say({ language: "iw-IL", voice: "Polly.Carmit" }, reply);

  // Continue gathering input in English
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
app.listen(PORT, () => console.log(`🚀 High-End Hebrew AI running on port ${PORT}`));
