import express from "express";
import expressWs from "express-ws";
import WebSocket from "ws";
import encodeMuLaw from "./utils/encodeMuLaw.js";

const PORT = process.env.PORT || 10000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const app = express();
expressWs(app);

app.ws("/twilio-stream", async (ws, req) => {
  console.log("✅ Twilio WebSocket connected");

  const openAiWs = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview",
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );

  let openAiReady = false;
  let pendingMessages = [];
  let twilioReady = false;
  let bufferedAudio = [];
  let receivedAudio = false;

  let silenceTimer = null;
  const SILENCE_TIMEOUT = 800;

  function scheduleResponse() {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (openAiReady && receivedAudio) {
        console.log("🤖 Detected pause — asking GPT to respond...");
        openAiWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        openAiWs.send(
          JSON.stringify({
            type: "response.create",
            response: {
              modalities: ["audio", "text"],
              instructions:
                "Respond naturally and conversationally to what the caller just said. Keep answers short and friendly.",
            },
          })
        );
        receivedAudio = false; // reset flag for next turn
      }
    }, SILENCE_TIMEOUT);
  }

  openAiWs.on("open", () => {
    console.log("🔗 Connected to OpenAI Realtime API");
    openAiReady = true;

    pendingMessages.forEach((msg) => openAiWs.send(msg));
    pendingMessages = [];
  });

  openAiWs.on("message", (message) => {
    const event = JSON.parse(message);

    if (event.type === "session.created")
      console.log("📡 OpenAI Event: session.created");

    if (event.type === "response.created")
      console.log("📡 OpenAI Event: response.created");

    if (event.type === "response.audio.delta") {
      const ulawBuffer = Buffer.from(event.delta, "base64");
      if (!twilioReady) {
        bufferedAudio.push(ulawBuffer);
        return;
      }

      ws.send(
        JSON.stringify({
          event: "media",
          media: { payload: ulawBuffer.toString("base64") },
        })
      );
    }

    if (event.type === "response.audio.done") {
      console.log("📡 OpenAI Event: response.audio.done");
    }

    if (event.type === "error") {
      console.error("📡 OpenAI ERROR:", JSON.stringify(event, null, 2));
    }
  });

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "start") {
      console.log("📞 Call started");
      twilioReady = true;

      bufferedAudio.forEach((chunk) => {
        ws.send(
          JSON.stringify({
            event: "media",
            media: { payload: chunk.toString("base64") },
          })
        );
      });
      bufferedAudio = [];
    }

    if (data.event === "media") {
      receivedAudio = true;
      const audioBuffer = Buffer.from(data.media.payload, "base64");
      const base64Audio = audioBuffer.toString("base64");

      const message = JSON.stringify({
        type: "input_audio_buffer.append",
        audio: base64Audio,
      });

      if (openAiReady) openAiWs.send(message);
      else pendingMessages.push(message);

      scheduleResponse();
    }

    if (data.event === "stop") {
      console.log("🛑 Caller hung up");
      openAiWs.close();
    }
  });

  ws.on("close", () => {
    console.log("❌ Twilio WebSocket closed");
    openAiWs.close();
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

