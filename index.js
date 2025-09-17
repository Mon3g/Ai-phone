import express from "express";
import expressWs from "express-ws";
import WebSocket from "ws";
import fetch from "node-fetch";
import encodeMuLaw from "./utils/encodeMuLaw.js";
import { decode as base64Decode } from "base64-arraybuffer";

const app = express();
expressWs(app);

const PORT = process.env.PORT || 10000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17";

// -----------------
// UTIL: Connect to OpenAI Realtime API
// -----------------
async function connectToOpenAI() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(OPENAI_REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1"
      }
    });

    ws.on("open", () => {
      console.log("🔗 Connected to OpenAI Realtime API");
      // Create session with voice enabled
      ws.send(
        JSON.stringify({
          type: "session.create",
          session: {
            model: "gpt-4o-realtime-preview",
            voice: "verse", // Best natural voice
            input_audio_format: "pcm16",
            output_audio_format: "pcm16"
          }
        })
      );
      resolve(ws);
    });

    ws.on("error", reject);
  });
}

// -----------------
// TWILIO STREAM HANDLER
// -----------------
app.ws("/media-stream", async (twilio, req) => {
  console.log("✅ Twilio WebSocket connected");
  let openAiWS;
  try {
    openAiWS = await connectToOpenAI();
  } catch (err) {
    console.error("❌ Could not connect to OpenAI:", err);
    twilio.close();
    return;
  }

  // Buffer for input audio
  let audioBuffer = [];
  let lastCommitTime = Date.now();

  // Receive OpenAI responses
  openAiWS.on("message", (msg) => {
    const event = JSON.parse(msg.toString());

    if (event.type === "response.output_audio.delta") {
      const pcm16 = Buffer.from(event.delta, "base64");
      const ulaw = encodeMuLaw(pcm16);
      twilio.send(
        JSON.stringify({
          event: "media",
          media: { payload: ulaw.toString("base64") }
        })
      );
    }

    if (event.type === "response.created") {
      console.log("📡 OpenAI Event: response.created");
    }
    if (event.type === "error") {
      console.error("📡 OpenAI ERROR:", event);
    }
  });

  twilio.on("message", async (msg) => {
    const data = JSON.parse(msg);
    switch (data.event) {
      case "start":
        console.log(`📞 Call started (streamSid: ${data.start.streamSid} )`);
        break;

      case "media":
        // 1. Decode Twilio μ-law -> PCM16
        const mulawBuffer = Buffer.from(data.media.payload, "base64");
        const pcm16 = muLawToPCM16(mulawBuffer); // See helper below

        // 2. Append to buffer
        audioBuffer.push(pcm16);

        // 3. Commit to OpenAI every 100ms
        if (Date.now() - lastCommitTime > 100) {
          const combined = Buffer.concat(audioBuffer);
          openAiWS.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: combined.toString("base64")
            })
          );
          openAiWS.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
          audioBuffer = [];
          lastCommitTime = Date.now();
        }
        break;

      case "stop":
        console.log("🛑 Caller hung up");
        openAiWS.close();
        twilio.close();
        break;
    }
  });

  twilio.on("close", () => {
    console.log("❌ Twilio WebSocket closed");
    if (openAiWS) openAiWS.close();
  });
});

// -----------------
// μ-law → PCM16 Decoder
// -----------------
function muLawToPCM16(mulaw) {
  const pcm16 = Buffer.alloc(mulaw.length * 2);
  for (let i = 0; i < mulaw.length; i++) {
    const mu = mulaw[i];
    let sign = mu & 0x80;
    let exponent = (mu >> 4) & 0x07;
    let mantissa = mu & 0x0F;
    let sample = ((mantissa << 3) + 0x84) << (exponent + 3);
    if (sign !== 0) sample = -sample;
    pcm16.writeInt16LE(sample, i * 2);
  }
  return pcm16;
}

// -----------------
app.listen(PORT, () => {
  console.log(`🚀 Test server running on port ${PORT}`);
});
