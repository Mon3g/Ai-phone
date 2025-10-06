import Fastify from 'fastify';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import ngrok from '@ngrok/ngrok';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env file
dotenv.config();

// Retrieve the OpenAI API key from environment variables.
const { OPENAI_API_KEY } = process.env;

if (!OPENAI_API_KEY) {
  console.error('Missing OpenAI API key. Please set it in the .env file.');
  process.exit(1);
}

// Initialize Fastify
const fastify = Fastify();
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

// Simple logger helper
const log = (level, ...args) => {
  const ts = new Date().toISOString();
  console[level](`[${ts}]`, ...args);
};

// Supabase client for server-side persona management
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
let supabase = null;
if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
} else {
  log('log', 'Supabase service key or URL not provided; persona APIs will be disabled.');
}

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
  // Try to read active persona from Supabase (server key required)
  let persona = null;
  if (supabase) {
    try {
      const { data } = await supabase
        .from('personas')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();
      if (data) persona = data;
    } catch (err) {
      log('error', 'Error fetching active persona:', err);
    }
  }

  const voice = persona?.voice || VOICE;
  const greeting = persona?.initial_greeting || '';

  const sayIntro =
    greeting ||
    'Please wait while we connect your call to the A. I. voice assistant, powered by Twilio and the Open A I Realtime API';

  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
                          <Response>
                              <Say voice="Google.en-US-Chirp3-HD-Aoede">${sayIntro}</Say>
                              <Pause length="1"/>
                              <Say voice="Google.en-US-Chirp3-HD-Aoede">O.K. you can start talking!</Say>
                              <Connect>
                                  <Stream url="wss://${request.headers.host}/media-stream" />
                              </Connect>
                          </Response>`;

  reply.type('text/xml').send(twimlResponse);
});

// Minimal Personas API (server-side)
fastify.get('/api/personas', async (request, reply) => {
  if (!supabase) return reply.code(503).send({ error: 'Supabase not configured' });
  try {
    const res = await supabase.from('personas').select('*').order('created_at', { ascending: false });
    log('log', 'Supabase /personas result:', res);
    const { data } = res;
    reply.send(data);
  } catch (err) {
    log('error', 'Error listing personas', err);
    reply.code(500).send({ error: 'list failed' });
  }
});

fastify.post('/api/personas', async (request, reply) => {
  if (!supabase) return reply.code(503).send({ error: 'Supabase not configured' });
  // Require valid user token
  const { user, error: authError } = await verifyAuth(request);
  if (authError || !user) return reply.code(401).send({ error: 'unauthenticated' });

  const payload = { ...request.body, user_id: user.id };
  try {
    const res = await supabase.from('personas').insert([payload]).select();
    log('log', 'Supabase insert result:', res);
    const data = Array.isArray(res.data) && res.data.length > 0 ? res.data[0] : null;
    reply.code(201).send(data);
  } catch (err) {
    log('error', 'Error creating persona', err);
    reply.code(500).send({ error: 'create failed' });
  }
});

fastify.put('/api/personas/:id', async (request, reply) => {
  if (!supabase) return reply.code(503).send({ error: 'Supabase not configured' });
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
    log('error', 'Error updating persona', err);
    reply.code(500).send({ error: 'update failed' });
  }
});

fastify.post('/api/personas/:id/activate', async (request, reply) => {
  if (!supabase) return reply.code(503).send({ error: 'Supabase not configured' });
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
    log('error', 'Error activating persona', err);
    reply.code(500).send({ error: 'activate failed' });
  }
});

// Preview endpoint: generate short TTS/audio sample for a persona using OpenAI Realtime
fastify.post('/api/personas/:id/preview', async (request, reply) => {
  if (!supabase) return reply.code(503).send({ error: 'Supabase not configured' });
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
        log('log', 'OpenAI preview WS open');

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
    log('error', 'Preview error', err);
    reply.code(500).send({ error: 'preview failed', details: err.message });
  }
});


// WebSocket route for media-stream
fastify.register(async (fastify) => {
  fastify.get('/media-stream', { websocket: true }, (connection, req) => {
    console.log('Client connected');

    // Connection-specific state
    let streamSid = null;
    let latestMediaTimestamp = 0;
    let lastAssistantItem = null;
    let markQueue = [];
    let responseStartTimestampTwilio = null;

    const openAiWs = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=gpt-realtime&temperature=${TEMPERATURE}`,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );

    // Control initial session with OpenAI
    const initializeSession = () => {
      const sessionUpdate = {
        type: 'session.update',
        session: {
          type: 'realtime',
          model: 'gpt-realtime',
          output_modalities: ['audio'],
          audio: {
            input: { format: { type: 'audio/pcmu' }, turn_detection: { type: 'server_vad' } },
            output: { format: { type: 'audio/pcmu' }, voice: VOICE },
          },
          instructions: SYSTEM_MESSAGE,
        },
      };

      console.log('Sending session update:', JSON.stringify(sessionUpdate));
      openAiWs.send(JSON.stringify(sessionUpdate));

      // Uncomment the following line to have AI speak first:
      // sendInitialConversationItem();
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

      if (SHOW_TIMING_MATH)
        console.log('Sending initial conversation item:', JSON.stringify(initialConversationItem));
      openAiWs.send(JSON.stringify(initialConversationItem));
      openAiWs.send(JSON.stringify({ type: 'response.create' }));
    };

    // Handle interruption when the caller's speech starts
    const handleSpeechStartedEvent = () => {
      if (markQueue.length > 0 && responseStartTimestampTwilio != null) {
        const elapsedTime = latestMediaTimestamp - responseStartTimestampTwilio;
        if (SHOW_TIMING_MATH)
          console.log(
            `Calculating elapsed time for truncation: ${latestMediaTimestamp} - ${responseStartTimestampTwilio} = ${elapsedTime}ms`
          );

        if (lastAssistantItem) {
          const truncateEvent = {
            type: 'conversation.item.truncate',
            item_id: lastAssistantItem,
            content_index: 0,
            audio_end_ms: elapsedTime,
          };
          if (SHOW_TIMING_MATH)
            console.log('Sending truncation event:', JSON.stringify(truncateEvent));
          openAiWs.send(JSON.stringify(truncateEvent));
        }

        connection.send(
          JSON.stringify({
            event: 'clear',
            streamSid: streamSid,
          })
        );

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
      console.log('Connected to the OpenAI Realtime API');
      setTimeout(initializeSession, 100);
    });

    // Listen for messages from the OpenAI WebSocket (and send to Twilio if necessary)
    openAiWs.on('message', (data) => {
      try {
        const response = JSON.parse(data);

        if (LOG_EVENT_TYPES.includes(response.type)) {
          console.log(`Received event: ${response.type}`, response);
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
              console.log(
                `Setting start timestamp for new response: ${responseStartTimestampTwilio}ms`
              );
          }

          if (response.item_id) {
            lastAssistantItem = response.item_id;
          }

          sendMark(connection, streamSid);
        }

        if (response.type === 'input_audio_buffer.speech_started') {
          handleSpeechStartedEvent();
        }
      } catch (error) {
        console.error('Error processing OpenAI message:', error, 'Raw message:', data);
      }
    });

    // Handle incoming messages from Twilio
    connection.on('message', (message) => {
      try {
        const data = JSON.parse(message);

        switch (data.event) {
          case 'media':
            latestMediaTimestamp = data.media.timestamp;
            if (SHOW_TIMING_MATH)
              console.log(`Received media message with timestamp: ${latestMediaTimestamp}ms`);
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
            console.log('Incoming stream has started', streamSid);

            // Reset start and media timestamp on a new stream
            responseStartTimestampTwilio = null;
            latestMediaTimestamp = 0;
            break;
          case 'mark':
            if (markQueue.length > 0) {
              markQueue.shift();
            }
            break;
          default:
            console.log('Received non-media event:', data.event);
            break;
        }
      } catch (error) {
        console.error('Error parsing message:', error, 'Message:', message);
      }
    });

    // Handle connection close
    connection.on('close', () => {
      if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
      log('log', 'Client disconnected.');
    });

    // Handle WebSocket close and errors
    openAiWs.on('close', () => {
      log('log', 'Disconnected from the OpenAI Realtime API');
    });

    openAiWs.on('error', (error) => {
      log('error', 'Error in the OpenAI WebSocket:', error);
    });
  });
});
const server = fastify.listen({ port: PORT }, async (err) => {
  if (err) {
    log('error', err);
    process.exit(1);
  }
  log('log', `Server is listening on port ${PORT}`);

  try {
    const listener = await ngrok.forward({ addr: PORT, authtoken_from_env: true });
    log('log', `\n🌐 ngrok tunnel created: ${listener.url()}`);
    log('log', `📞 Set your Twilio webhook to: ${listener.url()}/incoming-call\n`);
  } catch (error) {
    log('log', '\n⚠️  ngrok tunnel not created. You can:');
    log('log', '   1. Set NGROK_AUTHTOKEN in .env file');
    log('log', '   2. Or run ngrok manually: ngrok http 5050\n');
  }
});

// Graceful shutdown
const shutdown = async (signal) => {
  try {
    log('log', `Received ${signal}. Shutting down...`);
    await fastify.close();
    process.exit(0);
  } catch (err) {
    log('error', 'Error during shutdown', err);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
