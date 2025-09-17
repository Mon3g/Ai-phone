import express from "express";
import WebSocket, { WebSocketServer } from "ws";
import fetch from "node-fetch";
import base64 from "base64-js";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("✅ Server is running"));

const server = app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);

const wss = new WebSocketServer({ server });

wss.on("connection", async (ws) => {
  console.log("✅ Twilio WebSocket connected");

  // Connect to OpenAI Realtime API
  const openaiWS = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17", {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  openaiWS.on("open", () => {
    console.log("🔗 Connected to OpenAI Realtime API");

    // Create session with correct audio format
    openaiWS.send(JSON.stringify({
      type: "session.create",
      session: {
        input_audio_format: {
          type: "pcm16",
          sample_rate_hz: 8000,
          channels: 1
        },
        output_audio_format: {
          type: "pcm16",
          sample_rate_hz: 8000,
          channels: 1
        },
        instructions: "You are a helpful assistant speaking to a human over the phone. Keep responses short."
      }
    }));
  });

  openaiWS.on("message", (message) => {
    const data = JSON.parse(message);
    if (data.type === "error") {
      console.error("📡 OpenAI Event: error", data);
    } else {
      console.log(`📡 OpenAI Event: ${data.type}`);
    }

    // Forward audio from OpenAI to Twilio
    if (data.type === "response.output_audio.delta") {
      ws.send(Buffer.from(base64.toByteArray(data.delta)));
    }
  });

  ws.on("message", (msg) => {
    // Convert incoming Twilio audio into base64 PCM16
    openaiWS.send(JSON.stringify({
      type: "input_audio_buffer.append",
      audio: msg.toString("base64"),
    }));

    console.log(`🎤 Received ${msg.length} bytes (decoded to PCM)`);
  });

  ws.on("close", () => {
    console.log("❌ Twilio WebSocket closed");
    openaiWS.close();
  });
});
 