import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

// Create Twilio client with your credentials
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function triggerGPTCall() {
  try {
    const call = await client.calls.create({
      to: process.env.ISRAEL_NUMBER,          // your phone number
      from: process.env.TWILIO_PHONE_NUMBER,  // your Twilio number
      url: "https://gpt-phone-call.onrender.com/twiml"      // local server endpoint
      // If deployed, replace with: "https://gpt-phone-call.onrender.com/twiml"
    });

    console.log("✅ GPT call triggered:", call.sid);
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

triggerGPTCall();
