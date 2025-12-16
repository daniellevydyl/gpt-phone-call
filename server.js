import express from "express";
import dotenv from "dotenv";
import twilio from "twilio";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const { twiml } = twilio;
const VoiceResponse = twiml.VoiceResponse;

// Gemini setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// FIX 1: Define the System Instruction HERE, not in the history array
// FIX 2: Use the stable model version '001'
const model = genAI.getGenerativeModel({ 
  model: "gemini-1.5-flash-001",
  systemInstruction: "You are a helpful assistant speaking over a phone call. Keep replies short (1-2 sentences) and clear. Do not use emojis."
});

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// In-memory session store
const sessions = new Map();

// Entry point
app.post("/twiml", (req, res) => {
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

// Handle speech input
app.post("/gather", async (req, res) => {
  const callSid = req.body.CallSid;
  const userText = req.body.SpeechResult; 

  const response = new VoiceResponse();

  // FIX 3: Handle Silence (Prevents Crash)
  if (!userText) {
    response.say("I didn't hear anything. Please say that again.");
    response.gather({ input: "speech", action: "/gather", method: "POST" });
    return res.type("text/xml").send(response.toString());
  }

  // Get history or start new
  // Note: For simplicity, we are sending a "Chat Session" history
  let chatSession = sessions.get(callSid);
  
  // Initialize chat if it doesn't exist
  if (!chatSession) {
    chatSession = model.startChat({
      history: [], // History starts empty, system instruction is handled by the model config above
    });
    sessions.set(callSid, chatSession);
  }

  let reply = "I'm having trouble connecting. One moment.";

  try {
    // FIX 4: Use 'sendMessage' to automatically handle history
    const result = await chatSession.sendMessage(userText);
    reply = result.response.text();
  } catch (err) {
    console.error("Gemini Error:", err); // Check your Render logs for this!
    reply = "I am sorry, I am having a technical issue.";
  }

  // Respond to caller
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

// Cleanup
app.post("/hangup", (req, res) => {
  sessions.delete(req.body.CallSid);
  res.type("text/xml").send(new VoiceResponse().say("Goodbye.").toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
