// Purchasing: purchase orders, approval, goods receipt and invoicing (3-way match).
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ShoppingCart, Plus, Trash2, Send, PackageCheck, FileText, XCircle, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { apiErrorMessage, financeAPI, procurementAPI, projectsAPI } from '@/services/api'
import { formatCurrency, formatDate, getStatusColor } from '@/utils/format'
import AccountCombobox from '@/components/common/AccountCombobox'
import ApprovalBox from '@/components/common/ApprovalBox'
import Pagination from '@/components/common/Pagination'

const today = () => new Date().toISOString().split('T')[0]
const rows = (res) => res?.data?.results || res?.data || []
const STATUSES = ['draft', 'issued', 'partially_received', 'received', 'closed', 'cancelled']
const blankLine = () => ({ description: '', expense_account: '', picked: null, quantity: '1', unit_price: '' })

function useRun() {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const run = async (fn, success) => {
    setBusy(true)
    try {
      const { data } = await fn()
      toast.success(typeof success === 'function' ? success(data) : success)
      for (const key of ['purchase-orders', 'purchase-order', 'goods-receipts']) queryClient.invalidateQueries({ queryKey: [key] })
      return data
    } catch (error) {
      toast.error(apiErrorMessage(error))
      return null
    } finally {
      setBusy(false)
    }
  }
  return [run, busy]
}

function OrderForm({ onDone }) {
  const [run, busy] = useRun()
  const [form, setForm] = useState({ supplier: '', order_date: today(), expected_date: '', project: '', notes: '', lines: [blankLine()] })
  const { data: suppliersRes } = useQuery({ queryKey: ['ap-suppliers-picker'], queryFn: () => financeAPI.ap.suppliers.list({ page_size: 200 }) })
  const { data: projectsRes } = useQuery({ queryKey: ['projects-picker'], queryFn: () => projectsAPI.list({ status: 'active', page_size: 200 }) })
  const setLine = (i, patch) => setForm({ ...form, lines: form.lines.map((ln, j) => (j === i ? { ...ln, ...patch } : ln)) })
  const total = form.lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0)

  const save = async () => {
    const payload = {
      ...form, expected_date: form.expected_date || null, project: form.project || null,
      lines: form.lines.filter(l => l.description && l.expense_account).map(({ picked, ...l }) => l),
    }
    const order = await run(() => procurementAPI.orders.create(payload), d => `Created ${d.number}.`)
    if (order) onDone(order)
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-white font-semibold">New purchase order</h2>
        <button className="btn-ghost p-1" aria-label="Close" onClick={() => onDone(null)}><X size={16} /></button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <select className="form-input" aria-label="Supplier" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })}>
          <option value="">Supplier...</option>
          {rows(suppliersRes).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label className="text-xs text-dark-400">Order date<input type="date" className="form-input" value={form.order_date} onChange={e => setForm({ ...form, order_date: e.target.value })} /></label>
        <label className="text-xs text-dark-400">Expected<input type="date" className="form-input" value={form.expected_date} onChange={e => setForm({ ...form, expected_date: e.target.value })} /></label>
        <select className="form-input" aria-label="Project" value={form.project} onChange={e => setForm({ ...form, project: e.target.value })}>
          <option value="">No project</option>
          {rows(projectsRes).map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
        </select>
      </div>
      {form.project && <p className="text-xs text-dark-500">Costs will be charged to the project's work-in-progress account when invoiced.</p>}
      <div className="space-y-2">
        {form.lines.map((ln, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <input className="form-input col-span-4" placeholder="Description" aria-label={`Line ${i + 1} description`} value={ln.description} onChange={e => setLine(i, { description: e.target.value })} />
            <div className="col-span-4">
              <AccountCombobox value={ln.picked} placeholder="Expense account..."
                onChange={item => (item.type === 'account'
                  ? setLine(i, { expense_account: item.id, picked: item })
                  : toast.error('Pick a GL account.'))} />
            </div>
            <input type="number" step="0.01" className="form-input col-span-1" aria-label={`Line ${i + 1} quantity`} value={ln.quantity} onChange={e => setLine(i, { quantity: e.target.value })} />
            <input type="number" step="0.01" className="form-input col-span-2" placeholder="Unit price" aria-label={`Line ${i + 1} unit price`} value={ln.unit_price} onChange={e => setLine(i, { unit_price: e.target.value })} />
            <button className="btn-ghost col-span-1 text-dark-500" aria-label={`Remove line ${i + 1}`} disabled={form.lines.length === 1}
              onClick={() => setForm({ ...form, lines: form.lines.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
          </div>
        ))}
        <button className="btn-ghost text-xs" onClick={() => setForm({ ...form, lines: [...form.lines, blankLine()] })}><Plus size={12} /> Line</button>
      </div>
      <textarea className="form-input w-full" rows={2} placeholder="Notes" aria-label="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
      <div className="flex justify-between items-center">
        <p className="text-sm text-white">Total {formatCurrency(total)}</p>
        <button className="btn-primary" disabled={busy || !form.supplier || !form.lines.some(l => l.description && l.expense_account)} onClick={save}>Save draft</button>
      </div>
    </div>
  )
}

function OrderDetail({ id, onClose }) {
  const [run, busy] = useRun()
  const { data } = useQuery({ queryKey: ['purchase-order', id], queryFn: () => procurementAPI.orders.detail(id) })
  const { data: receiptsRes } = useQuery({ queryKey: ['goods-receipts', id], queryFn: () => procurementAPI.receipts.list({ order: id }) })
  const [receipt, setReceipt] = useState(null)
  const [invoice, setInvoice] = useState(null)
  const order = data?.data
  if (!order) return <div className="card p-10 text-center text-dark-400">Loading...</div>
  const receiving = ['issued', 'partially_received'].includes(order.status)
  const uninvoiced = order.lines.some(l => parseFloat(l.received_qty) > parseFloat(l.invoiced_qty))

  const receive = async () => {
    const lines = Object.entries(receipt.qty).filter(([, q]) => parseFloat(q) > 0).map(([line, quantity]) => ({ line, quantity }))
    if (await run(() => procurementAPI.orders.receive(order.id, { lines, date: receipt.date, delivery_note: receipt.delivery_note }),
      d => `Received on ${d.number}.`)) setReceipt(null)
  }
  const createInvoice = async () => {
    if (await run(() => procurementAPI.orders.createInvoice(order.id, invoice),
      d => `Draft supplier invoice created for ${d.invoice_number}. Review and post it in Accounts Payable.`)) setInvoice(null)
  }

  return (
    <div className="card p-5 space-y-5">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-mono text-primary text-sm">{order.number}</p>
          <h2 className="text-xl text-white font-semibold">{order.supplier_name}</h2>
          <p className="text-xs text-dark-400">
            Ordered {formatDate(order.order_date)}{order.expected_date ? `, expected ${formatDate(order.expected_date)}` : ''}
            {order.project_code ? ` · Project ${order.project_code}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge text-[10px] uppercase font-bold ${getStatusColor(order.status)}`}>{order.status.replace(/_/g, ' ')}</span>
          <button className="btn-ghost p-1" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
      </div>

      <table className="data-table">
        <thead><tr><th>Item</th><th>Account</th><th className="text-right">Ordered</th><th className="text-right">Received</th><th className="text-right">Invoiced</th><th className="text-right">Price</th><th className="text-right">Total</th></tr></thead>
        <tbody>
          {order.lines.map(l => (
            <tr key={l.id}>
              <td className="px-3 py-2 text-sm text-white">{l.description}</td>
              <td className="px-3 py-2 text-xs font-mono">{l.expense_account_code}</td>
              <td className="px-3 py-2 text-xs text-right">{l.quantity}</td>
              <td className="px-3 py-2 text-xs text-right">{l.received_qty}</td>
              <td className="px-3 py-2 text-xs text-right">{l.invoiced_qty}</td>
              <td className="px-3 py-2 text-xs text-right">{formatCurrency(l.unit_price)}</td>
              <td className="px-3 py-2 text-sm text-right">{formatCurrency(l.line_total)}</td>
            </tr>
          ))}
          <tr><td colSpan={6} className="px-3 py-2 text-right text-xs text-dark-400">Order total</td><td className="px-3 py-2 text-right text-white font-semibold">{formatCurrency(order.total_amount)}</td></tr>
        </tbody>
      </table>

      {order.status === 'draft' && <ApprovalBox api={procurementAPI.orders} id={order.id} queryKey="purchase-order" />}

      <div className="flex flex-wrap gap-2">
        {order.status === 'draft' && (
          <button className="btn-primary" disabled={busy} onClick={() => run(() => procurementAPI.orders.issue(order.id), 'Order issued to supplier.')}>
            <Send size={16} /> Issue
          </button>
        )}
        {receiving && !receipt && (
          <button className="btn-secondary" onClick={() => setReceipt({ date: today(), delivery_note: '', qty: Object.fromEntries(order.lines.map(l => [l.id, String(Math.max(parseFloat(l.quantity) - parseFloat(l.received_qty), 0))])) })}>
            <PackageCheck size={16} /> Receive goods
          </button>
        )}
        {uninvoiced && !invoice && (
          <button className="btn-secondary" onClick={() => setInvoice({ invoice_number: '', invoice_date: today() })}>
            <FileText size={16} /> Invoice received goods
          </button>
        )}
        {['draft', 'issued'].includes(order.status) && (
          <button className="btn-ghost text-rose-300" disabled={busy}
            onClick={() => window.confirm(`Cancel ${order.number}?`) && run(() => procurementAPI.orders.cancel(order.id), 'Order cancelled.')}>
            <XCircle size={16} /> Cancel order
          </button>
        )}
      </div>

      {receipt && (
        <div className="bg-dark-800/50 border border-white/5 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-bold text-dark-400 uppercase tracking-widest">Goods received note</h3>
          {order.lines.map(l => (
            <div key={l.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-dark-300">{l.description} <span className="text-dark-500 text-xs">({l.received_qty}/{l.quantity} received)</span></span>
              <input type="number" step="0.01" className="form-input w-28 text-xs" aria-label={`Receive ${l.description}`} value={receipt.qty[l.id]}
                onChange={e => setReceipt({ ...receipt, qty: { ...receipt.qty, [l.id]: e.target.value } })} />
            </div>
          ))}
          <div className="flex gap-2">
            <input type="date" className="form-input text-xs" aria-label="Receipt date" value={receipt.date} onChange={e => setReceipt({ ...receipt, date: e.target.value })} />
            <input className="form-input text-xs flex-1" placeholder="Supplier delivery note #" aria-label="Delivery note" value={receipt.delivery_note} onChange={e => setReceipt({ ...receipt, delivery_note: e.target.value })} />
            <button className="btn-primary text-xs" disabled={busy} onClick={receive}>Record receipt</button>
            <button className="btn-ghost text-xs" onClick={() => setReceipt(null)}>Cancel</button>
          </div>
        </div>
      )}

      {invoice && (
        <div className="bg-dark-800/50 border border-white/5 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-bold text-dark-400 uppercase tracking-widest">Supplier invoice for received, uninvoiced goods</h3>
          <div className="flex gap-2">
            <input className="form-input text-xs flex-1" placeholder="Supplier's invoice number" aria-label="Supplier invoice number" value={invoice.invoice_number}
              onChange={e => setInvoice({ ...invoice, invoice_number: e.target.value })} />
            <input type="date" className="form-input text-xs" aria-label="Invoice date" value={invoice.invoice_date} onChange={e => setInvoice({ ...invoice, invoice_date: e.target.value })} />
            <button className="btn-primary text-xs" disabled={busy || !invoice.invoice_number} onClick={createInvoice}>Create draft invoice</button>
            <button className="btn-ghost text-xs" onClick={() => setInvoice(null)}>Cancel</button>
          </div>
          <p className="text-xs text-dark-500">Posting checks the invoice against this order and its receipts (3-way match).</p>
        </div>
      )}

      {rows(receiptsRes).length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-dark-400 uppercase tracking-widest mb-2">Receipts</h3>
          {rows(receiptsRes).map(r => (
            <p key={r.id} className="text-xs text-dark-300">
              <span className="font-mono text-primary">{r.number}</span> {formatDate(r.receipt_date)}
              {r.delivery_note ? ` · DN ${r.delivery_note}` : ''} · {r.lines.map(l => `${l.quantity} × ${l.description}`).join(', ')}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PurchasingPage() {
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState(null)
  const { data, isLoading } = useQuery({
    queryKey: ['purchase-orders', { status, search, page }],
    queryFn: () => procurementAPI.orders.list({ status: status || undefined, search, page, ordering: '-order_date' }),
  })
  const orders = rows(data)

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-white">Purchasing</h1>
          <p className="text-dark-400 text-sm mt-1">Purchase orders, goods receipts and supplier invoice matching</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => { setCreating(true); setSelected(null) }}>
          <Plus size={16} /> New Purchase Order
        </button>
      </div>

      {creating && <OrderForm onDone={(order) => { setCreating(false); if (order) setSelected(order.id) }} />}
      {selected && <OrderDetail id={selected} onClose={() => setSelected(null)} />}

      <div className="flex items-center gap-3 max-w-2xl">
        <input className="form-input flex-1" placeholder="Search number, supplier..." aria-label="Search orders" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }} />
        <select className="form-input w-auto" aria-label="Status filter" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead><tr><th>PO #</th><th>Supplier</th><th>Date</th><th>Project</th><th>Status</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {orders.map(o => (
              <tr key={o.id} className={`cursor-pointer hover:bg-white/2 ${selected === o.id ? 'bg-primary/5' : ''}`} onClick={() => { setSelected(o.id); setCreating(false) }}>
                <td className="px-4 py-3 font-mono text-xs text-primary">{o.number}</td>
                <td className="px-4 py-3 text-sm text-white">{o.supplier_name}</td>
                <td className="px-4 py-3 text-xs text-dark-400">{formatDate(o.order_date)}</td>
                <td className="px-4 py-3 text-xs text-dark-400">{o.project_code || '—'}</td>
                <td className="px-4 py-3"><span className={`badge text-[10px] uppercase font-bold ${getStatusColor(o.status)}`}>{o.status.replace(/_/g, ' ')}</span></td>
                <td className="px-4 py-3 text-sm text-right text-white">{formatCurrency(o.total_amount)}</td>
              </tr>
            ))}
            {!isLoading && orders.length === 0 && (
              <tr><td colSpan={6} className="text-center py-16">
                <ShoppingCart size={40} className="mx-auto mb-3 text-dark-600" />
                <p className="text-dark-400">No purchase orders.</p>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination currentPage={page} totalPages={data?.data?.total_pages} totalCount={data?.data?.count} onPageChange={setPage} />
    </div>
  )
}
