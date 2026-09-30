// Stohill Properties - Bulk Action Bar
// Sticky bar that appears when 1+ kanban cards are selected
import { motion, AnimatePresence } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckSquare, UserCheck, Tag as TagIcon, Trash2, X, Loader2, Trophy, XCircle } from 'lucide-react'
import { crmAPI, hrAPI } from '@/services/api'
import { toast } from 'react-hot-toast'
import { useState } from 'react'

export default function BulkActionBar({ selectedIds, onClearSelection }) {
  const queryClient = useQueryClient()
  const [showReassign, setShowReassign] = useState(false)
  const [showTagger, setShowTagger] = useState(false)
  const [agentId, setAgentId] = useState('')
  const [tagId, setTagId] = useState('')

  const { data: agentsRes } = useQuery({
    queryKey: ['hr-employees-simple'],
    queryFn: () => hrAPI.employees.list({ page_size: 200 }),
    enabled: showReassign
  })
  const { data: tagsRes } = useQuery({
    queryKey: ['crm-tags'],
    queryFn: () => crmAPI.tags.list(),
    enabled: showTagger
  })

  const agents = agentsRes?.data?.results || []
  const tags = tagsRes?.data?.results || tagsRes?.data || []

  const bulkMutation = useMutation({
    mutationFn: (payload) => crmAPI.opportunities.bulkAction(payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
      queryClient.invalidateQueries({ queryKey: ['crm-opportunities'] })
      const labels = {
        reassign: 'Reassigned',
        add_tag: 'Tagged',
        delete: 'Deleted',
        mark_won: 'Marked Won',
        mark_lost: 'Marked Lost',
      }
      toast.success(`${labels[vars.action] || 'Done'}: ${selectedIds.length} record(s)`)
      onClearSelection()
      setShowReassign(false)
      setShowTagger(false)
    },
    onError: () => toast.error('Bulk action failed')
  })

  const count = selectedIds.length
  if (count === 0) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-dark-800 border border-white/10 rounded-2xl shadow-2xl shadow-black/60 p-3 flex items-center gap-2 backdrop-blur-lg"
      >
        {/* Selection count */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20">
          <CheckSquare size={14} className="text-primary" />
          <span className="text-xs font-bold text-primary">{count} selected</span>
        </div>

        {/* Reassign */}
        {showReassign ? (
          <div className="flex items-center gap-2">
            <select
              value={agentId}
              onChange={e => setAgentId(e.target.value)}
              className="form-input h-9 text-xs w-40"
              autoFocus
            >
              <option value="">Select Agent</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>
              ))}
            </select>
            <button
              onClick={() => agentId && bulkMutation.mutate({ ids: selectedIds, action: 'reassign', agent_id: agentId })}
              disabled={!agentId || bulkMutation.isPending}
              className="btn-primary h-9 px-3 text-xs"
            >
              {bulkMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Apply'}
            </button>
            <button onClick={() => setShowReassign(false)} className="text-dark-500 hover:text-white">
              <X size={14} />
            </button>
          </div>
        ) : showTagger ? (
          <div className="flex items-center gap-2">
            <select
              value={tagId}
              onChange={e => setTagId(e.target.value)}
              className="form-input h-9 text-xs w-36"
              autoFocus
            >
              <option value="">Select Tag</option>
              {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button
              onClick={() => tagId && bulkMutation.mutate({ ids: selectedIds, action: 'add_tag', tag_id: tagId })}
              disabled={!tagId || bulkMutation.isPending}
              className="btn-primary h-9 px-3 text-xs"
            >
              {bulkMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Apply'}
            </button>
            <button onClick={() => setShowTagger(false)} className="text-dark-500 hover:text-white">
              <X size={14} />
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => setShowReassign(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 text-xs font-bold text-dark-300 hover:text-white hover:border-white/20 transition-all"
            >
              <UserCheck size={14} /> Reassign
            </button>
            <button
              onClick={() => setShowTagger(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 text-xs font-bold text-dark-300 hover:text-white hover:border-white/20 transition-all"
            >
              <TagIcon size={14} /> Add Tag
            </button>
            <button
              onClick={() => bulkMutation.mutate({ ids: selectedIds, action: 'mark_won' })}
              disabled={bulkMutation.isPending}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-500/30 text-xs font-bold text-emerald-400 hover:bg-emerald-500/10 transition-all"
            >
              <Trophy size={14} /> Mark Won
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Mark ${count} deal(s) as lost?`)) {
                  bulkMutation.mutate({ ids: selectedIds, action: 'mark_lost' })
                }
              }}
              disabled={bulkMutation.isPending}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-red-500/30 text-xs font-bold text-red-400 hover:bg-red-500/10 transition-all"
            >
              <XCircle size={14} /> Mark Lost
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Delete ${count} record(s)? This cannot be undone.`)) {
                  bulkMutation.mutate({ ids: selectedIds, action: 'delete' })
                }
              }}
              disabled={bulkMutation.isPending}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-red-500/30 text-xs font-bold text-red-500 hover:bg-red-500/10 transition-all"
            >
              <Trash2 size={14} /> Delete
            </button>
          </>
        )}

        {/* Clear selection */}
        <div className="w-px h-6 bg-white/10 mx-1" />
        <button
          onClick={onClearSelection}
          className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-dark-500 hover:text-white transition-all"
        >
          <X size={14} />
        </button>
      </motion.div>
    </AnimatePresence>
  )
}
