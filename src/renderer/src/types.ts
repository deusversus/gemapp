export interface ChatMessage {
  role: 'user' | 'model'
  content: string
  images?: string[] // Base64 data URLs
}
