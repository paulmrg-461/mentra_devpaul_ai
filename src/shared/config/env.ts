import * as dotenv from 'dotenv';
dotenv.config();

export const config = {
  app: {
    id: process.env.APP_ID || 'com.iaaplicada.numa-ai',
    name: process.env.APP_NAME || 'Numa AI',
    port: Number(process.env.PORT) || 3000,
    apiKey: process.env.MENTRAOS_API_KEY || 'local_dev_key',
  },
  ai: {
    provider: (process.env.AI_PROVIDER || 'groq') as 'groq' | 'openrouter' | 'api',
    systemPrompt: process.env.AI_SYSTEM_PROMPT ||
      'Eres Numa, un asistente de IA amigable y útil. Responde de forma concisa y clara en español.',
    visionSystemPrompt: process.env.AI_VISION_SYSTEM_PROMPT ||
      'Describe lo que ves en esta imagen de forma breve y clara en español.',
  },
  api: {
    queryUrl: process.env.API_URL || 'https://janee-friskier-teetotally.ngrok-free.dev/api/v1/query',
    analyzeImageUrl: process.env.ANALYZE_IMAGE_URL || 'https://janee-friskier-teetotally.ngrok-free.dev/api/v1/analyze-image',
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    voiceModel: process.env.GROQ_VOICE_MODEL || 'llama-3.1-8b-instant',
    apiUrl: process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions',
    streamUrl: process.env.GROQ_STREAM_URL || 'https://api.groq.com/openai/v1/chat/completions',
  },
  openrouter: {
    apiKey: process.env.OPEN_ROUTER_API_KEY || '',
    textModel: process.env.OPENROUTER_TEXT_MODEL || 'meta-llama/llama-3.3-70b-instruct',
    visionModel: process.env.OPENROUTER_VISION_MODEL || 'meta-llama/llama-3.2-11b-vision-instruct',
    apiUrl: process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions',
  },
};
