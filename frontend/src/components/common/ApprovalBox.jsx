import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, Check, X, Clock } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { apiErrorMessage } from '@/services/api'

// Approval workflow status for a document, with approve/reject for the
// current user. `api` provides approvalStatus(id), approve(id, c), reject(id, c).
export default function ApprovalBox({ api, id, queryKey }) {
  const queryClient = useQueryClient()
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const key = ['approval-status', queryKey, id]
  const { data } = useQuery({ queryKey: key, queryFn: () => api.approvalStatus(id), enabled: !!id })
  const state = data?.data

  if (!state || !state.required) return null

  const act = async (fn, success) => {
    setBusy(true)
    try {
      await fn(id, comment)
      toast.success(success)
      setComment('')
      queryClient.invalidateQueries({ queryKey: key })
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 bg-dark-800/50 border border-white/5 rounded-xl p-4">
      <h3 className="text-[10px] font-bold text-dark-500 uppercase tracking-widest flex items-center gap-2">
        <ShieldCheck size={12} /> Approval {state.approved ? '- complete' : state.rejected ? '- rejected' : '- required'}
      </h3>
      <ul className="space-y-1.5">
        {state.steps.map(step => (
          <li key={step.rule_id} className="flex items-center justify-between text-xs">
            <span className="text-dark-300">{step.rule} <span className="text-dark-500">({step.role})</span></span>
            {step.approved
              ? <span className="text-emerald-400 flex items-center gap-1"><Check size={12} /> Approved</span>
              : <span className="text-amber-400 flex items-center gap-1"><Clock size={12} /> Pending</span>}
          </li>
        ))}
      </ul>
      {state.history.length > 0 && (
        <ul className="text-[11px] text-dark-500 space-y-1 border-t border-white/5 pt-2">
          {state.history.map((h, i) => (
            <li key={i}>{h.user} {h.decision}{h.comment ? `: "${h.comment}"` : ''}</li>
          ))}
        </ul>
      )}
      {!state.approved && (
        <div className="space-y-2">
          <input className="form-input text-xs w-full" placeholder="Comment (required to reject)"
            aria-label="Approval comment" value={comment} onChange={e => setComment(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-primary text-xs flex-1 py-2" disabled={busy}
              onClick={() => act(api.approve, 'Approved.')}><Check size={14} /> Approve</button>
            <button className="btn-secondary text-xs flex-1 py-2 text-rose-300" disabled={busy || !comment}
              onClick={() => act(api.reject, 'Rejected.')}><X size={14} /> Reject</button>
          </div>
        </div>
      )}
    </div>
  )
}
