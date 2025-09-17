import express from "express";
import bodyParser from "body-parser";
import { WebSocketServer } from "ws";
import WebSocket from "ws";
import { Buffer } from "buffer";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// ===== 1. Twilio Webhook: Return TwiML =====
app.post("/voice", (req, res) => {
  const twiml = `
    <Response>
      <Connect>
        <Stream url="wss://speech-assistant-openai-realtime-api-node-ddc4.onrender.com/twilio-stream"/>
      </Connect>
    </Response>
  `;
  res.type("text/xml");
  res.send(twiml);
});

// ===== 2. μ-law Conversion (No NPM Packages Needed) =====
function linearToMulawSample(sample) {
  const MULAW_MAX = 0x1FFF;
  const MULAW_BIAS = 0x84;

  let sign = (sample >> 8) & 0x80;
  if (sign !== 0) sample = -sample;

  if (sample > MULAW_MAX) sample = MULAW_MAX;

  sample += MULAW_BIAS;
  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) {
    exponent--;
  }

  const mantissa = (sample >> ((exponent === 0) ? 4 : (exponent + 3))) & 0x0F;
  const mulawByte = ~(sign | (exponent << 4) | mantissa);
  return mulawByte & 0xFF;
}

function convertPcmToMulaw(base64Pcm) {
  const pcmBuffer = Buffer.from(base64Pcm, "base64");
  const sampleCount = pcmBuffer.length / 2;
  const mulawBuffer = Buffer.alloc(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2);
    mulawBuffer[i] = linearToMulawSample(sample);
  }

  return mulawBuffer.toString("base64");
}

// ===== 3. WebSocket Server for Twilio Stream =====
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", async (twilioWS) => {
  console.log("✅ Twilio WebSocket connected");

  // Connect to OpenAI Realtime API
  const openaiWS = await connectToOpenAI();
  let audioBuffer = [];

  twilioWS.on("message", (message) => {
    try {
      const msg = JSON.parse(message.toString());

      if (msg.event === "media" && msg.media?.payload) {
        // Collect caller audio
        const audioChunk = Buffer.from(msg.media.payload, "base64");
        audioBuffer.push(audioChunk);
      }

      if (msg.event === "stop") {
        console.log("🛑 Caller hung up");
        openaiWS.close();
      }
    } catch (err) {
      console.error("Error parsing Twilio message:", err);
    }
  });

  // Flush audio to OpenAI every second
  const interval = setInterval(() => {
    if (audioBuffer.length > 0) {
      const chunk = Buffer.concat(audioBuffer);
      audioBuffer = [];

      // Send caller audio to OpenAI
      openaiWS.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: chunk.toString("base64"),
        })
      );

      // Commit + ask GPT to respond
      openaiWS.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      openaiWS.send(
        JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["audio"],
            instructions:
              "You are a helpful phone assistant. Speak clearly and briefly.",
            voice: "verse",
          },
        })
      );
    }
  }, 1000);

  // Handle GPT's audio output
  openaiWS.on("message", (data) => {
    const event = JSON.parse(data.toString());

    if (event.type === "output_audio_buffer.delta" && event.audio) {
      const mulawBase64 = convertPcmToMulaw(event.audio);

      twilioWS.send(
        JSON.stringify({
          event: "media",
          media: { payload: mulawBase64 },
        })
      );
    }
  });

  twilioWS.on("close", () => {
    console.log("❌ Twilio WebSocket closed");
    clearInterval(interval);
    openaiWS.close();
  });
});

// ===== 4. HTTP + WS Upgrade =====
const server = app.listen(process.env.PORT || 3000, () =>
  console.log("🚀 Server running")
);

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/twilio-stream") {
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req)
    );
  }
});

// ===== 5. Connect to OpenAI Realtime =====
async function connectToOpenAI() {
  const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";
  const headers = {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "OpenAI-Beta": "realtime=v1",
  };

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers });

    ws.on("open", () => {
      console.log("🔗 Connected to OpenAI Realtime API");
      resolve(ws);
    });

    ws.on("error", (err) => {
      console.error("❌ OpenAI connection error:", err);
      reject(err);
    });
  });
}
