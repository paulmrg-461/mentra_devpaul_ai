import { IAIResponse, IImageAnalysisRequest, ConversationTurn } from '../entities/ai.js';

export interface IAIRepository {
  query(text: string, history?: ConversationTurn[]): Promise<IAIResponse>;
  queryStream(text: string, onChunk: (chunk: string) => void, history?: ConversationTurn[]): Promise<IAIResponse>;
  analyzeImage(request: IImageAnalysisRequest): Promise<IAIResponse>;
  queryMeeting(question: string, transcript: string): Promise<IAIResponse>;
  summarizeMeeting(transcript: string): Promise<IAIResponse>;
}
