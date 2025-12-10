import { X } from 'lucide-react'
import { useEffect, useState } from 'react'

interface GalleryModalProps {
  isOpen: boolean
  onClose: () => void
  onGoToImage?: (path: string) => void
}

export function GalleryModal({ isOpen, onClose, onGoToImage }: GalleryModalProps) {
  const [images, setImages] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadImages()
    }
  }, [isOpen])

  const loadImages = async () => {
    setLoading(true)
    try {
      const result = await window.gemini.listImages()
      if (result.success && result.images) {
        setImages(result.images)
      }
    } catch (error) {
      console.error('Failed to load images:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleNavigate = (img: string) => {
    if (onGoToImage) {
      onGoToImage(img)
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#1e1f20] border border-gray-800 w-[90%] max-w-4xl h-[80%] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-[#2b2d30]">
          <h2 className="text-xl font-semibold text-white">My Stuff</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#131314]">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              Loading gallery...
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <div className="w-16 h-16 bg-gray-800 rounded-2xl mb-4 flex items-center justify-center">
                <span className="text-2xl">🖼️</span>
              </div>
              <p>No images saved yet.</p>
              <p className="text-sm mt-2 opacity-60">Upload images in chat to see them here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {images.map((img, idx) => {
                const isVideo =
                  img.toLowerCase().endsWith('.mp4') ||
                  img.toLowerCase().endsWith('.webm') ||
                  img.toLowerCase().endsWith('.mov') ||
                  img.toLowerCase().endsWith('.avi')
                return (
                  <div
                    key={idx}
                    className="group relative aspect-square bg-gray-900 rounded-xl overflow-hidden border border-gray-800 hover:border-blue-500/50 transition-all cursor-pointer"
                  >
                    {isVideo ? (
                      <video
                        src={img}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        controls
                        muted
                      />
                    ) : (
                      <img
                        src={img}
                        alt={`Saved ${idx}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none group-hover:pointer-events-auto">
                      <button
                        onClick={() => handleNavigate(img)}
                        className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors transform translate-y-2 group-hover:translate-y-0 duration-200"
                      >
                        Go to Chat
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
