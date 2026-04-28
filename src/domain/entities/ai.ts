export interface IAIResponse {
  response: string;
}

export interface IImageAnalysisRequest {
  image: string; // base64
  prompt?: string;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}
