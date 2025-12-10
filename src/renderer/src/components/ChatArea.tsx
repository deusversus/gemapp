import { useState, useRef, useEffect } from 'react'
import {
  Send,
  Key,
  Sparkles,
  Mic,
  Image as ImageIcon,
  Plus,
  X,
  RotateCw,
  Copy,
  Share2,

  Pencil,
  Download
} from 'lucide-react'
import { StorageService } from '../services/storage'
import { ChatMessage as Message } from '../types'
import { MODELS } from '../constants/models'

// Declare the window.gemini API from preload
declare global {
  interface Window {
    gemini: {
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
      listModels: (params: {
        apiKey: string
        showAll?: boolean
      }) => Promise<{ success: boolean; models?: any[]; error?: string }>
      saveImage: (params: {
        base64Data: string
      }) => Promise<{ success: boolean; path?: string; error?: string }>
      listImages: () => Promise<{ success: boolean; images?: string[]; error?: string }>
      deleteImage: (params: { filename: string }) => Promise<{ success: boolean; error?: string }>
      deleteAllImages: () => Promise<{ success: boolean; error?: string }>
      getUserAgent: () => Promise<string>
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
      [key: string]: any
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

export function ChatArea({
  activeChatId,
  onUpdateChat,
  onCreateChat,
  apiKey,
  modelName,
  systemInstruction,
  onOpenSettings,
  highlightedImage,
  userName,
  globalInstructions
}: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [showCopiedToast, setShowCopiedToast] = useState(false)
  const [loading, setLoading] = useState(false)
  const isGeneratingRef = useRef(false)
  const [currentModel, setCurrentModel] = useState(modelName)
  const [attachments, setAttachments] = useState<string[]>([])
  const [viewedImage, setViewedImage] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Track if this is the initial mount
  const isInitialMount = useRef(true)

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
      const currentChat = chats.find((c) => c.id === activeChatId)
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
  }, [activeChatId, modelName])

  // Update default model if settings change (but only if no chat-specific model)
  useEffect(() => {
    if (!activeChatId && isInitialMount.current) {
      setCurrentModel(modelName)
    }
  }, [modelName, activeChatId])

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth'): void => {
    messagesEndRef.current?.scrollIntoView({ behavior })
  }

  // ...

  useEffect(() => {
    // Only auto-scroll to bottom if NOT highlighting an image
    if (!highlightedImage) {
      // Use 'auto' (instant) scrolling when loading/streaming to prevent stutter and missed updates
      scrollToBottom(loading ? 'auto' : 'smooth')
    }
  }, [messages, loading, highlightedImage])

  const handleModelChange = (newModelId: string): void => {
    setCurrentModel(newModelId)
    // If there's an active chat, persist the model choice
    if (activeChatId) {
      onUpdateChat(activeChatId, messages, undefined, newModelId)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>): void => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files)
      files.forEach((file) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            setAttachments((prev) => [...prev, reader.result as string])
          }
        }
        reader.readAsDataURL(file)
      })
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeAttachment = (index: number): void => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSend = async (): Promise<void> => {
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
        const savePromises = currentAttachments.map((base64) =>
          window.gemini.saveImage({ base64Data: base64 })
        )
        const results = await Promise.all(savePromises)
        savedImagePaths = results
          .map((r) => (r.success ? r.path : null))
          .filter(Boolean) as string[]
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
    const displayImages =
      savedImagePaths.length > 0
        ? savedImagePaths
        : currentAttachments.length > 0
          ? currentAttachments
          : undefined

    const newMessages: Message[] = [
      ...currentMessages,
      {
        role: 'user',
        content: userMsg,
        images: displayImages
      }
    ]
    setMessages(newMessages)
    if (currentChatId) onUpdateChat(currentChatId, newMessages)

    setLoading(true)

    // Add placeholder for response
    setMessages((prev) => [...prev, { role: 'model', content: '...' }])

    try {
      if (currentMessages.length === 0 && currentChatId) {
        onUpdateChat(currentChatId, newMessages, userMsg.slice(0, 30))
      }

      // Combine global instructions with gem instructions
      const combinedSystemInstruction = [globalInstructions, systemInstruction]
        .filter(Boolean)
        .join('\n\n')

      // Handle Slash Commands
      if (userMsg.trim().startsWith('/')) {
        const parts = userMsg.trim().split(/\s+/)
        const cmd = parts[0].toLowerCase()

        // /list models
        if (cmd === '/list' && parts[1]?.toLowerCase() === 'models') {
          try {
            const res = await window.gemini.listModels({ apiKey, showAll: true })
            let responseText = ''
            if (res.success && res.models) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const modelList = res.models
                .map(
                  (m: any) =>
                    `- **${m.displayName || m.name}** (\`${m.name.replace('models/', '')}\`)`
                )
                .join('\n')
              responseText = `### Available Models (All)\n\nYou can use these IDs with \`/generate [model] [prompt]\`:\n\n${modelList}`
            } else {
              responseText = `Error listing models: ${res.error || 'Unknown error'}`
            }

            const finalMessages = [
              ...newMessages,
              { role: 'model', content: responseText }
            ] as Message[]
            setMessages(finalMessages)
            if (currentChatId) onUpdateChat(currentChatId, finalMessages)
          } catch (err: any) {
            const errMsg = `Error: ${err.message}`
            const finalMessages = [...newMessages, { role: 'model', content: errMsg }] as Message[]
            setMessages(finalMessages)
            if (currentChatId) onUpdateChat(currentChatId, finalMessages)
          }
          setLoading(false)
          return
        }

        // /generate [model] [prompt]
        if (cmd === '/generate') {
          if (parts.length < 3) {
            const helpMsg = `**Usage:** \`/generate [model_id] [prompt]\`\nExample: \`/generate imagen-4.0-generate-001 A futuristic city\``
            const finalMessages = [...newMessages, { role: 'model', content: helpMsg }] as Message[]
            setMessages(finalMessages)
            if (currentChatId) onUpdateChat(currentChatId, finalMessages)
            setLoading(false)
            return
          }

          const modelId = parts[1]
          const prompt = parts.slice(2).join(' ')

          try {
            const res = await window.gemini.generateImage({ apiKey, modelId, prompt })
            if (res.success && res.path) {
              const successMsg: Message = {
                role: 'model',
                content: '',
                images: [res.path]
              }
              const finalMessages = [...newMessages, successMsg] as Message[]
              setMessages(finalMessages)
              if (currentChatId) onUpdateChat(currentChatId, finalMessages)
            } else {
              const errorMsg = `Generation failed: ${res.error || 'Unknown error'}`
              const finalMessages = [
                ...newMessages,
                { role: 'model', content: errorMsg }
              ] as Message[]
              setMessages(finalMessages)
              if (currentChatId) onUpdateChat(currentChatId, finalMessages)
            }
          } catch (err: any) {
            const errorMsg = `Generation error: ${err.message}`
            const finalMessages = [
              ...newMessages,
              { role: 'model', content: errorMsg }
            ] as Message[]
            setMessages(finalMessages)
            if (currentChatId) onUpdateChat(currentChatId, finalMessages)
          }
          setLoading(false)
          isGeneratingRef.current = false
          return
        }
      }

      // Standard Generation
      await generateResponse(newMessages, currentChatId, combinedSystemInstruction)
    } catch (error) {
      console.error(error)
      setMessages((prev) => {
        const newArr = [...prev]
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        if (
          newArr.length > 0 &&
          newArr[newArr.length - 1].role === 'model' &&
          newArr[newArr.length - 1].content === '...'
        ) {
          newArr[newArr.length - 1].content =
            `Error: ${errorMessage}\n\nPlease check your API Key in Settings.`
        } else {
          newArr.push({ role: 'model', content: `Error: ${errorMessage}` })
        }
        return newArr
      })
    } finally {
      setLoading(false)
      isGeneratingRef.current = false
    }
  }

  const generateResponse = async (
    historyMessages: Message[],
    chatId: string,
    instructions?: string
  ): Promise<void> => {
    // Build history in API format

    // The last message is the User's new input
    const lastMsg = historyMessages[historyMessages.length - 1]
    if (lastMsg.role !== 'user') {
      console.error('Last message is not user!')
      return
    }

    // We need to exclude the last message from history passed to startChat
    const historyForChat = historyMessages.slice(0, -1).map(convertMessageToApiFormat)

    const result = await window.gemini.stream({
      apiKey,
      modelName: currentModel,
      message: lastMsg.content,
      images: lastMsg.images?.filter(
        (img) => img.startsWith('data:') || img.startsWith('gemini-media://')
      ), // Only pass data/protocol URIs
      history: historyForChat,
      systemInstruction: instructions
    })

    if (result.success) {
      setMessages((prev) => {
        const newArr = [...prev]
        const lastMsgPlaceholder = newArr[newArr.length - 1]
        // We expect a placeholder '...' to be there if we called this from handleSend
        // But if this is a retry, we might need to handle state differently.

        // Actually, let's keep it simple:
        // When `generateResponse` is called, we assume the state ALREADY has the '...' placeholder?
        // OR `generateResponse` interacts with state?

        // `handleSend` added the placeholder.
        // Let's assume the placeholder is there.
        if (lastMsgPlaceholder.role === 'model' && lastMsgPlaceholder.content === '...') {
          lastMsgPlaceholder.content = result.text || ''
          lastMsgPlaceholder.images = result.images
        } else {
          // Should not happen if flow is correct, but let's append if missing
          newArr.push({
            role: 'model',
            content: result.text || '',
            images: result.images
          })
        }
        return newArr
      })

      // We need to reconstruct the final messages array for `onUpdateChat`
      // Since `setMessages` is async, we can't read it back immediately.
      // We'll approximate:
      const updatedMessages = [
        ...historyMessages,
        {
          role: 'model',
          content: result.text || '',
          images: result.images
        }
      ] as Message[]

      if (chatId) onUpdateChat(chatId, updatedMessages)
    } else {
      setMessages((prev) => {
        const newArr = [...prev]
        const lastMsgPlaceholder = newArr[newArr.length - 1]
        const errorText = `Error: ${result.error}\n\nTry a different model or check your API key.`
        if (lastMsgPlaceholder.role === 'model' && lastMsgPlaceholder.content === '...') {
          lastMsgPlaceholder.content = errorText
        } else {
          newArr.push({ role: 'model', content: errorText })
        }
        return newArr
      })
    }
  }

  // Helper to format messages for API
  const convertMessageToApiFormat = (m: Message) => {
    const parts: any[] = []
    if (m.role !== 'model' && m.images && m.images.length > 0) {
      m.images.forEach((img) => {
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
          parts.push({
            internalUrl: img
          })
        }
      })
    }
    if (m.content && m.content.trim()) {
      parts.push({ text: m.content })
    } else if (parts.length === 0) {
      parts.push({ text: '' })
    }
    return {
      role: m.role,
      parts: parts
    }
  }

  const handleRetry = async (index: number): Promise<void> => {
    if (loading || isGeneratingRef.current) return

    // Check if apiKey is present
    if (!apiKey) {
      onOpenSettings()
      return
    }

    const targetMsg = messages[index]

    let historyToKeep: Message[] = []

    if (targetMsg.role === 'model') {
      // Retro-compatibility or if we decide to keep it on model too
      // History = messages[0...index] (Excludes this model message)
      // Wait, slice(0, index) gives 0 to index-1.
      historyToKeep = messages.slice(0, index)

      // Validate preceding is user
      if (historyToKeep.length === 0 || historyToKeep[historyToKeep.length - 1].role !== 'user') {
        console.error('Cannot retry: Preceding message is not user')
        return
      }
    } else if (targetMsg.role === 'user') {
      // If retrying a USER message, we want to KEEP that message and regenerate response.
      // History = messages[0...index+1] (Includes this user message)
      historyToKeep = messages.slice(0, index + 1)
    } else {
      return
    }

    // Set state to truncated history + Placeholder
    setMessages([...historyToKeep, { role: 'model', content: '...' }])
    setLoading(true)
    isGeneratingRef.current = true

    // Combined instructions
    const combinedSystemInstruction = [globalInstructions, systemInstruction]
      .filter(Boolean)
      .join('\n\n')

    try {
      await generateResponse(historyToKeep, activeChatId || '', combinedSystemInstruction)
    } catch (error) {
      console.error('Retry failed', error)
      setMessages((prev) => {
        const newArr = [...prev]
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        newArr[newArr.length - 1].content = `Error: ${errorMessage}`
        return newArr
      })
    } finally {
      setLoading(false)
      isGeneratingRef.current = false
    }
  }

  const handleCopy = async (content: string, images?: string[]): Promise<void> => {
    try {
      // Prioritize copying image if available
      if (images && images.length > 0) {
        const imgUrl = images[images.length - 1] // Copy the last image
        if (imgUrl.startsWith('data:')) {
          const matches = imgUrl.match(/^data:(.+);base64,([\s\S]+)$/)
          if (matches) {
            const mimeType = matches[1]
            const b64Data = matches[2]
            const blob = await fetch(`data:${mimeType};base64,${b64Data}`).then((res) => res.blob())
            await navigator.clipboard.write([
              new ClipboardItem({
                [mimeType]: blob
              })
            ])
            setShowCopiedToast(true)
            setTimeout(() => setShowCopiedToast(false), 2000)
            return
          }
        }
        if (imgUrl.startsWith('gemini-media://')) {
          await window.gemini.copyImage({ url: imgUrl })
          setShowCopiedToast(true)
          setTimeout(() => setShowCopiedToast(false), 2000)
          return
        }
      }

      await navigator.clipboard.writeText(content)
      // Show toast
      setShowCopiedToast(true)
      setTimeout(() => setShowCopiedToast(false), 2000)
    } catch (err) {
      console.error('Failed to copy keys:', err)
      // Fallback
      navigator.clipboard.writeText(content)
      setShowCopiedToast(true)
      setTimeout(() => setShowCopiedToast(false), 2000)
    }
  }

  const handleShare = (content: string): void => {
    // Simple mailto
    const subject = 'Shared from Gemini App'
    const body = encodeURIComponent(content)
    window.open(`mailto:?subject=${subject}&body=${body}`)
  }

  const handleDownload = async (images?: string[]): Promise<void> => {
    if (!images || images.length === 0) return
    const targetImage = images[images.length - 1] // Download last/main image
    if (targetImage.startsWith('gemini-media://')) {
      await window.gemini.downloadMedia({ url: targetImage })
    }
  }

  const handleEdit = (index: number): void => {
    const targetMsg = messages[index]

    if (targetMsg.role === 'model') {
      // Edit preceding user message
      const previousUserMsgIndex = index - 1
      if (previousUserMsgIndex < 0 || messages[previousUserMsgIndex].role !== 'user') {
        return
      }
      // Recursive call for the user message
      handleEdit(previousUserMsgIndex)
      return
    }

    if (targetMsg.role === 'user') {
      // Populate input
      setInput(targetMsg.content)

      // Restore images if possible (only data URIs, not file paths easily)
      // For now, we only restore text.

      // Revert history to BEFORE this user message
      // messages[0...index] (Exclusive)
      const historyToKeep = messages.slice(0, index)
      setMessages(historyToKeep)
      if (activeChatId) onUpdateChat(activeChatId, historyToKeep)

      // Focus input
      setTimeout(() => {
        const textarea = document.querySelector('textarea')
        textarea?.focus()
      }, 100)
    }
  }

  if (!apiKey && !activeChatId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#131314] text-[#e3e3e3]">
        <Key className="w-12 h-12 text-[#8ab4f8] mb-4" />
        <h2 className="text-2xl font-GoogleSans mb-2">Setup API Key</h2>
        <p className="text-gray-400 mb-6 max-w-md">
          To use the API mode, you need to add a Google Gemini API Key in Settings.
        </p>
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
      <div
        ref={containerRef}
        className={`flex-1 overflow-y-auto px-4 md:px-[15%] pt-8 pb-4 flex flex-col ${isZeroState ? 'justify-center items-center' : 'gap-10'}`}
      >
        {isZeroState ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-fade-in select-none">
            <div className="mb-8">
              <h1 className="text-5xl font-medium tracking-tight bg-gradient-to-r from-[#4285f4] via-[#9b72cb] to-[#d96570] text-transparent bg-clip-text mb-2">
                Hi {userName ? userName.split(' ')[0] : 'there'}
              </h1>
              <p className="text-2xl text-[#5f6368] font-medium">Can I help you with anything?</p>
            </div>

            <div className="w-full max-w-3xl flex flex-wrap justify-center gap-3">
              {[
                { label: 'Create image', icon: '🎨', prompt: 'Create an image of ' },
                { label: 'Create video', icon: '🎥', prompt: 'Create a video about ' },
                { label: 'Write anything', icon: '📝', prompt: 'Write a story about ' },
                { label: 'Help me learn', icon: '🎓', prompt: 'Explain the concept of ' },
                { label: 'Boost my day', icon: '🚀', prompt: 'Give me a motivation quote' }
              ].map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => setInput(chip.prompt)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#1e1f20] hover:bg-[#333537] rounded-[100px] text-[#e3e3e3] border border-transparent hover:border-gray-600 transition-all font-medium text-[15px]"
                >
                  <span className="text-lg">{chip.icon}</span>
                  <span>{chip.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} w-full group/message`}
              >
                <div
                  className={`max-w-[85%] rounded-[20px] px-6 py-4 text-[15px] leading-relaxed relative ${msg.role === 'user'
                    ? 'bg-[#2c2d2e] text-[#e3e3e3]'
                    : 'bg-transparent text-[#e3e3e3]'
                    }`}
                >
                  {msg.role === 'model' && <Sparkles size={16} className="text-[#c48df6] mb-2" />}
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
                            const isPdf =
                              img.startsWith('data:application/pdf') || lowerImg.endsWith('.pdf')
                            const isVideo =
                              img.startsWith('data:video/') ||
                              /\.(mp4|webm|mov|avi)$/i.test(lowerImg)

                            if (isVideo) {
                              return (
                                <video
                                  key={i}
                                  src={img}
                                  controls
                                  className="w-full max-w-[300px] h-auto rounded-lg border border-gray-700/50 cursor-pointer"
                                  onClick={() => setViewedImage(img)}
                                />
                              )
                            }

                            const isDataImage = img.startsWith('data:image/')
                            const isProtocolImage = img.startsWith('gemini-media://')
                            const isFileImage = /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(img)

                            // Determine if it should be rendered as an image
                            const shouldRenderAsImage =
                              isDataImage || isFileImage || isProtocolImage

                            // Render PDF/Docs/Unknown as file card
                            if (isPdf || !shouldRenderAsImage) {
                              return (
                                <div
                                  key={i}
                                  className="flex items-center gap-2 bg-[#1e1f20] border border-gray-700 rounded-lg px-3 py-2 text-sm text-[#8ab4f8]"
                                >
                                  <div className="bg-red-500/20 p-1.5 rounded">
                                    <svg
                                      className="w-4 h-4 text-red-400"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                      />
                                    </svg>
                                  </div>
                                  <span className="truncate max-w-[150px]">
                                    {img.startsWith('data:')
                                      ? `Attachment ${i + 1}`
                                      : img.split(/[/\\]/).pop()}
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
                                onClick={() => setViewedImage(img)}
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

                      {/* Model Message Toolbar (Copy, Share) */}
                      {msg.role === 'model' && (
                        <div className="absolute -bottom-10 left-0 flex items-center gap-1 opacity-0 group-hover/message:opacity-100 transition-opacity duration-200 py-2">
                          <div className="flex bg-[#1e1e1e] rounded-lg overflow-hidden border border-[#333]">
                            <button
                              onClick={() => handleCopy(msg.content, msg.images)}
                              className="p-1.5 hover:bg-[#333] text-gray-400 hover:text-white transition-colors"
                              title="Copy"
                            >
                              <Copy size={14} />
                            </button>
                            <div className="w-[1px] bg-[#333]" />
                            {msg.images && msg.images.length > 0 && (
                              <>
                                <button
                                  onClick={() => handleDownload(msg.images)}
                                  className="p-1.5 hover:bg-[#333] text-gray-400 hover:text-white transition-colors"
                                  title="Download"
                                >
                                  <Download size={14} />
                                </button>
                                <div className="w-[1px] bg-[#333]" />
                              </>
                            )}
                            <button
                              onClick={() => handleShare(msg.content)}
                              className="p-1.5 hover:bg-[#333] text-gray-400 hover:text-white transition-colors"
                              title="Share"
                            >
                              <Share2 size={14} />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* User Message Toolbar (Retry, Edit) */}
                      {msg.role === 'user' && !loading && (
                        <div className="absolute -bottom-10 right-0 flex items-center gap-1 opacity-0 group-hover/message:opacity-100 transition-opacity duration-200 py-2">
                          <button
                            onClick={() => handleEdit(idx)}
                            className="p-1.5 rounded hover:bg-[#3c4043] text-gray-400 hover:text-white transition-colors"
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleRetry(idx)}
                            className="p-1.5 rounded hover:bg-[#3c4043] text-gray-400 hover:text-white transition-colors"
                            title="Retry (Resend)"
                          >
                            <RotateCw size={14} />
                          </button>
                        </div>
                      )}
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
                    <img
                      src={img}
                      alt="preview"
                      className="w-16 h-16 object-cover rounded-lg border border-gray-700"
                    />
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
              placeholder={attachments.length > 0 ? 'Ask about this image...' : 'Ask Gemini'}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              onPaste={(e) => {
                const items = e.clipboardData.items
                for (let i = 0; i < items.length; i++) {
                  if (items[i].type.indexOf('image') !== -1) {
                    e.preventDefault()
                    const blob = items[i].getAsFile()
                    if (blob) {
                      const reader = new FileReader()
                      reader.onload = (event) => {
                        if (event.target?.result) {
                          setAttachments((prev) => [...prev, event.target!.result as string])
                        }
                      }
                      reader.readAsDataURL(blob)
                    }
                  }
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
              {MODELS.map((m) => (
                <option key={m.id} value={m.id} className="bg-[#1e1f20]">
                  {m.name}
                </option>
              ))}
            </select>
            <svg
              className="w-3 h-3 text-gray-500 absolute right-3 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>

        <p className="text-center text-[11px] text-[#8e8e8e] mt-3">
          Gemini can make mistakes, so double-check it.
        </p>
      </div>

      {/* Lightbox Modal */}
      {
        viewedImage && (
          <div
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setViewedImage(null)}
          >
            <button
              className="absolute top-4 right-4 text-white hover:text-gray-300 bg-gray-900/50 rounded-full p-2 transition-colors"
              onClick={() => setViewedImage(null)}
            >
              <X size={24} />
            </button>

            {viewedImage.startsWith('data:video/') ||
              /\.(mp4|webm|mov|avi)$/i.test(viewedImage.toLowerCase()) ? (
              <video
                src={viewedImage}
                controls
                autoPlay
                className="max-w-full max-h-[90vh] rounded-lg shadow-2xl bg-black"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <img
                src={viewedImage}
                alt="Full size"
                className="max-w-full max-h-[90vh] rounded-lg shadow-2xl object-contain bg-black"
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>
        )
      }
      {/* Copied Toast */}
      {
        showCopiedToast && (
          <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 bg-[#333] text-white px-3 py-1.5 rounded-full text-sm font-medium shadow-lg animate-fade-in-up flex items-center gap-2 border border-[#444]">
            <span className="text-green-400">✓</span> Copied to clipboard
          </div>
        )
      }
    </div >
  )
}
