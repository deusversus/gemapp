import { GoogleGenerativeAI, Content } from '@google/generative-ai'

export class GeminiService {
  private genAI: GoogleGenerativeAI
  private modelName: string

  constructor(apiKey: string, modelName: string = 'gemini-1.5-flash') {
    this.genAI = new GoogleGenerativeAI(apiKey)
    this.modelName = modelName
  }

  async streamChat(message: string, history: Content[], systemInstruction?: string) {
    let modelName = this.modelName
    let thinkingConfig = {}

    // Special handling for "Thinking" pseudo-model
    if (this.modelName === 'gemini-3-pro-preview-thinking') {
      modelName = 'gemini-3-pro-preview'
      // @ts-ignore - SDK might not have strict typing for this yet
      thinkingConfig = { thinking_level: 'high' }
    }

    const model = this.genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemInstruction,
      ...thinkingConfig
    })

    const chat = model.startChat({
      history: history,
      generationConfig: {
        maxOutputTokens: 8000
      }
    })

    const result = await chat.sendMessageStream(message)
    return result.stream
  }

  async validateKey() {
    try {
      // Simple test
      const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
      await model.generateContent('ping')
      return true
    } catch (e) {
      console.error(e)
      return false
    }
  }

  static async listModels(apiKey: string) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      )
      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.statusText}`)
      }
      const data = await response.json()
      return data.models || []
    } catch (error) {
      console.error('Error listing models:', error)
      return []
    }
  }
}
