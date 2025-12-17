
import express from "express";
import dotenv from "dotenv";
import twilio from "twilio";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// Crash logging (CRITICAL)
process.on("uncaughtException", err => console.error("UNCAUGHT:", err));
process.on("unhandledRejection", err => console.error("UNHANDLED:", err));

const { twiml } = twilio;
const VoiceResponse = twiml.VoiceResponse;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash-001",
  systemInstruction:
    "You are a helpful assistant speaking over a phone call. Keep replies short and clear. Do not use emojis."
});

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const sessions = new Map();

// 🔥 THIS MUST NEVER FAIL
app.post("/twiml", (req, res) => {
  console.log("📞 /twiml hit");

  const response = new VoiceResponse();
  response.say("Connecting you to Gemini. Ask me anything.");
  response.gather({
    input: "speech",
    action: "/gather",
    method: "POST",
    timeout: 5,
    speechTimeout: "auto"
  });

  res.type("text/xml").send(response.toString());
});

app.post("/gather", async (req, res) => {
  const response = new VoiceResponse();
  const callSid = req.body.CallSid;
  const userText = req.body.SpeechResult;

  if (!userText) {
    response.say("I did not hear anything. Please try again.");
    response.gather({ input: "speech", action: "/gather", method: "POST" });
    return res.type("text/xml").send(response.toString());
  }

  let chat = sessions.get(callSid);
  if (!chat) {
    chat = model.startChat({ history: [] });
    sessions.set(callSid, chat);
  }

  let reply = "Sorry, something went wrong.";
  try {
    const result = await chat.sendMessage(userText);
    reply = result.response.text();
  } catch (e) {
    console.error("Gemini error:", e);
  }

  response.say(reply);
  response.gather({
    input: "speech",
    action: "/gather",
    method: "POST",
    timeout: 5,
    speechTimeout: "auto"
  });

  res.type("text/xml").send(response.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Running on ${PORT}`));
