// Stohill Properties - Upload a document.
// Opened from Documents (optionally with a document type chosen) or from a
// record, which passes { property | contact | lease | categoryId } to pre-link it.
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, FileText, AlertCircle, Save, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { documentsAPI, propertiesAPI, crmAPI, rentalsAPI, apiErrorMessage } from '@/services/api'
import { useUIStore } from '@/stores/authStore'

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip'
const listOf = (res) => res?.data?.results || res?.data || []

export default function DocumentUploadForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel, sidePanelData } = useUIStore()
  const preset = sidePanelData || {}
  const [file, setFile] = useState(null)
  const [error, setError] = useState(null)
  const [formData, setFormData] = useState({
    title: '',
    category: preset.categoryId || '',
    description: '',
    expiry_date: '',
    is_confidential: false,
    property: preset.property || '',
    contact: preset.contact || '',
    lease: preset.lease || '',
  })
  const set = (key, value) => setFormData((prev) => ({ ...prev, [key]: value }))

  const { data: categoriesRes } = useQuery({ queryKey: ['document-categories'], queryFn: () => documentsAPI.categories.list() })
  const categories = listOf(categoriesRes).filter((c) => c.is_active)
  const { data: propertiesRes } = useQuery({ queryKey: ['properties', 'options'], queryFn: () => propertiesAPI.list({ page_size: 200 }) })
  const { data: contactsRes } = useQuery({ queryKey: ['crm-contacts', 'options'], queryFn: () => crmAPI.contacts.list({ page_size: 200 }) })
  const { data: leasesRes } = useQuery({ queryKey: ['leases', 'options'], queryFn: () => rentalsAPI.leases.list({ page_size: 200 }) })

  // Until the user picks one, file under "General" (or the first type).
  useEffect(() => {
    const active = listOf(categoriesRes).filter((c) => c.is_active)
    if (active.length) {
      setFormData((prev) => (prev.category ? prev : { ...prev, category: (active.find((c) => c.code === 'GEN') || active[0]).id }))
    }
  }, [categoriesRes])

  const uploadMutation = useMutation({
    mutationFn: (data) => documentsAPI.upload(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      queryClient.invalidateQueries({ queryKey: ['document-categories'] })
      toast.success('Document uploaded.')
      closeSidePanel()
    },
    onError: (err) => setError(apiErrorMessage(err, 'Failed to upload document.')),
  })

  const handleFileChange = (e) => {
    const selected = e.target.files[0]
    if (!selected) return
    if (selected.size > MAX_BYTES) {
      setError('The file is larger than the 10 MB limit.')
      return
    }
    setError(null)
    setFile(selected)
    if (!formData.title) set('title', selected.name.replace(/\.[^.]+$/, ''))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!file) {
      setError('Choose a file to upload.')
      return
    }
    if (!formData.category) {
      setError('Choose the document type.')
      return
    }
    const data = new FormData()
    data.append('file', file)
    Object.entries(formData).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) data.append(key, value)
    })
    uploadMutation.mutate(data)
  }

  return (
    <div className="flex flex-col h-full bg-dark-900">
      <div className="p-6 border-b border-white/5 bg-dark-800/50 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Upload size={20} className="text-primary" /> Upload Document
        </h2>
        <button onClick={closeSidePanel} className="p-2 text-dark-400 hover:text-white transition-colors" aria-label="Close">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {error && (
          <div role="alert" className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2">
            <AlertCircle size={14} className="flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <form id="upload-form" onSubmit={handleSubmit} className="space-y-5">
          {/* File */}
          <div className="space-y-1.5">
            <label className="form-label" htmlFor="document-file">File *</label>
            <div className={`relative border-2 border-dashed rounded-2xl p-8 transition-all text-center
              ${file ? 'border-primary/50 bg-primary/5' : 'border-white/10 hover:border-white/20 hover:bg-white/2'}`}>
              <input id="document-file" type="file" accept={ACCEPT} onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <div className="space-y-3">
                <div className={`w-12 h-12 rounded-xl mx-auto flex items-center justify-center ${file ? 'bg-primary text-[#111]' : 'bg-dark-800 text-dark-400'}`}>
                  {file ? <FileText size={24} /> : <Upload size={24} />}
                </div>
                {file ? (
                  <div>
                    <p className="text-sm font-medium text-white">{file.name}</p>
                    <p className="text-[10px] text-dark-500 font-mono mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-white">Click or drag to upload</p>
                    <p className="text-xs text-dark-500 mt-1">PDF, image, Office document or zip (max 10 MB)</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="form-label" htmlFor="document-title">Title *</label>
            <input id="document-title" type="text" value={formData.title} onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. 2026 Lease Agreement" required className="form-input w-full" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="form-label" htmlFor="document-type">Document type *</label>
              <select id="document-type" value={formData.category} onChange={(e) => set('category', e.target.value)} required className="form-input w-full">
                <option value="">Choose…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="form-label" htmlFor="document-expiry">Expiry date</label>
              <input id="document-expiry" type="date" value={formData.expiry_date} onChange={(e) => set('expiry_date', e.target.value)} className="form-input w-full" />
            </div>
          </div>

          <label className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5 cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={formData.is_confidential} onChange={(e) => set('is_confidential', e.target.checked)} />
            <span>
              <span className="text-sm font-medium text-white">Confidential</span>
              <span className="block text-[11px] text-dark-400">Only Documents-module users and the uploader can see it.</span>
            </span>
          </label>

          {/* Links */}
          <div className="space-y-4 pt-4 border-t border-white/5">
            <h3 className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Link to a record (optional)</h3>
            <div className="space-y-1.5">
              <label className="form-label" htmlFor="document-property">Property</label>
              <select id="document-property" value={formData.property} onChange={(e) => set('property', e.target.value)} className="form-input w-full">
                <option value="">—</option>
                {listOf(propertiesRes).map((p) => <option key={p.id} value={p.id}>{p.reference_number} {p.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="form-label" htmlFor="document-contact">Contact</label>
                <select id="document-contact" value={formData.contact} onChange={(e) => set('contact', e.target.value)} className="form-input w-full">
                  <option value="">—</option>
                  {listOf(contactsRes).map((c) => <option key={c.id} value={c.id}>{c.full_name || `${c.first_name} ${c.last_name}`}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="form-label" htmlFor="document-lease">Lease</label>
                <select id="document-lease" value={formData.lease} onChange={(e) => set('lease', e.target.value)} className="form-input w-full">
                  <option value="">—</option>
                  {listOf(leasesRes).map((l) => <option key={l.id} value={l.id}>{l.lease_number}{l.tenant_name ? ` (${l.tenant_name})` : ''}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="form-label" htmlFor="document-notes">Notes</label>
            <textarea id="document-notes" value={formData.description} onChange={(e) => set('description', e.target.value)}
              rows={3} placeholder="Context or notes about this document..." className="form-input w-full resize-none" />
          </div>
        </form>
      </div>

      <div className="p-6 border-t border-white/5 bg-dark-800/30 flex gap-3">
        <button type="submit" form="upload-form" disabled={uploadMutation.isPending}
          className="flex-1 btn-primary py-3 flex items-center justify-center gap-2 shadow-gold">
          {uploadMutation.isPending ? 'Uploading...' : <><Save size={18} /> Upload</>}
        </button>
        <button type="button" onClick={closeSidePanel} className="btn-secondary px-8">Cancel</button>
      </div>
    </div>
  )
}
