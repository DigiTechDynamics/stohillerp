// Owner (landlord) portal. The API only returns the signed-in owner's own data.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Check, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { apiErrorMessage, ownerPortalAPI, saveBlobResponse } from '@/services/api'
import { formatCurrency, formatDate, getStatusColor } from '@/utils/format'

const isoDaysAgo = (days) => new Date(Date.now() - days * 864e5).toISOString().split('T')[0]

function Card({ title, children, className = '' }) {
  return (
    <section className={`card p-5 space-y-3 ${className}`}>
      {title && <h2 className="text-xs font-bold text-dark-400 uppercase tracking-widest">{title}</h2>}
      {children}
    </section>
  )
}

function Range({ range, setRange }) {
  return (
    <div className="flex gap-2 items-end">
      <label className="text-xs text-dark-400">From<input type="date" className="form-input" value={range.from_date} onChange={(e) => setRange({ ...range, from_date: e.target.value })} /></label>
      <label className="text-xs text-dark-400">To<input type="date" className="form-input" value={range.to_date} onChange={(e) => setRange({ ...range, to_date: e.target.value })} /></label>
    </div>
  )
}

export function OwnerHome() {
  const { data, isLoading, error } = useQuery({ queryKey: ['owner-me'], queryFn: () => ownerPortalAPI.me() })
  const { data: quotes } = useQuery({ queryKey: ['owner-quotes'], queryFn: () => ownerPortalAPI.quotes() })
  const me = data?.data
  if (error) return <p className="text-rose-300">{apiErrorMessage(error)}</p>
  if (isLoading || !me) return <p className="text-dark-400">Loading...</p>
  const waiting = quotes?.data?.length || 0
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-white">Hello, {me.name}</h1>
      <div className="grid sm:grid-cols-3 gap-4">
        <Card title="Held for you">
          <p className="text-3xl font-display text-white">{formatCurrency(me.balance)}</p>
          <p className="text-xs text-dark-400">Rent collected less fees and costs, not yet paid out.</p>
        </Card>
        <Card title="Available to pay">
          <p className="text-3xl font-display text-emerald-400">{formatCurrency(me.available_to_pay)}</p>
          <p className="text-xs text-dark-400">Paid to {me.bank_name || 'your bank'} {me.bank_account_number}</p>
        </Card>
        <Card title="Rent not yet collected">
          <p className="text-3xl font-display text-white">{formatCurrency(me.uncollected)}</p>
        </Card>
      </div>
      {waiting > 0 && (
        <Card className="border-amber-500/30">
          <p className="text-sm text-amber-300">{waiting} maintenance quote(s) need your approval. Open Maintenance & approvals.</p>
        </Card>
      )}
      <Card title="Your properties">
        {me.properties.map((ref) => (
          <p key={ref} className="text-sm text-dark-300">{ref} · your share {me.shares?.[ref] ?? '100.00'}%</p>
        ))}
      </Card>
    </div>
  )
}

export function OwnerProperties() {
  const [range, setRange] = useState({ from_date: isoDaysAgo(365), to_date: isoDaysAgo(0) })
  const { data, isLoading } = useQuery({ queryKey: ['owner-properties', range], queryFn: () => ownerPortalAPI.properties(range) })
  const rows = data?.data?.properties || []
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl text-white">Properties</h1>
        <Range range={range} setRange={setRange} />
      </div>
      <Card>
        {isLoading ? <p className="text-dark-400">Loading...</p> : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Property</th><th className="text-right">Share</th><th>Occupancy</th><th className="text-right">Rent billed</th><th className="text-right">Collected</th><th className="text-right">Costs</th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2"><p className="text-sm text-white">{p.name}</p><p className="text-[10px] text-dark-500">{p.reference} · {p.address}</p></td>
                    <td className="px-3 py-2 text-sm text-right">{p.share_percent}%</td>
                    <td className="px-3 py-2 text-sm">{p.occupied}/{p.units} occupied</td>
                    <td className="px-3 py-2 text-sm text-right">{formatCurrency(p.rent_billed)}</td>
                    <td className="px-3 py-2 text-sm text-right text-emerald-400">{formatCurrency(p.rent_collected)}</td>
                    <td className="px-3 py-2 text-sm text-right">{formatCurrency(p.costs_charged)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-dark-500 mt-2">Amounts are your share.</p>
          </div>
        )}
      </Card>
    </div>
  )
}

export function OwnerStatement() {
  const [range, setRange] = useState({ from_date: isoDaysAgo(180), to_date: isoDaysAgo(0) })
  const { data, isLoading } = useQuery({ queryKey: ['owner-statement', range], queryFn: () => ownerPortalAPI.statement(range) })
  const s = data?.data
  const pdf = async () => {
    try {
      saveBlobResponse(await ownerPortalAPI.statementPdf(range), 'Owner_Statement.pdf')
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not download the statement.'))
    }
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl text-white">Statement</h1>
        <div className="flex gap-2 items-end">
          <Range range={range} setRange={setRange} />
          <button className="btn-secondary" onClick={pdf}><Download size={16} /> PDF</button>
        </div>
      </div>
      <Card>
        {isLoading || !s ? <p className="text-dark-400">Loading...</p> : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Reference</th><th>Description</th><th className="text-right">Paid out / costs</th><th className="text-right">Received</th><th className="text-right">Balance</th></tr></thead>
              <tbody>
                <tr><td colSpan={5} className="px-3 py-2 text-xs text-dark-400">Opening balance</td><td className="px-3 py-2 text-sm text-right">{formatCurrency(s.opening_balance, s.currency)}</td></tr>
                {s.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-xs">{formatDate(l.date)}</td>
                    <td className="px-3 py-2 text-xs font-mono">{l.reference}</td>
                    <td className="px-3 py-2 text-xs text-dark-300">{l.description}</td>
                    <td className="px-3 py-2 text-xs text-right">{parseFloat(l.debit) ? formatCurrency(l.debit, s.currency) : ''}</td>
                    <td className="px-3 py-2 text-xs text-right">{parseFloat(l.credit) ? formatCurrency(l.credit, s.currency) : ''}</td>
                    <td className="px-3 py-2 text-xs text-right">{formatCurrency(l.balance, s.currency)}</td>
                  </tr>
                ))}
                <tr><td colSpan={5} className="px-3 py-2 text-xs text-white font-semibold">Closing balance</td><td className="px-3 py-2 text-sm text-right text-white font-semibold">{formatCurrency(s.closing_balance, s.currency)}</td></tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

export function OwnerMaintenance() {
  const queryClient = useQueryClient()
  const { data: jobs } = useQuery({ queryKey: ['owner-maintenance'], queryFn: () => ownerPortalAPI.maintenance() })
  const { data: quotes } = useQuery({ queryKey: ['owner-quotes'], queryFn: () => ownerPortalAPI.quotes() })
  const [busy, setBusy] = useState(null)

  const decide = async (quote, approve) => {
    const note = approve ? '' : (window.prompt('Reason (optional)') ?? '')
    setBusy(quote.id)
    try {
      await ownerPortalAPI.decide(quote.id, approve, note)
      toast.success(approve ? 'Approved. The work will be ordered.' : 'Declined.')
      queryClient.invalidateQueries({ queryKey: ['owner-quotes'] })
      queryClient.invalidateQueries({ queryKey: ['owner-maintenance'] })
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-white">Maintenance & approvals</h1>
      <Card title="Quotes waiting for your approval">
        {(quotes?.data || []).length === 0 && <p className="text-sm text-dark-400">Nothing waiting for you.</p>}
        {(quotes?.data || []).map((q) => (
          <div key={q.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
            <div>
              <p className="text-sm text-white">{q.property}: {q.category} <span className="text-dark-500 font-mono text-xs">{q.job}</span></p>
              <p className="text-xs text-dark-400">{q.description}</p>
              <p className="text-xs text-dark-300">{q.supplier}: <span className="text-white font-semibold">{formatCurrency(q.amount)}</span>{q.valid_until ? ` · valid until ${formatDate(q.valid_until)}` : ''}</p>
              {q.quote_notes && <p className="text-xs text-dark-500">{q.quote_notes}</p>}
            </div>
            <div className="flex gap-2">
              <button className="btn-primary text-xs" disabled={busy === q.id} onClick={() => decide(q, true)}><Check size={14} /> Approve</button>
              <button className="btn-secondary text-xs" disabled={busy === q.id} onClick={() => decide(q, false)}><X size={14} /> Decline</button>
            </div>
          </div>
        ))}
      </Card>
      <Card title="Maintenance on your properties">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Job</th><th>Property</th><th>Work</th><th>Status</th><th className="text-right">Cost</th></tr></thead>
            <tbody>
              {(jobs?.data || []).map((j) => (
                <tr key={j.reference}>
                  <td className="px-3 py-2 text-xs font-mono">{j.reference}<p className="text-[10px] text-dark-500">{formatDate(j.created_at)}</p></td>
                  <td className="px-3 py-2 text-sm">{j.property}</td>
                  <td className="px-3 py-2 text-xs text-dark-300">{j.category}: {j.description}</td>
                  <td className="px-3 py-2"><span className={`badge text-[10px] uppercase ${getStatusColor(j.status)}`}>{j.status?.replace(/_/g, ' ')}</span></td>
                  <td className="px-3 py-2 text-sm text-right">{j.actual_cost ? formatCurrency(j.actual_cost) : j.estimated_cost ? `est. ${formatCurrency(j.estimated_cost)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
