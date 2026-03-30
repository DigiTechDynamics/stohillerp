import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, FileText, AlertCircle, Save, X } from 'lucide-react'
import { documentsAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import { toast } from 'react-hot-toast'

export default function DocumentUploadForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel } = useUIStore()
  const [file, setFile] = useState(null)
  const [error, setError] = useState(null)
  const [formData, setFormData] = useState({
    title: '',
    category: 'general',
    related_type: '',
    related_id: '',
    notes: ''
  })

  const uploadMutation = useMutation({
    mutationFn: (data) => documentsAPI.upload(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      toast.success('Document uploaded successfully')
      closeSidePanel()
    },
    onError: (err) => {
      setError(err.response?.data?.message || 'Failed to upload document')
    }
  })

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    if (selectedFile) {
      setFile(selectedFile)
      if (!formData.title) {
        setFormData(prev => ({ ...prev, title: selectedFile.name.split('.')[0] }))
      }
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!file) {
      setError('Please select a file to upload')
      return
    }

    const data = new FormData()
    data.append('file', file)
    data.append('title', formData.title)
    data.append('category', formData.category)
    data.append('notes', formData.notes)
    if (formData.related_type && formData.related_id) {
      data.append('related_object_type', formData.related_type)
      data.append('related_object_id', formData.related_id)
    }

    uploadMutation.mutate(data)
  }

  return (
    <div className="flex flex-col h-full bg-dark-900">
      <div className="p-6 border-b border-white/5 bg-dark-800/50 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Upload size={20} className="text-primary" /> Upload Document
        </h2>
        <button onClick={closeSidePanel} className="p-2 text-dark-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2">
            <AlertCircle size={14} className="flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <form id="upload-form" onSubmit={handleSubmit} className="space-y-5">
          {/* File Dropzone */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest ml-1">File Attachment *</label>
            <div className={`
              relative border-2 border-dashed rounded-2xl p-8 transition-all text-center
              ${file ? 'border-primary/50 bg-primary/5' : 'border-white/10 hover:border-white/20 hover:bg-white/2'}
            `}>
              <input 
                type="file" 
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="space-y-3">
                <div className={`w-12 h-12 rounded-xl mx-auto flex items-center justify-center ${file ? 'bg-primary text-dark-900' : 'bg-dark-800 text-dark-400'}`}>
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
                    <p className="text-xs text-dark-500 mt-1">PDF, Image, Word or Zip (Max 10MB)</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest ml-1">Document Title *</label>
            <input 
              type="text" 
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g. 2024 Lease Agreement"
              required
              className="form-input w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest ml-1">Category</label>
              <select 
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                className="form-input w-full"
              >
                <option value="general">General</option>
                <option value="contract">Lease / Contract</option>
                <option value="kyc">KYC / ID</option>
                <option value="finance">Finance / Invoice</option>
                <option value="property">Property Deed</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest ml-1">Security Level</label>
              <select className="form-input w-full" defaultValue="internal">
                <option value="public">Public</option>
                <option value="internal">Internal Only</option>
                <option value="restricted">Restricted (Vault)</option>
              </select>
            </div>
          </div>

          {/* Linking (Simplified) */}
          <div className="space-y-4 pt-4 border-t border-white/5">
            <h3 className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Link to Record (Optional)</h3>
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-600 uppercase">Entity Type</label>
                  <select 
                    value={formData.related_type}
                    onChange={(e) => setFormData(prev => ({ ...prev, related_type: e.target.value }))}
                    className="form-input w-full"
                  >
                    <option value="">No Link</option>
                    <option value="property">Property</option>
                    <option value="contact">Contact / User</option>
                    <option value="sale">Sale Deal</option>
                  </select>
               </div>
               <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-600 uppercase">Record ID</label>
                  <input 
                    type="text" 
                    value={formData.related_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, related_id: e.target.value }))}
                    placeholder="UUID or Reference"
                    className="form-input w-full font-mono text-xs"
                  />
               </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest ml-1">Internal Notes</label>
            <textarea 
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
              placeholder="Context or notes about this document..."
              className="form-input w-full resize-none"
            />
          </div>
        </form>
      </div>

      <div className="p-6 border-t border-white/5 bg-dark-800/30 flex gap-3">
        <button 
          type="submit" 
          form="upload-form"
          disabled={uploadMutation.isPending}
          className="flex-1 btn-primary py-3 flex items-center justify-center gap-2 shadow-gold"
        >
          {uploadMutation.isPending ? 'Uploading...' : <><Save size={18} /> Process Upload</>}
        </button>
        <button onClick={closeSidePanel} className="btn-secondary px-8">Cancel</button>
      </div>
    </div>
  )
}
