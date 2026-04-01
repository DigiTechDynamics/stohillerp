import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  X, Tag, User, MapPin, 
  Calendar, CheckCircle2, 
  Clock, Download, Trash2, 
  ChevronRight, ArrowRightCircle,
  ExternalLink,
  Shield, 
  FileText
} from 'lucide-react'
import { documentsAPI } from '@/services/api'
import { formatDate } from '@/utils/format'

export default function DocumentInspector({ doc, onClose }) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({ ...doc })

  const updateMutation = useMutation({
    mutationFn: (data) => documentsAPI.update(doc.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      setIsEditing(false)
    }
  })

  if (!doc) return null

  return (
    <div className="flex flex-col h-full bg-dark-900/50 backdrop-blur-md border-l border-white/5 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-gold-sm">
            <FileText size={20} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white leading-none truncate max-w-[150px]">{doc.title}</h2>
            <p className="text-[10px] text-dark-500 uppercase tracking-widest mt-1">Ref: {doc.reference || '—'}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-dark-400 group relative">
          <X size={18} />
          <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-dark-950 text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity">Close Panel (Esc)</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {/* Workflow Actions Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-white/50 mb-2">
            <ArrowRightCircle size={14} />
            <span className="text-xs font-semibold uppercase tracking-wider">Smart Actions</span>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <button className="flex flex-col items-center justify-center p-4 rounded-2xl bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-all group">
               <Shield size={20} className="text-primary mb-2" />
               <span className="text-[10px] font-bold text-white group-hover:text-primary transition-colors uppercase tracking-widest">Verify KYC</span>
            </button>
            <button className="flex flex-col items-center justify-center p-4 rounded-2xl bg-dark-800/40 border border-white/5 hover:border-white/20 transition-all group">
               <ExternalLink size={20} className="text-dark-400 mb-2" />
               <span className="text-[10px] font-bold text-dark-400 group-hover:text-white transition-colors uppercase tracking-widest">Link Finance</span>
            </button>
          </div>
        </section>

        {/* Metadata section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between text-white/50 mb-2">
            <div className="flex items-center gap-2">
              <Tag size={14} />
              <span className="text-xs font-semibold uppercase tracking-wider">Metadata & Tags</span>
            </div>
            <button className="text-[10px] text-primary hover:underline font-bold uppercase" onClick={() => setIsEditing(!isEditing)}>
              {isEditing ? 'Cancel' : 'Edit'}
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] text-dark-500 font-bold uppercase tracking-wider">Classification</label>
              <div className="text-sm text-white font-medium bg-dark-800/40 p-3 rounded-xl border border-white/5">
                {doc.category_name || 'General'}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-dark-500 font-bold uppercase tracking-wider">Tags</label>
              <div className="flex flex-wrap gap-2">
                {doc.tags_detail?.map(tag => (
                  <span 
                    key={tag.id} 
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-dark-800 text-[10px] font-bold text-white border border-white/5"
                  >
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                  </span>
                )) || <span className="text-xs text-dark-600 italic">No tags assigned.</span>}
                <button className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-[10px] font-bold text-primary border border-primary/20 hover:bg-primary/20 transition-all">
                  + Add Tag
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-dark-500 text-[10px] font-bold uppercase tracking-wider">
                  <User size={12} />
                  Ownership
                </div>
                <p className="text-xs text-dark-200 mt-1">{doc.contact?.name || doc.employee?.name || 'Unassigned'}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-dark-500 text-[10px] font-bold uppercase tracking-wider">
                  <Calendar size={12} />
                  Expiry Date
                </div>
                <p className={`text-xs mt-1 ${doc.expiry_date ? 'text-rose-400' : 'text-dark-200'}`}>
                   {doc.expiry_date ? formatDate(doc.expiry_date) : 'Infinite'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Audit / Compliance */}
        <section className="bg-dark-950/40 rounded-2xl border border-white/5 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-emerald-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-widest">Compliance Audit</h3>
          </div>
          <div className="space-y-3">
             <div className="flex items-start gap-3">
               <CheckCircle2 size={14} className="text-emerald-500 mt-0.5" />
               <div className="flex-1">
                 <p className="text-xs text-white">Malware Clean</p>
                 <p className="text-[10px] text-dark-500">Scanned via Defend-X on upload</p>
               </div>
             </div>
             <div className="flex items-start gap-3">
               <Clock size={14} className="text-primary mt-0.5" />
               <div className="flex-1">
                 <p className="text-xs text-white">Retention Period (7yr)</p>
                 <p className="text-[10px] text-dark-500">Expires in 2033</p>
               </div>
             </div>
          </div>
        </section>
      </div>

      {/* Footer Actions */}
      <div className="p-6 border-t border-white/5 bg-dark-900/80 flex items-center gap-3">
        <button className="btn-secondary h-11 flex-1 gap-2">
          <Download size={16} /> Download
        </button>
        <button className="btn-ghost text-rose-400 h-11 p-3 hover:bg-rose-500/10 hover:text-rose-400 transition-colors">
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  )
}
