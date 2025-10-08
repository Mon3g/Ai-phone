import WebSocket from 'ws';

export default async function mediaStreamRoutes(fastify, opts) {
  const { logger, config } = opts;
  const {
    openAiApiKey,
    temperature,
    voice,
    systemMessage,
    logEventTypes,
    showTimingMath,
  } = config;

  fastify.get('/media-stream', { websocket: true }, (connection, req) => {
    logger.info({ streamSid: null, remoteAddress: req.socket.remoteAddress }, 'Client connected');

    let streamSid = null;
    let latestMediaTimestamp = 0;
    let lastAssistantItem = null;
    let markQueue = [];
    let responseStartTimestampTwilio = null;

    const openAiWs = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=gpt-realtime&temperature=${temperature}`,
      {
        headers: {
          Authorization: `Bearer ${openAiApiKey}`,
        },
      }
    );

    const initializeSession = () => {
      const sessionUpdate = {
        type: 'session.update',
        session: {
          type: 'realtime',
          model: 'gpt-realtime',
          output_modalities: ['audio'],
          audio: {
            input: { format: { type: 'audio/pcmu' }, turn_detection: { type: 'server_vad' } },
            output: { format: { type: 'audio/pcmu' }, voice },
          },
          instructions: systemMessage,
        },
      };

      logger.debug({ sessionUpdate }, 'Sending session update to OpenAI');
      openAiWs.send(JSON.stringify(sessionUpdate));
    };

    const sendInitialConversationItem = () => {
      const initialConversationItem = {
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'Greet the user with "Hello there! I am an AI voice assistant powered by Twilio and the OpenAI Realtime API. You can ask me for facts, jokes, or anything you can imagine. How can I help you?"',
            },
          ],
        },
      };

      if (showTimingMath) logger.debug({ initialConversationItem }, 'Sending initial conversation item');
      openAiWs.send(JSON.stringify(initialConversationItem));
      openAiWs.send(JSON.stringify({ type: 'response.create' }));
    };

    const handleSpeechStartedEvent = () => {
      if (markQueue.length > 0 && responseStartTimestampTwilio != null) {
        const elapsedTime = latestMediaTimestamp - responseStartTimestampTwilio;
        if (showTimingMath)
          logger.debug(
            {
              latestMediaTimestamp,
              responseStartTimestampTwilio,
              elapsedTime,
            },
            'Calculating elapsed time for truncation'
          );

        if (lastAssistantItem) {
          const truncateEvent = {
            type: 'conversation.item.truncate',
            item_id: lastAssistantItem,
            content_index: 0,
            audio_end_ms: elapsedTime,
          };
          if (showTimingMath) logger.debug({ truncateEvent }, 'Sending truncation event');
          openAiWs.send(JSON.stringify(truncateEvent));
        }

        connection.send(
          JSON.stringify({
            event: 'clear',
            streamSid,
          })
        );

        markQueue = [];
        lastAssistantItem = null;
        responseStartTimestampTwilio = null;
      }
    };

    const sendMark = () => {
      if (streamSid) {
        const markEvent = {
          event: 'mark',
          streamSid,
          mark: { name: 'responsePart' },
        };
        connection.send(JSON.stringify(markEvent));
        markQueue.push('responsePart');
      }
    };

    openAiWs.on('open', () => {
      logger.info('Connected to the OpenAI Realtime API');
      setTimeout(initializeSession, 100);
      // sendInitialConversationItem(); // Optional starter prompt
    });

    openAiWs.on('message', (data) => {
      try {
        const response = JSON.parse(data);

        if (logEventTypes.includes(response.type)) {
          logger.debug({ response }, `Received event: ${response.type}`);
        }

        if (response.type === 'response.output_audio.delta' && response.delta) {
          const audioDelta = {
            event: 'media',
            streamSid,
            media: { payload: response.delta },
          };
          connection.send(JSON.stringify(audioDelta));

          if (!responseStartTimestampTwilio) {
            responseStartTimestampTwilio = latestMediaTimestamp;
            if (showTimingMath)
              logger.debug({ responseStartTimestampTwilio }, 'Setting start timestamp for new response');
          }

          if (response.item_id) {
            lastAssistantItem = response.item_id;
          }

          sendMark();
        }

        if (response.type === 'input_audio_buffer.speech_started') {
          handleSpeechStartedEvent();
        }
      } catch (error) {
        logger.error({ err: error, rawMessage: data.toString() }, 'Error processing OpenAI message');
      }
    });

    connection.on('message', (message) => {
      try {
        const data = JSON.parse(message);

        switch (data.event) {
          case 'media':
            latestMediaTimestamp = data.media.timestamp;
            if (showTimingMath) logger.debug({ latestMediaTimestamp }, 'Received media message');
            if (openAiWs.readyState === WebSocket.OPEN) {
              const audioAppend = {
                type: 'input_audio_buffer.append',
                audio: data.media.payload,
              };
              openAiWs.send(JSON.stringify(audioAppend));
            }
            break;
          case 'start':
            streamSid = data.start.streamSid;
            logger.info({ streamSid }, 'Incoming stream has started');
            responseStartTimestampTwilio = null;
            latestMediaTimestamp = 0;
            break;
          case 'mark':
            if (markQueue.length > 0) {
              markQueue.shift();
            }
            break;
          default:
            logger.debug({ event: data.event }, 'Received non-media event');
            break;
        }
      } catch (error) {
        logger.error({ err: error, rawMessage: message.toString() }, 'Error parsing message from Twilio');
      }
    });

    connection.on('close', () => {
      if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
      logger.info('Client disconnected.');
    });

    openAiWs.on('close', () => {
      logger.info('Disconnected from the OpenAI Realtime API');
    });

    openAiWs.on('error', (error) => {
      logger.error({ err: error }, 'Error in the OpenAI WebSocket');
    });
  });
}
