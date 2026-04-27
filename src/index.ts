import { GroqAIRepository } from './data/repositories/groq-ai.repository.js';
import { VoiceAssistantUseCase } from './domain/use-cases/voice-assistant.use-case.js';
import { VisionAssistantUseCase } from './domain/use-cases/vision-assistant.use-case.js';
import { SessionHandler } from './presentation/handlers/session.handler.js';
import { MentraDevPaulAppServer } from './presentation/server/devpaul-server.js';
import { config } from './shared/config/env.js';

// 1. Initialize Groq Repository (optimized for background audio + Groq API)
const aiRepository = new GroqAIRepository();

// 2. Initialize Use Cases
const voiceUseCase = new VoiceAssistantUseCase(aiRepository);
const visionUseCase = new VisionAssistantUseCase(aiRepository);

// 3. Initialize Handlers
const sessionHandler = new SessionHandler(voiceUseCase, visionUseCase);

// 4. Initialize and Start Server
const server = new MentraDevPaulAppServer(sessionHandler);

if (process.env.NODE_ENV !== 'test') {
  server.start().then(() => {
    console.log(`${config.app.name} server started on port ${config.app.port}`);
    console.log(`🎯 Using Groq API: ${config.groq.model}`);
    console.log(`🎤 Background audio listening enabled`);
  });
}

export { server, sessionHandler, voiceUseCase, visionUseCase, aiRepository };
