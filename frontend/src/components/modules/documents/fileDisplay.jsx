import { FileText, FileArchive, Image as ImageIcon } from 'lucide-react'

export const formatFileSize = (bytes) => {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileIcon({ mimeType, size = 18 }) {
  if (mimeType?.includes('pdf')) return <FileText size={size} className="text-red-400" />
  if (mimeType?.includes('zip') || mimeType?.includes('rar')) return <FileArchive size={size} className="text-amber-400" />
  if (mimeType?.startsWith('image')) return <ImageIcon size={size} className="text-blue-400" />
  return <FileText size={size} className="text-dark-400" />
}
