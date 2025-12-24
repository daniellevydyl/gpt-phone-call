import express from "express";
import dotenv from "dotenv";
import twilio from "twilio";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// 🔒 ONLY THIS PHONE NUMBER CAN CALL
const ALLOWED_NUMBER = "+972554402506"; // <-- PUT YOUR PHONE NUMBER HERE

// Crash logging
process.on("uncaughtException", err => console.error("UNCAUGHT:", err));
process.on("unhandledRejection", err => console.error("UNHANDLED:", err));

const { twiml } = twilio;
const VoiceResponse = twiml.VoiceResponse;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ---------------------------------------------------------
// 🔥 UPDATED SECTION: Added Google Search Tool
// ---------------------------------------------------------
const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash", 
    systemInstruction: "You are a helpful phone assistant. You have access to Google Search, so please check for the latest information (like weather, news, or car specs) when asked. Keep replies short, clear, and natural for a voice call. No emojis.",
    tools: [
        {
            googleSearch: {}
        }
    ]
});
// ---------------------------------------------------------

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const sessions = new Map();

// 🔥 THIS MUST NEVER FAIL
app.post("/twiml", (req, res) => {
    console.log("📞 /twiml hit");

    // 🔒 BLOCK ALL CALLERS EXCEPT YOUR NUMBER
    if (req.body.From !== ALLOWED_NUMBER) {
        const response = new VoiceResponse();
        response.reject();
        return res.type("text/xml").send(response.toString());
    }

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
        response.gather({
            input: "speech",
            action: "/gather",
            method: "POST"
        });
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
