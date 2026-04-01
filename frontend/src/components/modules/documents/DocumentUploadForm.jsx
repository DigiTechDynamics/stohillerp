import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, FileText, AlertCircle, Save, X, Info } from 'lucide-react'
import { documentsAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import { toast } from 'react-hot-toast'

export default function DocumentUploadForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel } = useUIStore()
  const [file, setFile] = useState(null)
  const [error, setError] = useState(null)
  
  // Fetch Workspaces & Categories for dropdowns
  const { data: workspacesRes } = useQuery({
    queryKey: ['document-workspaces'],
    queryFn: () => documentsAPI.workspaces.list(),
  })
  
  const { data: categoriesRes } = useQuery({
    queryKey: ['document-categories'],
    queryFn: () => documentsAPI.categories.list(),
  })

  const workspaces = workspacesRes?.data || []
  const categories = categoriesRes?.data || []

  const [formData, setFormData] = useState({
    title: '',
    workspace: '',
    category: '', // Code or ID
    is_confidential: false,
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
    if (formData.workspace) data.append('workspace', formData.workspace)
    if (formData.category) data.append('category', formData.category)
    data.append('is_confidential', formData.is_confidential)
    data.append('description', formData.notes)
    
    if (formData.related_type && formData.related_id) {
      data.append('related_object_type', formData.related_type)
      data.append('related_object_id', formData.related_id)
    }

    uploadMutation.mutate(data)
  }

  return (
    <div className="flex flex-col h-full bg-dark-900 font-body">
      <div className="p-6 border-b border-white/5 bg-dark-800/50 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Upload size={20} className="text-primary" /> Upload Document
          </h2>
          <p className="text-[10px] text-dark-500 uppercase font-bold tracking-widest mt-1">Digital Asset Ingestion</p>
        </div>
        <button onClick={closeSidePanel} className="p-2 text-dark-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2 animate-shake">
            <AlertCircle size={14} className="flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <form id="upload-form" onSubmit={handleSubmit} className="space-y-6">
          {/* File Dropzone */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-[0.2em] ml-1">File Attachment *</label>
            <div className={`
              relative border-2 border-dashed rounded-2xl p-10 transition-all text-center group
              ${file ? 'border-primary/50 bg-primary/5' : 'border-white/5 hover:border-white/20 hover:bg-white/2'}
            `}>
              <input 
                type="file" 
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="space-y-4">
                <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center transition-transform group-hover:scale-110 
                  ${file ? 'bg-primary text-dark-900 shadow-gold' : 'bg-dark-800 text-dark-400'}`}>
                  {file ? <FileText size={32} /> : <Upload size={32} />}
                </div>
                {file ? (
                  <div>
                    <p className="text-base font-semibold text-white">{file.name}</p>
                    <p className="text-[11px] text-dark-500 font-mono mt-1 uppercase tracking-widest">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB · {file.type || 'Unknown Type'}
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-semibold text-white group-hover:text-primary transition-colors">Click or drag to upload</p>
                    <p className="text-xs text-dark-500 mt-1">Supports PDF, Images, Word and Zip (Max 25MB)</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-[0.2em] ml-1">Document Title *</label>
            <input 
              type="text" 
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g. 2024 signed Lease Agreement"
              required
              className="form-input w-full bg-dark-800/50 border-white/5 focus:border-primary/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-dark-400 uppercase tracking-[0.2em] ml-1">Destination Workspace</label>
              <select 
                value={formData.workspace}
                onChange={(e) => setFormData(prev => ({ ...prev, workspace: e.target.value }))}
                className="form-input w-full bg-dark-800/50 border-white/5"
              >
                <option value="">Select Workspace...</option>
                {workspaces.map(ws => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-dark-400 uppercase tracking-[0.2em] ml-1">Category / Type</label>
              <select 
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                className="form-input w-full bg-dark-800/50 border-white/5"
              >
                <option value="">Uncategorized</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.code}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-dark-800/30 border border-white/5 flex items-center justify-between group hover:bg-dark-800/50 transition-colors">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${formData.is_confidential ? 'bg-amber-500/10 text-amber-500' : 'bg-dark-700 text-dark-400'}`}>
                <Info size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Confidential Document</p>
                <p className="text-[10px] text-dark-500 uppercase font-bold tracking-widest">Restricts visibility to compliance/executors</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={formData.is_confidential}
                onChange={(e) => setFormData(prev => ({ ...prev, is_confidential: e.target.checked }))}
                className="sr-only peer" 
              />
              <div className="w-11 h-6 bg-dark-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>

          {/* Linking Section */}
          <div className="space-y-4 pt-4 border-t border-white/5">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-dark-500 uppercase tracking-[0.25em]">Transactional Association</h3>
              <span className="text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded uppercase font-bold">Auto-Link Engine</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                  <label className="text-[10px] font-bold text-dark-600 uppercase tracking-widest">Module Link</label>
                  <select 
                    value={formData.related_type}
                    onChange={(e) => setFormData(prev => ({ ...prev, related_type: e.target.value }))}
                    className="form-input w-full bg-dark-800/50 border-white/5"
                  >
                    <option value="">No Association</option>
                    <option value="property">Property Portfolio</option>
                    <option value="contact">CRM Contact / Client</option>
                    <option value="employee">HR Employee Profile</option>
                    <option value="sale">Sales Transaction</option>
                    <option value="lease">Rental Lease Contract</option>
                  </select>
               </div>
               <div className="space-y-2">
                  <label className="text-[10px] font-bold text-dark-600 uppercase tracking-widest">Record Link ID</label>
                  <input 
                    type="text" 
                    value={formData.related_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, related_id: e.target.value }))}
                    placeholder="Enter UUID or Ref ID"
                    className="form-input w-full font-mono text-xs bg-dark-800/50 border-white/5"
                  />
               </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-[0.2em] ml-1">Internal Annotation</label>
            <textarea 
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
              placeholder="Provide context for audit trails and compliance reviews..."
              className="form-input w-full resize-none bg-dark-800/50 border-white/5 focus:border-primary/50"
            />
          </div>
        </form>
      </div>

      <div className="p-6 border-t border-white/5 bg-dark-800/30 flex gap-4">
        <button 
          type="submit" 
          form="upload-form"
          disabled={uploadMutation.isPending}
          className="flex-1 btn-primary py-4 flex items-center justify-center gap-2 shadow-gold group"
        >
          {uploadMutation.isPending ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-dark-900/20 border-t-dark-900 rounded-full animate-spin" />
              <span>Ingesting Asset...</span>
            </div>
          ) : (
            <>
              <Save size={18} className="transition-transform group-hover:scale-110" /> 
              <span>Validate & Commit</span>
            </>
          )}
        </button>
        <button onClick={closeSidePanel} className="btn-secondary px-8 py-4 font-bold uppercase text-[10px] tracking-widest">Discard</button>
      </div>
    </div>
  )
}
