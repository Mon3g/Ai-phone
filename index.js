import Fastify from 'fastify';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import ngrok from '@ngrok/ngrok';
import { createClient } from '@supabase/supabase-js';
import logger from './logger.js';
import { createMcpClients, getMcpTools, closeMcpClients } from './tools/mcp-client.js';
import { dispatchTool } from './tools/dispatcher.js';

// Load environment variables from .env file
dotenv.config();

// Retrieve the OpenAI API key from environment variables.
const { OPENAI_API_KEY } = process.env;

if (!OPENAI_API_KEY) {
  logger.fatal('Missing OpenAI API key. Please set it in the .env file.');
  process.exit(1);
}

// Initialize Fastify
const fastify = Fastify({ logger: false });
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

// Allow empty JSON bodies: some clients (or curl -X POST) may set
// Content-Type: application/json but send no body. Fastify by
// default rejects that with FST_ERR_CTP_EMPTY_JSON_BODY. Add a
// permissive parser that treats an empty body as an empty object.
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
  if (!body) return done(null, {});
  try {
    done(null, JSON.parse(body));
  } catch (err) {
    err.statusCode = 400;
    done(err, undefined);
  }
});

fastify.addHook('onRequest', (request, reply, done) => {
  request.startTime = process.hrtime.bigint();
  logger.info({ reqId: request.id, method: request.method, url: request.url }, 'request received');
  done();
});

fastify.addHook('onResponse', (request, reply, done) => {
  const startTime = request.startTime;
  const durationMs = startTime ? Number((process.hrtime.bigint() - startTime) / BigInt(1e6)) : undefined;
  logger.info(
    {
      reqId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTimeMs: durationMs,
    },
    'request completed'
  );
  done();
});

fastify.addHook('onError', (request, reply, error, done) => {
  logger.error(
    {
      reqId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      err: error,
    },
    'request errored'
  );
  done();
});

fastify.setErrorHandler((error, request, reply) => {
  if (!reply.sent) {
    reply.status(error.statusCode || 500).send({ error: 'internal_server_error' });
  }
});

// Constants
const SYSTEM_MESSAGE =
  'You are a helpful and bubbly AI assistant who loves to chat about anything the user is interested about and is prepared to offer them facts. You have a penchant for dad jokes, owl jokes, and rickrolling – subtly. Always stay positive, but work in a joke when appropriate.';
const VOICE = 'alloy';
const TEMPERATURE = 0.8; // Controls the randomness of the AI's responses
const PORT = process.env.PORT || 5050; // Allow dynamic port assignment

// List of Event Types to log to the console. See the OpenAI Realtime API Documentation: https://platform.openai.com/docs/api-reference/realtime
const LOG_EVENT_TYPES = [
  'error',
  'response.content.done',
  'rate_limits.updated',
  'response.done',
  'input_audio_buffer.committed',
  'input_audio_buffer.speech_stopped',
  'input_audio_buffer.speech_started',
  'session.created',
  'session.updated',
];

// Show AI response elapsed timing calculations
const SHOW_TIMING_MATH = false;

// Supabase client for server-side persona management
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
  logger.fatal('SUPABASE_URL and SUPABASE_SERVICE_KEY are required. Set them in your .env file.');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Helper: Verify Bearer token from Authorization header using Supabase Admin client
async function verifyAuth(request) {
  try {
    const authHeader = request.headers.authorization || '';
    const token = (authHeader.startsWith('Bearer ') && authHeader.split(' ')[1]) || null;
    if (!token) return { user: null, error: 'missing token' };
    const { data, error } = await supabase.auth.getUser(token);
    if (error) return { user: null, error };
    return { user: data.user, error: null };
  } catch (err) {
    return { user: null, error: err };
  }
}

// Root Route
fastify.get('/', async (request, reply) => {
  reply.send({ message: 'Twilio Media Stream Server is running!' });
});

// Health route for readiness checks
fastify.get('/health', async (request, reply) => {
  reply.send({ ok: true, uptime: process.uptime() });
});

// Route for Twilio to handle incoming calls
// <Say> punctuation to improve text-to-speech translation
fastify.all('/incoming-call', async (request, reply) => {
  // Load active persona from Supabase
  let persona = null;
  try {
    const { data } = await supabase.from('personas').select('*').eq('is_active', true).maybeSingle();
    if (data) persona = data;
  } catch (err) {
    logger.error({ err }, 'Error fetching active persona');
  }

  const voice = persona?.voice || VOICE;
  const greeting = persona?.initial_greeting || '';

  const sayIntro =
    greeting ||
    'Please wait while we connect your call to the A. I. voice assistant, powered by Twilio and the Open A I Realtime API';

  // Pass the persona ID as a query param so the media-stream handler can reload it
  const streamParams = persona?.id ? `?personaId=${encodeURIComponent(persona.id)}` : '';

  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
                          <Response>
                              <Say voice="Google.en-US-Chirp3-HD-Aoede">${sayIntro}</Say>
                              <Pause length="1"/>
                              <Say voice="Google.en-US-Chirp3-HD-Aoede">O.K. you can start talking!</Say>
                              <Connect>
                                  <Stream url="wss://${request.headers.host}/media-stream${streamParams}" />
                              </Connect>
                          </Response>`;

  reply.type('text/xml').send(twimlResponse);
});

// Minimal Personas API (server-side)
fastify.get('/api/personas', async (request, reply) => {
  const { user, error: authError } = await verifyAuth(request);
  if (authError || !user) return reply.code(401).send({ error: 'unauthenticated' });
  try {
    const res = await supabase.from('personas').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    logger.debug({ result: res }, 'Supabase /personas result');
    reply.send(res.data);
  } catch (err) {
    logger.error({ err }, 'Error listing personas');
    reply.code(500).send({ error: 'list failed' });
  }
});

fastify.post('/api/personas', async (request, reply) => {
  // Require valid user token
  const { user, error: authError } = await verifyAuth(request);
  if (authError || !user) return reply.code(401).send({ error: 'unauthenticated' });

  const payload = { ...request.body, user_id: user.id };
  try {
    const res = await supabase.from('personas').insert([payload]).select();
    logger.debug({ result: res }, 'Supabase insert result');
    const data = Array.isArray(res.data) && res.data.length > 0 ? res.data[0] : null;
    reply.code(201).send(data);
  } catch (err) {
    logger.error({ err }, 'Error creating persona');
    reply.code(500).send({ error: 'create failed' });
  }
});

fastify.put('/api/personas/:id', async (request, reply) => {
  const { user, error: authError } = await verifyAuth(request);
  if (authError || !user) return reply.code(401).send({ error: 'unauthenticated' });

  const { id } = request.params;
  const payload = request.body;
  try {
    // Ensure the persona belongs to the user — RLS should also enforce this
    const { data: existing } = await supabase.from('personas').select('user_id').eq('id', id).maybeSingle();
    if (!existing || existing.user_id !== user.id) return reply.code(403).send({ error: 'forbidden' });

    const { data } = await supabase.from('personas').update(payload).eq('id', id).select().single();
    reply.send(data);
  } catch (err) {
    logger.error({ err }, 'Error updating persona');
    reply.code(500).send({ error: 'update failed' });
  }
});

fastify.post('/api/personas/:id/activate', async (request, reply) => {
  const { user, error: authError } = await verifyAuth(request);
  if (authError || !user) return reply.code(401).send({ error: 'unauthenticated' });

  const { id } = request.params;
  try {
    // Ensure persona belongs to the user
    const { data: existing } = await supabase.from('personas').select('user_id').eq('id', id).maybeSingle();
    if (!existing || existing.user_id !== user.id) return reply.code(403).send({ error: 'forbidden' });

    await supabase.from('personas').update({ is_active: false }).eq('is_active', true).eq('user_id', user.id);
    const { data } = await supabase
      .from('personas')
      .update({ is_active: true })
      .eq('id', id)
      .select()
      .single();
    reply.send(data);
  } catch (err) {
    logger.error({ err }, 'Error activating persona');
    reply.code(500).send({ error: 'activate failed' });
  }
});

// Preview endpoint: generate short TTS/audio sample for a persona using OpenAI Realtime
fastify.post('/api/personas/:id/preview', async (request, reply) => {
  const { id } = request.params;
  try {
    const { data: persona, error: perr } = await supabase.from('personas').select('*').eq('id', id).maybeSingle();
    if (perr) throw perr;
    if (!persona) return reply.code(404).send({ error: 'persona not found' });

    // Build a short prompt for the assistant to speak
    const previewText = persona.initial_greeting || persona.system_message || 'Hello!';

    // Open a realtime WebSocket to OpenAI
    const openAiWs = new WebSocket(`wss://api.openai.com/v1/realtime?model=gpt-realtime`, {
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    });

    const audioChunks = [];
    let finished = false;

    const cleanup = () => {
      try {
        if (openAiWs && openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
      } catch (e) {
        /* ignore */
      }
    };

    const wait = (ms) => new Promise((res) => setTimeout(res, ms));

    const timeoutMs = 15000; // 15s timeout

    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('preview timeout'));
      }, timeoutMs);

      openAiWs.on('open', () => {
        logger.info({ personaId: id }, 'OpenAI preview WebSocket opened');

        // Initialize session for audio output (request wav if supported)
        const sessionUpdate = {
          type: 'session.update',
          session: {
            type: 'realtime',
            model: 'gpt-realtime',
            output_modalities: ['audio'],
            audio: {
              input: { format: { type: 'audio/pcmu' }, turn_detection: { type: 'server_vad' } },
              output: { format: { type: 'audio/wav' }, voice: persona.voice || VOICE },
            },
            instructions: persona.system_message || SYSTEM_MESSAGE,
          },
        };

        openAiWs.send(JSON.stringify(sessionUpdate));

        // Send a conversation item to produce a short spoken response
        const createItem = {
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [
              { type: 'input_text', text: previewText },
            ],
          },
        };

        openAiWs.send(JSON.stringify(createItem));
        openAiWs.send(JSON.stringify({ type: 'response.create' }));
      });

      openAiWs.on('message', (data) => {
        try {
          const msg = JSON.parse(data);

          // Collect audio deltas
          if (msg.type === 'response.output_audio.delta' && msg.delta) {
            audioChunks.push(msg.delta);
          }

          // When response is done, resolve with concatenated audio
          if (msg.type === 'response.done' || msg.type === 'response.content.done') {
            clearTimeout(timer);
            finished = true;
            cleanup();
            // Combine base64 chunks
            const buffers = audioChunks.map((c) => Buffer.from(c, 'base64'));
            const combined = Buffer.concat(buffers);
            // Return base64 of combined audio and content-type
            resolve({ audio_base64: combined.toString('base64'), content_type: 'audio/wav' });
          }
        } catch (err) {
          clearTimeout(timer);
          cleanup();
          reject(err);
        }
      });

      openAiWs.on('error', (err) => {
        clearTimeout(timer);
        cleanup();
        reject(err);
      });
    });

    // Send result as JSON with base64 audio
    reply.send(result);
  } catch (err) {
    logger.error({ err, personaId: id }, 'Preview error');
    reply.code(500).send({ error: 'preview failed', details: err.message });
  }
});


// WebSocket route for media-stream
fastify.register(async (fastify) => {
  fastify.get('/media-stream', { websocket: true }, async (connection, req) => {
    logger.info({ remoteAddress: req.socket.remoteAddress }, 'Client connected');

    // Load persona and its tool / MCP config before touching OpenAI
    const personaId = req.query?.personaId;
    let persona = null;
    if (personaId) {
      try {
        const { data } = await supabase.from('personas').select('*').eq('id', personaId).maybeSingle();
        persona = data;
      } catch (err) {
        logger.error({ err, personaId }, 'Error loading persona for media stream');
      }
    }

    // Spin up any MCP servers configured on the persona
    let mcpClients = new Map();
    if (persona?.mcp_servers?.length) {
      mcpClients = await createMcpClients(persona.mcp_servers);
    }

    // Connection-specific state
    let streamSid = null;
    let latestMediaTimestamp = 0;
    let lastAssistantItem = null;
    let markQueue = [];
    let responseStartTimestampTwilio = null;

    const openAiWs = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=gpt-realtime&temperature=${persona?.temperature ?? TEMPERATURE}`,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );

    // Build the session update including any tools defined on the persona or from MCP
    const initializeSession = async () => {
      const mcpTools = mcpClients.size > 0 ? await getMcpTools(mcpClients) : [];
      const allTools = [...(persona?.tools || []), ...mcpTools];

      const sessionUpdate = {
        type: 'session.update',
        session: {
          type: 'realtime',
          model: 'gpt-realtime',
          output_modalities: ['audio'],
          audio: {
            input: { format: { type: 'audio/pcmu' }, turn_detection: { type: 'server_vad' } },
            output: { format: { type: 'audio/pcmu' }, voice: persona?.voice || VOICE },
          },
          instructions: persona?.system_message || SYSTEM_MESSAGE,
          ...(allTools.length > 0 && { tools: allTools, tool_choice: 'auto' }),
        },
      };

      logger.debug({ sessionUpdate }, 'Sending session update to OpenAI');
      openAiWs.send(JSON.stringify(sessionUpdate));
    };

    // Send initial conversation item if AI talks first
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

      if (SHOW_TIMING_MATH) logger.debug({ initialConversationItem }, 'Sending initial conversation item');
      openAiWs.send(JSON.stringify(initialConversationItem));
      openAiWs.send(JSON.stringify({ type: 'response.create' }));
    };

    // Handle interruption when the caller's speech starts
    const handleSpeechStartedEvent = () => {
      if (markQueue.length > 0 && responseStartTimestampTwilio != null) {
        const elapsedTime = latestMediaTimestamp - responseStartTimestampTwilio;
        if (SHOW_TIMING_MATH)
          logger.debug(
            { latestMediaTimestamp, responseStartTimestampTwilio, elapsedTime },
            'Calculating elapsed time for truncation'
          );

        if (lastAssistantItem) {
          const truncateEvent = {
            type: 'conversation.item.truncate',
            item_id: lastAssistantItem,
            content_index: 0,
            audio_end_ms: elapsedTime,
          };
          if (SHOW_TIMING_MATH) logger.debug({ truncateEvent }, 'Sending truncation event');
          openAiWs.send(JSON.stringify(truncateEvent));
        }

        connection.send(JSON.stringify({ event: 'clear', streamSid }));

        // Reset
        markQueue = [];
        lastAssistantItem = null;
        responseStartTimestampTwilio = null;
      }
    };

    // Send mark messages to Media Streams so we know if and when AI response playback is finished
    const sendMark = (connection, streamSid) => {
      if (streamSid) {
        const markEvent = {
          event: 'mark',
          streamSid: streamSid,
          mark: { name: 'responsePart' },
        };
        connection.send(JSON.stringify(markEvent));
        markQueue.push('responsePart');
      }
    };

    // Open event for OpenAI WebSocket
    openAiWs.on('open', () => {
      logger.info('Connected to the OpenAI Realtime API');
      setTimeout(() => initializeSession(), 100);
    });

    // Listen for messages from the OpenAI WebSocket (and send to Twilio if necessary)
    openAiWs.on('message', (data) => {
      (async () => {
        try {
          const response = JSON.parse(data);

          if (LOG_EVENT_TYPES.includes(response.type)) {
            logger.debug({ response }, `Received event: ${response.type}`);
          }

          if (response.type === 'response.output_audio.delta' && response.delta) {
            const audioDelta = {
              event: 'media',
              streamSid: streamSid,
              media: { payload: response.delta },
            };
            connection.send(JSON.stringify(audioDelta));

            // First delta from a new response starts the elapsed time counter
            if (!responseStartTimestampTwilio) {
              responseStartTimestampTwilio = latestMediaTimestamp;
              if (SHOW_TIMING_MATH)
                logger.debug({ responseStartTimestampTwilio }, 'Setting start timestamp for new response');
            }

            if (response.item_id) {
              lastAssistantItem = response.item_id;
            }

            sendMark(connection, streamSid);
          }

          if (response.type === 'input_audio_buffer.speech_started') {
            handleSpeechStartedEvent();
          }

          // Handle function/tool calls from OpenAI
          if (response.type === 'response.function_call_arguments.done') {
            const { call_id, name, arguments: argsJson } = response;
            logger.info({ call_id, toolName: name }, 'Tool call requested');
            let args = {};
            try {
              args = JSON.parse(argsJson || '{}');
            } catch {
              logger.warn({ argsJson }, 'Failed to parse tool arguments');
            }
            let result;
            try {
              result = await dispatchTool(name, args, mcpClients);
            } catch (err) {
              logger.error({ err, toolName: name }, 'Tool dispatch failed');
              result = { error: err.message };
            }
            openAiWs.send(
              JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'function_call_output',
                  call_id,
                  output: typeof result === 'string' ? result : JSON.stringify(result),
                },
              })
            );
            openAiWs.send(JSON.stringify({ type: 'response.create' }));
            logger.info({ call_id, toolName: name }, 'Tool result returned to OpenAI');
          }
        } catch (error) {
          logger.error({ err: error, rawMessage: data.toString() }, 'Error processing OpenAI message');
        }
      })();
    });

    // Handle incoming messages from Twilio
    connection.on('message', (message) => {
      try {
        const data = JSON.parse(message);

        switch (data.event) {
          case 'media':
            latestMediaTimestamp = data.media.timestamp;
            if (SHOW_TIMING_MATH) logger.debug({ latestMediaTimestamp }, 'Received media message');
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

    // Handle connection close — also shut down any MCP servers for this session
    connection.on('close', async () => {
      if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
      await closeMcpClients(mcpClients);
      logger.info('Client disconnected.');
    });

    // Handle WebSocket close and errors
    openAiWs.on('close', () => {
      logger.info('Disconnected from the OpenAI Realtime API');
    });

    openAiWs.on('error', (error) => {
      logger.error({ err: error }, 'Error in the OpenAI WebSocket');
    });
  });
});
const server = fastify.listen({ port: PORT }, async (err) => {
  if (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
  logger.info({ port: PORT }, 'Server is listening');

  try {
    const listener = await ngrok.forward({ addr: PORT, authtoken_from_env: true });
    logger.info({ url: listener.url() }, 'ngrok tunnel created');
    logger.info({ url: `${listener.url()}/incoming-call` }, 'Set your Twilio webhook URL');
  } catch (error) {
    logger.warn('ngrok tunnel not created automatically.');
    logger.warn('1. Set NGROK_AUTHTOKEN in .env file');
    logger.warn('2. Or run ngrok manually: ngrok http 5050');
  }
});

// Graceful shutdown
const shutdown = async (signal) => {
  try {
    logger.info({ signal }, 'Received shutdown signal');
    await fastify.close();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  process.exit(1);
});
