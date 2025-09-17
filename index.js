app.ws("/twilio-stream", async (ws, req) => {
  console.log("✅ Twilio WebSocket connected");

  // Queue for Twilio audio received before OpenAI is ready
  const pendingAudio = [];

  const openaiWS = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  let openaiReady = false;

  openaiWS.on("open", () => {
    console.log("🔗 Connected to OpenAI Realtime API");
    openaiReady = true;

    // Flush any queued audio
    for (const audio of pendingAudio) {
      openaiWS.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio
      }));
    }
    pendingAudio.length = 0;

    // Ask GPT to respond in PCM16
    openaiWS.send(JSON.stringify({
      type: "response.create",
      response: {
        modalities: ["audio"],
        audio: { format: "pcm16" },
        instructions: "Reply conversationally and briefly.",
        voice: "verse"
      }
    }));
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
