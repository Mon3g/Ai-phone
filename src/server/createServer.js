import Fastify from 'fastify';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import rootRoutes from '../routes/root.js';
import incomingCallRoutes from '../routes/incomingCall.js';
import personaRoutes from '../routes/personas.js';
import mediaStreamRoutes from '../routes/mediaStream.js';
import { registerJsonBodyParser } from '../plugins/contentParsers.js';
import { registerErrorHandler, registerRequestLogging } from '../plugins/loggingHooks.js';

export function createServer({ config, logger, supabase }) {
  const fastify = Fastify({ logger: false });

  fastify.decorate('config', config);
  fastify.decorate('appLogger', logger);
  fastify.decorate('supabase', supabase);

  fastify.register(fastifyFormBody);
  fastify.register(fastifyWs);

  registerJsonBodyParser(fastify);
  registerRequestLogging(fastify, logger);
  registerErrorHandler(fastify);

  fastify.register(rootRoutes);
  fastify.register(incomingCallRoutes, { supabase, logger, config });
  fastify.register(personaRoutes, { supabase, logger, config });
  fastify.register(mediaStreamRoutes, { logger, config, supabase });

  return fastify;
}
