import express from "express";
import expressWs from "express-ws";
import WebSocket from "ws";
import base64js from "base64-js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17";

const app = express();
expressWs(app);

// μ-law decode lookup table
const muLawDecodeTable = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  let u = ~i;
  let sign = (u & 0x80) ? -1 : 1;
  let exponent = (u >> 4) & 7;
  let mantissa = u & 0x0f;
  let sample = (((mantissa << 1) + 1) << (exponent + 2)) - 33;
  muLawDecodeTable[i] = sign * sample;
}

function decodeMuLaw(ulawData) {
  const pcm = new Int16Array(ulawData.length);
  for (let i = 0; i < ulawData.length; i++) {
    pcm[i] = muLawDecodeTable[ulawData[i]];
  }
  return pcm;
}

function encodeMuLaw(pcmData) {
  const BIAS = 0x84;
  const CLIP = 32635;
  let muLawData = new Uint8Array(pcmData.length);

  for (let i = 0; i < pcmData.length; i++) {
    let sample = pcmData[i];
    let sign = (sample >> 8) & 0x80;
    if (sign !== 0) sample = -sample;
    if (sample > CLIP) sample = CLIP;
    sample += BIAS;

    let exponent = 7;
    for (let expMask = 0x4000;
      (sample & expMask) === 0 && exponent > 0;
      exponent--, expMask >>= 1);
    let mantissa = (sample >> (exponent + 3)) & 0x0f;
    let ulawByte = ~(sign | (exponent << 4) | mantissa);
    muLawData[i] = ulawByte;
  }
  return muLawData;
}

// Twilio <Stream> WebSocket endpoint
app.ws("/twilio-stream", async (ws, req) => {
  console.log("✅ Twilio WebSocket connected");

  const pendingAudio = [];
  let openaiReady = false;

  // Connect to OpenAI Realtime API
  const openaiWS = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  openaiWS.on("open", () => {
    console.log("🔗 Connected to OpenAI Realtime API");
    openaiReady = true;

    // Flush queued audio
    for (const audio of pendingAudio) {
      openaiWS.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio
      }));
    }
    pendingAudio.length = 0;

    // ✅ Request both audio + text
    openaiWS.send(JSON.stringify({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        instructions: "Reply conversationally and briefly.",
        voice: "verse"
      }
    }));
  });

  // Handle OpenAI messages
  openaiWS.on("message", (raw) => {
    const event = JSON.parse(raw.toString());

    if (event.type === "error") {
      console.error("📡 OpenAI ERROR:", JSON.stringify(event, null, 2));
      return;
    }

    console.log("📡 OpenAI Event:", event.type);

    if (event.type === "output_audio_buffer.delta") {
      const pcm16 = Buffer.from(event.delta, "base64");
      const pcmView = new Int16Array(pcm16.buffer, pcm16.byteOffset, pcm16.length / 2);
      const ulaw = encodeMuLaw(pcmView);

      ws.send(JSON.stringify({
        event: "media",
        media: { payload: Buffer.from(ulaw).toString("base64") }
      }));
    }
  });

  // Handle Twilio messages
  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "media" && data.media?.payload) {
      const ulaw = Buffer.from(data.media.payload, "base64");
      const pcm16 = decodeMuLaw(ulaw);
      const base64Audio = base64js.fromByteArray(new Uint8Array(pcm16.buffer));

      if (openaiReady) {
        openaiWS.send(JSON.stringify({
          type: "input_audio_buffer.append",
          audio: base64Audio
        }));
      } else {
        pendingAudio.push(base64Audio);
      }
    } else if (data.event === "start") {
      console.log("📞 Call started");
    } else if (data.event === "stop") {
      console.log("🛑 Caller hung up");
      openaiWS.close();
    }
  });

  ws.on("close", () => {
    console.log("❌ Twilio WebSocket closed");
    openaiWS.close();
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
