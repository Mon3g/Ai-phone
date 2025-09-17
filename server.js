import express from "express";
import bodyParser from "body-parser";
import { WebSocketServer } from "ws";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Endpoint Twilio hits when a call starts
app.post("/voice", (req, res) => {
  const twiml = `
    <Response>
      <Connect>
        <Stream url="wss://${req.headers.host}/twilio-stream"/>
      </Connect>
    </Response>
  `;
  res.type("text/xml");
  res.send(twiml);
});

// WebSocket server for Twilio stream
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", async (ws) => {
  console.log("✅ Twilio call connected via WebSocket");

  // Connect to OpenAI Realtime API
  const openaiWS = await connectToOpenAI();

  ws.on("message", (msg) => {
    // Forward incoming Twilio audio to OpenAI
    openaiWS.send(msg);
  });

  openaiWS.on("message", (msg) => {
    // Forward AI speech back to Twilio caller
    ws.send(msg);
  });

  ws.on("close", () => {
    console.log("❌ Twilio call ended");
    openaiWS.close();
  });
});

// Upgrade HTTP → WebSocket for Twilio stream
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

// Connect to OpenAI Realtime API
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
    ws.on("error", reject);
  });
}
