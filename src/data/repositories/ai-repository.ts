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

  async query(text: string): Promise<IAIResponse> {
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
