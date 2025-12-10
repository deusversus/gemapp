// Shared model definitions - Verified from API Dec 2025
export const MODELS = [
  // Gemini 3 Series
  { id: 'gemini-3-pro', name: 'Gemini 3 Pro' },
  { id: 'gemini-3-pro-image', name: 'Gemini 3 Pro Image' },

  // Gemini 2.5 Series
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },

  // Gemini 2.0 Series
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
  { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
  { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash Experimental' }
]

export function getModelName(id: string): string {
  const model = MODELS.find((m) => m.id === id)
  return model ? model.name : id
}
