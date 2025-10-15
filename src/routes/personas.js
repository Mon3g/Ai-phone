import { createPersonaService } from '../services/personaService.js';

function sendError(reply, error, fallbackMessage) {
  const statusCode = error?.statusCode || 500;
  reply.code(statusCode).send({ error: error?.message || fallbackMessage });
}

export default async function personaRoutes(fastify, opts) {
  const { supabase, logger, integrations = {} } = opts;
  const personaService = createPersonaService({
    supabase,
    logger,
    openAiRealtime: integrations.openAiRealtime,
  });

  fastify.get('/api/personas', async (request, reply) => {
    try {
      const personas = await personaService.listPersonas();
      reply.send(personas);
    } catch (error) {
      logger.error({ err: error }, 'Error listing personas');
      sendError(reply, error, 'list failed');
    }
  });

  fastify.get('/api/personas/active', async (request, reply) => {
    try {
      const activePersona = await personaService.getActivePersona(request);
      reply.send(activePersona);
    } catch (error) {
      if (error.statusCode && error.statusCode !== 500) {
        return sendError(reply, error);
      }
      logger.error({ err: error }, 'Error retrieving active persona');
      sendError(reply, error, 'retrieve failed');
    }
  });

  fastify.post('/api/personas', async (request, reply) => {
    try {
      const persona = await personaService.createPersona(request, request.body);
      reply.code(201).send(persona);
    } catch (error) {
      if (error.statusCode && error.statusCode !== 500) {
        return sendError(reply, error);
      }
      logger.error({ err: error }, 'Error creating persona');
      sendError(reply, error, 'create failed');
    }
  });

  fastify.put('/api/personas/:id', async (request, reply) => {
    const { id } = request.params;
    try {
      const persona = await personaService.updatePersona(request, id, request.body);
      reply.send(persona);
    } catch (error) {
      if (error.statusCode && error.statusCode !== 500) {
        return sendError(reply, error);
      }
      logger.error({ err: error }, 'Error updating persona');
      sendError(reply, error, 'update failed');
    }
  });

  fastify.post('/api/personas/:id/activate', async (request, reply) => {
    const { id } = request.params;
    try {
      const persona = await personaService.activatePersona(request, id);
      reply.send(persona);
    } catch (error) {
      if (error.statusCode && error.statusCode !== 500) {
        return sendError(reply, error);
      }
      logger.error({ err: error }, 'Error activating persona');
      sendError(reply, error, 'activate failed');
    }
  });

  fastify.post('/api/personas/:id/preview', async (request, reply) => {
    const { id } = request.params;
    try {
      const preview = await personaService.generatePreview(id);
      reply.send(preview);
    } catch (error) {
      if (error.statusCode && error.statusCode !== 500) {
        return sendError(reply, error);
      }
      logger.error({ err: error, personaId: id }, 'Preview error');
      sendError(reply, error, 'preview failed');
    }
  });
}

