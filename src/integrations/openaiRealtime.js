import WebSocket from 'ws';

const DEFAULT_MODEL = 'gpt-realtime';
const DEFAULT_TIMEOUT_MS = 15000;

export class OpenAiRealtimeClient {
  constructor({ apiKey, model = DEFAULT_MODEL, logger, defaultVoice, defaultSystemMessage }) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required to initialise the realtime client');
    }

    this.apiKey = apiKey;
    this.model = model;
    this.logger = logger;
    this.defaultVoice = defaultVoice;
    this.defaultSystemMessage = defaultSystemMessage;
  }

  async createPreviewAudio({ persona, promptText, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    const logger = this.logger;
    const personaVoice = persona?.voice || this.defaultVoice;
    const sessionInstructions = persona?.system_message || this.defaultSystemMessage;
    const previewText = promptText || persona?.initial_greeting || persona?.system_message || 'Hello!';

    const openAiWs = new WebSocket(`wss://api.openai.com/v1/realtime?model=${this.model}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    const audioChunks = [];
    let finished = false;

    const cleanup = () => {
      try {
        if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
          openAiWs.close();
        }
      } catch (error) {
        logger?.warn({ err: error }, 'Failed to close realtime preview socket');
      }
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('preview timeout'));
      }, timeoutMs);

      openAiWs.on('open', () => {
        logger?.info({ personaId: persona?.id }, 'OpenAI preview WebSocket opened');

        const sessionUpdate = {
          type: 'session.update',
          session: {
            type: 'realtime',
            model: this.model,
            output_modalities: ['audio'],
            audio: {
              input: {
                format: { type: 'audio/pcmu' },
                turn_detection: { type: 'server_vad' },
              },
              output: {
                format: { type: 'audio/wav' },
                voice: personaVoice,
              },
            },
            instructions: sessionInstructions,
          },
        };

        openAiWs.send(JSON.stringify(sessionUpdate));

        const createItem = {
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: previewText }],
          },
        };

        openAiWs.send(JSON.stringify(createItem));
        openAiWs.send(JSON.stringify({ type: 'response.create' }));
      });

      openAiWs.on('message', (data) => {
        try {
          const msg = JSON.parse(data);

          if (msg.type === 'response.output_audio.delta' && msg.delta) {
            audioChunks.push(msg.delta);
          }

          if (!finished && (msg.type === 'response.done' || msg.type === 'response.content.done')) {
            clearTimeout(timer);
            finished = true;
            cleanup();
            const buffers = audioChunks.map((chunk) => Buffer.from(chunk, 'base64'));
            const combined = Buffer.concat(buffers);
            resolve({ audio_base64: combined.toString('base64'), content_type: 'audio/wav' });
          }
        } catch (error) {
          clearTimeout(timer);
          cleanup();
          reject(error);
        }
      });

      openAiWs.on('error', (error) => {
        clearTimeout(timer);
        cleanup();
        reject(error);
      });
    });
  }
}

export function createOpenAiRealtimeClient({ config, logger }) {
  return new OpenAiRealtimeClient({
    apiKey: config.openAiApiKey,
    model: config.openAiRealtimeModel || DEFAULT_MODEL,
    logger,
    defaultVoice: config.voice,
    defaultSystemMessage: config.systemMessage,
  });
}

