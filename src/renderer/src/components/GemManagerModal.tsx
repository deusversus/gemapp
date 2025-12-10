import React, { useState, useEffect } from 'react'
import { X, Plus, Trash2, Zap, Play, Brain, Code, PenTool, Sparkles, Smile, Terminal, Briefcase, Coffee, Music, Save, AlertCircle, AlertTriangle } from 'lucide-react'
import { Gem, StorageService, ChatSession } from '../services/storage'

interface GemManagerModalProps {
    isOpen: boolean
    onClose: () => void
    onStartGemChat: (gem: Gem) => void
    onGemUpdated: () => void // Trigger refresh in parent
    onDeleteGem: (gemId: string) => Promise<void>
    gems: Gem[]
    chats: ChatSession[]
}

const ICONS = [
    { name: 'zap', icon: Zap },
    { name: 'brain', icon: Brain },
    { name: 'code', icon: Code },
    { name: 'pen', icon: PenTool },
    { name: 'sparkles', icon: Sparkles },
    { name: 'smile', icon: Smile },
    { name: 'terminal', icon: Terminal },
    { name: 'briefcase', icon: Briefcase },
    { name: 'coffee', icon: Coffee },
    { name: 'music', icon: Music },
]

export function GemManagerModal({ isOpen, onClose, onStartGemChat, onGemUpdated, onDeleteGem, gems, chats }: GemManagerModalProps): JSX.Element | null {
    const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list')
    const [editingId, setEditingId] = useState<string | null>(null)

    // Form State
    const [name, setName] = useState('')
    const [instruction, setInstruction] = useState('')
    const [selectedIcon, setSelectedIcon] = useState('zap')

    // Deletion State
    const [deletingGem, setDeletingGem] = useState<Gem | null>(null)
    const [deleteConfirmation, setDeleteConfirmation] = useState('')

    useEffect(() => {
        if (isOpen) {
            resetForm()
        }
    }, [isOpen])

    const resetForm = () => {
        setMode('list')
        setEditingId(null)
        setName('')
        setInstruction('')
        setSelectedIcon('zap')
        setDeletingGem(null)
        setDeleteConfirmation('')
    }

    const handleStartCreate = () => {
        resetForm()
        setMode('create')
    }

    const handleStartEdit = (gem: Gem, e: React.MouseEvent) => {
        e.stopPropagation()
        setName(gem.name)
        setInstruction(gem.instruction)
        setSelectedIcon(gem.icon || 'zap')
        setEditingId(gem.id)
        setMode('edit')
    }

    const handleSave = () => {
        if (!name.trim() || !instruction.trim()) return

        if (mode === 'create') {
            const newGem: Gem = {
                id: Date.now().toString(),
                name: name.trim(),
                icon: selectedIcon,
                instruction: instruction.trim()
            }
            StorageService.addGem(newGem)
        } else if (mode === 'edit' && editingId) {
            const updatedGem: Gem = {
                id: editingId,
                name: name.trim(),
                icon: selectedIcon,
                instruction: instruction.trim()
            }
            StorageService.updateGem(updatedGem)
        }

        onGemUpdated()
        resetForm()
    }

    // Initial click on delete icon
    const handleStartDelete = (gem: Gem, e: React.MouseEvent) => {
        e.stopPropagation()
        setDeletingGem(gem)
        setDeleteConfirmation('')
    }

    const handleConfirmDelete = async () => {
        if (!deletingGem) return
        if (deleteConfirmation !== 'DELETE') return

        await onDeleteGem(deletingGem.id)
        setDeletingGem(null)
        setDeleteConfirmation('')
        // If we were editing this gem, reset
        if (editingId === deletingGem.id) {
            resetForm()
        }
    }

    const renderIcon = (iconName: string, size = 18, className = "") => {
        const IconComponent = ICONS.find(i => i.name === iconName)?.icon || Zap
        return <IconComponent size={size} className={className} />
    }

    if (!isOpen) return null

    // Count affected chats
    const affectedChatsCount = deletingGem
        ? chats.filter(c => c.gemId === deletingGem.id).length
        : 0

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#1e1f20] w-[850px] h-[600px] rounded-[24px] shadow-2xl border border-[#37383a] flex flex-col overflow-hidden text-[#e3e3e3] font-sans relative">

                {/* Deletion Overlay */}
                {deletingGem && (
                    <div className="absolute inset-0 z-50 bg-[#1e1f20]/90 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in">
                        <div className="bg-[#1a1b1c] border border-red-500/30 rounded-2xl p-8 max-w-md w-full shadow-2xl">
                            <div className="flex flex-col items-center text-center space-y-4">
                                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-2">
                                    <AlertTriangle size={32} className="text-red-500" />
                                </div>
                                <h3 className="text-xl font-bold text-white">Delete Gem?</h3>
                                <p className="text-gray-400 text-sm">
                                    This will permanently delete <strong className="text-white">"{deletingGem.name}"</strong> and all related data.
                                </p>

                                {affectedChatsCount > 0 && (
                                    <div className="bg-red-500/10 border border-red-500/20 px-4 py-3 rounded-xl w-full flex items-center gap-3">
                                        <Trash2 size={16} className="text-red-400 shrink-0" />
                                        <span className="text-red-200 text-sm font-medium">
                                            {affectedChatsCount} chat conversations will also be deleted.
                                        </span>
                                    </div>
                                )}

                                <div className="w-full pt-4">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                                        Type "DELETE" to confirm
                                    </label>
                                    <input
                                        className="w-full bg-[#000] border border-red-900/50 focus:border-red-500 rounded-xl px-4 py-3 text-center font-mono placeholder-gray-700 outline-none transition-colors"
                                        placeholder="DELETE"
                                        value={deleteConfirmation}
                                        onChange={e => setDeleteConfirmation(e.target.value)}
                                        autoFocus
                                    />
                                </div>

                                <div className="flex gap-3 w-full pt-4">
                                    <button
                                        onClick={() => setDeletingGem(null)}
                                        className="flex-1 px-4 py-3 bg-[#2c2d2e] hover:bg-[#3c4043] rounded-xl font-medium transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleConfirmDelete}
                                        disabled={deleteConfirmation !== 'DELETE'}
                                        className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-medium transition-colors text-white shadow-lg shadow-red-900/20"
                                    >
                                        Delete Forever
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#37383a] bg-[#222324]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-400/20 to-orange-400/20 flex items-center justify-center border border-amber-500/20">
                            <Sparkles className="text-[#f4b400]" size={16} />
                        </div>
                        <div>
                            <h2 className="text-lg font-medium">Gem Manager</h2>
                            <p className="text-xs text-gray-500">Create custom personas and system prompts</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-white hover:bg-[#3c4043] rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Main Layout */}
                <div className="flex-1 flex overflow-hidden">

                    {/* Left Sidebar: List */}
                    <div className="w-[280px] bg-[#1a1b1c] border-r border-[#37383a] flex flex-col">
                        <div className="p-4 border-b border-[#37383a]/50">
                            <button
                                onClick={handleStartCreate}
                                className={`w-full flex items-center justify-center gap-2 p-3 rounded-xl transition-all border ${mode === 'create'
                                    ? 'bg-[#f4b400]/10 border-[#f4b400]/50 text-[#f4b400]'
                                    : 'bg-[#2c2d2e] border-transparent hover:border-gray-600 text-gray-300 hover:text-white'}`}
                            >
                                <Plus size={18} />
                                <span className="font-medium text-sm">Create New Gem</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
                            {gems.length === 0 && (
                                <div className="text-center py-8 opacity-40">
                                    <Sparkles size={24} className="mx-auto mb-2" />
                                    <p className="text-xs">No Gems yet</p>
                                </div>
                            )}

                            {gems.map(gem => (
                                <div
                                    key={gem.id}
                                    onClick={() => {
                                        if (mode === 'edit' && editingId === gem.id) return // Already editing
                                        handleStartEdit(gem, { stopPropagation: () => { } } as any)
                                    }}
                                    className={`group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${(mode === 'edit' && editingId === gem.id)
                                        ? 'bg-[#2c2d2e] border-[#f4b400]/50 shadow-md transform scale-[1.02]'
                                        : 'border-transparent hover:bg-[#252627] hover:border-gray-700'
                                        }`}
                                >
                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${(mode === 'edit' && editingId === gem.id) ? 'bg-[#f4b400]/20 text-[#f4b400]' : 'bg-[#3c4043] text-gray-400 group-hover:text-gray-200'
                                        }`}>
                                        {renderIcon(gem.icon, 16)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-sm truncate text-gray-200">{gem.name}</div>
                                        <div className="text-[10px] text-gray-500 truncate">
                                            {gem.instruction.slice(0, 30)}...
                                        </div>
                                    </div>

                                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => handleStartDelete(gem, e)}
                                            className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10 hover:text-red-400 text-gray-500"
                                            title="Delete"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right Content: Editor or Preview */}
                    <div className="flex-1 bg-[#1e1f20] flex flex-col">
                        {mode === 'list' ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-60">
                                <div className="w-20 h-20 bg-[#2c2d2e] rounded-full flex items-center justify-center mb-6 animate-pulse">
                                    <Sparkles size={40} className="text-[#f4b400]" />
                                </div>
                                <h3 className="text-xl font-medium mb-2 text-white">Select a Gem to Edit</h3>
                                <p className="text-gray-400 max-w-sm mb-8 text-sm leading-relaxed">
                                    Or create a new one to start chatting with a custom persona. Gems define how the AI behaves and responds.
                                </p>
                                {gems.length > 0 && (
                                    <div className="grid grid-cols-2 gap-3 w-full max-w-md">
                                        {gems.slice(0, 4).map(g => (
                                            <button
                                                key={g.id}
                                                onClick={() => {
                                                    onStartGemChat(g)
                                                    onClose()
                                                }}
                                                className="flex items-center gap-2 p-3 bg-[#252627] rounded-lg hover:bg-[#2c2d2e] border border-gray-800 hover:border-gray-600 transition-all text-left group"
                                            >
                                                <div className="w-6 h-6 rounded bg-[#f4b400]/10 flex items-center justify-center text-[#f4b400]">
                                                    {renderIcon(g.icon, 12)}
                                                </div>
                                                <span className="text-sm text-gray-300 group-hover:text-white">{g.name}</span>
                                                <Play size={12} className="ml-auto opacity-0 group-hover:opacity-50" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="p-6 flex-1 overflow-y-auto">
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="text-xl font-medium flex items-center gap-2">
                                            {mode === 'create' ? (
                                                <>
                                                    <span className="text-[#f4b400]">New Gem</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="text-gray-400">Editing</span>
                                                    <span className="text-white">{name || 'Untitled'}</span>
                                                </>
                                            )}
                                        </h3>
                                        <div className="flex gap-2">
                                            {mode === 'edit' && (
                                                <button
                                                    onClick={() => {
                                                        const gem = gems.find(g => g.id === editingId)
                                                        if (gem) {
                                                            onStartGemChat(gem)
                                                            onClose()
                                                        }
                                                    }}
                                                    className="px-4 py-2 bg-[#2c2d2e] text-[#8ab4f8] rounded-lg hover:bg-[#37383a] text-sm font-medium flex items-center gap-2 transition-colors"
                                                >
                                                    <Play size={14} />
                                                    Start Chat
                                                </button>
                                            )}
                                            <button
                                                onClick={resetForm}
                                                className="px-4 py-2 bg-[#2c2d2e] text-gray-300 rounded-lg hover:bg-[#37383a] text-sm font-medium transition-colors"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleSave}
                                                disabled={!name.trim() || !instruction.trim()}
                                                className="px-6 py-2 bg-[#f4b400] text-black font-medium rounded-lg hover:bg-[#fdd663] text-sm flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-900/20"
                                            >
                                                <Save size={16} />
                                                Save Gem
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-6 max-w-2xl mx-auto">
                                        {/* Icon Selector */}
                                        <div>
                                            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Icon</label>
                                            <div className="flex flex-wrap gap-2 bg-[#252627] p-4 rounded-xl border border-[#37383a]">
                                                {ICONS.map((item) => (
                                                    <button
                                                        key={item.name}
                                                        onClick={() => setSelectedIcon(item.name)}
                                                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${selectedIcon === item.name
                                                            ? 'bg-[#f4b400] text-black shadow-lg scale-110'
                                                            : 'bg-[#2c2d2e] text-gray-400 hover:bg-[#3c4043] hover:text-white'
                                                            }`}
                                                        title={item.name}
                                                    >
                                                        <item.icon size={20} />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Name Input */}
                                        <div>
                                            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Gem Name</label>
                                            <input
                                                className="w-full bg-[#252627] border border-[#37383a] rounded-xl px-4 py-3 focus:border-[#f4b400] outline-none text-[#e3e3e3] placeholder-gray-600 transition-colors"
                                                placeholder="e.g. Senior React Developer"
                                                value={name}
                                                onChange={e => setName(e.target.value)}
                                                autoFocus
                                            />
                                        </div>

                                        {/* Instruction Input */}
                                        <div>
                                            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                                                System Instructions
                                                <span className="ml-2 normal-case text-gray-500 font-normal opacity-70">- Define the persona and behavior</span>
                                            </label>
                                            <div className="relative">
                                                <textarea
                                                    className="w-full bg-[#252627] border border-[#37383a] rounded-xl px-4 py-4 focus:border-[#f4b400] outline-none min-h-[250px] resize-none text-[#e3e3e3] placeholder-gray-600 leading-relaxed custom-scrollbar transition-colors"
                                                    placeholder="You are an expert software engineer specializing in React and TypeScript. Always provide type-safe examples and explain best practices..."
                                                    value={instruction}
                                                    onChange={e => setInstruction(e.target.value)}
                                                />
                                                <div className="absolute bottom-4 right-4 text-xs text-gray-600 bg-[#252627]/80 backdrop-blur px-2 py-1 rounded">
                                                    {instruction.length} chars
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
