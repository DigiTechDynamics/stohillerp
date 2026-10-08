import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MessageSquare, Clock, Plus, Send, CheckCircle, Mail, Phone, User, Building2, FileText, Paperclip, Download, X
} from 'lucide-react'
import { crmAPI, downloadPrivateFile, apiErrorMessage } from '@/services/api'
import { formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import { toast } from 'react-hot-toast'
import RecordActions from '@/components/common/RecordActions'

export default function Chatter({ opportunityId, contactId, contactData, opportunityData }) {
  const queryClient = useQueryClient()
  const [noteBody, setNoteBody] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [attachment, setAttachment] = useState(null)
  const fileRef = useRef(null)
  const openPanel = useUIStore(s => s.openSidePanel)

  // Fetch Notes
  const { data: notesRes, isLoading: notesLoading } = useQuery({
    queryKey: ['crm-notes', opportunityId || contactId],
    queryFn: () => crmAPI.notes.list(opportunityId ? { opportunity: opportunityId } : { contact: contactId }),
    enabled: !!(opportunityId || contactId)
  })

  // Fetch Activities
  const { data: activitiesRes, isLoading: activitiesLoading } = useQuery({
    queryKey: ['crm-activities', opportunityId || contactId],
    queryFn: () => crmAPI.activities.list(opportunityId ? { opportunity: opportunityId } : { contact: contactId }),
    enabled: !!(opportunityId || contactId)
  })

  const notes = notesRes?.data?.results || []
  const activities = activitiesRes?.data?.results || []

  // Combine and sort by date
  const feed = [
    ...notes.map(n => ({ ...n, type: 'note', date: n.created_at })),
    ...activities.map(a => ({ ...a, type: 'activity', date: a.created_at || a.due_date }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date))

  const addNoteMutation = useMutation({
    mutationFn: (data) => crmAPI.notes.create(data),
    onSuccess: () => {
      setNoteBody('')
      setAttachment(null)
      queryClient.invalidateQueries({ queryKey: ['crm-notes'] })
      toast.success('Note added')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'The note could not be saved.')),
  })

  const handleAddNote = (e) => {
    e.preventDefault()
    if (!noteBody.trim() && !attachment) return
    const values = { opportunity: opportunityId, contact: contactId, body: noteBody.trim() || attachment.name, is_internal: isInternal }
    if (!attachment) {
      addNoteMutation.mutate(values)
      return
    }
    const data = new FormData()
    Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== null) data.append(key, value) })
    data.append('attachment', attachment)
    addNoteMutation.mutate(data)
  }

  const getActivityIcon = (type) => {
    switch(type) {
      case 'call': return <Phone size={14} className="text-blue-400" />
      case 'email': return <Mail size={14} className="text-amber-400" />
      case 'meeting': return <User size={14} className="text-purple-400" />
      case 'viewing': return <Building2 size={14} className="text-emerald-400" />
      case 'whatsapp': return <MessageSquare size={14} className="text-green-400" />
      default: return <FileText size={14} className="text-dark-400" />
    }
  }

  if (notesLoading || activitiesLoading) {
    return (
      <div className="p-4 space-y-4 animate-pulse">
        <div className="h-20 bg-dark-800 rounded-xl" />
        <div className="h-20 bg-dark-800 rounded-xl" />
        <div className="h-20 bg-dark-800 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-dark-800/20">
      {/* Header */}
      <div className="p-4 border-b border-white/5 bg-dark-800/40 flex items-center justify-between">
        <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
          <MessageSquare size={14} className="text-primary" /> Chatter & Activities
        </h3>
        <div className="flex gap-2">
          <button 
            onClick={() => openPanel('activity-form', { contact: contactData, opportunity: opportunityData })}
            className="text-[10px] font-bold text-primary hover:text-white bg-primary/10 hover:bg-primary px-2 py-1 rounded-md border border-primary/20 transition-all uppercase tracking-tighter flex items-center gap-1"
          >
            <Plus size={10} /> Schedule
          </button>
          <span className="text-[10px] font-bold text-dark-500 bg-dark-700 px-2 py-1 rounded-md border border-white/5">
            {feed.length} items
          </span>
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar flex flex-col">
        {feed.map((item) => (
          <div key={item.id} className="relative pl-6 border-l-2 border-white/5 pb-2">
            <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-dark-900 flex items-center justify-center border-2 border-white/5">
              {item.type === 'note' ? <MessageSquare size={8} className="text-primary" /> : getActivityIcon(item.activity_type)}
            </div>
            
            <div className={`p-4 rounded-2xl border transition-all ${item.type === 'note' && item.is_internal ? 'bg-amber-500/5 border-amber-500/10 shadow-lg shadow-amber-500/5' : 'bg-dark-700/50 border-white/5'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-dark-600 flex items-center justify-center text-[8px] font-bold text-dark-300 uppercase">
                    {item.author_name?.[0] || 'A'}
                  </div>
                  <span className="text-xs font-bold text-white">{item.author_name || 'System User'}</span>
                  {item.type === 'note' && item.is_internal && <span className="text-[8px] px-1.5 py-0.5 bg-amber-500/20 text-amber-500 font-bold rounded uppercase tracking-tighter border border-amber-500/20">Internal Note</span>}
                  {item.type === 'activity' && <span className="text-[8px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 font-bold rounded uppercase tracking-tighter border border-blue-500/20">{item.activity_type}</span>}
                </div>
                <span className="flex items-center gap-1">
                  <span className="text-[10px] text-dark-500 font-mono font-bold tracking-tighter opacity-60">
                    {formatDate(item.date)}
                  </span>
                  {item.type === 'activity' ? (
                    <RecordActions record={item} label="activity" size={12}
                      onEdit={() => openPanel('activity-form', { activity: item, contact: contactData, opportunity: opportunityData })}
                      deleteFn={crmAPI.activities.delete} invalidate={['crm-activities', 'kanban']} />
                  ) : (
                    <RecordActions record={item} label="note" size={12} deleteFn={crmAPI.notes.delete} invalidate={['crm-notes']} />
                  )}
                </span>
              </div>
              
              <p className="text-xs text-dark-300 leading-relaxed text-pretty whitespace-pre-wrap">
                {item.type === 'note' ? item.body : (
                  <>
                    <span className="font-bold text-white block mb-1">{item.subject}</span>
                    {item.description}
                  </>
                )}
              </p>
              
              {item.type === 'note' && item.attachment_url && (
                <button type="button"
                  onClick={() => downloadPrivateFile(item.attachment_url, 'attachment').catch(() => toast.error('Download failed.'))}
                  className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-primary hover:underline">
                  <Paperclip size={11} /> Download attachment <Download size={11} />
                </button>
              )}

              {item.type === 'activity' && item.status === 'completed' && (
                <div className="flex items-center gap-1 mt-2 text-[9px] text-emerald-400 font-bold uppercase">
                  <CheckCircle size={10} /> Completed
                </div>
              )}
            </div>
          </div>
        ))}
        
        {feed.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30 py-20">
            <Clock size={48} className="text-dark-600 mb-4" />
            <p className="text-xs text-dark-500 font-bold uppercase tracking-widest">No history yet</p>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 bg-dark-800/40 border-t border-white/5 space-y-3">
         <form onSubmit={handleAddNote} className="relative">
            <textarea 
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Post a note or log an internal update..."
              className="w-full bg-dark-700 border-white/5 rounded-2xl p-4 pr-12 text-sm text-white placeholder-dark-500 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all resize-none h-24"
            />
            <button 
              type="submit"
              disabled={(!noteBody.trim() && !attachment) || addNoteMutation.isPending}
              className="absolute right-3 bottom-3 p-2 bg-primary text-white rounded-xl shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:hover:scale-100"
            >
              <Send size={18} />
            </button>
         </form>
         <div className="flex items-center justify-between px-1">
            <button 
              onClick={() => setIsInternal(!isInternal)}
              className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-all ${isInternal ? 'text-amber-500' : 'text-dark-500 hover:text-dark-300'}`}
            >
              <div className={`w-3 h-3 rounded-full border-2 transition-all ${isInternal ? 'bg-amber-500 border-amber-500' : 'border-dark-700'}`} />
              Internal Note Only
            </button>
            <div className="flex items-center gap-2 text-dark-500 min-w-0">
               {attachment && (
                 <span className="flex items-center gap-1 text-[11px] text-dark-300 truncate max-w-[12rem]">
                   <Paperclip size={11} className="flex-shrink-0" /> <span className="truncate">{attachment.name}</span>
                   <button type="button" aria-label="Remove attachment" className="hover:text-white" onClick={() => setAttachment(null)}><X size={11} /></button>
                 </span>
               )}
               <input ref={fileRef} type="file" className="hidden" aria-label="Attachment"
                 onChange={(e) => { setAttachment(e.target.files[0] || null); e.target.value = '' }} />
               <button type="button" className="p-1.5 rounded-lg hover:bg-white/5 transition-all" title="Add Attachment"
                 onClick={() => fileRef.current?.click()}><Plus size={14} /></button>
            </div>
         </div>
      </div>
    </div>
  )
}
