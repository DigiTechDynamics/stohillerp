import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Wallet, Users } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { apiErrorMessage, bankingAPI, financeAPI, rentalsAPI, saveBlobResponse } from '@/services/api'
import { formatCurrency } from '@/utils/format'

const today = () => new Date().toISOString().split('T')[0]
const OPEN_STATUSES = ['logged', 'acknowledged', 'in_progress', 'pending_parts']

// Close a maintenance job: raise the contractor's bill and optionally recharge the tenant.
export function MaintenanceComplete({ ticket }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    actual_cost: ticket.estimated_cost || '', contractor: ticket.contractor || '',
    contractor_invoice_number: '', bill_to_tenant: false,
  })
  const { data: suppliersRes } = useQuery({
    queryKey: ['ap-suppliers-picker'],
    queryFn: () => financeAPI.ap.suppliers.list({ page_size: 200 }),
    enabled: open,
  })
  const suppliers = suppliersRes?.data?.results || []

  if (!OPEN_STATUSES.includes(ticket.status)) return null
  if (!open) {
    return (
      <button className="btn-secondary text-xs px-3 py-1.5" onClick={(e) => { e.stopPropagation(); setOpen(true) }}>
        Complete job
      </button>
    )
  }

  const submit = async () => {
    setBusy(true)
    try {
      const { data } = await rentalsAPI.maintenance.complete(ticket.id, form)
      toast.success(`Completed. Bill ${data.supplier_invoice} charged to ${data.charged_to}`
        + (data.recharge_invoice ? `; tenant recharge ${data.recharge_invoice}` : '') + '.')
      queryClient.invalidateQueries({ queryKey: ['rental-maintenance'] })
      setOpen(false)
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 grid grid-cols-2 lg:grid-cols-5 gap-2 items-center" onClick={(e) => e.stopPropagation()}>
      <select className="form-input text-xs" aria-label="Contractor" value={form.contractor}
        onChange={e => setForm({ ...form, contractor: e.target.value })}>
        <option value="">Contractor (supplier)...</option>
        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <input type="number" step="0.01" className="form-input text-xs" placeholder="Actual cost" aria-label="Actual cost"
        value={form.actual_cost} onChange={e => setForm({ ...form, actual_cost: e.target.value })} />
      <input className="form-input text-xs" placeholder="Contractor invoice #" aria-label="Contractor invoice number"
        value={form.contractor_invoice_number} onChange={e => setForm({ ...form, contractor_invoice_number: e.target.value })} />
      <label className="flex items-center gap-2 text-xs text-dark-400">
        <input type="checkbox" checked={form.bill_to_tenant} onChange={e => setForm({ ...form, bill_to_tenant: e.target.checked })} />
        Recharge tenant
      </label>
      <div className="flex gap-2">
        <button className="btn-primary text-xs px-3 py-1.5" disabled={busy || !form.contractor || !form.actual_cost} onClick={submit}>Complete</button>
        <button className="btn-ghost text-xs px-3 py-1.5" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  )
}

// Landlord trust balances, statements and payouts for managed properties.
export function OwnersTab() {
  const queryClient = useQueryClient()
  const [payout, setPayout] = useState(null)
  const [busy, setBusy] = useState(false)
  const { data, isLoading } = useQuery({ queryKey: ['rental-owners'], queryFn: () => rentalsAPI.owners.list() })
  const owners = data?.data?.results || []
  const { data: banksRes } = useQuery({
    queryKey: ['bank-accounts-picker'],
    queryFn: () => bankingAPI.accounts.list({ page_size: 100 }),
    enabled: !!payout,
  })
  const banks = banksRes?.data?.results || banksRes?.data || []

  const statement = async (owner) => {
    try {
      const to = today()
      const from = new Date(Date.now() - 90 * 864e5).toISOString().split('T')[0]
      saveBlobResponse(await rentalsAPI.owners.statementPdf(owner.id, { from_date: from, to_date: to }),
        `Owner_Statement_${owner.name}.pdf`)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not produce the statement.'))
    }
  }

  const pay = async () => {
    setBusy(true)
    try {
      const { data: res } = await rentalsAPI.owners.payout(payout.owner.id, {
        amount: payout.amount, bank_account: payout.bank_account, date: payout.date,
      })
      toast.success(`Paid ${formatCurrency(payout.amount)} to ${payout.owner.name} (${res.journal_entry}).`)
      queryClient.invalidateQueries({ queryKey: ['rental-owners'] })
      setPayout(null)
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card overflow-hidden">
      <table className="data-table">
        <thead>
          <tr>
            <th>Owner</th>
            <th>Properties</th>
            <th className="text-right">Held in trust</th>
            <th className="text-right">Not yet collected</th>
            <th className="text-right">Available to pay</th>
            <th className="w-48"></th>
          </tr>
        </thead>
        <tbody>
          {owners.map(owner => (
            <tr key={owner.id}>
              <td className="px-4 py-3 text-sm text-white font-medium">{owner.name}</td>
              <td className="px-4 py-3 text-xs text-dark-400 font-mono">{owner.properties.join(', ')}</td>
              <td className="px-4 py-3 text-sm text-right text-white">{formatCurrency(owner.balance)}</td>
              <td className="px-4 py-3 text-sm text-right text-dark-400">{formatCurrency(owner.uncollected)}</td>
              <td className="px-4 py-3 text-sm text-right text-emerald-400 font-semibold">{formatCurrency(owner.available_to_pay)}</td>
              <td className="px-4 py-3 text-right space-x-2">
                <button className="btn-ghost text-xs p-1.5" title="Statement (last 90 days)" onClick={() => statement(owner)}>
                  <Download size={14} className="inline" /> Statement
                </button>
                <button className="btn-secondary text-xs px-2 py-1" disabled={parseFloat(owner.available_to_pay) <= 0}
                  onClick={() => setPayout({ owner, amount: owner.available_to_pay, bank_account: '', date: today() })}>
                  <Wallet size={12} className="inline" /> Pay out
                </button>
              </td>
            </tr>
          ))}
          {owners.length === 0 && !isLoading && (
            <tr>
              <td colSpan={6} className="text-center py-16">
                <Users size={40} className="mx-auto mb-3 text-dark-600" />
                <p className="text-dark-400">No property owners yet. Link an owner to a managed property.</p>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {payout && (
        <div className="border-t border-white/5 p-4 grid grid-cols-2 lg:grid-cols-5 gap-2 items-center">
          <p className="text-xs text-dark-300">Pay {payout.owner.name}</p>
          <input type="number" step="0.01" className="form-input text-xs" aria-label="Payout amount" value={payout.amount}
            onChange={e => setPayout({ ...payout, amount: e.target.value })} />
          <select className="form-input text-xs" aria-label="Pay from bank account" value={payout.bank_account}
            onChange={e => setPayout({ ...payout, bank_account: e.target.value })}>
            <option value="">Pay from...</option>
            {banks.map(b => <option key={b.id} value={b.id}>{b.account_name || b.name} {b.currency_code ? `(${b.currency_code})` : ''}</option>)}
          </select>
          <input type="date" className="form-input text-xs" aria-label="Payout date" value={payout.date}
            onChange={e => setPayout({ ...payout, date: e.target.value })} />
          <div className="flex gap-2">
            <button className="btn-primary text-xs px-3 py-1.5" disabled={busy || !payout.bank_account || !payout.amount} onClick={pay}>Pay</button>
            <button className="btn-ghost text-xs px-3 py-1.5" onClick={() => setPayout(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
