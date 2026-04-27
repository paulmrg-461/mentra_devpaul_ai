import { IAIRepository } from '../repositories/ai-repository.interface.js';
import { PROCESSING_MESSAGES } from '../../shared/config/constants.js';

export class VoiceAssistantUseCase {
  constructor(private aiRepository: IAIRepository) {}

  async execute(text: string, onProcessing: (msg: string) => void): Promise<string> {
    if (!text) throw new Error('No input text provided');

    onProcessing(PROCESSING_MESSAGES.voice);
    const result = await this.aiRepository.query(text);
    return result.response;
  }
}
