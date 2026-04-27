import { IAIRepository } from '../repositories/ai-repository.interface.js';
import { MeetingTranscript } from '../entities/meeting-transcript.js';
import { PROCESSING_MESSAGES } from '../../shared/config/constants.js';

export class MeetingAssistantUseCase {
  constructor(private aiRepository: IAIRepository) {}

  async queryContext(
    question: string,
    transcript: MeetingTranscript,
    onProcessing: (msg: string) => void
  ): Promise<string> {
    if (!question) throw new Error('No question provided');

    const text = transcript.getFullText();
    if (!text) return 'No hay transcripción disponible aún.';

    onProcessing(PROCESSING_MESSAGES.meetingQuery);
    const result = await this.aiRepository.queryMeeting(question, text);
    return result.response;
  }

  async generateSummary(
    transcript: MeetingTranscript,
    onProcessing: (msg: string) => void
  ): Promise<string> {
    const text = transcript.getFullText();
    if (!text) throw new Error('No transcript to summarize');

    onProcessing(PROCESSING_MESSAGES.meetingSummary);
    const result = await this.aiRepository.summarizeMeeting(text);
    return result.response;
  }
}
