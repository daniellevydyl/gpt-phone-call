import express from "express";
import dotenv from "dotenv";
import http from "http";
import { WebSocketServer } from "ws";
import twilio from "twilio";
import OpenAI from "openai";

dotenv.config();

// Twilio setup
const { twiml } = twilio;
const VoiceResponse = twiml.VoiceResponse;

// OpenAI setup
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
const server = http.createServer(app);

// WebSocket server, routed to /voice-stream
const wss = new WebSocketServer({ noServer: true });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Twilio webhook: returns TwiML to start streaming audio
app.post("/twiml", (req, res) => {
  const response = new VoiceResponse();
  response.say("Connecting you to GPT...");
  response.connect().stream({
    url: "wss://gpt-phone-call.onrender.com/voice-stream"
  });

  res.type("text/xml");
  res.send(response.toString());
});

// Route WebSocket connections to /voice-stream
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/voice-stream") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  }
});

// Handle Twilio audio stream
wss.on("connection", (ws) => {
  console.log("🔊 Twilio stream connected");

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      if (data.event === "media") {
        // Decode base64 audio payload
        const audioBuffer = Buffer.from(data.media.payload, "base64");

        // 1. Transcribe audio with Whisper
        const transcription = await openai.audio.transcriptions.create({
          file: audioBuffer,
          model: "whisper-1"
        });

        console.log("📝 User said:", transcription.text);

        // 2. Send text to GPT
        const gptResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: transcription.text }]
        });

        const reply = gptResponse.choices[0].message.content;
        console.log("🤖 GPT replied:", reply);

        // 3. Convert GPT reply to speech
        const speech = await openai.audio.speech.create({
          model: "gpt-4o-mini-tts",
          voice: "alloy",
          input: reply
        });

        // 4. Send audio back to Twilio
        ws.send(speech);
      }
    } catch (err) {
      console.error("❌ Error handling audio:", err);
    }
  });

  ws.on("close", () => {
    console.log("❌ Twilio stream disconnected");
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running");
});
