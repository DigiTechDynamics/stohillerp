import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link2, Wand2, Loader2 } from 'lucide-react'
import { financeAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'

const OPEN = ['posted', 'partial', 'overdue']

// Apply a receipt/payment or credit note (worth `available`) to the party's
// open invoices. Calls onSubmit([{ invoice, amount }]) with the chosen split.
export default function SettlementPanel({ side, partyId, available, currencyCode, onSubmit, submitting, title }) {
  const [amounts, setAmounts] = useState({})
  const invoicesApi = side === 'ar' ? financeAPI.ar.invoices : financeAPI.ap.invoices
  const partyKey = side === 'ar' ? 'customer' : 'supplier'

  const { data, isLoading } = useQuery({
    queryKey: ['open-invoices', side, partyId],
    queryFn: () => invoicesApi.list({ [partyKey]: partyId, page_size: 200, ordering: 'due_date' }),
    enabled: !!partyId,
  })
  const invoices = useMemo(() => (data?.data?.results || data?.data || [])
    .filter(inv => OPEN.includes(inv.status) && inv.document_type !== 'credit_note' && parseFloat(inv.balance_due) > 0),
  [data])

  const total = Object.values(amounts).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
  const over = total > parseFloat(available || 0) + 0.0001

  const autofill = () => {
    let remaining = parseFloat(available || 0)
    const next = {}
    for (const inv of invoices) {
      if (remaining <= 0) break
      const take = Math.min(remaining, parseFloat(inv.balance_due))
      next[inv.id] = take.toFixed(2)
      remaining -= take
    }
    setAmounts(next)
  }

  const allocations = Object.entries(amounts)
    .filter(([, v]) => parseFloat(v) > 0)
    .map(([invoice, amount]) => ({ invoice, amount }))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-bold text-dark-500 uppercase tracking-widest flex items-center gap-2">
          <Link2 size={12} /> {title || 'Apply to invoices'}
        </h3>
        <button type="button" className="btn-ghost text-xs text-primary flex items-center gap-1" onClick={autofill}
          disabled={!invoices.length}>
          <Wand2 size={12} /> Oldest first
        </button>
      </div>
      <p className="text-xs text-dark-400">Available to apply: <span className="text-white font-mono">{formatCurrency(available, currencyCode)}</span></p>
      <div className="card !bg-dark-900 border border-white/5 overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-white/2 border-b border-white/5 text-dark-400">
            <tr><th className="px-3 py-2">Invoice</th><th className="px-3 py-2 text-right">Open</th><th className="px-3 py-2 text-right w-32">Apply</th></tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {invoices.map(inv => (
              <tr key={inv.id}>
                <td className="px-3 py-2">
                  <p className="text-white font-mono">{inv.invoice_number}</p>
                  <p className="text-[10px] text-dark-500">due {formatDate(inv.due_date)}</p>
                </td>
                <td className="px-3 py-2 text-right font-mono text-dark-300">{formatCurrency(inv.balance_due, inv.currency_code)}</td>
                <td className="px-3 py-2 text-right">
                  <input type="number" step="0.01" min="0" max={inv.balance_due}
                    aria-label={`Apply to ${inv.invoice_number}`}
                    className="form-input text-xs text-right w-28" value={amounts[inv.id] ?? ''}
                    onChange={e => setAmounts({ ...amounts, [inv.id]: e.target.value })} />
                </td>
              </tr>
            ))}
            {!isLoading && invoices.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-dark-500">No open invoices.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between">
        <span className={`text-xs ${over ? 'text-rose-400' : 'text-dark-400'}`}>
          Applying {formatCurrency(total, currencyCode)}{over ? ' - more than is available' : ''}
        </span>
        <button type="button" className="btn-primary text-xs px-4 py-2" disabled={!allocations.length || over || submitting}
          onClick={() => onSubmit(allocations)}>
          {submitting ? <Loader2 size={14} className="animate-spin" /> : 'Apply'}
        </button>
      </div>
    </div>
  )
}
