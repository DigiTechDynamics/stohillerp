import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Maximize2, Minimize2, Download, Share2 } from 'lucide-react'
import { useUIStore } from '@/stores/authStore'

/**
 * Focus Overlay
 * Renders a full-screen, distraction-free view of a component
 */
export default function FocusOverlay() {
  const { focusedElement, clearFocusedElement } = useUIStore()

  // Handle ESC key to close
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') clearFocusedElement()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [clearFocusedElement])

  if (!focusedElement) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[2000] flex items-center justify-center p-6 lg:p-12 overflow-hidden"
      >
        {/* Cinematic Backdrop */}
        <div 
          className="absolute inset-0 bg-black/80 backdrop-blur-3xl"
          onClick={clearFocusedElement}
        />

        {/* Focused Content Container */}
        <motion.div
          layoutId={`focus-${focusedElement.id}`}
          initial={{ scale: 0.9, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.9, y: 20, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-6xl max-h-full bg-dark-900 border border-white/10 rounded-3xl shadow-[0_40px_100px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-8 py-6 border-b border-white/5 bg-white/2">
            <div>
               <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Focus Analysis Mode</p>
               <h2 className="text-2xl font-display text-white">{focusedElement.title}</h2>
            </div>
            
            <div className="flex items-center gap-4">
              <button className="btn-ghost p-3 hover:bg-white/5 rounded-full transition-colors text-dark-400 hover:text-white">
                <Download size={20} />
              </button>
              <button className="btn-ghost p-3 hover:bg-white/5 rounded-full transition-colors text-dark-400 hover:text-white">
                <Share2 size={20} />
              </button>
              <div className="h-8 w-px bg-white/5 mx-2" />
              <button 
                onClick={clearFocusedElement}
                className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white hover:bg-red-500/20 hover:text-red-400 transition-all border border-white/5"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-auto p-12 custom-scrollbar flex items-center justify-center">
            <div className="w-full h-full max-w-5xl">
               {/* Note: We expect focusedElement.content to be a React component or element */}
               {focusedElement.content}
            </div>
          </div>

          {/* Footer / Status */}
          <div className="px-8 py-4 bg-black/20 border-t border-white/5 flex items-center justify-between">
             <div className="flex items-center gap-2 text-[10px] font-medium text-dark-500 uppercase tracking-widest">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Data Link Active
             </div>
             <p className="text-[10px] text-dark-600 font-mono">STOHILL_FOCUS_ID: {focusedElement.id || 'N/A'}</p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
