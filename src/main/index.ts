import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  globalShortcut,
  nativeImage,
  protocol,
  session,
  clipboard,
  dialog
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import trayIcon from '../../resources/tray.png?asset'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { ImageGenerationParams, ChatHistoryItem } from './types'

// Register custom protocol privileges (MUST be done before app is ready)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'gemini-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true
    }
  }
])

// Hide automation flags
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')

// Spoof UA to allow Google Login - use Firefox UA as it often bypasses Electron detection
// (User suggested Firefox 70, but using 133 to avoid 'browser not supported' errors)
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0'
const WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0'
const CHROME_UA = process.platform === 'win32' ? WIN_UA : MAC_UA
app.userAgentFallback = CHROME_UA

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let isQuitting = false

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
    ...(process.platform === 'win32'
      ? {
          titleBarStyle: 'hidden',
          titleBarOverlay: {
            color: '#00000000',
            symbolColor: '#ffffff',
            height: 30
          }
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true,
      contextIsolation: true,
      webSecurity: false // Still needed for some things, but protocol handles images now
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Close behavior: hide instead of quit on Mac/Win if desired
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
    return false
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function toggleWindow(): void {
  if (mainWindow?.isVisible()) {
    mainWindow.hide()
  } else {
    mainWindow?.show()
    mainWindow?.focus()
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Register 'gemini-media' protocol to serve saved images
  protocol.handle('gemini-media', (request) => {
    try {
      const url = request.url.replace('gemini-media://', '')
      const decodedUrl = decodeURI(url)

      // Clean up filename: extract last path segment and remove trailing slashes
      let cleanFilename = decodedUrl.split('/').pop() || decodedUrl
      cleanFilename = cleanFilename.replace(/\/+$/, '')

      if (!cleanFilename || cleanFilename.trim() === '') {
        return new Response('Invalid filename', { status: 400 })
      }

      const filePath = path.join(app.getPath('userData'), 'images', cleanFilename)

      if (!fs.existsSync(filePath)) {
        console.warn('[Protocol] File not found:', filePath)
        return new Response('Not Found', { status: 404 })
      }

      const data = fs.readFileSync(filePath)

      // Determine mime type based on extension
      const ext = path.extname(cleanFilename).toLowerCase()
      let mimeType = 'image/png'
      if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg'
      if (ext === '.webp') mimeType = 'image/webp'
      if (ext === '.gif') mimeType = 'image/gif'
      if (ext === '.svg') mimeType = 'image/svg+xml'

      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': String(data.length)
        }
      })
    } catch (error) {
      console.error('[Protocol] Error:', error)
      return new Response('Internal Error', { status: 500 })
    }
  })

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Return platform-appropriate User-Agent
  ipcMain.handle('gemini:getUserAgent', () => {
    return CHROME_UA
  })

  app.on('web-contents-created', (_event, contents) => {
    // Advanced stealth: Use CDP (Chrome DevTools Protocol) to modify navigator properties
    // This runs even before preload scripts, effectively hiding the automation flags completely
    contents.on('did-finish-load', () => {
      // Optional: extra verify
    })

    try {
      if (!contents.debugger.isAttached()) {
        contents.debugger.attach('1.3')
      }

      contents.debugger.sendCommand('Page.enable')
      contents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
        source: `
                // Overwrite the webdriver property with a getter that returns undefined
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined
                });
                
                // Cleanup prototype just in case
                try {
                    delete Navigator.prototype.webdriver;
                } catch(e) {}

                // Remove specific automation flags
                try {
                    const key = Object.keys(window).find(key => key.startsWith('cdc_'));
                    if(key) delete window[key];
                } catch(e) {}
            `
      })
    } catch (e) {
      console.error('Failed to attach debugger for stealth:', e)
    }
  })

  app.on('ready', () => {
    // 1. Create Anti-Fingerprinting Preload Script
    // We write this file dynamically to ensure it exists and has the latest bypass logic
    const userDataPath = app.getPath('userData')
    const antiFingerprintPath = join(userDataPath, 'anti-fingerprint.js')

    const antiFingerprintContent = `
      try {
        // Remove navigator.webdriver (common automation flag)
        const newProto = navigator.__proto__;
        delete newProto.webdriver;
        navigator.__proto__ = newProto;
      } catch (e) {}

      try {
        // Remove Selenium/ChromeDriver markers (cdc_...)
        const key = Object.keys(window).find(key => key.startsWith('cdc_'));
        if(key) delete window[key];
      } catch (e) {}
    `
    try {
      fs.writeFileSync(antiFingerprintPath, antiFingerprintContent)
    } catch (e) {
      console.error('Failed to write anti-fingerprint script:', e)
    }

    // 2. Configure Specific Session with Preload & Headers
    const geminiSession = session.fromPartition('persist:gemini')
    try {
      geminiSession.setPreloads([antiFingerprintPath])
    } catch (e) {
      console.error('Failed to set preloads:', e)
    }

    // Helper to strip headers for anti-fingerprinting
    const stripHeaders = (sess: Session): void => {
      sess.webRequest.onBeforeSendHeaders(
        { urls: ['*://*.google.com/*', '*://*.googleapis.com/*', '*://accounts.google.com/*'] },
        (details, callback) => {
          const { requestHeaders } = details
          delete requestHeaders['Sec-Ch-Ua']
          delete requestHeaders['Sec-Ch-Ua-Full-Version']
          delete requestHeaders['Sec-Ch-Ua-Full-Version-List']
          delete requestHeaders['Sec-Ch-Ua-Mobile']
          delete requestHeaders['Sec-Ch-Ua-Platform']
          delete requestHeaders['Sec-Ch-Ua-Platform-Version']
          callback({ requestHeaders })
        }
      )
    }

    // Apply to default session (safe fallback)
    stripHeaders(session.defaultSession)

    // Apply to our specific webview partition
    stripHeaders(geminiSession)
  })

  createWindow()

  // Create Tray
  const iconImage = nativeImage.createFromPath(trayIcon)
  tray = new Tray(iconImage.resize({ width: 16, height: 16 }))

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show App', click: () => mainWindow?.show() },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setToolTip('Gemini Native')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => toggleWindow())

  // Global Shortcut
  globalShortcut.register('CommandOrControl+Shift+G', () => {
    toggleWindow()
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
})

// Helper to save image to disk
// Helper to save image/video to disk
ipcMain.handle('gemini:saveImage', async (_event, { base64Data }) => {
  try {
    const matches = base64Data.match(/^data:([^;]+);base64,([\s\S]+)$/)
    if (!matches) throw new Error('Invalid base64 data')

    const mimeType = matches[1]
    const data = matches[2]
    const buffer = Buffer.from(data, 'base64')

    // Determine extension
    let ext = 'png'
    if (mimeType === 'image/jpeg') ext = 'jpg'
    if (mimeType === 'image/webp') ext = 'webp'
    if (mimeType === 'application/pdf') ext = 'pdf'
    // Video support
    if (mimeType === 'video/mp4') ext = 'mp4'
    if (mimeType === 'video/webm') ext = 'webm'
    if (mimeType === 'video/quicktime') ext = 'mov'

    // Setup directory
    const userDataPath = app.getPath('userData')
    const imagesDir = path.join(userDataPath, 'images')

    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true })
    }

    // Generate filename
    const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`
    const filePath = path.join(imagesDir, filename)

    // Write file
    await fs.promises.writeFile(filePath, buffer)

    // Return protocol URL (gemini-media://filename)
    return { success: true, path: `gemini-media://${filename}` }
  } catch (error: any) {
    console.error('Failed to save media:', error)
    return { success: false, error: error.message }
  }
})

// Helper to list saved media
ipcMain.handle('gemini:listImages', async () => {
  try {
    const userDataPath = app.getPath('userData')
    const imagesDir = path.join(userDataPath, 'images')

    if (!fs.existsSync(imagesDir)) {
      return { success: true, images: [] }
    }

    const files = await fs.promises.readdir(imagesDir)

    // Filter for valid image/video extensions
    const validExtensions = new Set([
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.webp',
      '.svg', // Images
      '.mp4',
      '.webm',
      '.mov',
      '.avi' // Videos
    ])
    const validFiles = files.filter((file) => {
      const ext = path.extname(file).toLowerCase()
      return validExtensions.has(ext)
    })

    // Get stats for sorting and exclude empty files
    const fileStats = (
      await Promise.all(
        validFiles.map(async (file) => {
          const filePath = path.join(imagesDir, file)
          const stats = await fs.promises.stat(filePath)
          // Filter out 0 byte files
          if (stats.size === 0) return null
          return { file, mtime: stats.mtimeMs }
        })
      )
    ).filter(Boolean) as { file: string; mtime: number }[]

    // Sort by newest first
    fileStats.sort((a, b) => b.mtime - a.mtime)

    const imageUrls = fileStats.map((f) => `gemini-media://${f.file}`)
    return { success: true, images: imageUrls }
  } catch (error: any) {
    console.error('Failed to list media:', error)
    return { success: false, error: error.message }
  }
})

// Delete specific image
ipcMain.handle('gemini:deleteImage', async (_event, { filename }) => {
  try {
    const userDataPath = app.getPath('userData')
    const filePath = path.join(userDataPath, 'images', filename)

    // Security check: ensure file is within images dir
    if (!filePath.startsWith(path.join(userDataPath, 'images'))) {
      throw new Error('Access denied')
    }

    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath)
    }
    return { success: true }
  } catch (error: any) {
    console.error('Failed to delete image:', error)
    return { success: false, error: error.message }
  }
})

// Delete ALL images (Nuclear Option)
ipcMain.handle('gemini:deleteAllImages', async () => {
  try {
    const userDataPath = app.getPath('userData')
    const imagesDir = path.join(userDataPath, 'images')

    if (fs.existsSync(imagesDir)) {
      // Remove the entire directory and recreate it
      await fs.promises.rm(imagesDir, { recursive: true, force: true })
      await fs.promises.mkdir(imagesDir, { recursive: true })
    }
    return { success: true }
  } catch (error: any) {
    console.error('Failed to delete all images:', error)
    return { success: false, error: error.message }
  }
})

// Helper function for Image Generation
// Helper to list models (internal use)
async function listModelsHelper(apiKey: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  )
  if (!response.ok) return []
  const data = await response.json()
  return data.models || []
}

// Helper function for Image Generation
async function generateImageHelper(
  apiKey: string,
  modelId: string,
  prompt: string,
  aspectRatio?: string,
  personGeneration?: string
) {
  // 1. Try the requested model first
  try {
    return await attemptGenerateImage(apiKey, modelId, prompt, aspectRatio, personGeneration)
  } catch (error: any) {
    // 2. If 404 (Not Found), try to find a valid fallback
    if (error.message.includes('404') || error.message.includes('not found')) {
      console.warn(`[Imagen] Model ${modelId} not found. Searching for available alternatives...`)

      const models = await listModelsHelper(apiKey)
      // Look for any model with 'imagen' in the name
      // Preferred order: imagen-4, 3.0-generate-002, 3.0-generate-001, 3.0-fast, 2.0, any imagen
      const fallback =
        models.find((m: any) => m.name.includes('imagen-4')) ||
        models.find((m: any) => m.name.includes('imagen-3.0-generate-002')) ||
        models.find((m: any) => m.name.includes('imagen-3.0-generate-001')) ||
        models.find((m: any) => m.name.includes('imagen-3.0-fast')) ||
        models.find((m: any) => m.name.includes('imagen-2')) ||
        models.find((m: any) => m.name.includes('imagen'))

      if (fallback) {
        const newModelId = fallback.name.replace('models/', '')
        console.log(`[Imagen] Retrying with fallback model: ${newModelId}`)
        return await attemptGenerateImage(apiKey, newModelId, prompt, aspectRatio, personGeneration)
      }
    }
    throw error
  }
}

async function attemptGenerateImage(
  apiKey: string,
  modelId: string,
  prompt: string,
  aspectRatio?: string,
  personGeneration?: string
) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:predict?key=${apiKey}`

  const requestBody = {
    instances: [
      {
        prompt: prompt
      }
    ],
    parameters: {
      sampleCount: 1,
      aspectRatio: aspectRatio || '1:1',
      personGeneration: personGeneration || 'allow_adult'
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Imagen API Error: ${response.status} ${response.statusText} - ${errorText}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await response.json()) as any

  if (data.predictions && data.predictions.length > 0) {
    const prediction = data.predictions[0]
    const b64 = prediction.bytesBase64Encoded
    const mimeType = prediction.mimeType || 'image/png'

    const buffer = Buffer.from(b64, 'base64')
    let ext = 'png'
    if (mimeType === 'image/jpeg') ext = 'jpg'
    if (mimeType === 'image/webp') ext = 'webp'

    const userDataPath = app.getPath('userData')
    const imagesDir = path.join(userDataPath, 'images')
    if (!fs.existsSync(imagesDir)) {
      await fs.promises.mkdir(imagesDir, { recursive: true })
    }

    const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`
    const filePath = path.join(imagesDir, filename)

    await fs.promises.writeFile(filePath, buffer)

    return {
      success: true,
      path: `gemini-media://${filename}`,
      base64: `data:${mimeType};base64,${b64}`,
      mimeType
    }
  } else {
    throw new Error('No predictions returned from Imagen')
  }
}

// Helper function for Video Generation
async function attemptGenerateVideo(apiKey: string, modelId: string, prompt: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:predict?key=${apiKey}`

  const requestBody = {
    instances: [
      {
        prompt: prompt
      }
    ]
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Veo API Error: ${response.status} ${response.statusText} - ${errorText}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await response.json()) as any

  if (data.predictions && data.predictions.length > 0) {
    const prediction = data.predictions[0]

    const b64 =
      prediction.bytesBase64Encoded || (prediction.video && prediction.video.bytesBase64Encoded)
    const mimeType =
      prediction.mimeType || (prediction.video && prediction.video.mimeType) || 'video/mp4'

    if (!b64) {
      throw new Error('No video data found in Veo prediction')
    }

    const buffer = Buffer.from(b64, 'base64')
    let ext = 'mp4'
    if (mimeType === 'video/webm') ext = 'webm'
    if (mimeType === 'video/quicktime') ext = 'mov'
    if (mimeType === 'video/avi') ext = 'avi'

    const userDataPath = app.getPath('userData')
    const imagesDir = path.join(userDataPath, 'images')
    if (!fs.existsSync(imagesDir)) {
      await fs.promises.mkdir(imagesDir, { recursive: true })
    }

    const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`
    const filePath = path.join(imagesDir, filename)

    await fs.promises.writeFile(filePath, buffer)

    return {
      success: true,
      path: `gemini-media://${filename}`,
      mimeType
    }
  } else {
    throw new Error('No predictions returned from Veo')
  }
}

async function generateVideoHelper(apiKey: string, modelId: string, prompt: string) {
  // 1. Try the requested model first
  try {
    return await attemptGenerateVideo(apiKey, modelId, prompt)
  } catch (error: any) {
    // 2. If 404 (Not Found), try to find a valid fallback
    if (error.message.includes('404') || error.message.includes('not found')) {
      console.warn(`[Veo] Model ${modelId} not found. Searching for available alternatives...`)

      const models = await listModelsHelper(apiKey)
      // Look for any model with 'veo' in the name
      // Preferred order: veo-3.1, veo-3.0, veo-2.0, any veo
      const fallback =
        models.find((m: any) => m.name.includes('veo-3.1')) ||
        models.find((m: any) => m.name.includes('veo-3.0')) ||
        models.find((m: any) => m.name.includes('veo-2.0')) ||
        models.find((m: any) => m.name.includes('veo'))

      if (fallback) {
        const newModelId = fallback.name.replace('models/', '')
        console.log(`[Veo] Retrying with fallback model: ${newModelId}`)
        return await attemptGenerateVideo(apiKey, newModelId, prompt)
      }
    }
    throw error
  }
}
// Generate Image (Imagen 4.0 / 3.0)
ipcMain.handle(
  'gemini:generate-image',
  async (_event, args: ImageGenerationParams & { apiKey: string }) => {
    try {
      return await generateImageHelper(
        args.apiKey,
        args.modelId,
        args.prompt,
        args.aspectRatio,
        args.personGeneration
      )
    } catch (error: any) {
      console.error('Failed to generate image:', error)
      return { success: false, error: error.message }
    }
  }
)
// Generate Video (Veo)
ipcMain.handle('gemini:generate-video', async (_event, { apiKey, modelId, prompt }) => {
  try {
    return await generateVideoHelper(apiKey, modelId, prompt)
  } catch (error: any) {
    console.error('Failed to generate video:', error)
    return { success: false, error: error.message }
  }
})

// Download Helper
ipcMain.handle('gemini:download-media', async (_event, { url }) => {
  try {
    if (!url || !url.startsWith('gemini-media://')) {
      throw new Error('Invalid URL')
    }

    const filename = url.replace('gemini-media://', '')
    const userDataPath = app.getPath('userData')
    const sourcePath = path.join(userDataPath, 'images', filename)

    if (!fs.existsSync(sourcePath)) {
      throw new Error('File not found')
    }

    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: filename,
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
        { name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'avi'] }
      ]
    })

    if (canceled || !filePath) {
      return { success: false, error: 'User cancelled' }
    }

    await fs.promises.copyFile(sourcePath, filePath)
    return { success: true }
  } catch (error: any) {
    console.error('Failed to download media:', error)
    return { success: false, error: error.message }
  }
})

// Copy Image Helper
ipcMain.handle('gemini:copy-image', async (_event, { url }) => {
  try {
    if (!url) throw new Error('No URL provided')

    // Handle gemini-media://
    if (url.startsWith('gemini-media://')) {
      const filename = url.replace('gemini-media://', '')
      const userDataPath = app.getPath('userData')
      const imagePath = path.join(userDataPath, 'images', filename)

      if (!fs.existsSync(imagePath)) {
        throw new Error('Image file not found')
      }

      const image = nativeImage.createFromPath(imagePath)
      clipboard.writeImage(image)
      return { success: true }
    }

    // Handle data: base64
    if (url.startsWith('data:')) {
      const image = nativeImage.createFromDataURL(url)
      clipboard.writeImage(image)
      return { success: true }
    }

    throw new Error('Unsupported URL format')
  } catch (error: any) {
    console.error('Failed to copy image:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle(
  'gemini:chat',
  async (
    _event,
    {
      apiKey,
      modelName,
      message,
      history,
      systemInstruction
    }: {
      apiKey: string
      modelName: string
      message: string
      history: ChatHistoryItem[]
      systemInstruction?: string
    }
  ) => {
    try {
      const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } =
        await import('@google/generative-ai')
      const genAI = new GoogleGenerativeAI(apiKey)

      const safetySettings = [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE
        }
      ]

      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemInstruction || undefined,
        safetySettings
      })

      // Ensure roles are valid before starting chat (basic sanitization)
      // Gemini 1.5 models prefer 'user' and 'model' roles
      const sanitizedHistory = history.map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : msg.role,
        parts: msg.parts
      }))

      const chat = model.startChat({
        history: sanitizedHistory
      })

      const result = await chat.sendMessage(message)
      const response = await result.response
      return { success: true, text: response.text() }
    } catch (error: any) {
      console.error('Gemini API Error:', error)
      return { success: false, error: error.message || 'Unknown error' }
    }
  }
)

ipcMain.handle(
  'gemini:stream',
  async (_event, { apiKey, modelName, message, images, history, systemInstruction }) => {
    try {
      const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } =
        await import('@google/generative-ai')
      const genAI = new GoogleGenerativeAI(apiKey)

      const safetySettings = [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE
        }
      ]

      // Define tools for function calling
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tools: any = [
        {
          functionDeclarations: [
            {
              name: 'generate_image',
              description:
                'Generate an image based on a prompt. Use this when the user asks to draw, create, or generate an image.',
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  prompt: {
                    type: SchemaType.STRING,
                    description: 'The description of the image to generate.'
                  },
                  aspectRatio: {
                    type: SchemaType.STRING,
                    description:
                      "Aspect ratio. Options: '1:1', '16:9', '9:16', '4:3', '3:4'. Default '1:1'."
                  }
                },
                required: ['prompt']
              }
            },
            {
              name: 'generate_video',
              description:
                'Generate a short video based on a prompt. Use this when the user asks to create or generate a video.',
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  prompt: {
                    type: SchemaType.STRING,
                    description: 'The description of the video to generate.'
                  }
                },
                required: ['prompt']
              }
            }
          ]
        }
      ]

      const isGemma = modelName.toLowerCase().includes('gemma')

      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: isGemma ? undefined : systemInstruction || undefined,
        safetySettings,
        tools: isGemma ? undefined : tools
      })

      // Process history to hydrate internalUrl images into inlineData
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const processedHistory = await Promise.all(
        history.map(async (msg: any) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newParts = (
            await Promise.all(
              msg.parts.map(async (part: any) => {
                if (part.internalUrl) {
                  try {
                    const cleanFilename = part.internalUrl.replace('gemini-media://', '')
                    const filePath = path.join(app.getPath('userData'), 'images', cleanFilename)
                    if (fs.existsSync(filePath)) {
                      const data = fs.readFileSync(filePath)
                      const base64 = data.toString('base64')
                      const ext = path.extname(cleanFilename).toLowerCase()
                      let mimeType = 'image/png'
                      if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg'
                      if (ext === '.webp') mimeType = 'image/webp'
                      if (ext === '.gif') mimeType = 'image/gif'

                      return {
                        inlineData: {
                          mimeType: mimeType,
                          data: base64
                        }
                      }
                    } else {
                      console.warn('[IPC] Image file not found, skipping:', filePath)
                      return null
                    }
                  } catch (err) {
                    console.error('[IPC] Failed to hydrate history image:', err)
                    return null
                  }
                }
                return part
              })
            )
          ).filter((p: any) => p !== null)
          return { ...msg, parts: newParts }
        })
      )

      // Sanitize: strip any remaining internalUrl fields to prevent API errors
      // Also ensure roles are valid (gemini 1.5 likes 'user' and 'model')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sanitizedHistory = processedHistory.map((msg: any) => ({
        role: msg.role === 'assistant' ? 'model' : msg.role, // Ensure role mapping
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parts: msg.parts
          .map((part: any) => {
            if (part.internalUrl) {
              const rest = { ...part }
              delete rest.internalUrl
              if (Object.keys(rest).length === 0) {
                return { text: '[Image removed]' }
              }
              return rest
            }
            return part
          })
          .filter((p: any) => p && (p.text !== undefined || p.inlineData !== undefined))
      }))

      const chat = model.startChat({
        history: sanitizedHistory
      })

      // Construct message parts for current message
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let msgParts: any[] = []

      if (images && images.length > 0) {
        // Convert data URLs to inlineData objects
        // expected data URL format: "data:image/jpeg;base64,..."
        const imageParts = images
          .map((img) => {
            // Regex to capture MimeType (group 1) and Base64 Data (group 2)
            // Use [\s\S] to capture all characters including newlines in base64 data
            const matches = img.match(/^data:([^;]+);base64,([\s\S]+)$/)

            if (!matches) {
              console.error('[IPC] Failed to parse image data URL. Format mismatch.')
              return null
            }

            return {
              inlineData: {
                mimeType: matches[1],
                data: matches[2]
              }
            }
          })
          .filter(Boolean)

        // Add images first
        msgParts = [...msgParts, ...imageParts]
      }

      // Add text part only if there is text
      if (message && message.trim()) {
        msgParts.push({ text: message })
      } else if (msgParts.length === 0) {
        // Fallback
        msgParts.push({ text: '' })
      }

      // Retry logic for 429 Errors
      let result
      let retryCount = 0
      const maxRetries = 3

      while (true) {
        try {
          result = await chat.sendMessageStream(msgParts)
          break
        } catch (error: any) {
          const isRateLimit =
            error.message?.includes('429') ||
            error.status === 429 ||
            error.message?.includes('Too Many Requests') ||
            error.message?.includes('Resource exhausted')

          if (isRateLimit && retryCount < maxRetries) {
            retryCount++
            const delay = Math.pow(2, retryCount) * 1000 // 2s, 4s, 8s
            console.log(
              `[Gemini] Rate Limit (429). Retrying in ${delay}ms... (Attempt ${retryCount}/${maxRetries})`
            )
            await new Promise((resolve) => setTimeout(resolve, delay))
          } else {
            throw error
          }
        }
      }

      // Collect all chunks and check for function calls
      let fullText = ''
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allFunctionCalls: any[] = []

      for await (const chunk of result.stream) {
        try {
          // chunk.text() throws if no text is present (e.g. only function call)
          const text = chunk.text()
          if (text) fullText += text
        } catch (e) {
          // Ignore missing text
        }

        const calls = chunk.functionCalls()
        if (calls && calls.length > 0) {
          allFunctionCalls.push(...calls)
        }
      }

      // Execute function calls if any
      const generatedImages: string[] = []

      if (allFunctionCalls.length > 0) {
        for (const call of allFunctionCalls) {
          try {
            console.log(`[IPC] Executing tool: ${call.name}`, call.args)

            if (call.name === 'generate_image') {
              // Use newest Imagen 4 model ID by default
              const modelToUse = 'imagen-4.0-generate-001'
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const res = await generateImageHelper(
                apiKey,
                modelToUse,
                call.args.prompt as string,
                call.args.aspectRatio as string
              )
              if (res.success && res.path) {
                generatedImages.push(res.path)
                // Do NOt append text, let the UI render the image card
                // fullText += `\n\n> Generated Image: ${res.path}\n`
              }
            } else if (call.name === 'generate_video') {
              // Use default Veo model ID
              const modelToUse = 'veo-3.1-generate-001'
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const res = await generateVideoHelper(apiKey, modelToUse, call.args.prompt as string)
              if (res.success && res.path) {
                generatedImages.push(res.path)
                // fullText += `\n\n> Generated Video: ${res.path}\n`
              }
            }
          } catch (err: any) {
            console.error('[IPC] Tool Execution Failed:', err)
            fullText += `\n\n(Tool execution failed: ${err.message})`
          }
        }
      }

      return {
        success: true,
        text: fullText,
        images: generatedImages.length > 0 ? generatedImages : undefined
      }
    } catch (error: any) {
      console.error('Gemini API Error:', error)
      return { success: false, error: error.message || 'Unknown error' }
    }
  }
)

ipcMain.handle('gemini:listModels', async (_event, { apiKey, showAll }) => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    )
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as any
    const models = data.models || []

    if (showAll) {
      return { success: true, models }
    }

    // Filter out generation-only models (Imagen, Veo) to only show chat-capable models
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filteredModels = models.filter((m: any) => {
      const name = m.name.toLowerCase()
      // Keep if it DOES NOT contain 'imagen' or 'veo'
      return !name.includes('imagen') && !name.includes('veo')
    })

    return { success: true, models: filteredModels }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
