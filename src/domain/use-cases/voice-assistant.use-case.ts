import { IAIRepository } from '../repositories/ai-repository.interface.js';
import { ConversationTurn } from '../entities/ai.js';
import { PROCESSING_MESSAGES } from '../../shared/config/constants.js';

function extractSentences(buffer: string): { sentences: string[]; remainder: string } {
  const sentences: string[] = [];
  const re = /[^.!?]*[.!?]+(?:\s|$)/g;
  let lastEnd = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(buffer)) !== null) {
    const s = m[0].trim();
    if (s.length > 1) sentences.push(s);
    lastEnd = m.index + m[0].length;
  }

  return { sentences, remainder: buffer.slice(lastEnd) };
}

export class VoiceAssistantUseCase {
  constructor(private aiRepository: IAIRepository) {}

  async execute(text: string, onProcessing: (msg: string) => void, history: ConversationTurn[] = []): Promise<string> {
    if (!text) throw new Error('No input text provided');
    onProcessing(PROCESSING_MESSAGES.voice);
    const result = await this.aiRepository.query(text, history);
    return result.response;
  }

  async executeStreaming(
    text: string,
    onProcessing: (msg: string) => void,
    onSentence: (sentence: string) => Promise<void>,
    history: ConversationTurn[] = []
  ): Promise<string> {
    if (!text) throw new Error('No input text provided');

    onProcessing(PROCESSING_MESSAGES.voice);

    let buffer = '';
    let fullResponse = '';
    let speechChain: Promise<void> = Promise.resolve();
    let cancelled = false;

    const enqueue = (sentence: string) => {
      speechChain = speechChain.then(async () => {
        if (cancelled) return;
        try {
          await onSentence(sentence);
        } catch (err) {
          const msg = (err as Error).message ?? '';
          if (msg.includes('cancelled') || msg.includes('cleanup')) {
            cancelled = true;
          } else {
            throw err;
          }
        }
      });
    };

    await this.aiRepository.queryStream(text, (chunk) => {
      buffer += chunk;
      fullResponse += chunk;

      const { sentences, remainder } = extractSentences(buffer);
      buffer = remainder;

      for (const sentence of sentences) enqueue(sentence);
    }, history);

    if (buffer.trim().length > 0) enqueue(buffer.trim());

    await speechChain;
    return fullResponse;
  }
}
