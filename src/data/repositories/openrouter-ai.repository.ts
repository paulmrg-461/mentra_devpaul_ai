import { IAIRepository } from '../../domain/repositories/ai-repository.interface.js';
import { IAIResponse, IImageAnalysisRequest, ConversationTurn } from '../../domain/entities/ai.js';
import { config } from '../../shared/config/env.js';

const API_TIMEOUT_MS = 30000;

export class OpenRouterAIRepository implements IAIRepository {
  private readonly apiKey: string;
  private readonly textModel: string;
  private readonly visionModel: string;
  private readonly apiUrl: string;

  constructor() {
    this.apiKey = config.openrouter.apiKey;
    this.textModel = config.openrouter.textModel;
    this.visionModel = config.openrouter.visionModel;
    this.apiUrl = config.openrouter.apiUrl;
  }

  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://numa.pro',
          'X-Title': 'Numa AI',
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callChatAPI(
    model: string,
    messages: object[],
    options: { temperature?: number; max_tokens?: number } = {}
  ): Promise<string> {
    const response = await this.fetchWithTimeout(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) throw new Error('Invalid OpenRouter API response format');

    return content.trim();
  }

  async queryStream(text: string, onChunk: (chunk: string) => void, history: ConversationTurn[] = []): Promise<IAIResponse> {
    const response = await this.fetchWithTimeout(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.textModel,
        messages: [
          { role: 'system', content: config.ai.systemPrompt },
          ...history,
          { role: 'user', content: text },
        ],
        temperature: 0.7,
        max_tokens: 150,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter stream error: ${response.statusText} - ${errorText}`);
    }

    if (!response.body) throw new Error('No response body for streaming');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullResponse += content;
              onChunk(content);
            }
          } catch { /* skip invalid JSON */ }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { response: fullResponse };
  }

  async query(text: string, history: ConversationTurn[] = []): Promise<IAIResponse> {
    const response = await this.callChatAPI(
      this.textModel,
      [
        { role: 'system', content: config.ai.systemPrompt },
        ...history,
        { role: 'user', content: text },
      ],
      { temperature: 0.7, max_tokens: 150 }
    );

    return { response };
  }

  async analyzeImage(request: IImageAnalysisRequest): Promise<IAIResponse> {
    const response = await this.callChatAPI(
      this.visionModel,
      [
        { role: 'system', content: config.ai.visionSystemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: request.prompt || 'Describe what you see in this image.' },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${request.image}` },
            },
          ],
        },
      ],
      { max_tokens: 500 }
    );

    return { response };
  }

  async queryMeeting(question: string, transcript: string): Promise<IAIResponse> {
    const systemPrompt =
      'Eres un asistente de reuniones. Tienes acceso a la transcripción de una reunión en curso. ' +
      'Responde preguntas sobre lo que se habló, decidió o mencionó. Sé conciso y directo. Responde en español.';

    const response = await this.callChatAPI(
      this.textModel,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Transcripción:\n${transcript}\n\nPregunta: ${question}` },
      ],
      { temperature: 0.3, max_tokens: 300 }
    );

    return { response };
  }

  async summarizeMeeting(transcript: string): Promise<IAIResponse> {
    const systemPrompt =
      'Eres un asistente de reuniones. Genera un resumen estructurado con este formato exacto:\n' +
      'DECISIONES:\n- [decisión]\n\nACCIONES:\n- [acción] (responsable si se menciona)\n\nPREGUNTAS ABIERTAS:\n- [pregunta]\n\n' +
      'Solo incluye lo mencionado en la transcripción. Responde en español.';

    const response = await this.callChatAPI(
      this.textModel,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Transcripción:\n${transcript}` },
      ],
      { temperature: 0.3, max_tokens: 800 }
    );

    return { response };
  }
}
