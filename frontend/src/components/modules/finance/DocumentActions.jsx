import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Mail, Eraser, Undo2, History, Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { apiErrorMessage, financeAPI, saveBlobResponse } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'
import SettlementPanel from '@/components/common/SettlementPanel'

const OPEN = ['posted', 'partial', 'overdue']

function useRefresh(side) {
  const queryClient = useQueryClient()
  return () => {
    for (const key of [`${side}-invoices`, `${side}-invoice`, `${side}-receipts`, `${side}-payments`,
      'open-invoices', 'allocations']) {
      queryClient.invalidateQueries({ queryKey: [key] })
    }
  }
}

function BankAccountSelect({ value, onChange }) {
  const { data } = useQuery({ queryKey: ['bank-accounts-select'], queryFn: () => financeAPI.bank.accounts.list({ page_size: 200 }) })
  const accounts = data?.data?.results || data?.data || []
  return (
    <select className="form-input text-xs w-full" aria-label="Bank account" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Bank account...</option>
      {accounts.map(a => <option key={a.id} value={a.id}>{a.code || a.name} - {a.bank_name} {a.account_number}</option>)}
    </select>
  )
}

// Refund unapplied credit (a receipt/payment on account, or a credit note).
export function RefundForm({ available, currencyCode, onRefund }) {
  const [amount, setAmount] = useState('')
  const [bank, setBank] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="space-y-2 bg-dark-800/50 border border-white/5 rounded-xl p-4">
      <h3 className="text-[10px] font-bold text-dark-500 uppercase tracking-widest flex items-center gap-2"><Undo2 size={12} /> Refund credit</h3>
      <p className="text-xs text-dark-400">Up to {formatCurrency(available, currencyCode)}</p>
      <div className="grid grid-cols-2 gap-2">
        <input type="number" step="0.01" className="form-input text-xs" placeholder="Amount" aria-label="Refund amount"
          value={amount} onChange={e => setAmount(e.target.value)} />
        <BankAccountSelect value={bank} onChange={setBank} />
      </div>
      <button className="btn-secondary text-xs w-full py-2" disabled={busy || !amount || !bank}
        onClick={async () => { setBusy(true); try { await onRefund({ amount, bank_account: bank }) } finally { setBusy(false) } }}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : 'Refund'}
      </button>
    </div>
  )
}

export function AllocationHistory({ side, filter }) {
  const { data } = useQuery({
    queryKey: ['allocations', side, filter],
    queryFn: () => (side === 'ar' ? financeAPI.allocations.ar(filter) : financeAPI.allocations.ap(filter)),
  })
  const rows = data?.data?.results || []
  if (!rows.length) return null
  return (
    <div className="space-y-2">
      <h3 className="text-[10px] font-bold text-dark-500 uppercase tracking-widest flex items-center gap-2"><History size={12} /> Settlement history</h3>
      <ul className="text-xs space-y-1.5">
        {rows.map(r => (
          <li key={r.id} className="flex justify-between text-dark-300">
            <span>{formatDate(r.allocation_date)} · {r.kind.replace('_', ' ')} · {r.invoice_number || r.receipt_reference || r.payment_reference || r.credit_note_number || ''}</span>
            <span className="font-mono">{formatCurrency(r.amount)}{parseFloat(r.fx_difference) ? ` (FX ${r.fx_difference})` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Actions on a posted customer/supplier invoice or credit note.
export default function DocumentActions({ side, invoice }) {
  const refresh = useRefresh(side)
  const api = side === 'ar' ? financeAPI.ar.invoices : financeAPI.ap.invoices
  const [writeOff, setWriteOff] = useState({ amount: '', reason: '' })
  const [busy, setBusy] = useState(false)
  const isCredit = invoice.document_type === 'credit_note'
  const open = OPEN.includes(invoice.status)
  const partyId = side === 'ar' ? invoice.customer : invoice.supplier

  const run = async (fn, success) => {
    setBusy(true)
    try {
      await fn()
      toast.success(success)
      refresh()
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {side === 'ar' && (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-secondary text-xs py-2" onClick={() => run(async () => saveBlobResponse(await api.pdf(invoice.id), `${invoice.invoice_number}.pdf`), 'Downloaded.')}>
            <Download size={14} /> PDF
          </button>
          <button className="btn-secondary text-xs py-2" onClick={() => run(() => api.email(invoice.id), 'Emailed to the customer.')}>
            <Mail size={14} /> Email
          </button>
        </div>
      )}

      {open && !isCredit && (
        <div className="space-y-2 bg-dark-800/50 border border-white/5 rounded-xl p-4">
          <h3 className="text-[10px] font-bold text-dark-500 uppercase tracking-widest flex items-center gap-2"><Eraser size={12} /> Write off</h3>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" step="0.01" className="form-input text-xs" aria-label="Write-off amount"
              placeholder={`Up to ${invoice.balance_due}`} value={writeOff.amount}
              onChange={e => setWriteOff({ ...writeOff, amount: e.target.value })} />
            <input className="form-input text-xs" placeholder="Reason" aria-label="Write-off reason" value={writeOff.reason}
              onChange={e => setWriteOff({ ...writeOff, reason: e.target.value })} />
          </div>
          <button className="btn-secondary text-xs w-full py-2 text-amber-300" disabled={busy || !writeOff.reason}
            onClick={() => run(() => api.writeOff(invoice.id, { amount: writeOff.amount || undefined, reason: writeOff.reason }),
              side === 'ar' ? 'Written off to bad debts.' : 'Balance written off.')}>
            Write off {writeOff.amount ? formatCurrency(writeOff.amount) : 'full balance'}
          </button>
        </div>
      )}

      {open && isCredit && (
        <>
          <SettlementPanel side={side} partyId={partyId} available={invoice.balance_due}
            currencyCode={invoice.currency_code} title="Apply credit note" submitting={busy}
            onSubmit={allocations => run(() => api.applyCredit(invoice.id, allocations), 'Credit applied.')} />
          <RefundForm available={invoice.balance_due} currencyCode={invoice.currency_code}
            onRefund={data => run(() => api.refund(invoice.id, data), 'Refund posted.')} />
        </>
      )}

      <AllocationHistory side={side} filter={isCredit ? { credit_note: invoice.id } : { invoice: invoice.id }} />
    </div>
  )
}

// Actions on a posted customer receipt / supplier payment: apply unapplied
// cash to invoices, refund it, and see where it went.
export function CashDocumentActions({ side, document }) {
  const refresh = useRefresh(side)
  const api = side === 'ar' ? financeAPI.ar.receipts : financeAPI.ap.payments
  const partyId = side === 'ar' ? document.customer : document.supplier
  const [busy, setBusy] = useState(false)
  const unapplied = parseFloat(document.unapplied_amount || 0)

  const run = async (fn, success) => {
    setBusy(true)
    try {
      await fn()
      toast.success(success)
      refresh()
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between text-xs bg-dark-800/50 border border-white/5 rounded-xl p-3">
        <span className="text-dark-400">Unapplied (on account)</span>
        <span className="font-mono text-white">{formatCurrency(unapplied, document.currency_code)}</span>
      </div>
      {unapplied > 0 && (
        <>
          <SettlementPanel side={side} partyId={partyId} available={document.unapplied_amount}
            currencyCode={document.currency_code} submitting={busy}
            onSubmit={allocations => run(() => api.allocate(document.id, allocations), 'Applied to invoices.')} />
          <RefundForm available={document.unapplied_amount} currencyCode={document.currency_code}
            onRefund={data => run(() => api.refund(document.id, data), 'Refund posted.')} />
        </>
      )}
      <AllocationHistory side={side} filter={side === 'ar' ? { receipt: document.id } : { payment: document.id }} />
    </div>
  )
}