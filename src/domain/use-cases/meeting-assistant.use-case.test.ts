import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeetingAssistantUseCase } from './meeting-assistant.use-case.js';
import { MeetingTranscript } from '../entities/meeting-transcript.js';
import { IAIRepository } from '../repositories/ai-repository.interface.js';

const mockRepo: IAIRepository = {
  query: vi.fn(),
  analyzeImage: vi.fn(),
  queryMeeting: vi.fn(),
  summarizeMeeting: vi.fn(),
};

describe('MeetingAssistantUseCase', () => {
  let useCase: MeetingAssistantUseCase;
  let transcript: MeetingTranscript;
  const noop = () => {};

  beforeEach(() => {
    vi.resetAllMocks();
    useCase = new MeetingAssistantUseCase(mockRepo);
    transcript = new MeetingTranscript();
  });

  describe('queryContext', () => {
    it('should return contextual answer from transcript', async () => {
      transcript.addEntry('usaremos postgresql para la migración');
      vi.mocked(mockRepo.queryMeeting).mockResolvedValue({ response: 'PostgreSQL' });

      const result = await useCase.queryContext('qué base de datos', transcript, noop);

      expect(result).toBe('PostgreSQL');
      expect(mockRepo.queryMeeting).toHaveBeenCalledWith(
        'qué base de datos',
        'usaremos postgresql para la migración'
      );
    });

    it('should return fallback message when transcript is empty', async () => {
      const result = await useCase.queryContext('alguna pregunta', transcript, noop);
      expect(result).toBe('No hay transcripción disponible aún.');
      expect(mockRepo.queryMeeting).not.toHaveBeenCalled();
    });

    it('should throw on empty question', async () => {
      transcript.addEntry('algún texto');
      await expect(useCase.queryContext('', transcript, noop)).rejects.toThrow('No question provided');
    });
  });

  describe('generateSummary', () => {
    it('should return structured summary', async () => {
      transcript.addEntry('decidimos usar microservicios');
      vi.mocked(mockRepo.summarizeMeeting).mockResolvedValue({
        response: 'DECISIONES:\n- Usar microservicios\nACCIONES:\n- Ninguna\nPREGUNTAS ABIERTAS:\n- Ninguna',
      });

      const result = await useCase.generateSummary(transcript, noop);

      expect(result).toContain('DECISIONES');
      expect(mockRepo.summarizeMeeting).toHaveBeenCalledWith('decidimos usar microservicios');
    });

    it('should throw when transcript is empty', async () => {
      await expect(useCase.generateSummary(transcript, noop)).rejects.toThrow('No transcript to summarize');
    });

    it('should propagate repository errors', async () => {
      transcript.addEntry('algo importante');
      vi.mocked(mockRepo.summarizeMeeting).mockRejectedValue(new Error('Groq API error: rate limit'));
      await expect(useCase.generateSummary(transcript, noop)).rejects.toThrow('Groq API error: rate limit');
    });
  });
});
