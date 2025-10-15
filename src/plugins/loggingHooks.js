export function registerRequestLogging(fastify, logger) {
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
}

export function registerErrorHandler(fastify) {
  fastify.setErrorHandler((error, request, reply) => {
    if (!reply.sent) {
      reply.status(error.statusCode || 500).send({ error: 'internal_server_error' });
    }
  });
}
