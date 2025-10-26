import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_SYSTEM_MESSAGE =
  "You are a helpful and bubbly AI assistant who loves to chat about anything the user is interested about and is prepared to offer them facts. You have a penchant for dad jokes, owl jokes, and rickrolling – subtly. Always stay positive, but work in a joke when appropriate.";

const DEFAULT_LOG_EVENT_TYPES = [
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

const parseNumber = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseNumber(process.env.PORT, 5050),
  openAiApiKey: process.env.OPENAI_API_KEY,
  voice: process.env.ASSISTANT_VOICE ?? 'alloy',
  temperature: parseNumber(process.env.ASSISTANT_TEMPERATURE, 0.8),
  showTimingMath: (process.env.SHOW_TIMING_MATH ?? 'false').toLowerCase() === 'true',
  systemMessage: process.env.SYSTEM_MESSAGE?.trim() || DEFAULT_SYSTEM_MESSAGE,
  logEventTypes: DEFAULT_LOG_EVENT_TYPES,
  supabase: {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  },
  enableNgrok: (process.env.ENABLE_NGROK ?? 'true').toLowerCase() !== 'false',
};

export default config;
