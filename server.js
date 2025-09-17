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

// ===== 2. μ-law Lookup Table for Decode =====
const MULAW_DECODE_TABLE = new Int16Array(256);
(function buildMulawTable() {
  const MULAW_BIAS = 33;
  for (let i = 0; i < 256; i++) {
    let muLawByte = ~i & 0xff;
    let sign = muLawByte & 0x80;
    let exponent = (muLawByte >> 4) & 0x07;
    let mantissa = muLawByte & 0x0f;
    let sample = ((mantissa << 4) + MULAW_BIAS) << (exponent + 3);
    if (sign !== 0) sample = -sample;
    MULAW_DECODE_TABLE[i] = sample;
  }
})();

function decodeMulawToPcm(ulawBuffer) {
  const pcmBuffer = Buffer.alloc(ulawBuffer.length * 2);
  for (let i = 0; i < ulawBuffer.length; i++) {
    pcmBuffer.writeInt16LE(MULAW_DECODE_TABLE[ulawBuffer[i]], i * 2);
  }
  return pcmBuffer;
}

// ===== 3. PCM → μ-law for GPT Audio =====
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
  return ~(sign | (exponent << 4) | mantissa) & 0xFF;
}

function convertPcmToMulaw(base64Pcm) {
  const pcmBuffer = Buffer.from(base64Pcm, "base64");
  const mulawBuffer = Buffer.alloc(pcmBuffer.length / 2);
  for (let i = 0; i < mulawBuffer.length; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2);
    mulawBuffer[i] = linearToMulawSample(sample);
  }
  return mulawBuffer.toString("base64");
}

// ===== 4. WebSocket Server for Twilio Stream =====
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", async (twilioWS) => {
  console.log("✅ Twilio WebSocket connected");

  const openaiWS = await connectToOpenAI();
  let audioBuffer = [];

  twilioWS.on("message", (message) => {
    try {
      const msg = JSON.parse(message.toString());
      if (msg.event === "media" && msg.media?.payload) {
        const ulawChunk = Buffer.from(msg.media.payload, "base64");
        const pcmChunk = decodeMulawToPcm(ulawChunk);
        console.log(`🎤 Received ${ulawChunk.length} bytes (decoded to PCM)`);
        audioBuffer.push(pcmChunk);
      }
      if (msg.event === "stop") {
        console.log("🛑 Caller hung up");
        openaiWS.close();
      }
    } catch (err) {
      console.error("Error parsing Twilio message:", err);
    }
  });

  // Send audio to OpenAI every second, commit immediately, request response
  const interval = setInterval(() => {
    if (audioBuffer.length > 0) {
      const chunk = Buffer.concat(audioBuffer);
      audioBuffer = [];

      openaiWS.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio: chunk.toString("base64")
      }));
      openaiWS.send(JSON.stringify({ type: "input_audio_buffer.commit" }));

      // ✅ Updated: Explicitly request PCM16 audio output
      openaiWS.send(JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio"],
          audio: { format: "pcm16" },
          instructions: "Reply conversationally and briefly.",
          voice: "verse"
        }
      }));
    }
  }, 1000);

  openaiWS.on("message", (data) => {
    const event = JSON.parse(data.toString());
    console.log("📡 OpenAI Event:", event.type);

    if (event.type === "output_audio_buffer.delta" && event.audio) {
      console.log(`🔊 GPT Audio: ${event.audio.length} bytes`);
      const mulawBase64 = convertPcmToMulaw(event.audio);
      twilioWS.send(JSON.stringify({ event: "media", media: { payload: mulawBase64 } }));
    }
  });

  twilioWS.on("close", () => {
    console.log("❌ Twilio WebSocket closed");
    clearInterval(interval);
    openaiWS.close();
  });
});

// ===== 5. HTTP + WS Upgrade =====
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
