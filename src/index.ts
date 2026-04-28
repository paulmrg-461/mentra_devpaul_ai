import { createAIRepository } from './data/factory/ai-provider.factory.js';
import { VoiceAssistantUseCase } from './domain/use-cases/voice-assistant.use-case.js';
import { VisionAssistantUseCase } from './domain/use-cases/vision-assistant.use-case.js';
import { MeetingAssistantUseCase } from './domain/use-cases/meeting-assistant.use-case.js';
import { MeetingTranscript } from './domain/entities/meeting-transcript.js';
import { SessionHandler } from './presentation/handlers/session.handler.js';
import { MentraDevPaulAppServer } from './presentation/server/devpaul-server.js';
import { config } from './shared/config/env.js';

const aiRepository = createAIRepository();

const voiceUseCase = new VoiceAssistantUseCase(aiRepository);
const visionUseCase = new VisionAssistantUseCase(aiRepository);
const meetingUseCase = new MeetingAssistantUseCase(aiRepository);
const meetingTranscript = new MeetingTranscript();

const sessionHandler = new SessionHandler(voiceUseCase, visionUseCase, meetingUseCase, meetingTranscript);

const server = new MentraDevPaulAppServer(sessionHandler);

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
  process.exit(1);
});

if (process.env.NODE_ENV !== 'test') {
  console.log('[STARTUP] Starting server...');
  console.log(`[STARTUP] Provider: ${config.ai.provider}`);
  server.start().then(() => {
    console.log(`[STARTUP] ${config.app.name} server started on port ${config.app.port}`);
    console.log(`[STARTUP] Provider: ${config.ai.provider}`);
  }).catch((err: unknown) => {
    console.error('[FATAL] server.start() failed:', err);
    process.exit(1);
  });
}

export { server, sessionHandler, voiceUseCase, visionUseCase, meetingUseCase, meetingTranscript, aiRepository };
