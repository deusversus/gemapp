import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Sidebar } from './Sidebar'
import { ChatArea } from './ChatArea'
import { SettingsModal } from './SettingsModal'
import { GemManagerModal } from './GemManagerModal'
import { GalleryModal } from './GalleryModal'
import { Globe, Terminal } from 'lucide-react'
import { StorageService, ChatSession, AppSettings, Gem } from '../services/storage'
import { ChatMessage } from '../types'

type AppMode = 'web' | 'api'

export function Layout() {
    const [mode, setMode] = useState<AppMode>('web')
    const [chats, setChats] = useState<ChatSession[]>([])
    const [activeChatId, setActiveChatId] = useState<string | null>(null)

    // Config State
    const [settings, setSettings] = useState<AppSettings>(StorageService.getSettings())
    const [currentGemInstruction, setCurrentGemInstruction] = useState<string | undefined>(undefined)
    const [currentGemId, setCurrentGemId] = useState<string | undefined>(undefined)

    // Data State
    const [gems, setGems] = useState<Gem[]>([])
    const [recentImages, setRecentImages] = useState<string[]>([])
    const [userAgent, setUserAgent] = useState<string>('')

    // Modals
    const [showSettings, setShowSettings] = useState(false)
    const [showGemManager, setShowGemManager] = useState(false)
    const [showGallery, setShowGallery] = useState(false)

    // Sidebar State
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

    const [highlightedImage, setHighlightedImage] = useState<string | undefined>(undefined)



    const webviewRef = useRef<any>(null)

    useEffect(() => {
        const webview = webviewRef.current
        if (!webview) return

        const onDomReady = () => {
            // Anti-fingerprinting: Delete navigator.webdriver and ChromeDriver variables
            webview.executeJavaScript(`
                // 1. Remove navigator.webdriver
                const newProto = navigator.__proto__;
                delete newProto.webdriver;
                navigator.__proto__ = newProto;

                // 2. Remove ChromeDriver "cdc_" variable
                const key = Object.keys(window).find(key => key.startsWith('cdc_'));
                if(key) delete window[key];
            `)
        }

        webview.addEventListener('dom-ready', onDomReady)
        return () => {
            webview.removeEventListener('dom-ready', onDomReady)
        }
    }, [userAgent, mode])

    const fetchImages = useCallback(async () => {
        try {
            const result = await window.gemini.listImages()
            if (result.success && result.images) {
                setRecentImages(result.images)
            }
        } catch (e) {
            console.error('Failed to fetch images', e)
        }
    }, [])

    const loadData = useCallback(async () => {
        setChats(StorageService.getChats())
        setGems(StorageService.getGems())
        fetchImages()
        // Fetch platform-specific User-Agent from main process to support both Mac and Windows
        try {
            const ua = await window.gemini.getUserAgent()
            setUserAgent(ua)
        } catch (e) {
            console.error('Failed to get User-Agent:', e)
            // Fallback to Windows Firefox if IPC fails
            setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0')
        }
    }, [fetchImages])

    // Initial Data Load
    useEffect(() => {
        loadData()
    }, [loadData])

    // Refresh images occasionally or when chats update
    useEffect(() => {
        fetchImages()
    }, [chats, fetchImages]) // When chat updates, maybe new image was added

    const handleSelectChat = (id: string) => {
        setActiveChatId(id)
        setCurrentGemInstruction(undefined)
        setCurrentGemId(undefined)
        setHighlightedImage(undefined)
    }

    const cleanupChatImages = async (chat: ChatSession) => {
        const imagesToDelete: string[] = []
        chat.messages.forEach(msg => {
            if (msg.images) {
                msg.images.forEach(img => {
                    if (img.startsWith('gemini-media://')) {
                        const filename = img.replace('gemini-media://', '')
                        imagesToDelete.push(filename)
                    }
                })
            }
        })

        if (imagesToDelete.length > 0) {
            try {
                await Promise.all(imagesToDelete.map(filename =>
                    window.gemini.deleteImage({ filename })
                ))
            } catch (err) {
                console.error('Failed to cleanup images for chat', chat.id, err)
            }
        }
    }

    const handleDeleteChat = async (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation()

        // Find chat to get images
        const chatToDelete = chats.find(c => c.id === id)
        if (chatToDelete) {
            await cleanupChatImages(chatToDelete)
        }

        StorageService.deleteChat(id)
        loadData()
        if (activeChatId === id) setActiveChatId(null)
    }

    const handleDeleteGem = async (gemId: string) => {
        // Find links
        const chatsToDelete = chats.filter(c => c.gemId === gemId)

        // 1. Cleanup all chats (images + sessions)
        for (const chat of chatsToDelete) {
            await cleanupChatImages(chat)
            StorageService.deleteChat(chat.id)
        }

        // 2. Delete Gem
        StorageService.deleteGem(gemId)

        // 3. Reset UI if active chat was in this gem
        if (activeChatId && chatsToDelete.find(c => c.id === activeChatId)) {
            setActiveChatId(null)
            setCurrentGemInstruction(undefined)
            setCurrentGemId(undefined)
        }

        loadData()
    }

    const handleGoToImage = (imgSrc: string) => {
        // Find which chat contains this image
        // imgSrc is likely "gemini-media://filename" or just filename, depending on how recentImages is stored
        // recentImages comes from listImages which returns filenames usually? Or full paths? 
        // window.gemini.listImages returns filenames or `gemini-media://${filename}`?
        // Let's assume the src matches what's in the message.images array exactly or partially.

        // Scan all chats
        for (const chat of chats) {
            for (const msg of chat.messages) {
                if (msg.images && msg.images.includes(imgSrc)) {
                    setActiveChatId(chat.id)
                    setHighlightedImage(imgSrc)
                    return
                }
            }
        }

        // Fallback: If not exact match, try checking filename
        const targetFilename = imgSrc.split('/').pop()
        if (!targetFilename) return

        for (const chat of chats) {
            for (const msg of chat.messages) {
                if (msg.images) {
                    const match = msg.images.find(img => img.endsWith(targetFilename))
                    if (match) {
                        setActiveChatId(chat.id)
                        setHighlightedImage(match)
                        return
                    }
                }
            }
        }
    }

    const handleNewChat = () => {
        setActiveChatId(null)
        setCurrentGemInstruction(undefined)
        setCurrentGemId(undefined)
        setHighlightedImage(undefined)
    }

    const handleCreateChat = async (_initialMessage: string): Promise<string> => {
        const newId = Date.now().toString(36) + Math.random().toString(36).substr(2)
        const newChat: ChatSession = {
            id: newId,
            title: 'New Chat',
            messages: [],
            updatedAt: Date.now(),
            gemId: currentGemId // Link to current gem if active
        }
        StorageService.addChat(newChat)
        loadData()
        setActiveChatId(newId)
        return newId
    }

    const handleUpdateChat = (id: string, messages: ChatMessage[], title?: string, modelId?: string) => {
        StorageService.updateChat(id, messages, title, modelId)
        loadData()
    }

    const handleStartGemChat = (gem: Gem) => {
        // Start a new chat context with this gem's instruction
        setActiveChatId(null)
        setCurrentGemInstruction(gem.instruction)
        setCurrentGemId(gem.id)
        setShowGemManager(false)
        setHighlightedImage(undefined)
    }

    const activeApiKey = settings.apiKeys.find(k => k.id === settings.activeKeyId)?.key || ''

    return (
        <div className="flex flex-col h-screen w-screen overflow-hidden bg-transparent rounded-xl relative">
            {/* Draggable Title Bar Area - Top Level, Full Width */}
            <div className="h-8 w-full drag-region z-50 flex justify-center items-center pointer-events-none absolute top-0 left-0 bg-transparent">
                <div className="drag-none pointer-events-auto bg-gray-900/90 backdrop-blur rounded-full p-1 flex gap-1 border border-gray-800 mt-2">
                    <button
                        onClick={() => setMode('web')}
                        className={`p-1.5 rounded-full transition-colors ${mode === 'web' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                        title="Web Mode (gemini.google.com)"
                    >
                        <Globe size={14} />
                    </button>
                    <button
                        onClick={() => setMode('api')}
                        className={`p-1.5 rounded-full transition-colors ${mode === 'api' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                        title="API Mode (Custom Chat)"
                    >
                        <Terminal size={14} />
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex w-full h-full pt-8 bg-gray-950 overflow-hidden">
                {mode === 'api' && (
                    <Sidebar
                        chats={chats}
                        gems={gems}
                        recentImages={recentImages}
                        activeId={activeChatId}
                        onSelect={handleSelectChat}
                        onDelete={handleDeleteChat}
                        onNewChat={handleNewChat}
                        onOpenSettings={() => setShowSettings(true)}
                        onOpenGemManager={() => setShowGemManager(true)}
                        onOpenGallery={() => setShowGallery(true)}
                        onGoToImage={handleGoToImage}
                        collapsed={isSidebarCollapsed}
                        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    />
                )}

                <div className="flex-1 h-full min-w-0 relative flex flex-col">
                    {mode === 'web' ? (
                        userAgent ? (
                            <webview
                                ref={webviewRef}
                                src="https://gemini.google.com"
                                className="w-full h-full"
                                useragent={userAgent}
                                partition="persist:gemini"
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-400">
                                Initializing Secure Session...
                            </div>
                        )
                    ) : (
                        <ChatArea
                            activeChatId={activeChatId}
                            onUpdateChat={handleUpdateChat}
                            onCreateChat={handleCreateChat}
                            apiKey={activeApiKey}
                            modelName={settings.activeModel}
                            systemInstruction={currentGemInstruction}
                            onOpenSettings={() => setShowSettings(true)}
                            highlightedImage={highlightedImage}
                            userName={settings.username}
                            globalInstructions={settings.globalInstructions}
                        />
                    )}
                </div>
            </div>

            {/* Modals */}
            <SettingsModal
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                onSettingsChanged={setSettings}
                onImagesCleared={fetchImages}
            />
            <GemManagerModal
                isOpen={showGemManager}
                onClose={() => setShowGemManager(false)}
                onStartGemChat={handleStartGemChat}
                gems={gems}
                chats={chats}
                onGemUpdated={loadData}
                onDeleteGem={handleDeleteGem}
            />
            <GalleryModal
                isOpen={showGallery}
                onClose={() => setShowGallery(false)}
            />
        </div>
    )
}
