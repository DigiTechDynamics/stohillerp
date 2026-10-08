import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Edit2, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { apiErrorMessage } from '@/services/api'
import { confirmDialog } from '@/components/common/Dialogs'

// Edit / delete buttons for a record in a list or panel.
//
// The API sends `edit_lock` / `delete_lock` with each record: null when the
// action is allowed, otherwise the reason (e.g. "Posted invoices cannot be
// deleted. Raise a credit note instead."). A locked action is shown disabled
// with that reason as its tooltip, so users see why rather than a dead button.
// `deleteFn(id)` is the API call; `invalidate` lists query keys to refresh.
export default function RecordActions({
  record, label = 'record', onEdit, deleteFn, invalidate = [], onDeleted, size = 14, className = '',
}) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const editLock = record?.edit_lock
  const deleteLock = record?.delete_lock

  const remove = async (e) => {
    e.stopPropagation()
    if (deleteLock) {
      toast.error(deleteLock)
      return
    }
    const ok = await confirmDialog({
      title: `Delete this ${label}?`, message: 'This cannot be undone.', confirmLabel: 'Delete', tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    try {
      await deleteFn(record.id)
      toast.success(`${label.charAt(0).toUpperCase()}${label.slice(1)} deleted.`)
      invalidate.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }))
      onDeleted?.(record)
    } catch (error) {
      toast.error(apiErrorMessage(error, `Could not delete this ${label}.`))
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`} onClick={(e) => e.stopPropagation()}>
      {onEdit && (
        <button type="button" className={`p-1.5 rounded-lg transition-colors ${editLock ? 'text-dark-600 cursor-not-allowed' : 'text-dark-400 hover:text-primary hover:bg-primary/10'}`}
          title={editLock || `Edit ${label}`} aria-label={`Edit ${label}`}
          onClick={(e) => { e.stopPropagation(); if (editLock) toast.error(editLock); else onEdit(record) }}>
          <Edit2 size={size} />
        </button>
      )}
      {deleteFn && (
        <button type="button" className={`p-1.5 rounded-lg transition-colors ${deleteLock ? 'text-dark-600 cursor-not-allowed' : 'text-dark-400 hover:text-rose-400 hover:bg-rose-500/10'}`}
          title={deleteLock || `Delete ${label}`} aria-label={`Delete ${label}`} disabled={busy} onClick={remove}>
          {busy ? <Loader2 size={size} className="animate-spin" /> : <Trash2 size={size} />}
        </button>
      )}
    </span>
  )
}
