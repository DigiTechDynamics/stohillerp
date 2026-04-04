import React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { motion, AnimatePresence } from 'framer-motion'
import { useConfirmStore } from '@/stores/useConfirmStore'
import { AlertTriangle, Info, HelpCircle, X } from 'lucide-react'
import { useUIStore } from '@/stores/authStore'

export default function ConfirmDialog() {
  const { isOpen, title, message, confirmLabel, cancelLabel, type, onConfirm, onCancel, close } = useConfirmStore()
  const theme = useUIStore((s) => s.theme)

  const IconMap = {
    info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    confirm: { icon: HelpCircle, color: 'text-primary', bg: 'bg-primary/10' },
    danger: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
  }

  const { icon: Icon, color, bg } = IconMap[type] || IconMap.confirm

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && close()}>
      <AnimatePresence>
        {isOpen && (
          <Dialog.Portal forceMount>
            {/* Overlay */}
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
              />
            </Dialog.Overlay>

            {/* Content Container */}
            <div className="fixed inset-0 flex items-center justify-center p-4 z-[101] pointer-events-none">
              <Dialog.Content asChild>
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  className={`
                    pointer-events-auto
                    w-full max-w-md overflow-hidden rounded-2xl shadow-2xl border
                    ${theme === 'light' ? 'bg-white border-slate-200' : 'bg-dark-900 border-white/5'}
                  `}
                >
                  <div className="p-6">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${bg} ${color}`}>
                        <Icon size={24} />
                      </div>
                      <div className="flex-1">
                        <Dialog.Title className={`text-lg font-semibold mb-1 ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                          {title}
                        </Dialog.Title>
                        <Dialog.Description className={`text-sm leading-relaxed ${theme === 'light' ? 'text-slate-500' : 'text-dark-400'}`}>
                          {message}
                        </Dialog.Description>
                      </div>
                    </div>
                  </div>

                  <div className={`px-6 py-4 flex items-center justify-end gap-3 ${theme === 'light' ? 'bg-slate-50' : 'bg-white/2 border-t border-white/5'}`}>
                    <button
                      onClick={onCancel}
                      className={`
                        px-4 py-2 text-sm font-medium rounded-lg transition-colors
                        ${theme === 'light' 
                          ? 'text-slate-600 hover:bg-slate-200' 
                          : 'text-dark-400 hover:text-white hover:bg-white/5'}
                      `}
                    >
                      {cancelLabel}
                    </button>
                    <button
                      onClick={onConfirm}
                      className={`
                        px-5 py-2 text-sm font-bold rounded-lg transition-all shadow-lg
                        ${type === 'danger' 
                          ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20' 
                          : 'bg-primary hover:bg-primary-hover text-dark-950 shadow-gold'}
                      `}
                    >
                      {confirmLabel}
                    </button>
                  </div>
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
