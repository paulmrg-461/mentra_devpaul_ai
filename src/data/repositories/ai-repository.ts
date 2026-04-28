import { IAIRepository } from '../../domain/repositories/ai-repository.interface.js';
import { IAIResponse, IImageAnalysisRequest } from '../../domain/entities/ai.js';
import { config } from '../../shared/config/env.js';

const API_TIMEOUT_MS = 15000; // 15 seconds timeout

function validateAIResponse(data: unknown): IAIResponse {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid AI response format');
  }

  const response = data as Record<string, unknown>;
  if (typeof response.response !== 'string') {
    throw new Error('Invalid AI response: missing or invalid "response" field');
  }

  return { response: response.response };
}

export class AIRepository implements IAIRepository {
  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  async queryStream(text: string, onChunk: (chunk: string) => void, _history?: unknown[]): Promise<IAIResponse> {
    const streamUrl = config.api.queryUrl.replace(/\/query$/, '/query/stream');

    const response = await this.fetchWithTimeout(streamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: text }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Stream error: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value, { stream: true }).split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data) as { chunk?: string; error?: string };
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.chunk) { fullResponse += parsed.chunk; onChunk(parsed.chunk); }
          } catch (e: any) {
            if (e.message && !e.message.startsWith('Unexpected token')) throw e;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { response: fullResponse };
  }

  async query(text: string, _history?: unknown[]): Promise<IAIResponse> {
    const response = await this.fetchWithTimeout(config.api.queryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: text }),
    });

    if (!response.ok) {
      throw new Error(`AI Query API error: ${response.statusText}`);
    }

    const data = await response.json();
    return validateAIResponse(data);
  }

  async analyzeImage(request: IImageAnalysisRequest): Promise<IAIResponse> {
    const response = await this.fetchWithTimeout(config.api.analyzeImageUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Image Analysis API error: ${response.statusText}`);
    }

    const data = await response.json();
    return validateAIResponse(data);
  }

  async queryMeeting(question: string, transcript: string): Promise<IAIResponse> {
    const response = await this.fetchWithTimeout(config.api.queryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: question, context: transcript }),
    });

    if (!response.ok) {
      throw new Error(`AI Meeting Query API error: ${response.statusText}`);
    }

    const data = await response.json();
    return validateAIResponse(data);
  }

  async summarizeMeeting(transcript: string): Promise<IAIResponse> {
    const response = await this.fetchWithTimeout(config.api.queryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `Summarize this meeting:\n${transcript}` }),
    });

    if (!response.ok) {
      throw new Error(`AI Meeting Summary API error: ${response.statusText}`);
    }

    const data = await response.json();
    return validateAIResponse(data);
  }
}
