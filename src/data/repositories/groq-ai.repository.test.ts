import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GroqAIRepository } from './groq-ai.repository.js';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock config
vi.mock('../../shared/config/env.js', () => ({
  config: {
    groq: {
      apiKey: 'test-api-key',
      model: 'llama-3.3-70b-versatile',
      apiUrl: 'https://api.groq.com/openai/v1/chat/completions',
      streamUrl: 'https://api.groq.com/openai/v1/chat/completions',
      systemPrompt: 'Test system prompt',
      visionSystemPrompt: 'Test vision prompt',
    },
  },
}));

describe('GroqAIRepository', () => {
  let repository: GroqAIRepository;

  beforeEach(() => {
    vi.resetAllMocks();
    repository = new GroqAIRepository();
  });

  describe('Query', () => {
    it('should successfully query Groq API', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Test response' } }],
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await repository.query('Hello');

      expect(result.response).toBe('Test response');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.groq.com/openai/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should throw error on API failure', async () => {
      const mockResponse = {
        ok: false,
        statusText: 'Bad Request',
        text: vi.fn().mockResolvedValue('Error details'),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await expect(repository.query('Hello')).rejects.toThrow(
        'Groq API error: Bad Request - Error details'
      );
    });

    it('should throw error on invalid response format', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ invalid: 'format' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await expect(repository.query('Hello')).rejects.toThrow(
        'Invalid Groq API response format'
      );
    });
  });

  describe('Analyze Image', () => {
    it('should successfully analyze image', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'I see a cat' } }],
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await repository.analyzeImage({
        image: 'base64string',
        prompt: 'What is this?',
      });

      expect(result.response).toBe('I see a cat');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.groq.com/openai/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('What is this?'),
        })
      );
    });

    it('should use default prompt if not provided', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Image description' } }],
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await repository.analyzeImage({ image: 'base64string' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
          }),
          body: expect.stringContaining('Describe what you see in this image.'),
        })
      );
    });
  });

  describe('Streaming Query', () => {
    it('should stream response chunks', async () => {
      const mockStream = {
        getReader: vi.fn().mockReturnValue({
          read: vi.fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n'),
            })
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":" World"}}]}\n'),
            })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          releaseLock: vi.fn(),
        }),
      };

      const mockResponse = {
        ok: true,
        body: mockStream,
      };
      mockFetch.mockResolvedValue(mockResponse);

      const chunks: string[] = [];
      const result = await repository.queryStream('Hello', (chunk) => {
        chunks.push(chunk);
      });

      expect(chunks).toEqual(['Hello', ' World']);
      expect(result.response).toBe('Hello World');
    });

    it('should handle stream errors', async () => {
      const mockResponse = {
        ok: false,
        statusText: 'Stream Error',
        text: vi.fn().mockResolvedValue('Stream failed'),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        repository.queryStream('Hello', () => {})
      ).rejects.toThrow('Groq Stream API error: Stream Error - Stream failed');
    });
  });
});
