async function fetchActivePersona(supabase, logger) {
  if (!supabase) return null;
  try {
    const { data } = await supabase.from('personas').select('*').eq('is_active', true).maybeSingle();
    return data || null;
  } catch (err) {
    logger.error({ err }, 'Error fetching active persona');
    return null;
  }
}

function buildTwimlResponse({ voice, greeting, host }) {
  const sayIntro =
    greeting ||
    'Please wait while we connect your call to the A. I. voice assistant, powered by Twilio and the Open A I Realtime API';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Google.en-US-Chirp3-HD-Aoede">${sayIntro}</Say>
  <Pause length="1"/>
  <Say voice="Google.en-US-Chirp3-HD-Aoede">O.K. you can start talking!</Say>
  <Connect>
    <Stream url="wss://${host}/media-stream" />
  </Connect>
</Response>`;
}

export default async function incomingCallRoutes(fastify, opts) {
  const { supabase, logger, config } = opts;

  fastify.all('/incoming-call', async (request, reply) => {
    const persona = await fetchActivePersona(supabase, logger);
    const twimlResponse = buildTwimlResponse({
      voice: persona?.voice || config.voice,
      greeting: persona?.initial_greeting || '',
      host: request.headers.host,
    });

    reply.type('text/xml').send(twimlResponse);
  });
}
