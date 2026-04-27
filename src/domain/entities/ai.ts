export interface IAIResponse {
  response: string;
}

export interface IImageAnalysisRequest {
  image: string; // base64
  prompt?: string;
}
