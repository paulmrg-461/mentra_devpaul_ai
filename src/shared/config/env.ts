import * as dotenv from 'dotenv';
dotenv.config();

export const config = {
  app: {
    id: process.env.APP_ID || 'com.iaaplicada.devpaul-ai',
    name: process.env.APP_NAME || 'DevPaul AI',
    port: Number(process.env.PORT) || 3000,
    apiKey: process.env.MENTRAOS_API_KEY || 'local_dev_key',
  },
  api: {
    queryUrl: process.env.API_URL || 'https://pq48nm3b-1717.use2.devtunnels.ms/api/v1/query',
    analyzeImageUrl: process.env.ANALYZE_IMAGE_URL || 'https://pq48nm3b-1717.use2.devtunnels.ms/api/v1/analyze-image',
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    apiUrl: process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions',
    streamUrl: process.env.GROQ_STREAM_URL || 'https://api.groq.com/openai/v1/chat/completions',
    systemPrompt: process.env.GROQ_SYSTEM_PROMPT || 
      'Eres DevPaul, un asistente de IA amigable y útil. Responde de forma concisa y clara en español.',
    visionSystemPrompt: process.env.GROQ_VISION_SYSTEM_PROMPT ||
      'Describe lo que ves en esta imagen de forma breve y clara en español.',
  },
};
