import React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, FileText } from 'lucide-react'
import { useUIStore } from '@/stores/authStore'

export default function PDFPreviewModal({ isOpen, onClose, pdfUrl, title, filename }) {
  const theme = useUIStore((s) => s.theme)

  const handleDownload = () => {
    if (!pdfUrl) return
    const link = document.createElement('a')
    link.href = pdfUrl
    link.setAttribute('download', filename || 'document.pdf')
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AnimatePresence>
        {isOpen && (
          <Dialog.Portal forceMount>
            {/* Overlay */}
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100]"
              />
            </Dialog.Overlay>

            {/* Content Container */}
            <div className="fixed inset-0 flex items-center justify-center p-4 md:p-8 z-[101] pointer-events-none">
              <Dialog.Content asChild>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className={`
                    pointer-events-auto
                    w-full max-w-6xl h-full max-h-[90vh] flex flex-col overflow-hidden rounded-3xl shadow-2xl border
                    ${theme === 'light' ? 'bg-white border-slate-200' : 'bg-[#0D1117] border-white/10'}
                  `}
                >
                  {/* Header */}
                  <div className={`px-6 py-4 flex items-center justify-between border-b ${theme === 'light' ? 'border-slate-100' : 'border-white/5 bg-white/2'}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                        <FileText size={20} />
                      </div>
                      <div>
                        <Dialog.Title className={`text-sm font-semibold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                          {title || 'Document Preview'}
                        </Dialog.Title>
                        <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold">Stohill Production Engine</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleDownload}
                        className={`
                          flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all
                          ${theme === 'light' 
                            ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' 
                            : 'bg-white/5 text-dark-300 hover:text-white hover:bg-white/10'}
                        `}
                      >
                        <Download size={14} /> Download
                      </button>
                      
                      <button
                        onClick={onClose}
                        className={`
                          p-2 rounded-lg transition-colors
                          ${theme === 'light' ? 'hover:bg-slate-100 text-slate-400' : 'hover:bg-white/5 text-dark-500 hover:text-white'}
                        `}
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>

                  {/* PDF Viewport */}
                  <div className="flex-1 bg-dark-950/50 p-2 md:p-6 overflow-hidden">
                    <div className="w-full h-full rounded-2xl overflow-hidden shadow-inner border border-white/5">
                      {pdfUrl ? (
                         <iframe 
                            src={pdfUrl} 
                            className="w-full h-full border-none"
                            title="PDF Preview"
                         />
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-dark-500">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
                          <p className="text-sm">Preparing high-resolution document...</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer Branding */}
                  <div className={`px-6 py-3 border-t text-center ${theme === 'light' ? 'border-slate-100' : 'border-white/5 bg-white/2'}`}>
                    <p className="text-[9px] text-dark-500 font-medium tracking-wide">
                      This document is a computer-generated summary by Stohill ERP.
                    </p>
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
