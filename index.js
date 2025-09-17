import express from "express";
import expressWs from "express-ws";

const app = express();
expressWs(app);

const PORT = process.env.PORT || 10000;

app.ws("/twilio-stream", (ws, req) => {
  console.log("✅ Twilio WebSocket connected (TEST MODE)");

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    switch (data.event) {
      case "start":
        console.log("📞 Call started (streamSid:", data.start.streamSid, ")");
        break;

      case "media":
        // Log incoming audio size (μ-law from Twilio)
        console.log(`🎙 Received ${data.media.payload.length} bytes of audio`);

        // (Optional) Send back a short silence tone to confirm playback
        // This is a single 20ms μ-law frame of silence
        ws.send(JSON.stringify({
          event: "media",
          media: { payload: Buffer.alloc(160, 0xff).toString("base64") }
        }));
        break;

      case "stop":
        console.log("🛑 Caller hung up");
        ws.close();
        break;
    }
  });

  ws.on("close", () => console.log("❌ Twilio WebSocket closed (TEST MODE)"));
});

app.get("/", (req, res) => {
  res.send("✅ WebSocket test server running");
});

app.listen(PORT, () => console.log(`🚀 Test server running on port ${PORT}`));
