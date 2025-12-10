import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer - Gemini IPC bridge
const geminiAPI = {
  chat: (params: any) => ipcRenderer.invoke('gemini:chat', params),
  stream: (params: any) => ipcRenderer.invoke('gemini:stream', params),
  listModels: (params: any) => ipcRenderer.invoke('gemini:listModels', params),
  saveImage: (params: any) => ipcRenderer.invoke('gemini:saveImage', params),
  listImages: () => ipcRenderer.invoke('gemini:listImages'),
  deleteImage: (params: any) => ipcRenderer.invoke('gemini:deleteImage', params),
  deleteAllImages: () => ipcRenderer.invoke('gemini:deleteAllImages'),
  getUserAgent: () => ipcRenderer.invoke('gemini:getUserAgent'),
  generateImage: (params: any) => ipcRenderer.invoke('gemini:generate-image', params),
  generateVideo: (params: any) => ipcRenderer.invoke('gemini:generate-video', params),
  downloadMedia: (params: any) => ipcRenderer.invoke('gemini:download-media', params),
  copyImage: (params: any) => ipcRenderer.invoke('gemini:copy-image', params)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('gemini', geminiAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.gemini = geminiAPI
}
