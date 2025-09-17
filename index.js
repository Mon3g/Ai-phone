import express from "express";
import expressWs from "express-ws";
import WebSocket from "ws";
import encodeMuLaw from "./utils/encodeMuLaw.js";

const app = express();
expressWs(app);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PORT = process.env.PORT || 10000;

app.ws("/twilio-stream", (ws, req) => {
  console.log("✅ Twilio WebSocket connected");

  let twilioReady = false;
  let openAiWs = null;
  let openAiReady = false;
  let inputBuffer = [];
  let pendingTwilioAudio = [];

  // --- Connect to OpenAI Realtime API ---
  function connectToOpenAI() {
    openAiWs = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview", {
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1"
      }
    });

    openAiWs.on("open", () => {
      console.log("🔗 Connected to OpenAI Realtime API");
      openAiReady = true;

      openAiWs.send(JSON.stringify({
        type: "session.update",
        session: {
          voice: "verse",
          modalities: ["text", "audio"],
          input_audio_format: { type: "pcm16" },
          output_audio_format: { type: "pcm16", sample_rate: 16000 }
        }
      }));

      // Flush any Twilio audio that arrived before OpenAI was ready
      if (pendingTwilioAudio.length > 0) {
        console.log(`📡 Flushing ${pendingTwilioAudio.length} pending audio chunks`);
        for (const payload of pendingTwilioAudio) {
          openAiWs.send(JSON.stringify({
            type: "input_audio_buffer.append",
            audio: payload.toString("base64")
          }));
        }
        openAiWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        openAiWs.send(JSON.stringify({ type: "response.create" }));
        pendingTwilioAudio = [];
      }
    });

    openAiWs.on("message", (msg) => {
      const event = JSON.parse(msg);
      if (event.type?.startsWith("response.audio")) {
        const pcmBuffer = Buffer.from(event.delta ?? event.data ?? [], "base64");
        const downsampled = downsamplePCM16(pcmBuffer, 16000, 8000);
        const ulawBuffer = encodeMuLaw(downsampled);
        ws.send(JSON.stringify({
          event: "media",
          media: { payload: ulawBuffer.toString("base64") }
        }));
      } else if (event.type === "error") {
        console.error("📡 OpenAI ERROR:", event);
      }
    });
  }

  connectToOpenAI();

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    switch (data.event) {
      case "start":
        console.log("📞 Call started");
        twilioReady = true;
        break;

      case "media":
        const audioData = Buffer.from(data.media.payload, "base64");
        if (!openAiReady) {
          pendingTwilioAudio.push(audioData);
        } else {
          inputBuffer.push(audioData);
          if (inputBuffer.length > 4) {
            const merged = Buffer.concat(inputBuffer);
            openAiWs.send(JSON.stringify({
              type: "input_audio_buffer.append",
              audio: merged.toString("base64")
            }));
            openAiWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
            openAiWs.send(JSON.stringify({ type: "response.create" }));
            inputBuffer = [];
          }
        }
        break;

      case "stop":
        console.log("🛑 Caller hung up");
        ws.close();
        openAiWs?.close();
        break;
    }
  });

  ws.on("close", () => {
    console.log("❌ Twilio WebSocket closed");
    openAiWs?.close();
  });
});

// --- PCM16 Downsampler ---
function downsamplePCM16(buffer, inputSampleRate, outputSampleRate) {
  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const input = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
  const newLength = Math.round(input.length / sampleRateRatio);
  const result = new Int16Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0, count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < input.length; i++) {
      accum += input[i];
      count++;
    }
    result[offsetResult] = accum / count;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return Buffer.from(result.buffer);
}

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
