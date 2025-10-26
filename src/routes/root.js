export default async function rootRoutes(fastify) {
  fastify.get('/', async (request, reply) => {
    reply.send({ message: 'Twilio Media Stream Server is running!' });
  });

  fastify.get('/health', async (request, reply) => {
    reply.send({ ok: true, uptime: process.uptime() });
  });
}
