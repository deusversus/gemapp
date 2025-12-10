import React from 'react'
import { MessageSquare, Settings, Menu, Plus, Zap, Trash2, MessageCircleOff, Brain, Code, PenTool, Sparkles, Smile, Terminal, Briefcase, Coffee, Music } from 'lucide-react'
import { ChatSession, Gem } from '../services/storage'

interface SidebarProps {
    chats: ChatSession[]
    gems: Gem[]
    recentImages: string[]
    activeId: string | null
    onSelect: (id: string) => void
    onDelete: (id: string, e: React.MouseEvent) => void
    onNewChat: () => void
    onOpenSettings: () => void
    onOpenGemManager: () => void
    onOpenGallery: () => void
    onGoToImage: (src: string) => void
    collapsed: boolean
    onToggle: () => void
}

const ICON_MAP = {
    zap: Zap,
    brain: Brain,
    code: Code,
    pen: PenTool,
    sparkles: Sparkles,
    smile: Smile,
    terminal: Terminal,
    briefcase: Briefcase,
    coffee: Coffee,
    music: Music
}

export function Sidebar({ chats, gems, recentImages, activeId, onSelect, onDelete, onNewChat, onOpenSettings, onOpenGemManager, onOpenGallery, onGoToImage, collapsed, onToggle }: SidebarProps) {

    // Group chats by Gem
    const gemChats = (gemId: string) => chats.filter(c => c.gemId === gemId)
    // Chats without a Gem (Default section)
    const generalChats = chats.filter(c => !c.gemId)

    const renderGemIcon = (iconName: string, size = 16, className = "") => {
        const Icon = ICON_MAP[iconName] || Zap
        return <Icon size={size} className={className} />
    }

    return (
        <div className={`${collapsed ? 'w-[68px]' : 'w-[280px]'} h-full bg-[#1e1f20] flex flex-col pt-4 drag-none font-sans text-[14px] transition-all duration-300 ease-in-out`}>
            {/* Header / Hamburger */}
            <div className={`px-4 mb-4 flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
                <button
                    onClick={onToggle}
                    className="p-2 text-gray-400 hover:text-white hover:bg-[#2c2d2e] rounded-full transition-colors"
                    title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    <Menu size={20} />
                </button>
            </div>

            {/* New Chat Action */}
            <div className={`px-3 mb-4 transition-all ${collapsed ? 'flex justify-center' : ''}`}>
                <button
                    onClick={onNewChat}
                    className={`flex items-center gap-3 bg-[#2c2d2e] text-[#e3e3e3] rounded-full hover:bg-[#37383a] transition-all ${collapsed ? 'p-3 w-auto' : 'px-4 py-3 w-[140px]'}`}
                    title="New Chat"
                >
                    <Plus size={18} className="text-gray-300" />
                    {!collapsed && <span className="font-medium text-sm">New chat</span>}
                </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-2 space-y-6 custom-scrollbar">

                {/* My Stuff Section */}
                <div>
                    {!collapsed && (
                        <div
                            className="px-4 py-2 flex items-center justify-between text-xs font-medium text-gray-500 mb-1 hover:text-gray-300 cursor-pointer transition-colors"
                            onClick={onOpenGallery}
                        >
                            <span>My Stuff</span>
                            <MessageSquare size={12} className="opacity-0 group-hover:opacity-100" />
                        </div>
                    )}

                    {/* Recent Images Preview Row */}
                    {!collapsed && recentImages.length > 0 && (
                        <div className="flex px-4 gap-2 mb-4 overflow-hidden">
                            {recentImages.slice(0, 3).map((img, i) => (
                                <div
                                    key={i}
                                    className="w-16 h-16 rounded-lg bg-gray-800 border border-gray-700 overflow-hidden cursor-pointer hover:border-gray-500 transition-colors"
                                    onClick={() => onGoToImage(img)}
                                >
                                    <img src={img} className="w-full h-full object-cover opacity-80 hover:opacity-100" />
                                </div>
                            ))}
                        </div>
                    )}
                    {collapsed && (
                        <div className="flex justify-center mb-4">
                            <button onClick={onOpenGallery} className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-[#2c2d2e]" title="My Stuff Gallery">
                                <MessageSquare size={20} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Gems Section */}
                {gems.length > 0 && (
                    <div>
                        {!collapsed && (
                            <div className="px-4 py-2 text-xs font-medium text-gray-500 mb-1">
                                Gems
                            </div>
                        )}
                        <div className="space-y-4">
                            {gems.map(gem => {
                                const theseChats = gemChats(gem.id)
                                return (
                                    <div key={gem.id}>
                                        <div className={`flex items-center gap-2 ${collapsed ? 'justify-center p-2' : 'px-4 py-1 text-gray-300 mb-1'} `}>
                                            <div className={`text-[#f4b400] ${collapsed ? 'p-2 bg-[#2c2d2e] rounded-lg' : ''}`}>
                                                {renderGemIcon(gem.icon, collapsed ? 18 : 14)}
                                            </div>
                                            {!collapsed && (
                                                <span className="font-medium text-sm truncate">{gem.name}</span>
                                            )}
                                        </div>
                                        <div className="space-y-0.5">
                                            {theseChats.map(chat => (
                                                <ChatItem
                                                    key={chat.id}
                                                    chat={chat}
                                                    activeId={activeId}
                                                    onSelect={onSelect}
                                                    onDelete={onDelete}
                                                    collapsed={collapsed}
                                                    isNested={true}
                                                />
                                            ))}
                                            {theseChats.length === 0 && !collapsed && (
                                                <div className="px-4 py-1.5 text-xs text-gray-600 italic pl-6">
                                                    No chats yet
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Recent Chats Section (General) */}
                <div>
                    {!collapsed && (
                        <div className="px-4 py-2 text-xs font-medium text-gray-500 mb-1">
                            Chats
                        </div>
                    )}

                    {generalChats.length === 0 && gems.length === 0 ? (
                        !collapsed && (
                            <div className="px-4 py-8 text-center flex flex-col items-center opacity-40 select-none">
                                <MessageCircleOff size={24} className="mb-2" />
                                <span className="text-sm">No chats available.</span>
                            </div>
                        )
                    ) : (
                        <div className="space-y-1">
                            {generalChats.map((chat) => (
                                <ChatItem
                                    key={chat.id}
                                    chat={chat}
                                    activeId={activeId}
                                    onSelect={onSelect}
                                    onDelete={onDelete}
                                    collapsed={collapsed}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Actions */}
            <div className="mt-auto p-3 space-y-1">
                <button
                    onClick={onOpenGemManager}
                    className={`flex items-center gap-3 w-full text-left text-[#e3e3e3] hover:bg-[#2c2d2e] rounded-full transition-colors ${collapsed ? 'justify-center p-2.5' : 'px-4 py-2.5'}`}
                    title={collapsed ? "Gem Manager" : undefined}
                >
                    <Zap size={18} className="text-[#f4b400]" />
                    {!collapsed && <span>Gem Manager</span>}
                </button>
                <button
                    onClick={onOpenSettings}
                    className={`flex items-center gap-3 w-full text-left text-[#e3e3e3] hover:bg-[#2c2d2e] rounded-full transition-colors ${collapsed ? 'justify-center p-2.5' : 'px-4 py-2.5'}`}
                    title={collapsed ? "Settings" : undefined}
                >
                    <Settings size={18} />
                    {!collapsed && <span>Settings</span>}
                </button>
                {!collapsed && (
                    <div className="px-4 py-2 text-xs text-gray-500 flex items-center gap-2 fade-in">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <span>Gemini Native</span>
                    </div>
                )}
            </div>
        </div>
    )
}

function ChatItem({ chat, activeId, onSelect, onDelete, collapsed, isNested = false }: any) {
    return (
        <div
            className={`group relative w-full flex items-center gap-3 rounded-full transition-colors cursor-pointer ${collapsed ? 'justify-center p-2' : `py-2 ${isNested ? 'pl-6 pr-4' : 'px-4'}`
                } ${activeId === chat.id
                    ? 'bg-[#004a77] text-[#c2e7ff]'
                    : 'text-[#e3e3e3] hover:bg-[#2c2d2e]'
                }`}
            onClick={() => onSelect(chat.id)}
            title={collapsed ? chat.title : undefined}
        >
            <MessageSquare size={16} className={`${activeId === chat.id ? 'text-[#c2e7ff]' : 'text-gray-500 group-hover:text-gray-300'}`} />
            {!collapsed && (
                <>
                    <span className="truncate pr-6 text-sm flex-1">{chat.title}</span>
                    <button
                        className="absolute right-2 p-1.5 opacity-0 group-hover:opacity-100 hover:text-red-400 text-gray-400 transition-all rounded-full hover:bg-gray-700/50"
                        onClick={(e) => {
                            e.stopPropagation()
                            onDelete(chat.id, e)
                        }}
                        title="Delete Chat"
                    >
                        <Trash2 size={13} />
                    </button>
                </>
            )}
        </div>
    )
}
