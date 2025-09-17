import express from "express";
import bodyParser from "body-parser";
import { WebSocketServer } from "ws";
import WebSocket from "ws";
import { Buffer } from "buffer";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// === 1. TWILIO WEBHOOK FOR INCOMING CALL ===
app.post("/voice", (req, res) => {
  const twiml = `
    <Response>
      <Connect>
        <Stream url="wss://${req.headers.host}/twilio-stream" />
      </Connect>
    </Response>
  `;
  res.type("text/xml");
  res.send(twiml);
});

// === 2. WEBSOCKET SERVER FOR TWILIO AUDIO ===
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", async (twilioWS) => {
  console.log("✅ Twilio call connected (streaming)");

  // Connect to OpenAI
  const openaiWS = await connectToOpenAI();

  let audioBuffer = [];

  twilioWS.on("message", (message) => {
    const msg = JSON.parse(message.toString());

    if (msg.event === "media" && msg.media?.payload) {
      // Collect PCM μ-law audio from Twilio
      const audioChunk = Buffer.from(msg.media.payload, "base64");
      audioBuffer.push(audioChunk);
    }

    if (msg.event === "mark" || msg.event === "stop") {
      console.log("🛑 Caller hung up or stream stopped.");
      openaiWS.close();
    }
  });

  // Periodically send collected audio to OpenAI
  const interval = setInterval(() => {
    if (audioBuffer.length > 0) {
      const chunk = Buffer.concat(audioBuffer);
      audioBuffer = [];

      // Send chunk to OpenAI
      openaiWS.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: chunk.toString("base64"), // Send as base64 PCM
        })
      );

      // Commit so GPT processes it
      openaiWS.send(JSON.stringify({ type: "input_audio_buffer.commit" }));

      // Request GPT to respond
      openaiWS.send(
        JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["audio"],
            instructions:
              "You are a helpful phone assistant. Reply conversationally.",
            voice: "verse",
          },
        })
      );
    }
  }, 1000);

  // Handle OpenAI audio output
  openaiWS.on("message", (data) => {
    const event = JSON.parse(data.toString());

    if (event.type === "output_audio_buffer.delta" && event.audio) {
      // Forward AI audio to Twilio
      twilioWS.send(
        JSON.stringify({
          event: "media",
          media: { payload: event.audio },
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

// === 3. HTTP SERVER + WS UPGRADE ===
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

// === 4. CONNECT TO OPENAI REALTIME API ===
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
      console.error("❌ Error connecting to OpenAI:", err);
      reject(err);
    });
  });
}
