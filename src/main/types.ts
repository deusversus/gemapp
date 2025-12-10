export interface ImageGenerationParams {
  modelId: string
  prompt: string
  aspectRatio: string
  personGeneration?: string
}

export interface ChatMessage {
  role: 'user' | 'model'
  content: string
  images?: string[] // base64 or gemini-media://
}

export interface ChatHistoryItem {
  role: string
  parts: { text?: string; inlineData?: any; internalUrl?: any }[]
}
