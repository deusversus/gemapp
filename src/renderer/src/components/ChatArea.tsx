import { useState, useRef, useEffect } from 'react'
import { Send, Key, Sparkles, Mic, Image as ImageIcon, Plus, X } from 'lucide-react'
import { StorageService } from '../services/storage'
import { ChatMessage as Message } from '../types'
import { MODELS } from '../constants/models'

// Declare the window.gemini API from preload
declare global {
    interface Window {
        gemini: {
            chat: (params: any) => Promise<{ success: boolean; text?: string; error?: string }>
            stream: (params: any) => Promise<{ success: boolean; text?: string; error?: string }>
            listModels: (params: any) => Promise<{ success: boolean; models?: any[]; error?: string }>
            saveImage: (params: { base64Data: string }) => Promise<{ success: boolean; path?: string; error?: string }>
            listImages: () => Promise<{ success: boolean; images?: string[]; error?: string }>
            deleteImage: (params: { filename: string }) => Promise<{ success: boolean; error?: string }>
            deleteAllImages: () => Promise<{ success: boolean; error?: string }>
        }
    }
}

interface ChatAreaProps {
    activeChatId: string | null
    onUpdateChat: (id: string, messages: Message[], title?: string, modelId?: string) => void
    onCreateChat: (initialMessage: string, modelId?: string) => Promise<string>
    apiKey: string
    modelName: string // Default model from settings
    systemInstruction?: string
    onOpenSettings: () => void
    highlightedImage?: string
    userName?: string
    globalInstructions?: string
}

export function ChatArea({ activeChatId, onUpdateChat, onCreateChat, apiKey, modelName, systemInstruction, onOpenSettings, highlightedImage, userName, globalInstructions }: ChatAreaProps) {
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [currentModel, setCurrentModel] = useState(modelName)
    const [attachments, setAttachments] = useState<string[]>([])
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    // Track if this is the initial mount
    const isInitialMount = useRef(true)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    // Effect for deep linking/highlighting
    useEffect(() => {
        if (highlightedImage && messages.length > 0) {
            // Wait a tick for rendering
            setTimeout(() => {
                // Find all img tags
                const imgs = containerRef.current?.querySelectorAll('img')
                if (!imgs) return

                let targetImg: HTMLImageElement | null = null

                // Try to find Exact match first
                for (let i = 0; i < imgs.length; i++) {
                    if (imgs[i].src === highlightedImage) {
                        targetImg = imgs[i]
                        break
                    }
                }

                // Fallback: Ends with filename (since src might be file:// or gemini-media://)
                if (!targetImg) {
                    const targetFilename = highlightedImage.split('/').pop()
                    if (targetFilename) {
                        for (let i = 0; i < imgs.length; i++) {
                            if (imgs[i].src.endsWith(targetFilename)) {
                                targetImg = imgs[i]
                                break
                            }
                        }
                    }
                }

                if (targetImg) {
                    targetImg.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    // Add temporary highlight animation
                    targetImg.style.transition = 'box-shadow 0.3s ease'
                    targetImg.style.boxShadow = '0 0 0 4px #f4b400'
                    setTimeout(() => {
                        if (targetImg) targetImg.style.boxShadow = ''
                    }, 2000)
                }
            }, 100)
        } else if (!highlightedImage) {
            scrollToBottom()
        }
    }, [messages, highlightedImage])

    useEffect(() => {
        if (activeChatId) {
            const chats = StorageService.getChats()
            const currentChat = chats.find(c => c.id === activeChatId)
            if (currentChat) {
                setMessages(currentChat.messages)
                // Use chat's model if set, otherwise keep current selection
                if (currentChat.modelId) {
                    setCurrentModel(currentChat.modelId)
                }
            } else {
                setMessages([])
            }
        } else {
            setMessages([])
            // Only set default model on initial mount, not when user clears chat
            if (isInitialMount.current) {
                setCurrentModel(modelName)
                isInitialMount.current = false
            }
        }
    }, [activeChatId])

    // Update default model if settings change (but only if no chat-specific model)
    useEffect(() => {
        if (!activeChatId && isInitialMount.current) {
            setCurrentModel(modelName)
        }
    }, [modelName])

    useEffect(() => {
        // Only auto-scroll to bottom if NOT highlighting an image
        if (!highlightedImage) {
            scrollToBottom()
        }
    }, [messages])

    const handleModelChange = (newModelId: string) => {
        setCurrentModel(newModelId)
        // If there's an active chat, persist the model choice
        if (activeChatId) {
            onUpdateChat(activeChatId, messages, undefined, newModelId)
        }
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files)
            files.forEach(file => {
                const reader = new FileReader()
                reader.onloadend = () => {
                    if (typeof reader.result === 'string') {
                        setAttachments(prev => [...prev, reader.result as string])
                    }
                }
                reader.readAsDataURL(file)
            })
        }
        // Reset input so same file can be selected again
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const removeAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index))
    }

    const handleSend = async () => {
        if (!input.trim() && attachments.length === 0) return

        if (!apiKey) {
            onOpenSettings()
            return
        }

        const userMsg = input.trim()
        const currentAttachments = [...attachments]

        setInput('')
        setAttachments([])

        let currentChatId = activeChatId
        let currentMessages = messages

        // If no active chat, create one
        if (!currentChatId) {
            currentChatId = await onCreateChat(userMsg)
            currentMessages = []
        }

        // Save images to disk first
        let savedImagePaths: string[] = []
        if (currentAttachments.length > 0) {
            try {
                const savePromises = currentAttachments.map(base64 =>
                    window.gemini.saveImage({ base64Data: base64 })
                )
                const results = await Promise.all(savePromises)
                savedImagePaths = results.map(r => r.success ? r.path : null).filter(Boolean) as string[]
            } catch (err) {
                console.error('Failed to save images to disk', err)
                // Fallback to base64 if save fails (or user can live with it)
                // But we prefer paths.
            }
        }

        // Use PATHS for display history (to save space), but BASE64 for API call (immediate)
        // Wait, if we use paths for display, we hope the <img src> works with file://
        // Ideally we use base64 for IMMEDIATE display (optimistic), 
        // but commit paths to storage.

        // We'll update the optimistic message to use paths if available, or base64 if not?
        // Actually, let's use the Saved Paths for the message object we add to state.
        // It's cleaner. If save fails, we use base64.
        const displayImages = savedImagePaths.length > 0 ? savedImagePaths : (currentAttachments.length > 0 ? currentAttachments : undefined)

        const newMessages: Message[] = [...currentMessages, {
            role: 'user',
            content: userMsg,
            images: displayImages
        }]
        setMessages(newMessages)
        if (currentChatId) onUpdateChat(currentChatId, newMessages)

        setLoading(true)

        // Add placeholder for response
        setMessages(prev => [...prev, { role: 'model', content: '...' }])

        try {
            // Build history in API format
            const history = currentMessages.map(m => {
                const parts: any[] = []

                // Add images first
                if (m.images && m.images.length > 0) {
                    m.images.forEach(img => {
                        if (img.startsWith('data:')) {
                            const matches = img.match(/^data:(.+);base64,([\s\S]+)$/)
                            if (matches) {
                                parts.push({
                                    inlineData: {
                                        mimeType: matches[1],
                                        data: matches[2]
                                    }
                                })
                            }
                        } else if (img.startsWith('gemini-media://')) {
                            // Pass the protocol URL to the main process to handle
                            parts.push({
                                internalUrl: img
                            })
                        }
                    })
                }

                // Add text if present
                if (m.content && m.content.trim()) {
                    parts.push({ text: m.content })
                } else if (parts.length === 0) {
                    // Fallback for empty message (should not happen)
                    parts.push({ text: '' })
                }

                return {
                    role: m.role,
                    parts: parts
                }
            })

            if (currentMessages.length === 0 && currentChatId) {
                onUpdateChat(currentChatId, newMessages, userMsg.slice(0, 30))
            }

            // Combine global instructions with gem instructions
            const combinedSystemInstruction = [globalInstructions, systemInstruction].filter(Boolean).join('\n\n')

            // Call via IPC (main process handles the API call, bypassing CORS)
            const result = await window.gemini.stream({
                apiKey,
                modelName: currentModel, // Use per-chat model selection
                message: userMsg,
                images: currentAttachments,
                history,
                systemInstruction: combinedSystemInstruction
            })

            if (result.success) {
                setMessages(prev => {
                    const newArr = [...prev]
                    newArr[newArr.length - 1].content = result.text || ''
                    return newArr
                })

                const finalMessages = [...newMessages, { role: 'model', content: result.text || '' }] as Message[]
                if (currentChatId) onUpdateChat(currentChatId, finalMessages)
            } else {
                setMessages(prev => {
                    const newArr = [...prev]
                    newArr[newArr.length - 1].content = `Error: ${result.error}\n\nTry a different model or check your API key.`
                    return newArr
                })
            }

        } catch (error: any) {
            console.error(error)
            setMessages(prev => {
                const newArr = [...prev]
                newArr[newArr.length - 1].content = `Error: ${error.message || 'Unknown error'}\n\nPlease check your API Key in Settings.`
                return newArr
            })
        } finally {
            setLoading(false)
        }
    }

    if (!apiKey && !activeChatId) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#131314] text-[#e3e3e3]">
                <Key className="w-12 h-12 text-[#8ab4f8] mb-4" />
                <h2 className="text-2xl font-GoogleSans mb-2">Setup API Key</h2>
                <p className="text-gray-400 mb-6 max-w-md">To use the API mode, you need to add a Google Gemini API Key in Settings.</p>
                <button
                    onClick={onOpenSettings}
                    className="bg-[#8ab4f8] hover:bg-[#aecbfa] text-[#041e49] px-6 py-2.5 rounded-full font-medium transition-colors"
                >
                    Open Settings
                </button>
            </div>
        )
    }

    const isZeroState = !activeChatId || messages.length === 0

    return (
        <div className="flex-1 flex flex-col h-full bg-[#131314] text-[#e3e3e3] relative font-sans">

            <div ref={containerRef} className={`flex-1 overflow-y-auto px-4 md:px-[15%] pt-8 pb-4 flex flex-col ${isZeroState ? 'justify-center items-center' : 'gap-6'}`}>

                {isZeroState ? (
                    <div className="flex flex-col items-start w-full max-w-3xl mb-10 pl-2">
                        <div className="flex items-center gap-2 mb-2">
                            {systemInstruction ? <span className="bg-[#f4b400]/20 text-[#f4b400] text-xs px-2 py-0.5 rounded flex items-center gap-1"><Sparkles size={10} /> Custom Gem Active</span> : <Sparkles className="text-[#c48df6]" size={36} />}
                        </div>
                        <h1 className="text-5xl font-medium bg-gradient-to-r from-[#4285f4] via-[#ec407a] to-[#f4b400] bg-clip-text text-transparent pb-2">
                            Hello, {userName || 'User'}
                        </h1>
                        <p className="text-[#8e8e8e] text-2xl font-light">How can I help you today?</p>
                    </div>
                ) : (
                    <>
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} w-full`}>
                                <div className={`max-w-[85%] rounded-[20px] px-6 py-4 text-[15px] leading-relaxed ${msg.role === 'user'
                                    ? 'bg-[#2c2d2e] text-[#e3e3e3]'
                                    : 'bg-transparent text-[#e3e3e3]'
                                    }`}>
                                    {msg.role === 'model' && (
                                        <Sparkles size={16} className="text-[#c48df6] mb-2" />
                                    )}
                                    {msg.content === '...' && idx === messages.length - 1 ? (
                                        <div className="flex space-x-1 h-6 items-center px-1">
                                            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                                        </div>
                                    ) : (
                                        <>
                                            {msg.images && msg.images.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mb-3">
                                                    {msg.images.map((img, i) => {
                                                        const lowerImg = img.toLowerCase()
                                                        const isPdf = img.startsWith('data:application/pdf') || lowerImg.endsWith('.pdf')
                                                        const isDataImage = img.startsWith('data:image/')
                                                        const isProtocolImage = img.startsWith('gemini-media://')
                                                        const isFileImage = /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(img)

                                                        // Determine if it should be rendered as an image
                                                        const shouldRenderAsImage = isDataImage || isFileImage || isProtocolImage

                                                        // Render PDF/Docs/Unknown as file card
                                                        if (isPdf || !shouldRenderAsImage) {
                                                            return (
                                                                <div key={i} className="flex items-center gap-2 bg-[#1e1f20] border border-gray-700 rounded-lg px-3 py-2 text-sm text-[#8ab4f8]">
                                                                    <div className="bg-red-500/20 p-1.5 rounded">
                                                                        <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                        </svg>
                                                                    </div>
                                                                    <span className="truncate max-w-[150px]">
                                                                        {img.startsWith('data:') ? `Attachment ${i + 1}` : img.split(/[/\\]/).pop()}
                                                                    </span>
                                                                </div>
                                                            )
                                                        }

                                                        // Render Image
                                                        return (
                                                            <img
                                                                key={i}
                                                                src={img}
                                                                alt="attachment"
                                                                className="w-full max-w-[300px] h-auto rounded-lg border border-gray-700/50 object-contain hover:scale-105 transition-transform cursor-pointer"
                                                                onError={(e) => {
                                                                    // If image fails to load, we could replace with card, but for now just hide
                                                                    e.currentTarget.style.display = 'none'
                                                                }}
                                                            />
                                                        )
                                                    })}
                                                </div>
                                            )}
                                            <div className="whitespace-pre-wrap">{msg.content}</div>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className={`w-full max-w-3xl mx-auto px-4 ${isZeroState ? 'mb-20' : 'mb-6'}`}>
                <div className="relative bg-[#1e1f20] rounded-[28px] transition-all hover:bg-[#2c2d2e] group">

                    <div className="flex flex-col">
                        {attachments.length > 0 && (
                            <div className="flex gap-2 px-6 pt-4 overflow-x-auto">
                                {attachments.map((img, idx) => (
                                    <div key={idx} className="relative group shrink-0">
                                        <img src={img} alt="preview" className="w-16 h-16 object-cover rounded-lg border border-gray-700" />
                                        <button
                                            onClick={() => removeAttachment(idx)}
                                            className="absolute -top-1 -right-1 bg-gray-800 rounded-full p-0.5 text-gray-400 hover:text-white border border-gray-600 shadow-sm"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <textarea
                            className="w-full bg-transparent text-[#e3e3e3] placeholder-[#8e8e8e] px-6 py-4 rounded-[28px] focus:outline-none resize-none min-h-[60px] max-h-[200px]"
                            placeholder={attachments.length > 0 ? "Ask about this image..." : "Ask Gemini"}
                            rows={1}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            disabled={loading}
                            style={{ scrollbarWidth: 'none' }}
                        />

                        <div className="flex items-center justify-between px-4 pb-3">
                            <div className="flex items-center gap-2">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileSelect}
                                    className="hidden"
                                    accept="image/png, image/jpeg, image/webp, image/heic, application/pdf"
                                    multiple
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-2 rounded-full text-[#e3e3e3] hover:bg-[#3c4043] transition-colors"
                                    title="Add files"
                                >
                                    <Plus size={20} />
                                </button>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-2 rounded-full text-[#e3e3e3] hover:bg-[#3c4043] transition-colors"
                                    title="Add images"
                                >
                                    <ImageIcon size={20} />
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                {input.trim() || attachments.length > 0 ? (
                                    <button
                                        onClick={handleSend}
                                        disabled={loading}
                                        className="p-2 bg-[#e3e3e3] text-[#131314] rounded-full hover:bg-white transition-opacity disabled:opacity-50"
                                    >
                                        <Send size={18} className="translate-x-0.5" />
                                    </button>
                                ) : (
                                    <button className="p-2 rounded-full text-[#e3e3e3] hover:bg-[#3c4043] transition-colors">
                                        <Mic size={20} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-center mt-2">
                    <div className="relative inline-flex items-center gap-2 text-[10px] bg-[#1e1f20] px-3 py-1.5 rounded-full border border-gray-800 hover:border-gray-600 transition-colors">
                        <select
                            value={currentModel}
                            onChange={(e) => handleModelChange(e.target.value)}
                            className="bg-transparent text-gray-400 appearance-none cursor-pointer focus:outline-none pr-4"
                            style={{ fontSize: '10px' }}
                        >
                            {MODELS.map(m => (
                                <option key={m.id} value={m.id} className="bg-[#1e1f20]">
                                    {m.name}
                                </option>
                            ))}
                        </select>
                        <svg className="w-3 h-3 text-gray-500 absolute right-3 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </div>

                <p className="text-center text-[11px] text-[#8e8e8e] mt-3">
                    Gemini can make mistakes, so double-check it.
                </p>
            </div>
        </div>
    )
}
