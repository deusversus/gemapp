import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    gemini: {
      getUserAgent: () => Promise<string>
      listModels: (params: {
        apiKey: string
        showAll?: boolean
      }) => Promise<{ success: boolean; models?: any[]; error?: string }>
      chat: (params: {
        apiKey: string
        modelName: string
        message: string
        history: any[]
        systemInstruction?: string
      }) => Promise<{ success: boolean; text?: string; error?: string }>
      stream: (params: {
        apiKey: string
        modelName: string
        message: string
        images?: string[]
        history: any[]
        systemInstruction?: string
      }) => Promise<{ success: boolean; text?: string; images?: string[]; error?: string }>
      listImages: () => Promise<{ success: boolean; images: string[]; error?: string }>
      saveImage: (params: {
        base64Data: string
      }) => Promise<{ success: boolean; path?: string; error?: string }>
      deleteImage: (params: { filename: string }) => Promise<{ success: boolean; error?: string }>
      deleteAllImages: () => Promise<{ success: boolean; error?: string }>
      generateImage: (params: {
        apiKey: string
        modelId: string
        prompt: string
        aspectRatio?: string
        personGeneration?: string
      }) => Promise<{
        success: boolean
        path?: string
        base64?: string
        mimeType?: string
        error?: string
      }>
      generateVideo: (params: {
        apiKey: string
        modelId: string
        prompt: string
      }) => Promise<{ success: boolean; path?: string; mimeType?: string; error?: string }>
      downloadMedia: (params: { url: string }) => Promise<{ success: boolean; error?: string }>
      copyImage: (params: { url: string }) => Promise<{ success: boolean; error?: string }>
      [key: string]: any
    }
  }
}
