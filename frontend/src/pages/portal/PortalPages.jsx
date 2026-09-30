// Tenant portal screens. The API only ever returns the signed-in tenant's own data.
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, CreditCard, CheckCircle2, XCircle, Clock, Loader2, Wrench } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { apiErrorMessage, portalAPI, saveBlobResponse } from '@/services/api'
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

export function PortalHome() {
  const { data, isLoading } = useQuery({ queryKey: ['portal-me'], queryFn: () => portalAPI.me() })
  const me = data?.data
  if (isLoading || !me) return <p className="text-dark-400">Loading...</p>
  const owing = parseFloat(me.balance) > 0
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-white">Hello, {me.name}</h1>
      <div className="grid sm:grid-cols-2 gap-4">
        <Card title="Account balance">
          <p className={`text-3xl font-display ${owing ? 'text-white' : 'text-emerald-400'}`}>{formatCurrency(me.balance)}</p>
          <p className="text-xs text-dark-400">{me.open_invoices} open invoice{me.open_invoices === 1 ? '' : 's'}</p>
          {owing && <Link to="/portal/invoices" className="btn-primary inline-flex"><CreditCard size={16} /> Pay now</Link>}
        </Card>
        <Card title="Need a repair?">
          <p className="text-sm text-dark-300">Log a maintenance request and track it here.</p>
          <Link to="/portal/maintenance" className="btn-secondary inline-flex"><Wrench size={16} /> Report a problem</Link>
        </Card>
      </div>
      <Card title="Your leases">
        {me.leases.length === 0 && <p className="text-sm text-dark-400">No leases on your account.</p>}
        {me.leases.map(l => (
          <div key={l.id} className="flex flex-wrap justify-between gap-2 border-t border-white/5 pt-3 first:border-0 first:pt-0">
            <div>
              <p className="text-white font-medium">{l.property}{l.unit ? `, unit ${l.unit}` : ''}</p>
              <p className="text-xs text-dark-400">{l.address}</p>
              <p className="text-xs text-dark-500">{l.lease_number} · {formatDate(l.start_date)} to {l.end_date ? formatDate(l.end_date) : 'open-ended'}</p>
            </div>
            <div className="text-right">
              <p className="text-white">{formatCurrency(l.monthly_rental)}<span className="text-xs text-dark-400"> / month</span></p>
              {parseFloat(l.deposit_held) > 0 && <p className="text-xs text-dark-400">Deposit held {formatCurrency(l.deposit_held)}</p>}
              <span className={`badge text-[10px] uppercase font-bold ${getStatusColor(l.status)}`}>{l.status}</span>
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}

export function PortalInvoices() {
  const { data, isLoading } = useQuery({ queryKey: ['portal-invoices'], queryFn: () => portalAPI.invoices() })
  const { data: paymentsRes } = useQuery({ queryKey: ['portal-payments'], queryFn: () => portalAPI.payments.list() })
  const [selected, setSelected] = useState([])
  const [busy, setBusy] = useState(false)
  const invoices = data?.data || []
  const payable = invoices.filter(i => i.payable && parseFloat(i.balance) > 0)
  const chosen = payable.filter(i => selected.includes(i.id))
  const total = chosen.reduce((s, i) => s + parseFloat(i.balance), 0)
  const currencies = new Set(chosen.map(i => i.currency))

  const toggle = (id) => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]))
  const pdf = async (inv) => {
    try {
      saveBlobResponse(await portalAPI.invoicePdf(inv.id), `${inv.number}.pdf`)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not download the invoice.'))
    }
  }
  const pay = async () => {
    setBusy(true)
    try {
      const { data: payment } = await portalAPI.payments.start(selected)
      window.location.assign(payment.redirect_url)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not start the payment.'))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-white">Invoices & payments</h1>
      <Card>
        {isLoading && <p className="text-dark-400">Loading...</p>}
        {!isLoading && invoices.length === 0 && <p className="text-dark-400">No invoices yet.</p>}
        {invoices.length > 0 && (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th className="w-8"></th><th>Invoice</th><th>Date</th><th>Due</th><th>Status</th><th className="text-right">Total</th><th className="text-right">Balance</th><th></th></tr></thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td className="px-3 py-2">
                      {inv.payable && parseFloat(inv.balance) > 0 && (
                        <input type="checkbox" aria-label={`Pay ${inv.number}`} checked={selected.includes(inv.id)} onChange={() => toggle(inv.id)} />
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-white font-mono">{inv.number}{inv.type === 'credit_note' && <span className="text-xs text-dark-400"> (credit)</span>}</td>
                    <td className="px-3 py-2 text-xs">{formatDate(inv.invoice_date)}</td>
                    <td className="px-3 py-2 text-xs">{formatDate(inv.due_date)}</td>
                    <td className="px-3 py-2"><span className={`badge text-[10px] uppercase font-bold ${getStatusColor(inv.status)}`}>{inv.status.replace(/_/g, ' ')}</span></td>
                    <td className="px-3 py-2 text-sm text-right">{formatCurrency(inv.total, inv.currency)}</td>
                    <td className="px-3 py-2 text-sm text-right text-white">{formatCurrency(inv.balance, inv.currency)}</td>
                    <td className="px-3 py-2 text-right"><button className="btn-ghost p-1" aria-label={`Download ${inv.number}`} onClick={() => pdf(inv)}><Download size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {payable.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4">
            <div className="flex gap-2">
              <button className="btn-ghost text-xs" onClick={() => setSelected(payable.map(i => i.id))}>Select all due</button>
              {selected.length > 0 && <button className="btn-ghost text-xs" onClick={() => setSelected([])}>Clear</button>}
            </div>
            <div className="flex items-center gap-3">
              {currencies.size > 1 && <p className="text-xs text-amber-300">Pay invoices in one currency at a time.</p>}
              <p className="text-white">To pay: <strong>{formatCurrency(total, [...currencies][0])}</strong></p>
              <button className="btn-primary" disabled={busy || chosen.length === 0 || currencies.size > 1} onClick={pay}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />} Pay online
              </button>
            </div>
          </div>
        )}
      </Card>
      {(paymentsRes?.data || []).length > 0 && (
        <Card title="Online payments">
          {paymentsRes.data.map(p => (
            <Link key={p.reference} to={`/portal/payments/${p.reference}`} className="flex justify-between text-sm hover:bg-white/2 rounded px-1 py-1">
              <span className="font-mono text-dark-300">{p.reference} <span className="text-xs text-dark-500">{formatDate(p.created_at)}</span></span>
              <span className="flex gap-3 items-center">
                <span>{formatCurrency(p.amount, p.currency)}</span>
                <span className={`badge text-[10px] uppercase font-bold ${getStatusColor(p.status)}`}>{p.status}</span>
              </span>
            </Link>
          ))}
        </Card>
      )}
    </div>
  )
}

export function PortalStatement() {
  const [range, setRange] = useState({ from_date: isoDaysAgo(180), to_date: isoDaysAgo(0) })
  const { data, isLoading } = useQuery({ queryKey: ['portal-statement', range], queryFn: () => portalAPI.statement(range) })
  const s = data?.data
  const pdf = async () => {
    try {
      saveBlobResponse(await portalAPI.statementPdf(range), 'Statement.pdf')
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not download the statement.'))
    }
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl text-white">Statement</h1>
        <div className="flex gap-2 items-end">
          <label className="text-xs text-dark-400">From<input type="date" className="form-input" value={range.from_date} onChange={e => setRange({ ...range, from_date: e.target.value })} /></label>
          <label className="text-xs text-dark-400">To<input type="date" className="form-input" value={range.to_date} onChange={e => setRange({ ...range, to_date: e.target.value })} /></label>
          <button className="btn-secondary" onClick={pdf}><Download size={16} /> PDF</button>
        </div>
      </div>
      <Card>
        {isLoading || !s ? <p className="text-dark-400">Loading...</p> : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Reference</th><th>Description</th><th className="text-right">Charges</th><th className="text-right">Payments</th><th className="text-right">Balance</th></tr></thead>
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

export function PortalMaintenance() {
  const queryClient = useQueryClient()
  const { data: meRes } = useQuery({ queryKey: ['portal-me'], queryFn: () => portalAPI.me() })
  const { data, isLoading } = useQuery({ queryKey: ['portal-maintenance'], queryFn: () => portalAPI.maintenance.list() })
  const leases = (meRes?.data?.leases || []).filter(l => l.status === 'active')
  const [form, setForm] = useState({ lease: '', category: '', description: '', priority: 'medium' })
  const [busy, setBusy] = useState(false)
  const lease = form.lease || leases[0]?.id || ''

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const { data: res } = await portalAPI.maintenance.create({ ...form, lease })
      toast.success(`Request ${res.reference} logged. We'll be in touch.`)
      setForm({ lease: '', category: '', description: '', priority: 'medium' })
      queryClient.invalidateQueries({ queryKey: ['portal-maintenance'] })
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-white">Maintenance</h1>
      {leases.length > 0 ? (
        <Card title="Report a problem">
          <form onSubmit={submit} className="space-y-3">
            <div className="grid sm:grid-cols-3 gap-3">
              {leases.length > 1 && (
                <select className="form-input" aria-label="Lease" value={lease} onChange={e => setForm({ ...form, lease: e.target.value })}>
                  {leases.map(l => <option key={l.id} value={l.id}>{l.property}{l.unit ? `, unit ${l.unit}` : ''}</option>)}
                </select>
              )}
              <input className="form-input" placeholder="What needs fixing? (e.g. Plumbing)" aria-label="Category" required value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })} />
              <select className="form-input" aria-label="Urgency" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                <option value="low">Low - when convenient</option>
                <option value="medium">Medium</option>
                <option value="high">High - affects daily use</option>
                <option value="emergency">Emergency - safety, flooding, no power</option>
              </select>
            </div>
            <textarea className="form-input w-full" rows={3} placeholder="Describe the problem and where it is" aria-label="Description" required
              value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <button className="btn-primary" disabled={busy}>Submit request</button>
          </form>
        </Card>
      ) : <p className="text-dark-400 text-sm">You need an active lease to log a request.</p>}
      <Card title="Your requests">
        {isLoading && <p className="text-dark-400">Loading...</p>}
        {!isLoading && (data?.data || []).length === 0 && <p className="text-dark-400 text-sm">No requests yet.</p>}
        {(data?.data || []).map(m => (
          <div key={m.reference} className="flex justify-between gap-3 border-t border-white/5 pt-3 first:border-0 first:pt-0">
            <div>
              <p className="text-white text-sm">{m.category} <span className="text-xs font-mono text-dark-500">{m.reference}</span></p>
              <p className="text-xs text-dark-400">{m.description}</p>
              <p className="text-[10px] text-dark-500">Logged {formatDate(m.created_at)}{m.completed_date ? `, completed ${formatDate(m.completed_date)}` : ''}</p>
            </div>
            <span className={`badge h-fit text-[10px] uppercase font-bold ${getStatusColor(m.status)}`}>{m.status.replace(/_/g, ' ')}</span>
          </div>
        ))}
      </Card>
    </div>
  )
}

const MAX_POLLS = 12

// Where the gateway sends the tenant back. Polls until the payment settles.
export function PortalPaymentReturn() {
  const { reference } = useParams()
  const [params] = useSearchParams()
  const queryClient = useQueryClient()
  const [payment, setPayment] = useState(null)
  const [polls, setPolls] = useState(0)
  const [busy, setBusy] = useState(false)
  const settled = payment && ['paid', 'failed'].includes(payment.status)

  useEffect(() => {
    let cancelled = false
    portalAPI.payments.detail(reference)
      .then(({ data }) => { if (!cancelled) setPayment(data) })
      .catch(error => toast.error(apiErrorMessage(error, 'Payment not found.')))
    return () => { cancelled = true }
  }, [reference])

  // Poll the gateway while the payment is outstanding (not for simulated test payments).
  useEffect(() => {
    if (!payment || settled || payment.gateway === 'test' || polls >= MAX_POLLS) return undefined
    const timer = setTimeout(async () => {
      try {
        const { data } = await portalAPI.payments.refresh(reference)
        setPayment(data)
      } catch {
        // Keep polling; the gateway can be briefly unavailable.
      }
      setPolls(n => n + 1)
    }, 3000)
    return () => clearTimeout(timer)
  }, [payment, settled, polls, reference])

  useEffect(() => {
    if (settled) {
      for (const key of ['portal-me', 'portal-invoices', 'portal-payments']) queryClient.invalidateQueries({ queryKey: [key] })
    }
  }, [settled, queryClient])

  const act = async (fn) => {
    setBusy(true)
    try {
      const { data } = await fn()
      setPayment(data)
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  if (!payment) return <p className="text-dark-400">Loading payment...</p>
  return (
    <div className="max-w-lg mx-auto">
      <Card className="text-center space-y-4">
        {payment.status === 'paid' && <CheckCircle2 size={48} className="mx-auto text-emerald-400" />}
        {payment.status === 'failed' && <XCircle size={48} className="mx-auto text-rose-400" />}
        {!settled && <Clock size={48} className="mx-auto text-amber-400" />}
        <h1 className="text-xl text-white font-semibold">
          {payment.status === 'paid' ? 'Payment received - thank you'
            : payment.status === 'failed' ? 'Payment was not completed'
              : 'Waiting for confirmation'}
        </h1>
        <p className="text-3xl font-display text-white">{formatCurrency(payment.amount, payment.currency)}</p>
        <p className="text-xs text-dark-500 font-mono">{payment.reference}</p>
        {payment.status === 'paid' && payment.allocations?.length > 0 && (
          <p className="text-xs text-dark-400">Applied to {payment.allocations.length} invoice{payment.allocations.length === 1 ? '' : 's'}.</p>
        )}
        {!settled && payment.gateway !== 'test' && (
          polls < MAX_POLLS
            ? <p className="text-xs text-dark-400 flex items-center justify-center gap-2"><Loader2 size={12} className="animate-spin" /> Checking with the payment provider...</p>
            : <button className="btn-secondary" disabled={busy} onClick={() => act(() => portalAPI.payments.refresh(reference))}>Check again</button>
        )}
        {!settled && payment.gateway === 'test' && params.get('simulate') && (
          <div className="space-y-2">
            <p className="text-xs text-amber-300">Test gateway: no money moves. Choose an outcome.</p>
            <div className="flex gap-2 justify-center">
              <button className="btn-primary" disabled={busy} onClick={() => act(() => portalAPI.payments.simulate(reference, 'paid'))}>Simulate success</button>
              <button className="btn-secondary" disabled={busy} onClick={() => act(() => portalAPI.payments.simulate(reference, 'failed'))}>Simulate failure</button>
            </div>
          </div>
        )}
        <Link to="/portal/invoices" className="btn-ghost inline-flex">Back to invoices</Link>
      </Card>
    </div>
  )
}
