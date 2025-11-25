import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function triggerGPTCall() {
  try {
    const execution = await client.studio.flows(process.env.TWILIO_SUBFLOW_SID)
      .executions.create({
        to: process.env.ISRAEL_NUMBER,
        from: process.env.TWILIO_PHONE_NUMBER,
        parameters: { targetNumber: process.env.ISRAEL_NUMBER }
      });

    console.log("✅ GPT call triggered:", execution.sid);
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

triggerGPTCall();
