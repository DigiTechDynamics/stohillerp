// Stohill Properties - CRM Lost Reason Modal
// Shown when user clicks "Mark Lost" on an opportunity
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { XCircle, Plus, Loader2 } from 'lucide-react'
import { crmAPI } from '@/services/api'
import { toast } from 'react-hot-toast'

export default function LostReasonModal({ opportunityId, onClose, onSuccess }) {
  const [selectedReason, setSelectedReason] = useState(null)
  const [customText, setCustomText] = useState('')
  const [newReasonName, setNewReasonName] = useState('')
  const [showAddNew, setShowAddNew] = useState(false)
  const queryClient = useQueryClient()

  const { data: reasonsRes, isLoading } = useQuery({
    queryKey: ['crm-lost-reasons'],
    queryFn: () => crmAPI.lostReasons.list()
  })

  const reasons = reasonsRes?.data?.results || reasonsRes?.data || []

  const createReasonMutation = useMutation({
    mutationFn: (name) => crmAPI.lostReasons.create({ name }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['crm-lost-reasons'] })
      setSelectedReason(res.data.id)
      setNewReasonName('')
      setShowAddNew(false)
      toast.success('Reason added')
    }
  })

  const markLostMutation = useMutation({
    mutationFn: () => crmAPI.opportunities.markLost(opportunityId, selectedReason, customText),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-opportunity', opportunityId] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
      toast.success('Opportunity marked as lost')
      onSuccess?.()
      onClose()
    },
    onError: () => toast.error('Failed to mark as lost')
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md bg-dark-800 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 bg-red-500/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
              <XCircle size={20} className="text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Mark as Lost</h3>
              <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold">Select a reason to continue</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-dark-500 hover:text-white transition-all"
          >
            ✕
          </button>
        </div>

        {/* Reasons */}
        <div className="p-5 space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 size={24} className="animate-spin text-dark-600" />
            </div>
          ) : (
            <>
              {reasons.map(reason => (
                <label
                  key={reason.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedReason === reason.id
                      ? 'bg-red-500/10 border-red-500/40 text-red-400'
                      : 'border-white/5 hover:border-white/15 hover:bg-white/5 text-dark-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="lost_reason"
                    value={reason.id}
                    checked={selectedReason === reason.id}
                    onChange={() => setSelectedReason(reason.id)}
                    className="accent-red-500"
                  />
                  <span className="text-xs font-semibold">{reason.name}</span>
                </label>
              ))}

              {/* Add new reason */}
              {showAddNew ? (
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={newReasonName}
                    onChange={e => setNewReasonName(e.target.value)}
                    placeholder="e.g. Budget Constraints"
                    className="form-input flex-1 text-xs h-9"
                    onKeyDown={e => e.key === 'Enter' && newReasonName && createReasonMutation.mutate(newReasonName)}
                    autoFocus
                  />
                  <button
                    onClick={() => newReasonName && createReasonMutation.mutate(newReasonName)}
                    disabled={!newReasonName || createReasonMutation.isPending}
                    className="btn-primary px-3 h-9 text-xs"
                  >
                    {createReasonMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Add'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddNew(true)}
                  className="w-full flex items-center gap-2 p-2.5 rounded-xl border border-dashed border-white/10 text-[10px] font-bold uppercase tracking-wider text-dark-600 hover:text-primary hover:border-primary/30 transition-all"
                >
                  <Plus size={12} /> Add Custom Reason
                </button>
              )}
            </>
          )}
        </div>

        {/* Additional notes */}
        <div className="px-5 pb-3">
          <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest block mb-1.5">
            Additional Notes (optional)
          </label>
          <textarea
            value={customText}
            onChange={e => setCustomText(e.target.value)}
            rows={2}
            placeholder="Any extra context on why this deal was lost..."
            className="form-input w-full text-xs resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 p-5 border-t border-white/5 bg-dark-900/50">
          <button
            onClick={() => markLostMutation.mutate()}
            disabled={!selectedReason || markLostMutation.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-red-500/20"
          >
            {markLostMutation.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <><XCircle size={16} /> Confirm Lost</>
            )}
          </button>
          <button
            onClick={onClose}
            className="btn-secondary px-6 py-3 text-xs font-bold uppercase tracking-wider"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
