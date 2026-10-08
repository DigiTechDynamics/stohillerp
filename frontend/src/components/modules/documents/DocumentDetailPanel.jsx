// Stohill Properties - Document detail: metadata, an in-app preview (PDF and
// images) and download. Files are private, so the preview is fetched with the
// user's token and shown from a blob URL.
import { useEffect, useState } from 'react'
import { Download, Loader2, Lock, ExternalLink, FileText } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { documentsAPI, fetchPrivateFile, downloadPrivateFile, apiErrorMessage } from '@/services/api'
import { formatDate, getStatusColor } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import RecordActions from '@/components/common/RecordActions'
import { FileIcon, formatFileSize } from '@/components/modules/documents/fileDisplay'

const previewable = (mime) => !!mime && (mime === 'application/pdf' || mime.startsWith('image/') || mime.startsWith('text/'))

function Row({ label, children }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-white/5 last:border-0">
      <span className="text-xs text-dark-400">{label}</span>
      <span className="text-sm text-white text-right break-words">{children}</span>
    </div>
  )
}

export default function DocumentDetailPanel({ document: doc }) {
  const closePanel = useUIStore((s) => s.closeSidePanel)
  const [preview, setPreview] = useState(null)       // { url, mime }
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const canPreview = previewable(doc?.mime_type) && !!doc?.download_url

  useEffect(() => {
    if (!canPreview) return undefined
    let url = null
    let cancelled = false
    setLoadingPreview(true)
    fetchPrivateFile(doc.download_url, doc.title)
      .then(({ blob }) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setPreview({ url, mime: blob.type || doc.mime_type })
      })
      .catch((err) => { if (!cancelled) toast.error(apiErrorMessage(err, 'Could not load the preview.')) })
      .finally(() => { if (!cancelled) setLoadingPreview(false) })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [doc?.id, doc?.download_url, doc?.title, doc?.mime_type, canPreview])

  if (!doc) return null

  const download = async () => {
    setDownloading(true)
    try {
      await downloadPrivateFile(doc.download_url, doc.title)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Download failed.'))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center flex-shrink-0">
          <FileIcon mimeType={doc.mime_type} size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-white break-words">{doc.title}</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">{doc.reference}</span>
            {doc.status && <span className={`${getStatusColor(doc.status)} badge text-[10px] uppercase`}>{doc.status.replace(/_/g, ' ')}</span>}
            {doc.is_confidential && <span className="badge-gold text-[10px] uppercase"><Lock size={10} /> Confidential</span>}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button type="button" className="btn-primary flex-1 justify-center" onClick={download} disabled={!doc.download_url || downloading}>
          {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Download
        </button>
        {preview && (
          <a href={preview.url} target="_blank" rel="noreferrer" className="btn-secondary">
            <ExternalLink size={16} /> Open
          </a>
        )}
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-white/10 bg-dark-800/50 overflow-hidden">
        {loadingPreview ? (
          <div className="h-64 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-primary" /></div>
        ) : preview?.mime?.startsWith('image/') ? (
          <img src={preview.url} alt={doc.title} className="w-full max-h-[28rem] object-contain bg-white" />
        ) : preview ? (
          <iframe src={preview.url} title={`Preview of ${doc.title}`} className="w-full h-[28rem] bg-white" />
        ) : (
          <div className="h-40 flex flex-col items-center justify-center gap-2 text-dark-400 text-sm">
            <FileText size={28} className="text-dark-600" />
            {doc.download_url ? 'No preview for this file type. Download it to open it.' : 'This document has no file attached.'}
          </div>
        )}
      </div>

      <div className="card p-4">
        <Row label="Type">{doc.category_name}</Row>
        <Row label="File">{[doc.mime_type, formatFileSize(doc.file_size)].filter(Boolean).join(' · ')}</Row>
        <Row label="Property">{doc.property_name}</Row>
        <Row label="Contact">{doc.contact_name}</Row>
        <Row label="Lease">{doc.lease_number}</Row>
        <Row label="Employee">{doc.employee_name}</Row>
        <Row label="Expires">{doc.expiry_date ? formatDate(doc.expiry_date) : null}</Row>
        <Row label="Uploaded">{`${formatDate(doc.created_at)}${doc.created_by_name ? ` by ${doc.created_by_name}` : ''}`}</Row>
        <Row label="Version">{doc.version}</Row>
      </div>

      {doc.description && (
        <div className="space-y-1">
          <h3 className="text-xs font-bold text-dark-500 uppercase tracking-widest">Notes</h3>
          <p className="text-sm text-dark-300 whitespace-pre-line">{doc.description}</p>
        </div>
      )}

      <div className="flex justify-end">
        <RecordActions record={doc} label="document" deleteFn={documentsAPI.delete}
          invalidate={['documents', 'document-categories']} onDeleted={closePanel} />
      </div>
    </div>
  )
}
