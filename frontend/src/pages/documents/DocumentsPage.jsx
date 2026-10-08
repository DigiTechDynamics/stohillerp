// Stohill Properties - Documents and Compliance Page
//
// Document type tiles come from the document types set up in the system, with
// live counts; clicking one lists its documents. Clicking a document opens its
// detail panel (preview and download).
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Upload, Folder, FolderOpen, Shield, Download as DownloadIcon, Lock } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { documentsAPI, downloadPrivateFile } from '@/services/api'
import { formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import Pagination from '@/components/common/Pagination'
import RecordActions from '@/components/common/RecordActions'
import { SettingsButton } from '@/components/common/SettingsPage'
import { FileIcon, formatFileSize } from '@/components/modules/documents/fileDisplay'

export default function DocumentsPage() {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('-updated_at')
  const [page, setPage] = useState(1)
  const [category, setCategory] = useState(null)   // a document type, or null for all
  const openPanel = useUIStore((s) => s.openSidePanel)

  const { data: categoriesRes } = useQuery({
    queryKey: ['document-categories'],
    queryFn: () => documentsAPI.categories.list(),
  })
  const categories = (categoriesRes?.data?.results || categoriesRes?.data || []).filter((c) => c.is_active || c.document_count)
  const totalDocuments = categories.reduce((sum, c) => sum + (c.document_count || 0), 0)

  const { data, isLoading } = useQuery({
    queryKey: ['documents', { search, ordering: sort, page, category: category?.id }],
    queryFn: () => documentsAPI.list({ search, ordering: sort, page, category: category?.id }),
  })
  const documents = data?.data?.results || []

  const chooseCategory = (c) => {
    setCategory(c)
    setPage(1)
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl text-white">Digital Vault</h1>
          <p className="text-dark-400 text-sm mt-1">Unified document management and compliance tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <SettingsButton to="/documents/settings" />
          <button className="btn-secondary flex items-center gap-2" onClick={() => openPanel('compliance-check')}>
            <Shield size={16} /> Compliance Audit
          </button>
          <button className="btn-primary flex items-center gap-2" onClick={() => openPanel('document-upload', { categoryId: category?.id })}>
            <Upload size={16} /> Upload Document
          </button>
        </div>
      </div>

      {/* Document types */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <button type="button" onClick={() => chooseCategory(null)} aria-pressed={!category}
          className={`card p-3 text-left transition-all group ${!category ? 'border-primary/60 bg-primary/5' : 'hover:border-primary/30'}`}>
          <FolderOpen size={16} className={`mb-2 transition-colors ${!category ? 'text-primary' : 'text-dark-500 group-hover:text-primary'}`} />
          <p className="text-sm font-semibold text-white truncate">All documents</p>
          <p className="text-[10px] text-dark-500">{totalDocuments} {totalDocuments === 1 ? 'file' : 'files'}</p>
        </button>
        {categories.map((c) => {
          const active = category?.id === c.id
          return (
            <button key={c.id} type="button" onClick={() => chooseCategory(c)} aria-pressed={active} title={c.description || c.name}
              className={`card p-3 text-left transition-all group ${active ? 'border-primary/60 bg-primary/5' : 'hover:border-primary/30'}`}>
              <Folder size={16} className={`mb-2 transition-colors ${active ? 'text-primary' : 'text-dark-500 group-hover:text-primary'}`} />
              <p className="text-sm font-semibold text-white truncate">{c.name}</p>
              <p className="text-[10px] text-dark-500">{c.document_count} {c.document_count === 1 ? 'file' : 'files'}</p>
            </button>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 w-full flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-2xl">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
          <input
            type="text"
            placeholder={category ? `Search ${category.name.toLowerCase()}...` : 'Search documents by name or reference...'}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="form-input pl-9 w-full"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value); setPage(1) }}
          className="form-input w-auto min-w-[150px]"
          aria-label="Sort documents"
        >
          <option value="-updated_at">Latest Modified</option>
          <option value="title">Name (A-Z)</option>
          <option value="-file_size">Largest Size</option>
        </select>
      </div>

      {/* Documents */}
      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Document Name</th>
              <th>Type</th>
              <th>Reference</th>
              <th>Linked to</th>
              <th>Modified</th>
              <th>Size</th>
              <th className="w-28"></th>
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
                      <FileIcon mimeType={doc.mime_type} />
                      <span className="text-sm text-white font-medium truncate max-w-xs">{doc.title}</span>
                      {doc.is_confidential && <Lock size={12} className="text-amber-400 flex-shrink-0" aria-label="Confidential" />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-dark-500 uppercase tracking-widest">{doc.category_name || '—'}</td>
                  <td className="px-4 py-3 text-dark-300 font-mono text-xs">{doc.reference}</td>
                  <td className="px-4 py-3 text-xs text-dark-400">
                    {doc.property_name || doc.contact_name || doc.lease_number || doc.employee_name || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-dark-400">{formatDate(doc.updated_at)}</td>
                  <td className="px-4 py-3 text-xs text-dark-500 font-mono">{formatFileSize(doc.file_size)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center">
                      <button
                        className="p-1.5 rounded-lg text-dark-400 hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-30"
                        disabled={!doc.download_url}
                        title="Download"
                        aria-label={`Download ${doc.title}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          downloadPrivateFile(doc.download_url, doc.title).catch(() => toast.error('Download failed.'))
                        }}
                      >
                        <DownloadIcon size={14} />
                      </button>
                      <RecordActions record={doc} label="document" deleteFn={documentsAPI.delete}
                        invalidate={['documents', 'document-categories']} />
                    </span>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
            {documents.length === 0 && !isLoading && (
              <tr>
                <td colSpan={7} className="text-center py-20">
                  <Folder size={40} className="mx-auto mb-3 text-dark-600" />
                  <p className="text-dark-400">
                    {category ? `No ${category.name.toLowerCase()} yet.` : 'No documents found in vault.'}
                  </p>
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
