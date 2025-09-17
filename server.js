import express from "express";
import bodyParser from "body-parser";
import { WebSocketServer } from "ws";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Hardcoded TwiML
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

// Minimal WebSocket Echo Server
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws) => {
  console.log("✅ Twilio WebSocket connected");
  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.event === "media" && data.media?.payload) {
        // Echo back the same audio so Twilio plays it
        ws.send(
          JSON.stringify({
            event: "media",
            media: { payload: data.media.payload },
          })
        );
      }
    } catch (err) {
      console.error("Error parsing:", err);
    }
  });

  ws.on("close", () => console.log("❌ Twilio WebSocket closed"));
});

// Create HTTP server + upgrade for WS
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
