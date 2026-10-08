// Property-management operations shown as tabs on the Rentals page:
// arrears, lettings (applications), collections, owner payment runs,
// reports, messages, and contractor quotes on maintenance jobs.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Play, FileDown, Send, Download, ChevronDown, ChevronRight, Loader2, Save, Mail } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { propmanAPI, propertiesAPI, crmAPI, bankingAPI, financeAPI, notificationsAPI } from '@/services/api'
import { formatDate, formatDateTime } from '@/utils/format'
import CrudTable from '@/components/common/CrudTable'
import { act, Badge, money, label, rowsOf, saveBlob, useOptions } from './common'
import { confirmDialog, promptDialog } from '@/components/common/Dialogs'

const today = () => new Date().toISOString().slice(0, 10)
const firstOfMonth = () => `${today().slice(0, 8)}01`

function Field({ label: text, children }) {
  return (
    <div>
      <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">{text}</label>
      {children}
    </div>
  )
}

const useBanks = () => useOptions(['bank-accounts-picker'], () => bankingAPI.accounts.list({ page_size: 100 }),
  (b) => [b.id, `${b.account_name || b.name}${b.currency_code ? ` (${b.currency_code})` : ''}`])
const useProperties = () => useOptions(['properties-picker'], () => propertiesAPI.list({ page_size: 500 }),
  (p) => [p.id, `${p.reference_number} ${p.name}`])
const usePortfolios = () => useOptions(['portfolios'], () => propertiesAPI.portfolios.list(), (p) => [p.id, p.name])

// ── Arrears ─────────────────────────────────────────────────────────────────

export function ArrearsTab() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('open')
  const [openId, setOpenId] = useState(null)
  const [busy, setBusy] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['arrears-cases', status],
    queryFn: () => propmanAPI.arrearsCases.list({ status: status || undefined, ordering: '-amount_overdue', page_size: 200 }),
  })
  const cases = rowsOf(data)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['arrears-cases'] })

  const run = async () => {
    setBusy(true)
    if (await act(propmanAPI.arrearsCases.run(), (r) => r.data.result)) refresh()
    setBusy(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select aria-label="Case status" className="form-input w-auto text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All cases</option>
          {[['open', 'Open'], ['promise', 'Promise to pay'], ['legal', 'With attorneys'], ['settled', 'Settled'], ['written_off', 'Written off']]
            .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="btn-primary text-xs" disabled={busy} onClick={run}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Run arrears process now
        </button>
      </div>
      <p className="text-xs text-dark-400">The process also runs daily: overdue leases get a case, and each stage (reminder, letter of demand, final demand, legal) is sent as the debt ages. Configure stages in Property settings.</p>
      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead><tr><th></th><th>Lease</th><th>Tenant</th><th>Property</th><th className="text-right">Overdue</th><th>Days</th><th>Stage</th><th>Status</th></tr></thead>
          <tbody>
            {cases.map((c) => (
              <ArrearsRow key={c.id} c={c} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)} onChanged={refresh} />
            ))}
            {!isLoading && cases.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-dark-400 text-sm">No arrears cases.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ArrearsRow({ c, open, onToggle, onChanged }) {
  const [form, setForm] = useState({ promise_date: '', amount: '', attorney: '', reference: '', note: '' })
  const closed = ['settled', 'written_off'].includes(c.status)
  const go = async (promise, msg) => {
    if (await act(promise, msg)) {
      setForm({ promise_date: '', amount: '', attorney: '', reference: '', note: '' })
      onChanged()
    }
  }
  return (
    <>
      <tr className="cursor-pointer" onClick={onToggle}>
        <td className="px-2">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
        <td className="px-4 py-2.5 text-xs font-mono text-primary">{c.lease_number}</td>
        <td className="px-4 py-2.5 text-sm text-white">{c.tenant}</td>
        <td className="px-4 py-2.5 text-sm text-dark-300">{c.property_name}</td>
        <td className="px-4 py-2.5 text-sm text-right text-red-400">{money(c.amount_overdue)}</td>
        <td className="px-4 py-2.5 text-sm">{c.days_overdue}</td>
        <td className="px-4 py-2.5 text-sm">{c.stage_name || '—'}</td>
        <td className="px-4 py-2.5"><Badge value={c.status} /></td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8} className="px-6 py-4 bg-dark-800/40">
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="space-y-2">
                <h4 className="text-xs uppercase font-bold text-dark-400">History</h4>
                {c.promise_date && <p className="text-xs text-amber-300">Promise: {money(c.promise_amount)} by {formatDate(c.promise_date)}</p>}
                {c.attorney && <p className="text-xs text-red-300">With {c.attorney} {c.legal_reference ? `(ref ${c.legal_reference})` : ''} since {formatDate(c.handed_over_on)}</p>}
                {c.actions.map((a) => (
                  <div key={a.id} className="text-xs border-l-2 border-white/10 pl-2">
                    <p className="text-white">{label(a.action)}{a.stage_name ? ` · ${a.stage_name}` : ''} <span className="text-dark-500">{formatDateTime(a.created_at)}{a.created_by_name ? ` · ${a.created_by_name}` : ''}</span></p>
                    {a.description && <p className="text-dark-400 whitespace-pre-line">{a.description}</p>}
                    {a.message_statuses.map((m, i) => <p key={i} className="text-dark-500">{m.channel} to {m.recipient}: {m.status}</p>)}
                  </div>
                ))}
              </div>
              {!closed && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-secondary text-xs" onClick={() => go(propmanAPI.arrearsCases.nextStage(c.id), 'Next stage sent.')}>Send next stage now</button>
                    <button className="btn-secondary text-xs" onClick={async () => (await confirmDialog({ title: 'Mark this case settled?', confirmLabel: 'Settled' })) && go(propmanAPI.arrearsCases.close(c.id, { status: 'settled', note: form.note }), 'Case settled.')}>Settled</button>
                    <button className="btn-secondary text-xs" onClick={async () => (await confirmDialog({ title: 'Close as written off?', message: 'Write off the debt itself in Accounts Receivable.', confirmLabel: 'Close case', tone: 'warning' })) && go(propmanAPI.arrearsCases.close(c.id, { status: 'written_off', note: form.note }), 'Case closed.')}>Written off</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-end">
                    <Field label="Promise date"><input type="date" aria-label="Promise date" className="form-input text-xs w-full" value={form.promise_date} onChange={(e) => setForm({ ...form, promise_date: e.target.value })} /></Field>
                    <Field label="Amount"><input type="number" step="any" aria-label="Promise amount" className="form-input text-xs w-full" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
                    <button className="btn-secondary text-xs" disabled={!form.promise_date || !form.amount}
                      onClick={() => go(propmanAPI.arrearsCases.promise(c.id, { promise_date: form.promise_date, amount: form.amount, note: form.note }), 'Promise recorded.')}>Record promise</button>
                    <Field label="Attorney"><input aria-label="Attorney" className="form-input text-xs w-full" value={form.attorney} onChange={(e) => setForm({ ...form, attorney: e.target.value })} /></Field>
                    <Field label="Their reference"><input aria-label="Attorney reference" className="form-input text-xs w-full" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
                    <button className="btn-secondary text-xs" disabled={!form.attorney}
                      onClick={() => go(propmanAPI.arrearsCases.handover(c.id, { attorney: form.attorney, reference: form.reference, note: form.note }), 'Handed over.')}>Hand over</button>
                  </div>
                  <div className="flex gap-2">
                    <input aria-label="Note" placeholder="Note (call made, tenant response...)" className="form-input text-xs flex-1" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                    <button className="btn-secondary text-xs" disabled={!form.note} onClick={() => go(propmanAPI.arrearsCases.note(c.id, form.note), 'Note added.')}>Add note</button>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Lettings: tenant applications ───────────────────────────────────────────

export function ApplicationsTab() {
  const queryClient = useQueryClient()
  const properties = useProperties()
  const applicants = useOptions(['contacts-all'], () => crmAPI.contacts.list({ page_size: 500 }), (c) => [c.id, `${c.first_name} ${c.last_name}`.trim()])
  const [convert, setConvert] = useState(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['applications'] })
  const step = async (promise, msg) => { if (await act(promise, msg)) refresh() }

  const creditResult = async (app) => {
    const status = await promptDialog({
      title: 'Record credit result', label: 'Result', confirmLabel: 'Next',
      options: [{ value: 'clear', label: 'Clear' }, { value: 'adverse', label: 'Adverse' }, { value: 'error', label: 'Error' }],
    })
    if (!status) return
    const score = await promptDialog({ title: 'Record credit result', label: 'Score (optional)', confirmLabel: 'Save' })
    if (score === null) return
    step(propmanAPI.applications.creditResult(app.id, { status, score }), 'Credit result recorded.')
  }

  return (
    <div className="space-y-4">
      <CrudTable label="application" queryKey={['applications']} api={propmanAPI.applications}
        description="Screen applicants (credit check, affordability), then approve and turn the application into a lease."
        columns={[
          { key: 'applicant_name', label: 'Applicant' },
          { key: 'property_name', label: 'Property', render: (r) => `${r.property_name}${r.unit_number ? ` / ${r.unit_number}` : ''}` },
          { key: 'offered_rent', label: 'Rent', align: 'right', render: (r) => money(r.offered_rent) },
          { key: 'rent_to_income', label: 'Rent/income', render: (r) => (r.rent_to_income ? `${r.rent_to_income}%` : '—') },
          { key: 'credit_status', label: 'Credit', render: (r) => <Badge value={r.credit_status} /> },
          { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
        ]}
        rowActions={(r) => (
          <span className="inline-flex gap-1">
            {['new', 'screening'].includes(r.status) && r.credit_status === 'not_run' && (
              <button className="btn-ghost text-xs px-2 py-1" onClick={() => step(propmanAPI.applications.creditCheck(r.id), 'Credit check requested.')}>Credit check</button>
            )}
            {r.credit_status === 'pending' && <button className="btn-ghost text-xs px-2 py-1" onClick={() => creditResult(r)}>Record result</button>}
            {['new', 'screening'].includes(r.status) && (
              <>
                <button className="btn-ghost text-xs px-2 py-1 text-emerald-400" onClick={() => step(propmanAPI.applications.approve(r.id, ''), 'Approved.')}>Approve</button>
                <button className="btn-ghost text-xs px-2 py-1 text-rose-400" onClick={async () => { const reason = await promptDialog({ title: 'Decline this application?', label: 'Reason (optional)', confirmLabel: 'Decline', tone: 'danger', multiline: true }); if (reason !== null) step(propmanAPI.applications.decline(r.id, reason), 'Declined.') }}>Decline</button>
              </>
            )}
            {r.status === 'approved' && (
              <button className="btn-ghost text-xs px-2 py-1 text-primary" onClick={() => setConvert({ app: r, start_date: r.desired_start || today(), end_date: '', monthly_rental: r.offered_rent || '', deposit: '' })}>Create lease</button>
            )}
          </span>
        )}
        fields={[
          { key: 'applicant', label: 'Applicant (contact)', type: 'select', options: applicants, required: true, span: 2 },
          { key: 'property', label: 'Property', type: 'select', options: properties, required: true, span: 2 },
          { key: 'desired_start', label: 'Desired start', type: 'date' },
          { key: 'offered_rent', label: 'Rent offered', type: 'number' },
          { key: 'monthly_income', label: 'Monthly income', type: 'number' },
          { key: 'employer', label: 'Employer' },
          { key: 'references', label: 'References', type: 'textarea', span: 2 },
          { key: 'notes', label: 'Notes', type: 'textarea', span: 2 },
        ]} />
      {convert && (
        <div className="card p-4 space-y-3">
          <h3 className="text-sm text-white font-semibold">Create a lease for {convert.app.applicant_name}</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[['start_date', 'Start', 'date'], ['end_date', 'End', 'date'], ['monthly_rental', 'Monthly rent', 'number'], ['deposit', 'Deposit', 'number']].map(([k, l, t]) => (
              <Field key={k} label={l}><input aria-label={l} type={t} step="any" className="form-input text-sm w-full" value={convert[k]} onChange={(e) => setConvert({ ...convert, [k]: e.target.value })} /></Field>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setConvert(null)}>Cancel</button>
            <button className="btn-primary" onClick={async () => {
              const { app, ...body } = convert
              if (await act(propmanAPI.applications.convert(app.id, body), (r) => `Lease ${r.data.lease_number} created (draft).`)) {
                setConvert(null)
                refresh()
                queryClient.invalidateQueries({ queryKey: ['rental-leases'] })
              }
            }}>Create lease</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Collections: debit-order batches and deposit interest ───────────────────

export function CollectionsTab() {
  const queryClient = useQueryClient()
  const banks = useBanks()
  const [form, setForm] = useState({ collection_date: today(), bank_account: '', all_mandates: false })
  const [openBatch, setOpenBatch] = useState(null)
  const { data } = useQuery({ queryKey: ['debit-batches'], queryFn: () => propmanAPI.debitBatches.list({ page_size: 100 }) })
  const batches = rowsOf(data)
  const { data: interest } = useQuery({ queryKey: ['deposit-interest', 'all'], queryFn: () => propmanAPI.depositInterest.list({ page_size: 50 }) })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['debit-batches'] })

  return (
    <div className="space-y-5">
      <div className="card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white">New debit-order batch</h3>
        <p className="text-xs text-dark-400">Collects from every active mandate whose collection day matches the date (or all mandates). Download the file for your bank, then import the paid / unpaid results: paid items are receipted against the tenant's invoices.</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Collection date"><input type="date" aria-label="Collection date" className="form-input text-sm" value={form.collection_date} onChange={(e) => setForm({ ...form, collection_date: e.target.value })} /></Field>
          <Field label="Into bank account">
            <select aria-label="Bank account" className="form-input text-sm" value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })}>
              <option value="">Choose…</option>
              {banks.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-xs text-dark-300 pb-2"><input type="checkbox" checked={form.all_mandates} onChange={(e) => setForm({ ...form, all_mandates: e.target.checked })} /> All active mandates</label>
          <button className="btn-primary text-xs" disabled={!form.bank_account} onClick={async () => {
            const r = await act(propmanAPI.debitBatches.create(form), (res) => `Batch ${res.data.number} created with ${res.data.items.length} item(s).`)
            if (r) { refresh(); setOpenBatch(r.data.id) }
          }}>Create batch</button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>Batch</th><th>Date</th><th>Bank</th><th className="text-right">Total</th><th>Items</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-2.5 text-xs font-mono text-primary">{b.number}</td>
                <td className="px-4 py-2.5 text-sm">{formatDate(b.collection_date)}</td>
                <td className="px-4 py-2.5 text-sm">{b.bank_account_name}</td>
                <td className="px-4 py-2.5 text-sm text-right">{money(b.total)}</td>
                <td className="px-4 py-2.5 text-sm">{b.items.length}</td>
                <td className="px-4 py-2.5"><Badge value={b.status} /></td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <button className="btn-ghost text-xs px-2 py-1" onClick={async () => { const r = await act(propmanAPI.debitBatches.file(b.id)); if (r) { saveBlob(r, `${b.number}.csv`); refresh() } }}><Download size={13} /> File</button>
                  <button className="btn-ghost text-xs px-2 py-1" onClick={() => setOpenBatch(openBatch === b.id ? null : b.id)}>Results</button>
                  {b.status === 'draft' && (
                    <button className="btn-ghost text-xs px-2 py-1 text-rose-400" onClick={async () => { if (await confirmDialog({ title: 'Delete this draft batch?', confirmLabel: 'Delete', tone: 'danger' }) && await act(propmanAPI.debitBatches.delete(b.id), 'Batch deleted.')) refresh() }}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
            {batches.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-dark-400 text-sm">No batches yet. Add debit-order mandates on leases first.</td></tr>}
          </tbody>
        </table>
      </div>
      {openBatch && <BatchResults batch={batches.find((b) => b.id === openBatch)} onDone={refresh} />}

      <div className="card p-4">
        <h3 className="text-sm font-semibold text-white mb-2">Deposit interest credited (latest)</h3>
        <p className="text-xs text-dark-400 mb-2">Interest on deposits held in trust is credited monthly by the daily jobs, at the DEPOSIT_INTEREST_RATE setting.</p>
        <table className="data-table">
          <thead><tr><th>Lease</th><th>Month</th><th className="text-right">Rate %</th><th className="text-right">Amount</th></tr></thead>
          <tbody>{rowsOf(interest).map((r) => (
            <tr key={r.id}><td className="px-4 py-2 text-sm">{r.lease_number}</td><td className="px-4 py-2 text-sm">{formatDate(r.month)}</td>
              <td className="px-4 py-2 text-sm text-right">{r.rate}</td><td className="px-4 py-2 text-sm text-right">{money(r.amount)}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

function BatchResults({ batch, onDone }) {
  const [results, setResults] = useState({})
  if (!batch) return null
  const pending = batch.items.filter((i) => i.status === 'pending')
  return (
    <div className="card p-4 space-y-2">
      <h3 className="text-sm text-white font-semibold">Results for {batch.number}</h3>
      {batch.items.map((i) => (
        <div key={i.id} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex-1 min-w-[200px] text-dark-300">{i.lease_label} · {i.mandate_reference}</span>
          <span className="w-28 text-right">{money(i.amount)}</span>
          {i.status === 'pending' ? (
            <>
              <select aria-label={`Result for ${i.mandate_reference}`} className="form-input text-xs w-28" value={results[i.id]?.status || ''}
                onChange={(e) => setResults({ ...results, [i.id]: { ...results[i.id], status: e.target.value } })}>
                <option value="">—</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option>
              </select>
              {results[i.id]?.status === 'unpaid' && (
                <input aria-label="Unpaid reason" placeholder="Reason" className="form-input text-xs w-40"
                  onChange={(e) => setResults({ ...results, [i.id]: { ...results[i.id], reason: e.target.value } })} />
              )}
            </>
          ) : <Badge value={i.status} />}
        </div>
      ))}
      {pending.length > 0 && (
        <div className="flex justify-end gap-2">
          <button className="btn-ghost text-xs" onClick={() => setResults(Object.fromEntries(pending.map((i) => [i.id, { status: 'paid' }])))}>Mark all paid</button>
          <button className="btn-primary text-xs" onClick={async () => {
            const list = Object.entries(results).filter(([, v]) => v?.status).map(([item, v]) => ({ item, ...v }))
            if (!list.length) return toast.error('Choose a result for at least one item.')
            if (await act(propmanAPI.debitBatches.results(batch.id, list), (r) => `Processed: ${r.data.paid ?? 0} paid, ${r.data.unpaid ?? 0} unpaid.`)) {
              setResults({})
              onDone()
            }
          }}>Process results</button>
        </div>
      )}
    </div>
  )
}

// ── Owner payment run ───────────────────────────────────────────────────────

export function OwnerPaymentRuns() {
  const queryClient = useQueryClient()
  const banks = useBanks()
  const [minimum, setMinimum] = useState('0')
  const [selected, setSelected] = useState({})
  const [form, setForm] = useState({ bank_account: '', run_date: today() })
  const { data: preview, refetch } = useQuery({ queryKey: ['owner-run-preview', minimum], queryFn: () => propmanAPI.ownerRuns.preview({ minimum: minimum || 0 }) })
  const { data: runs } = useQuery({ queryKey: ['owner-runs'], queryFn: () => propmanAPI.ownerRuns.list({ page_size: 20 }) })
  const rows = preview?.data?.owners || []
  const chosen = rows.filter((r) => selected[r.owner] !== false)
  const total = chosen.reduce((s, r) => s + parseFloat(r.amount), 0)

  const run = async () => {
    if (!(await confirmDialog({ title: 'Post owner payment run?', message: `Pay ${chosen.length} owner(s) a total of ${money(total)}?`, confirmLabel: 'Pay owners', tone: 'warning' }))) return
    const r = await act(propmanAPI.ownerRuns.create({ ...form, minimum, owners: chosen.map((c) => c.owner) }), (res) => `Run ${res.data.number} posted.`)
    if (r) {
      saveBlob(await propmanAPI.ownerRuns.file(r.data.id), `${r.data.number}.csv`)
      refetch()
      for (const key of ['owner-runs', 'rental-owners']) queryClient.invalidateQueries({ queryKey: [key] })
    }
  }

  return (
    <div className="card p-4 space-y-3 mt-4">
      <h3 className="text-sm font-semibold text-white">Owner payment run</h3>
      <p className="text-xs text-dark-400">Pays every selected owner their available balance in one go, posts the payments, and downloads a bank bulk-payment file (CSV).</p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Minimum to pay"><input type="number" aria-label="Minimum" className="form-input text-sm w-32" value={minimum} onChange={(e) => setMinimum(e.target.value)} /></Field>
        <Field label="Pay from">
          <select aria-label="Pay from bank account" className="form-input text-sm" value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })}>
            <option value="">Choose…</option>
            {banks.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" aria-label="Run date" className="form-input text-sm" value={form.run_date} onChange={(e) => setForm({ ...form, run_date: e.target.value })} /></Field>
        <button className="btn-primary text-xs" disabled={!form.bank_account || chosen.length === 0} onClick={run}><Send size={14} /> Pay {chosen.length} owner(s): {money(total)}</button>
      </div>
      <table className="data-table">
        <thead><tr><th></th><th>Owner</th><th className="text-right">Available</th><th>Bank details</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.owner}>
              <td className="px-4 py-2"><input type="checkbox" aria-label={`Include ${r.name}`} checked={selected[r.owner] !== false} onChange={(e) => setSelected({ ...selected, [r.owner]: e.target.checked })} /></td>
              <td className="px-4 py-2 text-sm text-white">{r.name}</td>
              <td className="px-4 py-2 text-sm text-right text-emerald-400">{money(r.amount)}</td>
              <td className="px-4 py-2 text-xs">{r.has_bank_details ? 'On file' : <span className="text-amber-400">Missing: add them on the contact</span>}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} className="text-center py-6 text-dark-400 text-sm">No owner has a balance to pay.</td></tr>}
        </tbody>
      </table>
      {rowsOf(runs).length > 0 && (
        <div>
          <h4 className="text-xs uppercase text-dark-400 font-bold mb-1">Previous runs</h4>
          {rowsOf(runs).map((r) => (
            <p key={r.id} className="text-xs text-dark-300 flex items-center gap-2">
              {r.number} · {formatDate(r.run_date)} · {r.lines.length} owner(s) · {money(r.total)}
              <button className="text-primary" onClick={async () => { const f = await act(propmanAPI.ownerRuns.file(r.id)); if (f) saveBlob(f, `${r.number}.csv`) }}>bank file</button>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Reports ─────────────────────────────────────────────────────────────────

const REPORTS = [
  ['rent_roll', 'Rent roll / tenancy schedule'], ['lease_expiry', 'Lease expiry profile'], ['vacancy', 'Vacancy'],
  ['arrears', 'Arrears (aged)'], ['property_income', 'Income per property'],
]

export function ReportsTab() {
  const queryClient = useQueryClient()
  const properties = useProperties()
  const portfolios = usePortfolios()
  const [key, setKey] = useState('rent_roll')
  const [params, setParams] = useState({ property: '', portfolio: '', months: '12', from_date: '', to_date: '' })
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(false)
  const clean = () => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== ''))

  const run = async () => {
    setBusy(true)
    const r = await act(propmanAPI.reports.run(key, clean()))
    setBusy(false)
    if (r) setReport(r.data)
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <Field label="Report">
          <select aria-label="Report" className="form-input text-sm" value={key} onChange={(e) => { setKey(e.target.value); setReport(null) }}>
            {REPORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Property">
          <select aria-label="Property" className="form-input text-sm" value={params.property} onChange={(e) => setParams({ ...params, property: e.target.value })}>
            <option value="">All</option>{properties.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Portfolio">
          <select aria-label="Portfolio" className="form-input text-sm" value={params.portfolio} onChange={(e) => setParams({ ...params, portfolio: e.target.value })}>
            <option value="">All</option>{portfolios.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        {key === 'lease_expiry' && (
          <Field label="Months ahead"><input type="number" aria-label="Months ahead" className="form-input text-sm w-24" value={params.months} onChange={(e) => setParams({ ...params, months: e.target.value })} /></Field>
        )}
        {key === 'property_income' && (
          <>
            <Field label="From"><input type="date" aria-label="From" className="form-input text-sm" value={params.from_date} onChange={(e) => setParams({ ...params, from_date: e.target.value })} /></Field>
            <Field label="To"><input type="date" aria-label="To" className="form-input text-sm" value={params.to_date} onChange={(e) => setParams({ ...params, to_date: e.target.value })} /></Field>
          </>
        )}
        <button className="btn-primary text-xs" disabled={busy} onClick={run}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Run</button>
        <button className="btn-secondary text-xs" onClick={async () => { const r = await act(propmanAPI.reports.csv(key, clean())); if (r) saveBlob(r, `${key}.csv`) }}><FileDown size={14} /> CSV</button>
        <button className="btn-secondary text-xs" onClick={async () => {
          const name = await promptDialog({ title: 'Save report settings', label: 'Name', defaultValue: REPORTS.find(([v]) => v === key)[1], required: true, confirmLabel: 'Save' })
          if (name && await act(propmanAPI.savedReports.create({ name, report: key, params: clean(), schedule: 'none' }), 'Report saved.')) {
            queryClient.invalidateQueries({ queryKey: ['saved-reports'] })
          }
        }}><Save size={14} /> Save</button>
      </div>

      {report && (
        <div className="card overflow-x-auto">
          <h3 className="text-sm font-semibold text-white px-4 pt-3">{report.title}</h3>
          <table className="data-table">
            <thead><tr>{report.columns.map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
            <tbody>
              {report.rows.map((row, i) => <tr key={i}>{report.columns.map(([k]) => <td key={k} className="px-4 py-2 text-sm">{row[k] ?? ''}</td>)}</tr>)}
              {report.rows.length === 0 && <tr><td colSpan={report.columns.length} className="text-center py-6 text-dark-400 text-sm">No rows.</td></tr>}
              {report.totals && Object.keys(report.totals).length > 0 && (
                <tr className="font-semibold">{report.columns.map(([k], i) => <td key={k} className="px-4 py-2 text-sm text-white">{report.totals[k] ?? (i === 0 ? 'Total' : '')}</td>)}</tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <CrudTable title="Saved & scheduled reports" label="saved report" queryKey={['saved-reports']} api={propmanAPI.savedReports} canAdd={false}
        description="Scheduled reports are e-mailed as CSV to the recipients (weekly on Mondays or monthly on the 1st)."
        emptyText="Run a report and press Save to keep its settings."
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'report', label: 'Report', render: (r) => REPORTS.find(([v]) => v === r.report)?.[1] || r.report },
          { key: 'schedule', label: 'Schedule', render: (r) => label(r.schedule) },
          { key: 'recipients', label: 'Recipients' },
          { key: 'last_sent_on', label: 'Last sent', render: (r) => formatDate(r.last_sent_on) },
        ]}
        rowActions={(r) => (
          <button className="btn-ghost text-xs px-2 py-1" onClick={async () => {
            setKey(r.report)
            setParams({ property: '', portfolio: '', months: '12', from_date: '', to_date: '', ...r.params })
            const res = await act(propmanAPI.reports.run(r.report, r.params))
            if (res) setReport(res.data)
          }}>Run</button>
        )}
        fields={[
          { key: 'name', label: 'Name', required: true },
          { key: 'schedule', label: 'Schedule', type: 'select', options: [['none', 'Not scheduled'], ['weekly', 'Weekly (Mondays)'], ['monthly', 'Monthly (1st)']] },
          { key: 'recipients', label: 'Recipients (comma-separated e-mails)', span: 2 },
        ]} />
    </div>
  )
}

// ── Messages: bulk send, invoice / statement distribution, log ──────────────

export function MessagesTab() {
  const properties = useProperties()
  const portfolios = usePortfolios()
  const [msg, setMsg] = useState({ audience: 'tenants', property: '', portfolio: '', subject: '', body: '', email: true, sms: false })
  const [dist, setDist] = useState({ period_start: firstOfMonth(), from_date: firstOfMonth(), to_date: today() })
  const [busy, setBusy] = useState(false)
  const [channel, setChannel] = useState('')
  const queryClient = useQueryClient()
  const { data: log } = useQuery({ queryKey: ['messages', channel], queryFn: () => notificationsAPI.messages({ channel: channel || undefined, page_size: 50 }) })
  const scope = () => ({ property: msg.property || undefined, portfolio: msg.portfolio || undefined })
  const send = async (promise, success) => {
    setBusy(true)
    await act(promise, success)
    setBusy(false)
    queryClient.invalidateQueries({ queryKey: ['messages'] })
  }

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">Bulk message</h3>
          <div className="grid grid-cols-3 gap-2">
            <select aria-label="Audience" className="form-input text-sm" value={msg.audience} onChange={(e) => setMsg({ ...msg, audience: e.target.value })}>
              <option value="tenants">Tenants (active leases)</option><option value="owners">Owners</option>
            </select>
            <select aria-label="Property" className="form-input text-sm" value={msg.property} onChange={(e) => setMsg({ ...msg, property: e.target.value })}>
              <option value="">All properties</option>{properties.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select aria-label="Portfolio" className="form-input text-sm" value={msg.portfolio} onChange={(e) => setMsg({ ...msg, portfolio: e.target.value })}>
              <option value="">All portfolios</option>{portfolios.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <input aria-label="Subject" placeholder="Subject" className="form-input text-sm w-full" value={msg.subject} onChange={(e) => setMsg({ ...msg, subject: e.target.value })} />
          <textarea aria-label="Message" placeholder="Message" rows={4} className="form-input text-sm w-full" value={msg.body} onChange={(e) => setMsg({ ...msg, body: e.target.value })} />
          <div className="flex items-center gap-4">
            <label className="text-xs text-dark-300 flex items-center gap-1"><input type="checkbox" checked={msg.email} onChange={(e) => setMsg({ ...msg, email: e.target.checked })} /> E-mail</label>
            <label className="text-xs text-dark-300 flex items-center gap-1"><input type="checkbox" checked={msg.sms} onChange={(e) => setMsg({ ...msg, sms: e.target.checked })} /> SMS</label>
            <button className="btn-primary text-xs ml-auto" disabled={busy || !msg.subject || !msg.body || (!msg.email && !msg.sms)}
              onClick={() => send(propmanAPI.distribution.message({
                audience: msg.audience, subject: msg.subject, body: msg.body, ...scope(),
                channels: [msg.email && 'email', msg.sms && 'sms'].filter(Boolean),
              }), (r) => `Sent to ${r.data.recipients} recipient(s): ${Object.entries(r.data.by_status).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}.`)}>
              <Send size={14} /> Send
            </button>
          </div>
          <p className="text-[11px] text-dark-500">SMS is logged until an SMS provider is configured (SMS_BACKEND).</p>
        </div>

        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">Distribute documents</h3>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Invoices for period starting"><input type="date" aria-label="Invoice period" className="form-input text-sm" value={dist.period_start} onChange={(e) => setDist({ ...dist, period_start: e.target.value })} /></Field>
            <button className="btn-secondary text-xs" disabled={busy} onClick={() => send(propmanAPI.distribution.invoices({ period_start: dist.period_start, property: msg.property || undefined }),
              (r) => `E-mailed ${r.data.sent ?? 0} invoice(s), skipped ${r.data.skipped ?? 0}.`)}><Mail size={14} /> E-mail invoices</button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Statements from"><input type="date" aria-label="Statements from" className="form-input text-sm" value={dist.from_date} onChange={(e) => setDist({ ...dist, from_date: e.target.value })} /></Field>
            <Field label="to"><input type="date" aria-label="Statements to" className="form-input text-sm" value={dist.to_date} onChange={(e) => setDist({ ...dist, to_date: e.target.value })} /></Field>
            <button className="btn-secondary text-xs" disabled={busy} onClick={() => send(propmanAPI.distribution.statements({ audience: msg.audience, from_date: dist.from_date, to_date: dist.to_date, ...scope() }),
              (r) => `E-mailed ${r.data.sent} statement(s), skipped ${r.data.skipped} without an e-mail address.`)}><Mail size={14} /> E-mail {msg.audience === 'owners' ? 'owner' : 'tenant'} statements</button>
          </div>
          <p className="text-[11px] text-dark-500">Audience, property and portfolio come from the bulk message form.</p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-3">
          <h3 className="text-sm font-semibold text-white">Message log</h3>
          <select aria-label="Channel" className="form-input w-auto text-xs" value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">All channels</option><option value="email">E-mail</option><option value="sms">SMS</option>
          </select>
        </div>
        <table className="data-table">
          <thead><tr><th>When</th><th>Channel</th><th>To</th><th>Subject</th><th>Category</th><th>Status</th></tr></thead>
          <tbody>
            {rowsOf(log).map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-2 text-xs">{formatDateTime(m.created_at)}</td>
                <td className="px-4 py-2 text-xs uppercase">{m.channel}</td>
                <td className="px-4 py-2 text-xs">{m.recipient}</td>
                <td className="px-4 py-2 text-sm">{m.subject}</td>
                <td className="px-4 py-2 text-xs">{label(m.category)}</td>
                <td className="px-4 py-2"><Badge value={m.status} /></td>
              </tr>
            ))}
            {rowsOf(log).length === 0 && <tr><td colSpan={6} className="text-center py-6 text-dark-400 text-sm">No messages yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Contractor quotes on a maintenance job ──────────────────────────────────

export function MaintenanceQuotes({ ticket }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const suppliers = useOptions(['suppliers-all'], () => financeAPI.ap.suppliers.list({ page_size: 500 }), (s) => [s.id, s.name], open)
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['quotes'] })
    queryClient.invalidateQueries({ queryKey: ['rental-maintenance'] })
  }
  if (!open) {
    return <button className="btn-ghost text-xs px-2 py-1 mt-2" onClick={(e) => { e.stopPropagation(); setOpen(true) }}>Quotes</button>
  }
  return (
    <div className="mt-3" onClick={(e) => e.stopPropagation()}>
      <CrudTable label="quote" queryKey={['quotes']} api={propmanAPI.quotes} params={{ request: ticket.id }}
        title="Contractor quotes"
        description="Accepting a quote raises a purchase order. Above the owner-approval limit on a managed property, the owner approves it in the owner portal first."
        columns={[
          { key: 'supplier_name', label: 'Contractor' },
          { key: 'amount', label: 'Amount', align: 'right', render: (r) => money(r.amount) },
          { key: 'valid_until', label: 'Valid until', render: (r) => formatDate(r.valid_until) },
          { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
          { key: 'purchase_order_number', label: 'PO' },
        ]}
        rowActions={(r) => r.status === 'submitted' && (
          <>
            <button className="btn-ghost text-xs px-2 py-1 text-emerald-400" onClick={async () => { if (await act(propmanAPI.quotes.accept(r.id), (res) => res.data.status === 'awaiting_owner' ? 'Sent to the owner for approval.' : 'Quote accepted; purchase order raised.')) refresh() }}>Accept</button>
            <button className="btn-ghost text-xs px-2 py-1 text-rose-400" onClick={async () => { if (await act(propmanAPI.quotes.reject(r.id, ''), 'Quote rejected.')) refresh() }}>Reject</button>
          </>
        )}
        fields={[
          { key: 'supplier', label: 'Contractor', type: 'select', options: suppliers, required: true, span: 2 },
          { key: 'amount', label: 'Amount', type: 'number', required: true },
          { key: 'valid_until', label: 'Valid until', type: 'date' },
          { key: 'description', label: 'Scope / notes', type: 'textarea', span: 4 },
        ]} />
      <button className="btn-ghost text-xs mt-1" onClick={() => setOpen(false)}>Hide quotes</button>
    </div>
  )
}
