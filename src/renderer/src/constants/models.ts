// Shared model definitions - Verified from API Dec 2025
export const MODELS = [
    // Gemini 3 Series (Dec 2025)
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview' },
    // Gemini 2.5 Series (Current flagship)
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    // Gemini 2.0 Series
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash Experimental' },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
    // Gemini 1.5 Series (Stable)
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash 8B' },
]

export function getModelName(id: string): string {
    const model = MODELS.find(m => m.id === id)
    return model ? model.name : id
}
