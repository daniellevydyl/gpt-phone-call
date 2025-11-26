import express from "express";
import dotenv from "dotenv";
import http from "http";
import { WebSocketServer } from "ws";
import { twiml } from "twilio";
import OpenAI from "openai";

dotenv.config();

const VoiceResponse = twiml.VoiceResponse;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
const server = http.createServer(app);

// Create WebSocket server but don’t bind directly — we’ll route to /voice-stream
const wss = new WebSocketServer({ noServer: true });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Twilio will request this when the call starts
app.post("/twiml", (req, res) => {
  const twiml = new VoiceResponse();
  twiml.say("Connecting you to GPT...");
  twiml.connect().stream({
    url: "wss://gpt-phone-call.onrender.com/voice-stream"
  });

  res.type("text/xml");
  res.send(twiml.toString());
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

      // Twilio sends "media" events with base64 audio payloads
      if (data.event === "media") {
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
