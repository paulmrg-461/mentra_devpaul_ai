import { IAIRepository } from '../../domain/repositories/ai-repository.interface.js';
import { IAIResponse, IImageAnalysisRequest } from '../../domain/entities/ai.js';
import { config } from '../../shared/config/env.js';

const API_TIMEOUT_MS = 30000; // 30s timeout for Groq API

export class GroqAIRepository implements IAIRepository {
  private groqApiKey: string;
  private model: string;

  constructor() {
    this.groqApiKey = config.groq.apiKey;
    this.model = config.groq.model;
  }

  /**
   * Fetch with timeout and streaming support
   */
  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${this.groqApiKey}`,
        },
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Query Groq API with text
   */
  async query(text: string): Promise<IAIResponse> {
    const systemPrompt = config.groq.systemPrompt || 
      'Eres Numa, un asistente de IA amigable y útil. Responde de forma concisa y clara.';

    const response = await this.fetchWithTimeout(config.groq.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.choices?.[0]?.message?.content) {
      throw new Error('Invalid Groq API response format');
    }

    return {
      response: data.choices[0].message.content.trim(),
    };
  }

  /**
   * Analyze image using Groq's vision capabilities
   */
  async analyzeImage(request: IImageAnalysisRequest): Promise<IAIResponse> {
    const systemPrompt = config.groq.visionSystemPrompt ||
      'Describe lo que ves en esta imagen de forma breve y clara.';

    const response = await this.fetchWithTimeout(config.groq.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: request.prompt || 'Describe what you see in this image.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${request.image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq Vision API error: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.choices?.[0]?.message?.content) {
      throw new Error('Invalid Groq vision API response format');
    }

    return {
      response: data.choices[0].message.content.trim(),
    };
  }

  /**
   * Query with streaming response (for future enhancement)
   */
  async queryStream(
    text: string,
    onChunk: (chunk: string) => void
  ): Promise<IAIResponse> {
    const systemPrompt = config.groq.systemPrompt ||
      'Eres Numa, un asistente de IA amigable y útil. Responde de forma concisa y clara.';

    const response = await this.fetchWithTimeout(config.groq.streamUrl || config.groq.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.7,
        max_tokens: 500,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq Stream API error: ${response.statusText} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                onChunk(content);
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      response: fullResponse,
    };
  }
}
