import config from './config/env.js';
import logger from './observability/logger.js';
import { createSupabaseClient } from './integrations/supabase.js';
import { createServer } from './server/createServer.js';
import { startNgrokTunnel } from './tunneling/ngrok.js';
import { createOpenAiRealtimeClient } from './integrations/openaiRealtime.js';

async function bootstrap() {
  if (!config.openAiApiKey) {
    logger.fatal('Missing OpenAI API key. Please set OPENAI_API_KEY in the environment.');
    process.exit(1);
  }

  const supabase = createSupabaseClient(config.supabase, logger);
  const openAiRealtime = createOpenAiRealtimeClient({ config, logger });
  const fastify = createServer({ config, logger, supabase, integrations: { openAiRealtime } });

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

  try {
    await fastify.listen({ port: config.port, host: '0.0.0.0' });
    logger.info({ port: config.port }, 'Server is listening');

    if (config.enableNgrok) {
      await startNgrokTunnel(config.port, logger);
    }
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

bootstrap();
