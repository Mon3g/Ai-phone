import ngrok from '@ngrok/ngrok';

export async function startNgrokTunnel(port, logger) {
  try {
    const listener = await ngrok.forward({ addr: port, authtoken_from_env: true });
    logger.info({ url: listener.url() }, 'ngrok tunnel created');
    logger.info({ url: `${listener.url()}/incoming-call` }, 'Set your Twilio webhook URL');
  } catch (error) {
    logger.warn('ngrok tunnel not created automatically.');
    logger.warn('1. Set NGROK_AUTHTOKEN in .env file');
    logger.warn('2. Or run ngrok manually: ngrok http 5050');
  }
}
