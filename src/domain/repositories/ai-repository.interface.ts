import { IAIResponse, IImageAnalysisRequest } from '../entities/ai.js';

export interface IAIRepository {
  query(text: string): Promise<IAIResponse>;
  analyzeImage(request: IImageAnalysisRequest): Promise<IAIResponse>;
}
