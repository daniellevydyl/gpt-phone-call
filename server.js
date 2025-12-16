import express from "express";
import dotenv from "dotenv";
import twilio from "twilio";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const { twiml } = twilio;
const VoiceResponse = twiml.VoiceResponse;

// Gemini setup - pass API key as an object and use a valid model name
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Simple in-memory session store (per call)
const sessions = new Map();

// Entry point: Twilio hits this when the call starts
app.post("/twiml", (req, res) => {
  const response = new VoiceResponse();
  response.say("Connecting you to Gemini. Ask me anything after the beep.");
  response.gather({
    input: "speech",
    action: "/gather",
    method: "POST",
    timeout: 5,
    speechTimeout: "auto"
  }).say("I'm listening...");
  response.redirect("/twiml"); // loop if silence
  res.type("text/xml").send(response.toString());
});

// Handle speech input
app.post("/gather", async (req, res) => {
  const callSid = req.body.CallSid;
  const userText = req.body.SpeechResult || "";

  // Initialize or append to conversation
  const history = sessions.get(callSid) || [
    { role: "system", content: "You are a helpful assistant speaking over a phone call. Keep replies short and clear." }
  ];
  history.push({ role: "user", content: userText });

  // Ask Gemini
  let reply = "I didn’t catch that. Could you repeat?";
  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userText }]}]
    });
    // result.response.text() may be a method - keep same usage
    reply = result.response?.text?.() || (result?.candidates?.[0]?.content?.text || reply);
  } catch (err) {
    console.error("Gemini error:", err);
  }

  history.push({ role: "assistant", content: reply });
  sessions.set(callSid, history);

  // Respond with TwiML
  const response = new VoiceResponse();
  response.say(reply);
  response.gather({
    input: "speech",
    action: "/gather",
    method: "POST",
    timeout: 5,
    speechTimeout: "auto"
  }).say("What would you like to ask next?");
  response.redirect("/twiml");
  res.type("text/xml").send(response.toString());
});

// Cleanup when call ends
app.post("/hangup", (req, res) => {
  sessions.delete(req.body.CallSid);
  res.type("text/xml").send(new VoiceResponse().say("Goodbye.").toString());
});

// Use Render's PORT environment variable
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running with Gemini on port ${PORT}`);
});
