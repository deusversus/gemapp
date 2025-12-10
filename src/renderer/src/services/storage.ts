import { ChatMessage } from '../types'
import CryptoJS from 'crypto-js'

const SECRET_KEY = 'gemini-native-local-storage-secret'

export type { ChatMessage }

export interface ChatSession {
    id: string
    title: string
    messages: ChatMessage[]
    updatedAt: number
    modelId?: string // Per-chat model override
    gemId?: string // Optional: Linked Gem ID
}

export interface ApiKey {
    id: string
    name: string
    key: string
}

export interface AppSettings {
    apiKeys: ApiKey[]
    activeKeyId: string
    activeModel: string
    theme: 'dark' | 'light'
    username?: string
    globalInstructions?: string
}

export interface Gem {
    id: string
    name: string
    icon: string
    instruction: string
}

export class StorageService {
    private static CHATS_KEY = 'gemini_chats_encrypted'
    private static SETTINGS_KEY = 'gemini_settings'
    private static GEMS_KEY = 'gemini_gems'

    // --- ENCRYPTION HELPERS ---

    private static encrypt(data: any): string {
        try {
            const json = JSON.stringify(data)
            return CryptoJS.AES.encrypt(json, SECRET_KEY).toString()
        } catch (e) {
            console.error('Encryption failed:', e)
            return ''
        }
    }

    private static decrypt(ciphertext: string): any {
        try {
            const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY)
            const decrypted = bytes.toString(CryptoJS.enc.Utf8)
            if (!decrypted) return null
            return JSON.parse(decrypted)
        } catch (e) {
            return null
        }
    }

    // --- CHATS ---

    static getChats(): ChatSession[] {
        const raw = localStorage.getItem(this.CHATS_KEY)
        if (!raw) return []
        
        // Try decrypting first
        const decrypted = this.decrypt(raw)
        if (decrypted) return decrypted

        // Fallback: try parsing raw (migration from plain text)
        try {
            const plain = JSON.parse(raw)
            // If we successfully read plain text, re-save as encrypted immediately
            if (Array.isArray(plain)) {
                this.saveChats(plain)
                return plain
            }
        } catch (e) {
            // Ignore
        }
        return []
    }

    static saveChats(chats: ChatSession[]) {
        try {
            const ciphertext = this.encrypt(chats)
            if (ciphertext) {
                localStorage.setItem(this.CHATS_KEY, ciphertext)
            }
        } catch (e: any) {
            console.error('Storage quota exceeded:', e)
            // Fallback: Try saving without images (heavy base64 data)
            try {
                const liteChats = chats.map(chat => ({
                    ...chat,
                    messages: chat.messages.map(msg => ({
                        role: msg.role,
                        content: msg.content,
                        // Strip images to save space
                        images: undefined 
                    }))
                }))
                const liteCiphertext = this.encrypt(liteChats)
                if (liteCiphertext) {
                    localStorage.setItem(this.CHATS_KEY, liteCiphertext)
                }
            } catch (retryError) {
                console.error('Failed to save even lite version:', retryError)
            }
        }
    }

    static addChat(chat: ChatSession) {
        const chats = this.getChats()
        chats.unshift(chat)
        this.saveChats(chats)
    }

    static updateChat(id: string, messages: ChatMessage[], title?: string, modelId?: string) {
        const chats = this.getChats()
        const index = chats.findIndex(c => c.id === id)
        if (index !== -1) {
            chats[index].messages = messages
            chats[index].updatedAt = Date.now()
            if (title) chats[index].title = title
            if (modelId) chats[index].modelId = modelId
            const updated = chats.splice(index, 1)[0]
            chats.unshift(updated)
            this.saveChats(chats)
        }
    }

    static deleteChat(id: string) {
        const chats = this.getChats().filter(c => c.id !== id)
        this.saveChats(chats)
    }

    // --- SETTINGS ---

    static getSettings(): AppSettings {
        const raw = localStorage.getItem(this.SETTINGS_KEY)
        const defaultSettings: AppSettings = {
            apiKeys: [],
            activeKeyId: '',
            activeModel: 'gemini-1.5-flash',
            theme: 'dark',
            username: 'User',
            globalInstructions: ''
        }

        if (!raw) return defaultSettings

        // Try decrypting
        const decrypted = this.decrypt(raw)
        if (decrypted) return decrypted

        // Fallback: try parsing raw
        try {
            const plain = JSON.parse(raw)
            if (plain && typeof plain === 'object') {
                this.saveSettings(plain) // Migrate to encrypted
                return plain
            }
        } catch (e) {
            // Ignore
        }
        return defaultSettings
    }

    static saveSettings(settings: AppSettings) {
        const ciphertext = this.encrypt(settings)
        if (ciphertext) {
            localStorage.setItem(this.SETTINGS_KEY, ciphertext)
        }
    }

    // --- GEMS (System Prompts) ---

    static getGems(): Gem[] {
        const raw = localStorage.getItem(this.GEMS_KEY)
        if (!raw) return []

        const decrypted = this.decrypt(raw)
        if (decrypted) return decrypted

        try {
            const plain = JSON.parse(raw)
            if (Array.isArray(plain)) {
                this.saveGems(plain)
                return plain
            }
        } catch (e) {
            // Ignore
        }
        return []
    }

    static saveGems(gems: Gem[]) {
        const ciphertext = this.encrypt(gems)
        if (ciphertext) {
            localStorage.setItem(this.GEMS_KEY, ciphertext)
        }
    }

    static addGem(gem: Gem) {
        const gems = this.getGems()
        gems.push(gem)
        this.saveGems(gems)
    }

    static deleteGem(id: string) {
        const gems = this.getGems().filter(g => g.id !== id)
        this.saveGems(gems)
    }

    static updateGem(updatedGem: Gem) {
        const gems = this.getGems()
        const index = gems.findIndex(g => g.id === updatedGem.id)
        if (index !== -1) {
            gems[index] = updatedGem
            this.saveGems(gems)
        }
    }
}
