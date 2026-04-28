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

if (process.env.NODE_ENV !== 'test') {
  server.start().then(() => {
    console.log(`${config.app.name} server started on port ${config.app.port}`);
    console.log(`🎯 Provider: ${config.ai.provider}`);
    console.log(`🎤 Background audio + meeting mode enabled`);
  });
}

export { server, sessionHandler, voiceUseCase, visionUseCase, meetingUseCase, meetingTranscript, aiRepository };
