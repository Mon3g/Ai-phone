import WebSocket from 'ws';
import { verifySupabaseAuth } from '../utils/auth.js';

function ensureSupabaseConfigured(reply, supabase) {
  if (!supabase) {
    reply.code(503).send({ error: 'Supabase not configured' });
    return false;
  }
  return true;
}

async function getPersonaById(supabase, id) {
  const { data, error } = await supabase.from('personas').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export default async function personaRoutes(fastify, opts) {
  const { supabase, logger, config } = opts;

  fastify.get('/api/personas', async (request, reply) => {
    if (!ensureSupabaseConfigured(reply, supabase)) return;
    try {
      const { data } = await supabase.from('personas').select('*').order('created_at', { ascending: false });
      reply.send(data);
    } catch (err) {
      logger.error({ err }, 'Error listing personas');
      reply.code(500).send({ error: 'list failed' });
    }
  });

  fastify.post('/api/personas', async (request, reply) => {
    if (!ensureSupabaseConfigured(reply, supabase)) return;
    const { user, error: authError } = await verifySupabaseAuth(request, supabase);
    if (authError || !user) return reply.code(401).send({ error: 'unauthenticated' });

    const payload = { ...request.body, user_id: user.id };
    try {
      const res = await supabase.from('personas').insert([payload]).select();
      const data = Array.isArray(res.data) && res.data.length > 0 ? res.data[0] : null;
      reply.code(201).send(data);
    } catch (err) {
      logger.error({ err }, 'Error creating persona');
      reply.code(500).send({ error: 'create failed' });
    }
  });

  fastify.put('/api/personas/:id', async (request, reply) => {
    if (!ensureSupabaseConfigured(reply, supabase)) return;
    const { user, error: authError } = await verifySupabaseAuth(request, supabase);
    if (authError || !user) return reply.code(401).send({ error: 'unauthenticated' });

    const { id } = request.params;
    const payload = request.body;
    try {
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
    if (!ensureSupabaseConfigured(reply, supabase)) return;
    const { user, error: authError } = await verifySupabaseAuth(request, supabase);
    if (authError || !user) return reply.code(401).send({ error: 'unauthenticated' });

    const { id } = request.params;
    try {
      const { data: existing } = await supabase.from('personas').select('user_id').eq('id', id).maybeSingle();
      if (!existing || existing.user_id !== user.id) return reply.code(403).send({ error: 'forbidden' });

      await supabase.from('personas').update({ is_active: false }).eq('is_active', true).eq('user_id', user.id);
      const { data } = await supabase.from('personas').update({ is_active: true }).eq('id', id).select().single();
      reply.send(data);
    } catch (err) {
      logger.error({ err }, 'Error activating persona');
      reply.code(500).send({ error: 'activate failed' });
    }
  });

  fastify.post('/api/personas/:id/preview', async (request, reply) => {
    if (!ensureSupabaseConfigured(reply, supabase)) return;
    const { id } = request.params;

    try {
      const persona = await getPersonaById(supabase, id);
      if (!persona) return reply.code(404).send({ error: 'persona not found' });

      const previewText = persona.initial_greeting || persona.system_message || 'Hello!';

      const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-realtime', {
        headers: { Authorization: `Bearer ${config.openAiApiKey}` },
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

      const timeoutMs = 15000;

      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error('preview timeout'));
        }, timeoutMs);

        openAiWs.on('open', () => {
          logger.info({ personaId: id }, 'OpenAI preview WebSocket opened');

          const sessionUpdate = {
            type: 'session.update',
            session: {
              type: 'realtime',
              model: 'gpt-realtime',
              output_modalities: ['audio'],
              audio: {
                input: { format: { type: 'audio/pcmu' }, turn_detection: { type: 'server_vad' } },
                output: { format: { type: 'audio/wav' }, voice: persona.voice || config.voice },
              },
              instructions: persona.system_message || config.systemMessage,
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

      reply.send(result);
    } catch (err) {
      logger.error({ err, personaId: id }, 'Preview error');
      reply.code(500).send({ error: 'preview failed', details: err.message });
    }
  });
}
