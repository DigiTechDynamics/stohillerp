// Stohill Properties - Documents and Compliance Page
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, FileText, Upload, Folder, Shield, Download as DownloadIcon, FileArchive } from 'lucide-react'
import { documentsAPI, downloadPrivateFile } from '@/services/api'
import { formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import Pagination from '@/components/common/Pagination'
import RecordActions from '@/components/common/RecordActions'

export default function DocumentsPage() {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('-updated_at')
  const [page, setPage] = useState(1)
  const openPanel = useUIStore((s) => s.openSidePanel)

  const { data, isLoading } = useQuery({
    queryKey: ['documents', { search, ordering: sort, page }],
    queryFn: () => documentsAPI.list({ search, ordering: sort, page }),
  })

  const documents = data?.data?.results || []

  const getFileIcon = (mimeType) => {
    if (mimeType?.includes('pdf')) return <FileText size={18} className="text-red-400" />
    if (mimeType?.includes('zip') || mimeType?.includes('rar')) return <FileArchive size={18} className="text-amber-400" />
    if (mimeType?.includes('image')) return <Folder size={18} className="text-blue-400" />
    return <FileText size={18} className="text-dark-400" />
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-white">Digital Vault</h1>
          <p className="text-dark-400 text-sm mt-1">Unified document management and compliance tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-secondary flex items-center gap-2" onClick={() => openPanel('compliance-check')}>
            <Shield size={16} /> Compliance Audit
          </button>
          <button className="btn-primary flex items-center gap-2" onClick={() => openPanel('document-upload')}>
            <Upload size={16} /> Upload Document
          </button>
        </div>
      </div>

      {/* Categories */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {[
          { label: 'Property Title Deeds', count: 42, icon: Folder },
          { label: 'Lease Agreements', count: 124, icon: FileText },
          { label: 'KYC Documents', count: 85, icon: UserCog },
          { label: 'Sales Contracts', count: 32, icon: Briefcase },
          { label: 'Invoices & Receipts', count: 412, icon: DollarSign },
        ].map((cat, i) => (
          <div key={i} className="card p-3 hover:border-primary/30 transition-all cursor-pointer group">
            <cat.icon size={16} className="text-dark-500 mb-2 group-hover:text-primary transition-colors" />
            <p className="text-sm font-semibold text-white truncate">{cat.label}</p>
            <p className="text-[10px] text-dark-500">{cat.count} files</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 w-full max-w-2xl">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
          <input
            type="text"
            placeholder="Search documents by name or reference..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="form-input pl-9 w-full"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value); setPage(1) }}
          className="form-input w-auto min-w-[150px]"
        >
          <option value="-updated_at">Latest Modified</option>
          <option value="title">Name (A-Z)</option>
          <option value="-file_size">Largest Size</option>
        </select>
      </div>

      {/* Main Content */}
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Document Name</th>
              <th>Category</th>
              <th>Reference</th>
              <th>Modified</th>
              <th>Size</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout">
              {documents.map((doc) => (
                <motion.tr
                  key={doc.id}
                  layout={false}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-white/2 transition-colors cursor-pointer"
                  onClick={() => openPanel('document-detail', { document: doc })}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {getFileIcon(doc.file_type)}
                      <span className="text-sm text-white font-medium truncate max-w-xs">{doc.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-dark-500 uppercase tracking-widest">{doc.category || 'General'}</td>
                  <td className="px-4 py-3 text-sm text-dark-300 font-mono text-xs">{doc.related_object_ref || '—'}</td>
                  <td className="px-4 py-3 text-sm text-dark-400">{formatDate(doc.updated_at)}</td>
                  <td className="px-4 py-3 text-xs text-dark-500 font-mono">{doc.file_size ? `${(doc.file_size / 1024).toFixed(1)} KB` : '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      className="p-1 hover:text-white transition-colors disabled:opacity-30"
                      disabled={!doc.download_url}
                      title="Download"
                      onClick={(e) => {
                        e.stopPropagation()
                        downloadPrivateFile(doc.download_url, doc.title).catch(() => alert('Download failed.'))
                      }}
                    >
                      <DownloadIcon size={16} />
                    </button>
                    <RecordActions record={doc} label="document" deleteFn={documentsAPI.delete} invalidate={['documents']} />
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
            {documents.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="text-center py-20">
                  <Folder size={40} className="mx-auto mb-3 text-dark-600" />
                  <p className="text-dark-400">No documents found in vault.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination 
        currentPage={page}
        totalPages={data?.data?.total_pages}
        totalCount={data?.data?.count}
        onPageChange={setPage}
      />
    </div>
  )
}
import { UserCog, Briefcase, DollarSign } from 'lucide-react'
