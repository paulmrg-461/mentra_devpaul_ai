import { IAIRepository } from '../../domain/repositories/ai-repository.interface.js';
import { GroqAIRepository } from '../repositories/groq-ai.repository.js';
import { OpenRouterAIRepository } from '../repositories/openrouter-ai.repository.js';
import { AIRepository } from '../repositories/ai-repository.js';
import { config } from '../../shared/config/env.js';

export function createAIRepository(): IAIRepository {
  const provider = config.ai.provider;

  if (provider === 'api') {
    console.log(`🤖 AI Provider: Backend API (${config.api.queryUrl})`);
    return new AIRepository();
  }

  if (provider === 'openrouter') {
    if (!config.openrouter.apiKey) {
      throw new Error('OPEN_ROUTER_API_KEY is required when AI_PROVIDER=openrouter');
    }
    console.log(`🤖 AI Provider: OpenRouter (text=${config.openrouter.textModel}, vision=${config.openrouter.visionModel})`);
    return new OpenRouterAIRepository();
  }

  if (!config.groq.apiKey) {
    throw new Error('GROQ_API_KEY is required when AI_PROVIDER=groq');
  }
  console.log(`🤖 AI Provider: Groq (${config.groq.model})`);
  return new GroqAIRepository();
}
