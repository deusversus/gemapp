import React, { useState, useEffect } from 'react'
import { X, Plus, Trash2, Key, Check } from 'lucide-react'
import { AppSettings, StorageService } from '../services/storage'
import { MODELS } from '../constants/models'

interface SettingsModalProps {
    isOpen: boolean
    onClose: () => void
    onSettingsChanged: (settings: AppSettings) => void
    onImagesCleared?: () => void
}

// Add "Custom" option to the shared list for Settings only
const SETTINGS_MODELS = [...MODELS, { id: 'custom', name: 'Custom Model ID...' }]

export function SettingsModal({ isOpen, onClose, onSettingsChanged, onImagesCleared }: SettingsModalProps): JSX.Element {
    const [settings, setSettings] = useState<AppSettings>(StorageService.getSettings())
    const [newKeyName, setNewKeyName] = useState('')
    const [newKeyValue, setNewKeyValue] = useState('')
    const [showAddKey, setShowAddKey] = useState(false)
    const [customModelId, setCustomModelId] = useState('')

    // We are no longer auto-fetching to respect user preference for specific models
    const [isCustomMode, setIsCustomMode] = useState(false)

    useEffect(() => {
        if (isOpen) {
            const saved = StorageService.getSettings()
            setSettings(saved)
            // Check if current model is one of the presets
            const isPreset = SETTINGS_MODELS.some(m => m.id === saved.activeModel)
            if (!isPreset && saved.activeModel) {
                setIsCustomMode(true)
                setCustomModelId(saved.activeModel)
            } else {
                setIsCustomMode(false)
            }
        }
    }, [isOpen])

    const handleSaveSettings = (newSettings: AppSettings) => {
        StorageService.saveSettings(newSettings)
        setSettings(newSettings)
        onSettingsChanged(newSettings)
    }

    const handleAddKey = () => {
        if (!newKeyName || !newKeyValue) return
        const newKey = {
            id: Date.now().toString(),
            name: newKeyName,
            key: newKeyValue
        }
        const updatedKeys = [...settings.apiKeys, newKey]
        const updatedSettings = {
            ...settings,
            apiKeys: updatedKeys,
            activeKeyId: settings.activeKeyId || newKey.id
        }
        handleSaveSettings(updatedSettings)
        setNewKeyName('')
        setNewKeyValue('')
        setShowAddKey(false)
    }

    const handleDeleteKey = (id: string) => {
        const updatedKeys = settings.apiKeys.filter(k => k.id !== id)
        const updatedSettings = {
            ...settings,
            apiKeys: updatedKeys,
            activeKeyId: settings.activeKeyId === id ? (updatedKeys[0]?.id || '') : settings.activeKeyId
        }
        handleSaveSettings(updatedSettings)
    }

    const handleSetActiveKey = (id: string) => {
        handleSaveSettings({ ...settings, activeKeyId: id })
    }

    const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value
        if (val === 'custom') {
            setIsCustomMode(true)
            // Don't save yet, wait for text input
        } else {
            setIsCustomMode(false)
            handleSaveSettings({ ...settings, activeModel: val })
        }
    }

    const handleCustomModelBlur = () => {
        if (customModelId) {
            handleSaveSettings({ ...settings, activeModel: customModelId })
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-[#1e1f20] w-[600px] max-h-[85vh] rounded-[24px] shadow-2xl border border-[#37383a] flex flex-col overflow-hidden text-[#e3e3e3] font-sans">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#37383a] bg-[#2c2d2e]">
                    <h2 className="text-xl font-medium">Settings</h2>
                    <button onClick={onClose} className="p-2 hover:bg-[#3c4043] rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8">

                    {/* Storage Management */}
                    <div className="mb-6 pt-4 border-t border-gray-800">
                        <h3 className="text-sm font-medium text-gray-400 mb-2">Storage</h3>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">Manage saved images</span>
                            <button
                                onClick={async () => {
                                    if (confirm('Are you sure you want to delete ALL saved images? This cannot be undone.')) {
                                        await window.gemini.deleteAllImages()
                                        alert('All images deleted.')
                                        if (onImagesCleared) onImagesCleared()
                                    }
                                }}
                                className="text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 px-3 py-2 rounded-lg transition-colors border border-red-500/20"
                            >
                                Delete All Images
                            </button>
                        </div>
                    </div>

                    {/* Model Config */}
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-medium text-[#8ab4f8] uppercase tracking-wider">Model Selection</h3>
                        </div>

                        <div className="bg-[#2c2d2e] rounded-xl p-4 space-y-3">
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Default Model</label>
                                <select
                                    value={isCustomMode ? 'custom' : settings.activeModel}
                                    onChange={handleModelChange}
                                    className="w-full bg-[#1e1f20] border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:border-[#8ab4f8] transition-colors appearance-none"
                                >
                                    {SETTINGS_MODELS.map(m => (
                                        <option key={m.id} value={m.id}>
                                            {m.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {isCustomMode && (
                                <div className="animate-in fade-in slide-in-from-top-2">
                                    <label className="block text-sm text-gray-400 mb-2">Enter Custom Model ID</label>
                                    <input
                                        value={customModelId}
                                        onChange={(e) => setCustomModelId(e.target.value)}
                                        onBlur={handleCustomModelBlur}
                                        placeholder="e.g. gemini-1.5-pro-latest"
                                        className="w-full bg-[#1e1f20] border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:border-[#8ab4f8] font-mono text-sm"
                                    />
                                    <p className="text-xs text-gray-500 mt-2">
                                        Enter the exact model ID from the API documentation.
                                    </p>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* User Profile */}
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-medium text-[#8ab4f8] uppercase tracking-wider">User Profile</h3>
                        </div>
                        <div className="bg-[#2c2d2e] rounded-xl p-4 space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Display Name</label>
                                <input
                                    value={settings.username || ''}
                                    onChange={(e) => handleSaveSettings({ ...settings, username: e.target.value })}
                                    placeholder="User"
                                    className="w-full bg-[#1e1f20] border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:border-[#8ab4f8] text-[#e3e3e3] placeholder-gray-600 transition-colors"
                                />
                                <p className="text-xs text-gray-500 mt-2">
                                    Used for greetings (e.g. "Hello, [Name]")
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Global System Instructions</label>
                                <textarea
                                    value={settings.globalInstructions || ''}
                                    onChange={(e) => handleSaveSettings({ ...settings, globalInstructions: e.target.value })}
                                    placeholder="e.g. Always respond in markdown. Be concise. Prefer Python for code examples..."
                                    className="w-full bg-[#1e1f20] border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:border-[#8ab4f8] text-[#e3e3e3] placeholder-gray-600 transition-colors min-h-[100px] resize-none"
                                />
                                <p className="text-xs text-gray-500 mt-2">
                                    These instructions are appended to the start of every chat context, including when using Gems.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* API Keys */}
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-medium text-[#8ab4f8] uppercase tracking-wider">API Keys</h3>
                            <button
                                onClick={() => setShowAddKey(!showAddKey)}
                                className="text-sm flex items-center gap-1 text-[#8ab4f8] hover:text-[#aecbfa]"
                            >
                                <Plus size={16} /> Add Key
                            </button>
                        </div>

                        <div className="space-y-3">
                            {showAddKey && (
                                <div className="bg-[#2c2d2e] p-4 rounded-xl border border-[#8ab4f8] mb-4 space-y-3 animate-in fade-in slide-in-from-top-2">
                                    <input
                                        placeholder="Key Name (e.g. My Personal Key)"
                                        className="w-full bg-[#1e1f20] p-2 rounded border border-gray-600 focus:border-[#8ab4f8] outline-none"
                                        value={newKeyName}
                                        onChange={e => setNewKeyName(e.target.value)}
                                    />
                                    <input
                                        placeholder="AIzaSy..."
                                        className="w-full bg-[#1e1f20] p-2 rounded border border-gray-600 focus:border-[#8ab4f8] outline-none font-mono text-sm"
                                        value={newKeyValue}
                                        onChange={e => setNewKeyValue(e.target.value)}
                                        type="password"
                                    />
                                    <div className="flex justify-end gap-2 mt-2">
                                        <button onClick={() => setShowAddKey(false)} className="px-3 py-1.5 text-sm hover:bg-[#3c4043] rounded">Cancel</button>
                                        <button onClick={handleAddKey} className="px-3 py-1.5 text-sm bg-[#8ab4f8] text-[#041e49] rounded font-medium">Save Key</button>
                                    </div>
                                </div>
                            )}

                            {settings.apiKeys.length === 0 ? (
                                <div className="text-center py-8 text-gray-500 bg-[#2c2d2e] rounded-xl border border-dashed border-[#37383a]">
                                    <Key className="mx-auto mb-2 opacity-50" />
                                    No API Keys found. Add one to start chatting.
                                </div>
                            ) : (
                                settings.apiKeys.map(key => (
                                    <div
                                        key={key.id}
                                        onClick={() => handleSetActiveKey(key.id)}
                                        className={`flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${settings.activeKeyId === key.id
                                            ? 'bg-[#004a77]/30 border-[#8ab4f8] shadow-sm'
                                            : 'bg-[#2c2d2e] border-transparent hover:border-gray-600'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${settings.activeKeyId === key.id ? 'border-[#8ab4f8] bg-[#8ab4f8]' : 'border-gray-500'
                                                }`}>
                                                {settings.activeKeyId === key.id && <Check size={10} className="text-[#041e49]" />}
                                            </div>
                                            <div>
                                                <div className="font-medium text-sm">{key.name}</div>
                                                <div className="text-xs text-gray-500 font-mono">
                                                    {key.key.substr(0, 8)}...{key.key.substr(-4)}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteKey(key.id); }}
                                            className="p-2 text-gray-500 hover:text-red-400 hover:bg-[#3c4043] rounded-full transition-colors"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
                </div>

                <div className="p-4 border-t border-[#37383a] bg-[#1e1f20] text-center text-xs text-gray-500">
                    Configuration is encrypted locally using AES-256.
                </div>
            </div >
        </div >
    )
}
