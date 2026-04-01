import React from 'react'
import { motion } from 'framer-motion'
import { 
  FileText, Image as ImageIcon, FileArchive, 
  MoreVertical, Download, Trash2, ExternalLink,
  Shield, Lock, Tag
} from 'lucide-react'
import { formatDate } from '@/utils/format'

export default function DocumentCard({ doc, isSelected, onClick }) {
  const getFileIcon = (mimeType) => {
    if (mimeType?.includes('pdf')) return <FileText size={24} className="text-red-400" />
    if (mimeType?.includes('image')) return <ImageIcon size={24} className="text-blue-400" />
    if (mimeType?.includes('zip') || mimeType?.includes('rar')) return <FileArchive size={24} className="text-amber-400" />
    return <FileText size={24} className="text-dark-400" />
  }

  return (
    <motion.div
      layout
      onClick={onClick}
      className={`
        relative group cursor-pointer rounded-2xl border transition-all duration-200
        ${isSelected 
          ? 'bg-primary/5 border-primary/40 shadow-gold' 
          : 'bg-dark-900/40 border-white/5 hover:border-white/20 hover:bg-dark-900/60 shadow-lg'}
      `}
    >
      {/* status badges */}
      <div className="absolute top-3 left-3 z-10 flex gap-1.5">
        {doc.is_confidential && (
          <div className="p-1 rounded-md bg-dark-950/80 text-orange-400 backdrop-blur-sm" title="Confidential">
            <Lock size={12} />
          </div>
        )}
        {doc.status === 'signed' && (
          <div className="p-1 rounded-md bg-emerald-500/80 text-white backdrop-blur-sm" title="Signed">
            <Shield size={12} />
          </div>
        )}
      </div>

      {/* Preview Area */}
      <div className="aspect-[4/3] w-full rounded-t-2xl overflow-hidden bg-dark-950/50 flex items-center justify-center relative border-b border-white/5">
        {doc.thumbnail ? (
          <img src={doc.thumbnail} alt={doc.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="flex flex-col items-center gap-2 opacity-40 group-hover:opacity-60 transition-opacity">
            {getFileIcon(doc.mime_type)}
            <span className="text-[10px] font-mono tracking-tighter uppercase">{doc.mime_type?.split('/')[1] || 'FILE'}</span>
          </div>
        )}
        
        {/* Selection Overlay */}
        <div className={`absolute inset-0 bg-primary/10 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
      </div>

      {/* Content Area */}
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-white truncate leading-tight group-hover:text-primary transition-colors" title={doc.title}>
            {doc.title}
          </h3>
          <button className="text-dark-500 hover:text-white transition-colors flex-shrink-0">
            <MoreVertical size={14} />
          </button>
        </div>

        <div className="flex flex-wrap gap-1 mt-1">
          {doc.tags_detail?.slice(0, 2).map((tag) => (
            <span 
              key={tag.id} 
              className="px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-dark-800 text-dark-300 border border-white/5"
            >
              <Tag size={8} className="inline mr-1" style={{ color: tag.color }} />
              {tag.name}
            </span>
          ))}
          {doc.tags_detail?.length > 2 && (
            <span className="text-[9px] text-dark-500 font-bold">+{doc.tags_detail.length - 2} more</span>
          )}
        </div>

        <div className="pt-2 flex items-center justify-between text-[10px] text-dark-500 font-medium">
          <span>{formatDate(doc.updated_at)}</span>
          <span className="font-mono uppercase">{doc.file_size ? `${(doc.file_size / 1024).toFixed(1)} KB` : ''}</span>
        </div>
      </div>
    </motion.div>
  )
}
