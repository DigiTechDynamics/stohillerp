// Finance configuration: currencies, tax codes, cost centres, recurring journals, approval rules and FX revaluation.
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Coins, Percent, Layers, Repeat, ShieldCheck, ArrowLeftRight, Plus, Trash2, Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import CurrenciesTab from './CurrenciesTab'
import { toast } from 'react-hot-toast'
import { adminAPI, apiErrorMessage, financeAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'
import AccountCombobox from '@/components/common/AccountCombobox'
import RecordActions from '@/components/common/RecordActions'

const TABS = [
  { id: 'cost-centres', label: 'Cost Centres', icon: Layers },
  { id: 'recurring', label: 'Recurring Journals', icon: Repeat },
  { id: 'approvals', label: 'Approval Rules', icon: ShieldCheck },
  { id: 'fx', label: 'FX Revaluation', icon: ArrowLeftRight },
  { id: 'currencies', label: 'Currencies', icon: Coins },
  { id: 'tax-codes', label: 'Tax Codes', icon: Percent },
]
const DOC_TYPES = { supplier_invoice: 'Supplier invoice / credit note', supplier_payment: 'Supplier payment', purchase_order: 'Purchase order' }
const today = () => new Date().toISOString().split('T')[0]
const rows = (res) => res?.data?.results || res?.data || []

// Returns true when nothing is missing; otherwise says what is.
function complete(fields) {
  const missing = Object.entries(fields).filter(([, ok]) => !ok).map(([label]) => label)
  if (missing.length) toast.error(`Please fill in: ${missing.join(', ')}.`)
  return missing.length === 0
}

// Runs a mutation with toast feedback and refreshes the given query.
function useAction(queryKey) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const run = async (fn, success) => {
    setBusy(true)
    try {
      const { data } = await fn()
      if (success) toast.success(typeof success === 'function' ? success(data) : success)
      queryClient.invalidateQueries({ queryKey: [queryKey] })
      return data || true
    } catch (error) {
      toast.error(apiErrorMessage(error))
      return null
    } finally {
      setBusy(false)
    }
  }
  return [run, busy]
}

function CostCentres() {
  const { data, isLoading } = useQuery({ queryKey: ['cost-centres'], queryFn: () => financeAPI.costCenters.list({ page_size: 200 }) })
  const [run, busy] = useAction('cost-centres')
  const [form, setForm] = useState({ code: '', name: '' })
  const centres = rows(data)
  return (
    <div className="card overflow-hidden">
      <table className="data-table">
        <thead><tr><th>Code</th><th>Name</th><th>Status</th><th className="w-48"></th></tr></thead>
        <tbody>
          {centres.map(c => (
            <tr key={c.id}>
              <td className="px-4 py-3 font-mono text-xs text-primary">{c.code}</td>
              <td className="px-4 py-3 text-sm text-white">{c.name}</td>
              <td className="px-4 py-3 text-xs">{c.is_active ? 'Active' : <span className="text-dark-500">Inactive</span>}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <button className="btn-ghost text-xs" disabled={busy}
                  onClick={() => run(() => financeAPI.costCenters.update(c.id, { is_active: !c.is_active }))}>
                  {c.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <RecordActions record={c} label="cost centre" onEdit={() => setForm({ id: c.id, code: c.code, name: c.name })}
                  deleteFn={financeAPI.costCenters.delete} invalidate={['cost-centres']} />
              </td>
            </tr>
          ))}
          {!isLoading && centres.length === 0 && (
            <tr><td colSpan={4} className="text-center py-10 text-dark-400">No cost centres yet.</td></tr>
          )}
        </tbody>
      </table>
      <div className="border-t border-white/5 p-4 flex gap-2">
        <input className="form-input w-32" placeholder="Code" aria-label="Cost centre code" value={form.code}
          onChange={e => setForm({ ...form, code: e.target.value })} />
        <input className="form-input flex-1" placeholder="Name" aria-label="Cost centre name" value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })} />
        <button className="btn-primary" disabled={busy}
          onClick={async () => {
            if (!complete({ Code: form.code.trim(), Name: form.name.trim() })) return
            const { id, ...data } = form
            const saved = id
              ? await run(() => financeAPI.costCenters.update(id, data), 'Cost centre updated.')
              : await run(() => financeAPI.costCenters.create(data), 'Cost centre added.')
            if (saved) setForm({ code: '', name: '' })
          }}>
          {form.id ? 'Save' : <><Plus size={16} /> Add</>}
        </button>
        {form.id && <button className="btn-ghost" onClick={() => setForm({ code: '', name: '' })}>Cancel</button>}
      </div>
    </div>
  )
}

const blankLine = () => ({ account: '', side: 'debit', amount: '', description: '' })
const blankTemplate = () => ({
  name: '', description: '', journal: '', frequency: 'monthly', next_run_date: today(), end_date: '',
  auto_post: false, reverse_next_period: false, lines: [blankLine(), { ...blankLine(), side: 'credit' }],
})

function RecurringJournals() {
  const { data, isLoading } = useQuery({ queryKey: ['recurring-journals'], queryFn: () => financeAPI.recurringJournals.list() })
  const { data: journalsRes } = useQuery({ queryKey: ['journals'], queryFn: () => financeAPI.journals.list() })
  const [run, busy] = useAction('recurring-journals')
  const [form, setForm] = useState(null)
  const templates = rows(data)
  const journals = rows(journalsRes)

  const setLine = (i, patch) => setForm({ ...form, lines: form.lines.map((ln, j) => (j === i ? { ...ln, ...patch } : ln)) })
  const total = side => (form?.lines || []).filter(l => l.side === side).reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)

  // Open the new-template form where the user can see it.
  const formRef = useRef(null)
  const formOpen = form !== null
  useEffect(() => {
    if (formOpen) formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [formOpen])

  const save = async () => {
    const lines = form.lines.filter(l => l.account && parseFloat(l.amount) > 0).map(({ picked: _picked, ...ln }) => ln)
    if (!complete({ Name: form.name.trim(), 'Entry description': form.description.trim(), Journal: form.journal,
      'at least two lines with an account and amount': lines.length >= 2 })) return
    if (Math.abs(total('debit') - total('credit')) > 0.004) {
      toast.error('Debits and credits must be equal.')
      return
    }
    const { id, ...rest } = form
    const payload = { ...rest, end_date: form.end_date || null, lines }
    const saved = id
      ? await run(() => financeAPI.recurringJournals.update(id, payload), 'Recurring journal updated.')
      : await run(() => financeAPI.recurringJournals.create(payload), 'Recurring journal saved.')
    if (saved) setForm(null)
  }

  const editTemplate = (t) => setForm({
    id: t.id, name: t.name, description: t.description, journal: t.journal, frequency: t.frequency,
    next_run_date: t.next_run_date, end_date: t.end_date || '', auto_post: t.auto_post,
    reverse_next_period: t.reverse_next_period,
    lines: t.lines.map(l => ({
      account: l.account, side: l.side, amount: l.amount, description: l.description || '',
      picked: { type: 'account', id: l.account, display: l.account_code },
    })),
  })

  const templateForm = () => (
        <div className="card p-5 space-y-4">
          <h3 className="text-white font-semibold">{form.id ? 'Edit recurring journal' : 'New recurring journal'}</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <input className="form-input" placeholder="Name" aria-label="Template name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input className="form-input" placeholder="Entry description" aria-label="Entry description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <select className="form-input" aria-label="Journal" value={form.journal} onChange={e => setForm({ ...form, journal: e.target.value })}>
              <option value="">Journal...</option>
              {journals.map(j => <option key={j.id} value={j.id}>{j.code} - {j.name}</option>)}
            </select>
            <select className="form-input" aria-label="Frequency" value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })}>
              <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option>
            </select>
            <label className="text-xs text-dark-400">First run<input type="date" className="form-input" value={form.next_run_date} onChange={e => setForm({ ...form, next_run_date: e.target.value })} /></label>
            <label className="text-xs text-dark-400">End (optional)<input type="date" className="form-input" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></label>
            <label className="flex items-center gap-2 text-xs text-dark-300"><input type="checkbox" checked={form.auto_post} onChange={e => setForm({ ...form, auto_post: e.target.checked })} /> Post automatically</label>
            <label className="flex items-center gap-2 text-xs text-dark-300"><input type="checkbox" checked={form.reverse_next_period} onChange={e => setForm({ ...form, reverse_next_period: e.target.checked })} /> Reverse next period (accrual)</label>
          </div>
          <div className="space-y-2">
            {form.lines.map((ln, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <div className="col-span-5">
                  <AccountCombobox value={ln.picked} placeholder="Search GL account..."
                    onChange={item => (item.type === 'account'
                      ? setLine(i, { account: item.id, picked: item })
                      : toast.error('Pick a GL account, not a customer, supplier or employee.'))} />
                </div>
                <select className="form-input col-span-2" aria-label={`Line ${i + 1} side`} value={ln.side} onChange={e => setLine(i, { side: e.target.value })}>
                  <option value="debit">Debit</option><option value="credit">Credit</option>
                </select>
                <input type="number" step="0.01" className="form-input col-span-2" placeholder="Amount" aria-label={`Line ${i + 1} amount`} value={ln.amount} onChange={e => setLine(i, { amount: e.target.value })} />
                <input className="form-input col-span-2" placeholder="Narration" aria-label={`Line ${i + 1} narration`} value={ln.description} onChange={e => setLine(i, { description: e.target.value })} />
                <button className="btn-ghost col-span-1 text-dark-500" aria-label={`Remove line ${i + 1}`} disabled={form.lines.length <= 2}
                  onClick={() => setForm({ ...form, lines: form.lines.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
              </div>
            ))}
            <button className="btn-ghost text-xs" onClick={() => setForm({ ...form, lines: [...form.lines, blankLine()] })}><Plus size={12} /> Line</button>
          </div>
          <div className="flex items-center justify-between">
            <p className={`text-xs ${total('debit') === total('credit') && total('debit') > 0 ? 'text-emerald-400' : 'text-amber-300'}`}>
              Dr {formatCurrency(total('debit'))} / Cr {formatCurrency(total('credit'))}
            </p>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn-primary" disabled={busy} onClick={save}>Save template</button>
            </div>
          </div>
        </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <button className="btn-secondary" disabled={busy}
          onClick={() => run(() => financeAPI.recurringJournals.runDue(), d => `Generated: ${d.result}.`)}>
          <Play size={16} /> Run due now
        </button>
        <button className="btn-primary" onClick={() => setForm(form || blankTemplate())}><Plus size={16} /> New template</button>
      </div>
      {form && <div ref={formRef}>{templateForm()}</div>}
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Frequency</th><th>Next run</th><th>Last run</th><th>Mode</th><th className="text-right">Amount</th><th className="w-32"></th></tr></thead>
          <tbody>
            {templates.map(t => (
              <tr key={t.id} className={t.is_active ? '' : 'opacity-50'}>
                <td className="px-4 py-3 text-sm text-white">{t.name}<p className="text-xs text-dark-500">{t.description}</p></td>
                <td className="px-4 py-3 text-xs capitalize">{t.frequency}</td>
                <td className="px-4 py-3 text-xs">{formatDate(t.next_run_date)}</td>
                <td className="px-4 py-3 text-xs text-dark-400">{t.last_run_date ? formatDate(t.last_run_date) : '—'}</td>
                <td className="px-4 py-3 text-xs">{t.auto_post ? 'Auto-post' : 'Draft'}{t.reverse_next_period ? ', reverses' : ''}</td>
                <td className="px-4 py-3 text-sm text-right font-mono">
                  {formatCurrency(t.lines.filter(l => l.side === 'debit').reduce((s, l) => s + parseFloat(l.amount), 0))}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button className="btn-ghost text-xs" disabled={busy}
                    onClick={() => run(() => financeAPI.recurringJournals.update(t.id, { is_active: !t.is_active }))}>
                    {t.is_active ? 'Pause' : 'Resume'}
                  </button>
                  <RecordActions record={t} label="recurring journal" onEdit={editTemplate}
                    deleteFn={financeAPI.recurringJournals.remove} invalidate={['recurring-journals']} />
                </td>
              </tr>
            ))}
            {!isLoading && templates.length === 0 && (
              <tr><td colSpan={7} className="text-center py-10 text-dark-400">No recurring journals. Use them for accruals, depreciation-style charges and fixed monthly costs.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ApprovalRules() {
  const { data, isLoading } = useQuery({ queryKey: ['approval-rules'], queryFn: () => financeAPI.approvalRules.list() })
  const { data: rolesRes } = useQuery({ queryKey: ['roles'], queryFn: () => adminAPI.roles.list() })
  const [run, busy] = useAction('approval-rules')
  const blank = { name: '', document_type: 'supplier_invoice', min_amount: '0', role: '', sequence: 10 }
  const [form, setForm] = useState(blank)
  const rules = rows(data)
  const roles = rows(rolesRes)
  return (
    <div className="space-y-3">
      <p className="text-sm text-dark-400">
        A document needs one approval from each active rule whose threshold it reaches (in base currency), in sequence order.
        Nobody can approve a document they created.
      </p>
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Seq</th><th>Name</th><th>Document</th><th className="text-right">From amount</th><th>Approver role</th><th className="w-32"></th></tr></thead>
          <tbody>
            {rules.map(r => (
              <tr key={r.id} className={r.is_active ? '' : 'opacity-50'}>
                <td className="px-4 py-3 text-xs font-mono">{r.sequence}</td>
                <td className="px-4 py-3 text-sm text-white">{r.name}</td>
                <td className="px-4 py-3 text-xs">{DOC_TYPES[r.document_type] || r.document_type}</td>
                <td className="px-4 py-3 text-sm text-right font-mono">{formatCurrency(r.min_amount)}</td>
                <td className="px-4 py-3 text-xs">{r.role_name}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button className="btn-ghost text-xs" disabled={busy}
                    onClick={() => run(() => financeAPI.approvalRules.update(r.id, { is_active: !r.is_active }))}>
                    {r.is_active ? 'Disable' : 'Enable'}
                  </button>
                  <RecordActions record={r} label="approval rule"
                    onEdit={() => setForm({ id: r.id, name: r.name, document_type: r.document_type, min_amount: r.min_amount, role: r.role, sequence: r.sequence })}
                    deleteFn={financeAPI.approvalRules.remove} invalidate={['approval-rules']} />
                </td>
              </tr>
            ))}
            {!isLoading && rules.length === 0 && (
              <tr><td colSpan={6} className="text-center py-10 text-dark-400">No approval rules: documents can be posted without sign-off.</td></tr>
            )}
          </tbody>
        </table>
        <div className="border-t border-white/5 p-4 grid grid-cols-2 lg:grid-cols-6 gap-2">
          <input className="form-input lg:col-span-2" placeholder="Rule name" aria-label="Rule name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <select className="form-input" aria-label="Document type" value={form.document_type} onChange={e => setForm({ ...form, document_type: e.target.value })}>
            {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="number" step="0.01" className="form-input" placeholder="From amount" aria-label="Minimum amount" value={form.min_amount} onChange={e => setForm({ ...form, min_amount: e.target.value })} />
          <select className="form-input" aria-label="Approver role" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
            <option value="">Approver role...</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <div className="flex gap-2">
            <input type="number" className="form-input w-20" aria-label="Sequence" value={form.sequence} onChange={e => setForm({ ...form, sequence: e.target.value })} />
            <button className="btn-primary" disabled={busy} aria-label={form.id ? 'Save rule' : 'Add rule'}
              onClick={async () => {
                if (!complete({ 'Rule name': form.name.trim(), 'Approver role': form.role })) return
                const { id, ...data } = form
                const saved = id
                  ? await run(() => financeAPI.approvalRules.update(id, data), 'Rule updated.')
                  : await run(() => financeAPI.approvalRules.create(data), 'Rule added.')
                if (saved) setForm(blank)
              }}>
              {form.id ? 'Save' : <><Plus size={16} /> Add</>}
            </button>
            {form.id && <button className="btn-ghost" onClick={() => setForm(blank)}>Cancel</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

function FxRevaluation() {
  const [asOf, setAsOf] = useState(today())
  const [result, setResult] = useState(null)
  const [run, busy] = useAction('journal-entries')
  return (
    <div className="card p-5 space-y-4 max-w-3xl">
      <p className="text-sm text-dark-400">
        Restates open foreign-currency invoices, receipts and payments at the closing rate and posts the unrealised gain or loss.
        The entry reverses automatically the next day, so realised differences are still measured at settlement.
      </p>
      <div className="flex gap-2 items-end">
        <label className="text-xs text-dark-400">As of<input type="date" className="form-input" value={asOf} onChange={e => setAsOf(e.target.value)} /></label>
        <button className="btn-primary" disabled={busy || !asOf}
          onClick={async () => setResult(await run(() => financeAPI.fx.revalue(asOf),
            d => (d.journal_entry ? `Posted ${d.journal_entry}.` : 'No open foreign-currency items to revalue.')))}>
          Revalue
        </button>
      </div>
      {result && result.items?.length > 0 && (
        <table className="data-table">
          <thead><tr><th>Document</th><th>Currency</th><th className="text-right">Open</th><th className="text-right">Gain / (loss)</th></tr></thead>
          <tbody>
            {result.items.map(i => (
              <tr key={i.document}>
                <td className="px-4 py-2 text-xs font-mono">{i.document}</td>
                <td className="px-4 py-2 text-xs">{i.currency}</td>
                <td className="px-4 py-2 text-xs text-right">{formatCurrency(i.open_amount, i.currency)}</td>
                <td className={`px-4 py-2 text-xs text-right ${parseFloat(i.difference) < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{formatCurrency(i.difference)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {result?.auto_reverse_date && <p className="text-xs text-dark-500">Reverses on {formatDate(result.auto_reverse_date)}.</p>}
    </div>
  )
}

export default function FinanceSettingsPage() {
  const [tab, setTab] = useState('cost-centres')
  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl text-white">Finance Settings</h1>
        <p className="text-dark-400 text-sm mt-1">Currencies, tax codes, dimensions, automation, controls and period-end revaluation</p>
      </div>
      <div className="flex items-center gap-1 border-b border-white/5 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 pb-3 px-4 border-b-2 transition-colors text-xs font-bold uppercase tracking-wider whitespace-nowrap ${
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-dark-500 hover:text-dark-300'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'currencies' && <CurrenciesTab />}
      {tab === 'tax-codes' && (
        <div className="card p-5 space-y-2 max-w-xl">
          <p className="text-sm text-dark-300">Tax codes (VAT rates and the accounts they post to) are set up on the Tax &amp; VAT page.</p>
          <Link to="/finance/tax" className="btn-secondary inline-flex items-center gap-2"><Percent size={14} /> Open tax codes</Link>
        </div>
      )}
      {tab === 'cost-centres' && <CostCentres />}
      {tab === 'recurring' && <RecurringJournals />}
      {tab === 'approvals' && <ApprovalRules />}
      {tab === 'fx' && <FxRevaluation />}
    </div>
  )
}
