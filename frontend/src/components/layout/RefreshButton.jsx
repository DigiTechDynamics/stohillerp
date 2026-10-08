// Reloads the data on the current page (and any open side panel) without a full
// browser reload: every query in use is refetched, so lists, totals and panels
// show what others have changed since the page was opened.
import { useState } from 'react'
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { toast } from 'react-hot-toast'

export default function RefreshButton() {
  const queryClient = useQueryClient()
  const fetching = useIsFetching() > 0
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    setBusy(true)
    try {
      // Active queries refetch now; the rest are marked stale and reload when next shown.
      await queryClient.invalidateQueries({ refetchType: 'active' })
      toast.success('Refreshed.', { id: 'refresh', duration: 1200 })
    } catch {
      toast.error('Some data could not be refreshed.', { id: 'refresh' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" className="btn-ghost p-2" onClick={refresh} disabled={busy}
      aria-label="Refresh this page's data" title="Refresh this page's data">
      <RefreshCw size={18} className={busy || fetching ? 'animate-spin text-primary' : 'text-dark-400'} />
    </button>
  )
}
