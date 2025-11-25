import express from "express";
import expressWs from "express-ws";
import WebSocket from "ws";
import { config } from "dotenv";
config();

const app = express();
expressWs(app);

app.use(express.json());

// Twilio webhook
app.post("/twilio-stream", (req, res) => {
  res.set("Content-Type", "text/xml");
  res.send(\`
    <Response>
      <Start>
        <Stream url="wss://\${req.headers.host}/media" />
      </Start>
      <Say voice="alice">Hi, GPT is now on the call.</Say>
    </Response>
  \`);
});

// Media WebSocket
app.ws("/media", (ws) => {
  console.log("📞 Twilio connected");

  const openai = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview",
    {
      headers: {
        Authorization: \`Bearer \${process.env.OPENAI_API_KEY}\`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );

  openai.on("open", () => {
    console.log("🤖 OpenAI connected");

    openai.send(
      JSON.stringify({
        type: "response.create",
        response: {
          instructions:
            "You are a friendly AI assistant speaking on a phone call.",
        },
      })
    );
  });

  // Twilio → OpenAI
  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.event === "media") {
        openai.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: data.media.payload,
          })
        );
      }
    } catch (e) {
      console.error("Error:", e);
    }
  });

  // OpenAI → Twilio
  openai.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.type === "response.audio.delta") {
      ws.send(
        JSON.stringify({
          event: "media",
          media: {
            payload: data.delta,
          },
        })
      );
    }
  });

  ws.on("close", () => {
    openai.close();
  });
});

app.listen(3000, () =>
  console.log("🚀 Server running on http://localhost:3000")
);
