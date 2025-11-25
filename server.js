import express from "express";
import { VoiceResponse } from "twilio";
import dotenv from "dotenv";
import http from "http";
import WebSocket from "ws";

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.post("/twiml", (req, res) => {
  const twiml = new VoiceResponse();
  twiml.say("Connecting you to GPT...");
  twiml.connect().stream({
    url: "wss://gpt-phone-call.onrender.com/voice-stream"
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

wss.on("connection", (ws) => {
  console.log("🔊 Twilio stream connected");

  ws.on("message", async (msg) => {
    // TODO: Handle audio chunks, send to Whisper + GPT, return audio
    console.log("🎧 Received audio chunk:", msg.length);
  });

  ws.on("close", () => {
    console.log("❌ Twilio stream disconnected");
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running");
});
