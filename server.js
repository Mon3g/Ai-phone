import express from "express";
import bodyParser from "body-parser";
import { WebSocketServer } from "ws";
import WebSocket from "ws"; // Needed for OpenAI connection
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

  // Connect to OpenAI Realtime API
  const openaiWS = await connectToOpenAI();

  // Forward audio from Twilio → OpenAI
  twilioWS.on("message", (message) => {
    try {
      const msg = JSON.parse(message.toString());

      // Twilio sends keepalive events, we only care about media
      if (msg.event === "media" && msg.media?.payload) {
        const audioData = Buffer.from(msg.media.payload, "base64");
        openaiWS.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: audioData.toString("base64"),
          })
        );
      } else if (msg.event === "stop") {
        console.log("🛑 Call ended by Twilio");
        openaiWS.close();
      }
    } catch (err) {
      console.error("❌ Error parsing Twilio message:", err);
    }
  });

  // Forward AI audio → Twilio
  openaiWS.on("message", (data) => {
    try {
      const event = JSON.parse(data.toString());

      if (event.type === "output_audio_buffer.delta") {
        // Send audio back to Twilio
        twilioWS.send(
          JSON.stringify({
            event: "media",
            media: { payload: event.audio },
          })
        );
      }
    } catch (err) {
      console.error("❌ Error handling OpenAI message:", err);
    }
  });

  twilioWS.on("close", () => {
    console.log("❌ Twilio WebSocket closed");
    openaiWS.close();
  });
});

// === 3. CREATE HTTP SERVER AND UPGRADE TO WS ===
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
      // Start session with audio output enabled
      ws.send(
        JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["audio"],
            instructions: "You are a helpful phone assistant. Reply conversationally.",
            voice: "verse", // or alloy, nova, etc.
          },
        })
      );
      resolve(ws);
    });

    ws.on("error", (err) => {
      console.error("❌ Error connecting to OpenAI:", err);
      reject(err);
    });
  });
}
