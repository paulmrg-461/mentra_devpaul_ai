import { IAIRepository } from '../repositories/ai-repository.interface.js';
import { PROCESSING_MESSAGES } from '../../shared/config/constants.js';

export class VisionAssistantUseCase {
  constructor(private aiRepository: IAIRepository) {}

  async execute(imageBase64: string, onProcessing: (msg: string) => void): Promise<string> {
    if (!imageBase64) throw new Error('No image provided');

    onProcessing(PROCESSING_MESSAGES.vision);
    const result = await this.aiRepository.analyzeImage({
      image: imageBase64,
      prompt: 'Describe what you see in this image briefly and clearly.'
    });
    return result.response;
  }
}
