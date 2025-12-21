import express from "express";
import dotenv from "dotenv";
import twilio from "twilio";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const { twiml } = twilio;
const VoiceResponse = twiml.VoiceResponse;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-pro", 
  systemInstruction: 
    "You are a helpful assistant. The user will speak English. " +
    "You must ALWAYS respond in Hebrew. Keep answers short (under 40 words). " +
    "Do NOT use asterisks, markdown, emojis, or special symbols."
});

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const sessions = new Map();

// --- 1. CLEANER FUNCTION (Fixes Error 13520) ---
function cleanTextForTwilio(text) {
  if (!text) return "מצטער, לא הבנתי.";
  
  // Remove *, #, _, emojis, and other markdown symbols
  let clean = text.replace(/[*#_`~>\[\]()]/g, "")
                  .replace(/[\u{1F600}-\u{1F6FF}]/gu, "") // Remove emojis
                  .trim();
                  
  return clean;
}

app.post("/twiml", (req, res) => {
  const response = new VoiceResponse();
  
  // <Say>: Uses Amazon Polly -> MUST use 'he-IL'
  response.say(
    { language: "he-IL", voice: "Polly.Carmit" },
    "שלום. אני כאן. דבר אליי באנגלית."
  );

  // <Gather>: Uses Google STT -> Defaults to 'iw-IL' (Legacy Hebrew)
  // If 'en-US' (English) is acceptable for input, keep it 'en-US'.
  // If you want them to speak HEBREW input, change to 'iw-IL'.
  response.gather({
    input: "speech",
    action: "/gather",
    method: "POST",
    timeout: 5,
    language: "en-US" // Keep en-US if user speaks English, use iw-IL if they speak Hebrew
  });

  res.type("text/xml").send(response.toString());
});

app.post("/gather", async (req, res) => {
  const response = new VoiceResponse();
  const callSid = req.body.CallSid;
  const userText = req.body.SpeechResult;

  if (!userText) {
    // Retry prompt
    response.say({ language: "he-IL", voice: "Polly.Carmit" }, "לא שמעתי, נסה שוב.");
    response.gather({ input: "speech", action: "/gather", method: "POST", language: "en-US" });
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
    
    // Clean text to prevent "Say: Invalid text" error
    const reply = cleanTextForTwilio(rawReply);

    // Speak response (Amazon Polly -> he-IL)
    response.say({ language: "he-IL", voice: "Polly.Carmit" }, reply);

  } catch (e) {
    console.error("Gemini Error:", e);
    response.say({ language: "he-IL", voice: "Polly.Carmit" }, "יש תקלה, נסה שוב.");
  }

  // Continue conversation
  response.gather({
    input: "speech",
    action: "/gather",
    method: "POST",
    timeout: 5,
    language: "en-US"
  });

  res.type("text/xml").send(response.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server Running on ${PORT}`));
