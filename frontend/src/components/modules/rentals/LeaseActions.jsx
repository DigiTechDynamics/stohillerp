import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Receipt, PiggyBank, RefreshCcw, XCircle, ListPlus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { apiErrorMessage, rentalsAPI } from '@/services/api'
import { formatCurrency } from '@/utils/format'
import { confirmDialog } from '@/components/common/Dialogs'

const today = () => new Date().toISOString().split('T')[0]

function Section({ icon: Icon, title, children }) {
  return (
    <div className="space-y-2 bg-dark-800/50 border border-white/5 rounded-xl p-4">
      <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-2"><Icon size={12} /> {title}</h4>
      {children}
    </div>
  )
}

// Billing, deposits, renewal, termination and recurring charges for a lease.
export default function LeaseActions({ lease }) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [deposit, setDeposit] = useState({ amount: lease.deposit_amount || '', date: today() })
  const [arrears, setArrears] = useState('0')
  const [damages, setDamages] = useState('')
  const [renewal, setRenewal] = useState({ end_date: '', monthly_rental: '' })
  const [termination, setTermination] = useState({ termination_date: today(), reason: '' })
  const [charge, setCharge] = useState({ description: '', monthly_amount: '', charge_type: 'service_charge', vat_applicable: false })
  const [result, setResult] = useState(null)

  const { data: chargesData } = useQuery({
    queryKey: ['lease-charges', lease.id],
    queryFn: () => rentalsAPI.charges.list({ lease: lease.id }),
  })
  const charges = chargesData?.data?.results || []

  const refresh = () => {
    for (const key of ['rental-leases', 'lease-invoices', 'lease-charges', 'rental-invoices', 'rental-stats']) {
      queryClient.invalidateQueries({ queryKey: [key] })
    }
  }
  const run = async (fn, success) => {
    setBusy(true)
    try {
      const { data } = await fn()
      toast.success(typeof success === 'function' ? success(data) : success)
      refresh()
      return data
    } catch (error) {
      toast.error(apiErrorMessage(error))
      return null
    } finally {
      setBusy(false)
    }
  }
  const active = lease.status === 'active'

  return (
    <div className="space-y-4">
      {active && (
        <Section icon={Receipt} title="Billing">
          <p className="text-xs text-dark-400">Raise every invoice due up to today (rent, escalation and charges) and post it to AR.</p>
          <button className="btn-secondary text-xs w-full py-2" disabled={busy}
            onClick={() => run(() => rentalsAPI.leases.generateInvoices(lease.id, today()),
              d => d.created.length ? `Created ${d.created.join(', ')}` : 'Nothing was due.')}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : 'Bill now'}
          </button>
        </Section>
      )}

      <Section icon={PiggyBank} title={lease.deposit_paid ? 'Deposit held in trust' : 'Deposit'}>
        {!lease.deposit_paid ? (
          <div className="grid grid-cols-3 gap-2">
            <input type="number" step="0.01" className="form-input text-xs" aria-label="Deposit amount"
              value={deposit.amount} onChange={e => setDeposit({ ...deposit, amount: e.target.value })} />
            <input type="date" className="form-input text-xs" aria-label="Deposit date"
              value={deposit.date} onChange={e => setDeposit({ ...deposit, date: e.target.value })} />
            <button className="btn-secondary text-xs" disabled={busy || !deposit.amount}
              onClick={() => run(() => rentalsAPI.leases.recordDeposit(lease.id, deposit), 'Deposit received into trust.')}>Record</button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-dark-400">Held: {formatCurrency(lease.deposit_amount)}. Release it, keeping part against unpaid rent and damages.
              Damages default to the repair costs on the completed outgoing inspection.</p>
            <div className="grid grid-cols-3 gap-2">
              <input type="number" step="0.01" className="form-input text-xs" aria-label="Apply to arrears"
                placeholder="Apply to arrears" value={arrears} onChange={e => setArrears(e.target.value)} />
              <input type="number" step="0.01" className="form-input text-xs" aria-label="Keep for damages"
                placeholder="Damages (from inspection)" value={damages} onChange={e => setDamages(e.target.value)} />
              <button className="btn-secondary text-xs" disabled={busy}
                onClick={() => run(() => rentalsAPI.leases.refundDeposit(lease.id, {
                  applied_to_arrears: arrears || '0', date: today(), ...(damages !== '' ? { applied_to_damages: damages } : {}),
                }), d => `Refunded ${d.refunded}, applied ${d.applied_to_arrears} to arrears and ${d.applied_to_damages} to damages.`)}>Release deposit</button>
            </div>
          </div>
        )}
      </Section>

      <Section icon={ListPlus} title="Recurring charges">
        {charges.length === 0 && <p className="text-xs text-dark-500">No extra charges on this lease.</p>}
        {charges.map(c => (
          <div key={c.id} className="flex justify-between items-center text-xs">
            <span className="text-dark-300">{c.description}{c.vat_applicable ? ' (+VAT)' : ''}</span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-white">{formatCurrency(c.monthly_amount)}/mo</span>
              <button className="text-dark-500 hover:text-rose-400" aria-label={`Remove ${c.description}`} disabled={busy}
                onClick={() => run(() => rentalsAPI.charges.remove(c.id), 'Charge removed.')}><Trash2 size={12} /></button>
            </span>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <select className="form-input text-xs" aria-label="Charge type" value={charge.charge_type}
            onChange={e => setCharge({ ...charge, charge_type: e.target.value })}>
            <option value="service_charge">Service charge / levy</option>
            <option value="utilities">Utilities recovery</option>
            <option value="parking">Parking</option>
            <option value="insurance">Insurance recovery</option>
            <option value="other">Other</option>
          </select>
          <input className="form-input text-xs" placeholder="Description" aria-label="Charge description" value={charge.description}
            onChange={e => setCharge({ ...charge, description: e.target.value })} />
          <input type="number" step="0.01" className="form-input text-xs" placeholder="Monthly amount" aria-label="Charge amount"
            value={charge.monthly_amount} onChange={e => setCharge({ ...charge, monthly_amount: e.target.value })} />
          <label className="flex items-center gap-2 text-xs text-dark-400">
            <input type="checkbox" checked={charge.vat_applicable} onChange={e => setCharge({ ...charge, vat_applicable: e.target.checked })} /> VAT
          </label>
        </div>
        <button className="btn-secondary text-xs w-full py-2" disabled={busy || !charge.description || !charge.monthly_amount}
          onClick={async () => {
            if (await run(() => rentalsAPI.charges.create({ ...charge, lease: lease.id }), 'Charge added.')) {
              setCharge({ description: '', monthly_amount: '', charge_type: 'service_charge', vat_applicable: false })
            }
          }}>Add charge</button>
      </Section>

      {['active', 'expired'].includes(lease.status) && lease.end_date && (
        <Section icon={RefreshCcw} title="Renew">
          <div className="grid grid-cols-3 gap-2">
            <input type="date" className="form-input text-xs" aria-label="Renewal end date" value={renewal.end_date}
              onChange={e => setRenewal({ ...renewal, end_date: e.target.value })} />
            <input type="number" step="0.01" className="form-input text-xs" placeholder={`Rent (${lease.monthly_rental})`}
              aria-label="Renewal rent" value={renewal.monthly_rental} onChange={e => setRenewal({ ...renewal, monthly_rental: e.target.value })} />
            <button className="btn-secondary text-xs" disabled={busy || !renewal.end_date}
              onClick={() => run(() => rentalsAPI.leases.renew(lease.id, renewal), d => `Renewed as ${d.lease_number}.`)}>Renew</button>
          </div>
        </Section>
      )}

      {active && (
        <Section icon={XCircle} title="Terminate early">
          <div className="grid grid-cols-2 gap-2">
            <input type="date" className="form-input text-xs" aria-label="Termination date" value={termination.termination_date}
              onChange={e => setTermination({ ...termination, termination_date: e.target.value })} />
            <input className="form-input text-xs" placeholder="Reason" aria-label="Termination reason" value={termination.reason}
              onChange={e => setTermination({ ...termination, reason: e.target.value })} />
          </div>
          <button className="btn-secondary text-xs w-full py-2 text-rose-300" disabled={busy}
            onClick={async () => {
              if (!(await confirmDialog({ title: 'Terminate this lease?', message: 'Billed periods after the date will be credited.', confirmLabel: 'Terminate', tone: 'danger' }))) return
              setResult(await run(() => rentalsAPI.leases.terminate(lease.id, termination), 'Lease terminated.'))
            }}>Terminate lease</button>
          {result && (
            <div className="text-xs text-dark-300 space-y-1">
              {result.short_notice && <p className="text-amber-300">Less than the {lease.notice_period_days}-day notice period was given ({result.notice_days_given} days).</p>}
              {result.credits.map(c => <p key={c.credit_note}>Credit {c.credit_note}: {formatCurrency(c.amount)} on {c.invoice}</p>)}
              {parseFloat(result.deposit_held) > 0 && <p>Deposit of {formatCurrency(result.deposit_held)} still held - release it above.</p>}
            </div>
          )}
        </Section>
      )}
    </div>
  )
}
