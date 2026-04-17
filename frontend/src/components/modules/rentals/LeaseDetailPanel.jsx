// Stohill Properties - Lease Detail Panel
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Key, Building2, User, Calendar, DollarSign, TrendingUp,
  FileText, Edit3, AlertTriangle, CheckCircle2
} from 'lucide-react'
import { rentalsAPI } from '@/services/api'
import { formatCurrency, formatDate, getStatusColor } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import { useConfirmStore } from '@/stores/useConfirmStore'

function InfoRow({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[10px] text-dark-500 uppercase tracking-wider">{label}</span>
      <span className={`text-xs font-medium ${accent || 'text-white'}`}>{value || '—'}</span>
    </div>
  )
}

export default function LeaseDetailPanel() {
  const { sidePanelData, openSidePanel, closeSidePanel } = useUIStore()
  const queryClient = useQueryClient()
  const confirm = useConfirmStore((s) => s.confirm)
  const setContext = useUIStore((s) => s.setContext)
  const lease = sidePanelData?.lease

  useEffect(() => {
    if (lease?.id) {
      setContext('lease', lease.id)
    }
  }, [lease?.id, setContext])
  const [adjusting, setAdjusting] = useState(false)
  const [newRental, setNewRental] = useState(lease?.monthly_rental || '')
  const [postDeposit, setPostDeposit] = useState(true)

  // Invoices for this lease
  const { data: invRes } = useQuery({
    queryKey: ['lease-invoices', lease?.id],
    queryFn: () => rentalsAPI.invoices.list({ lease: lease.id }),
    enabled: !!lease?.id,
  })
  const invoices = invRes?.data?.results || []

  // Adjust rental mutation
  const adjustMutation = useMutation({
    mutationFn: () => rentalsAPI.leases.adjustRental(lease.id, newRental),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-leases'] })
      queryClient.invalidateQueries({ queryKey: ['rental-stats'] })
      setAdjusting(false)
    },
  })

  // Lifecycle Mutations
  const activateMutation = useMutation({
    mutationFn: () => rentalsAPI.leases.activate(lease.id, { post_deposit: postDeposit }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['rental-leases'] })
      queryClient.invalidateQueries({ queryKey: ['rental-stats'] })
      const { deposit_posted, journal_reference } = res.data
      if (deposit_posted) {
        alert(`Lease activated and Security Deposit recorded in General Ledger: ${journal_reference}`)
      } else {
        alert('Lease activated successfully.')
      }
      closeSidePanel()
    },
    onError: (err) => {
      alert(`Activation failed: ${err.response?.data?.error || err.message}`)
    }
  })

  const terminateMutation = useMutation({
    mutationFn: (data) => rentalsAPI.leases.terminate(lease.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-leases'] })
      queryClient.invalidateQueries({ queryKey: ['rental-stats'] })
      closeSidePanel()
    },
  })

  if (!lease) return null

  const escalatedAmount = parseFloat(lease.monthly_rental) * (1 + parseFloat(lease.rental_escalation_rate || 0) / 100)
  const commissionRate = 7.5 // Default management commission rate
  const commissionAmount = parseFloat(lease.monthly_rental) * (commissionRate / 100)

  const handleTerminate = async () => {
    const reason = window.prompt('Enter reason for early termination (optional):')
    const ok = await confirm({
      title: 'Terminate Lease',
      message: 'Are you sure you want to terminate this lease immediately? This will stop all future automated billing for this property.',
      confirmLabel: 'Terminate Now',
      type: 'danger'
    })
    if (ok) {
      terminateMutation.mutate({ reason })
    }
  }

  return (
    <div className="flex flex-col h-full bg-dark-900 overflow-y-auto scrollbar-hide">
      <div className="p-6 space-y-6">
        {/* Header Card */}
        <div className="bg-gradient-to-br from-primary/10 to-transparent rounded-2xl p-5 border border-primary/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary">
              <Key size={24} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">{lease.lease_number}</h3>
                <span className={`badge text-[10px] uppercase font-bold ${getStatusColor(lease.status)}`}>
                  {lease.status?.replace(/_/g, ' ')}
                </span>
              </div>
              {lease.previous_lease && (
                <p className="text-[9px] text-primary/60 uppercase font-bold tracking-tighter mt-1">
                  Agreement Renewal (Continuation)
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-dark-500 uppercase mb-0.5">Property</p>
              <p className="text-sm text-white font-medium">{lease.property_name}</p>
              <p className="text-[10px] text-dark-400">{lease.property_address}</p>
            </div>
            <div>
              <p className="text-[10px] text-dark-500 uppercase mb-0.5">Tenant</p>
              <p className="text-sm text-white font-medium">{lease.tenant_name}</p>
            </div>
          </div>
        </div>

        {/* Lifecycle Quick Actions (Contextual) */}
        {(lease.status === 'draft' || lease.status === 'pending_signature') && (
          <div className="space-y-3">
            {parseFloat(lease.deposit_amount || 0) > 0 && (
              <label className="flex items-center gap-3 p-3 rounded-xl bg-dark-800 border border-white/5 cursor-pointer hover:bg-dark-700 transition-colors">
                <input 
                  type="checkbox" 
                  checked={postDeposit} 
                  onChange={(e) => setPostDeposit(e.target.checked)}
                  className="w-4 h-4 rounded border-white/10 text-primary bg-dark-900 focus:ring-primary"
                />
                <div className="flex-1">
                  <p className="text-xs text-white font-medium">Record Security Deposit</p>
                  <p className="text-[10px] text-dark-500 uppercase tracking-tighter">Automatically post {formatCurrency(lease.deposit_amount)} to Trust Bank (GL) on activation.</p>
                </div>
              </label>
            )}
            <button 
              onClick={() => activateMutation.mutate()}
              disabled={activateMutation.isPending}
              className="w-full btn-primary py-3 flex items-center justify-center gap-2 shadow-gold group"
            >
              <CheckCircle2 size={16} className="group-hover:scale-110 transition-transform" /> 
              {activateMutation.isPending ? 'Processing...' : 'Fully Activate Lease'}
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {(lease.status === 'active' || lease.status === 'expired') && (
            <button 
              onClick={() => openSidePanel('lease-renewal-form', { lease })}
              className="btn-secondary py-2.5 text-xs font-bold flex items-center justify-center gap-2 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/5"
            >
              <TrendingUp size={14} /> Renew Lease
            </button>
          )}
          {lease.status === 'active' && (
            <button 
              onClick={handleTerminate}
              disabled={terminateMutation.isPending}
              className="btn-secondary py-2.5 text-xs font-bold flex items-center justify-center gap-2 border-red-500/20 text-red-400 hover:bg-red-500/5"
            >
              <AlertTriangle size={14} /> Terminate
            </button>
          )}
        </div>

        {/* Financial Summary */}
        <div className="space-y-1">
          <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest border-b border-white/5 pb-2 mb-2">
            Financial Details
          </h4>
          <InfoRow label="Monthly Rental" value={formatCurrency(parseFloat(lease.monthly_rental))} accent="text-emerald-400" />
          <InfoRow label="Escalation Rate" value={`${lease.rental_escalation_rate}%`} />
          <InfoRow label="Next Year Estimate" value={formatCurrency(escalatedAmount)} accent="text-dark-300" />
          <InfoRow label="Deposit" value={formatCurrency(parseFloat(lease.deposit_amount || 0))} />
          <InfoRow label="Deposit Paid" value={lease.deposit_paid ? 'Yes' : 'No'} accent={lease.deposit_paid ? 'text-emerald-400' : 'text-amber-400'} />
          <InfoRow label="VAT Applicable" value={lease.vat_applicable ? 'Yes' : 'No'} />

          {/* Adjust Rental */}
          {adjusting ? (
            <div className="mt-3 p-3 rounded-lg bg-dark-800 border border-white/5 space-y-2">
              <label className="text-[10px] font-bold text-dark-500 uppercase">New Monthly Rental</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={newRental}
                  onChange={(e) => setNewRental(e.target.value)}
                  className="form-input flex-1"
                />
                <button
                  onClick={() => adjustMutation.mutate()}
                  disabled={adjustMutation.isPending}
                  className="btn-primary px-4 text-xs"
                >
                  {adjustMutation.isPending ? '...' : 'Save'}
                </button>
                <button onClick={() => setAdjusting(false)} className="btn-ghost px-3 text-xs">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdjusting(true)}
              className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Edit3 size={12} /> Adjust Rental Fee
            </button>
          )}
        </div>

        {/* Commission */}
        <div className="space-y-1">
          <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest border-b border-white/5 pb-2 mb-2">
            Commission
          </h4>
          <InfoRow label="Commission Rate" value={`${commissionRate}%`} />
          <InfoRow label="Monthly Commission" value={formatCurrency(commissionAmount)} accent="text-emerald-400" />
          <InfoRow label="Annual Commission" value={formatCurrency(commissionAmount * 12)} accent="text-emerald-400" />
          {lease.agent_name && <InfoRow label="Managing Agent" value={lease.agent_name} />}
        </div>

        {/* Lease Terms */}
        <div className="space-y-1">
          <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest border-b border-white/5 pb-2 mb-2">
            Lease Terms
          </h4>
          <InfoRow label="Type" value={lease.lease_type?.replace(/_/g, ' ')} />
          <InfoRow label="Start Date" value={formatDate(lease.start_date)} />
          <InfoRow label="End Date" value={formatDate(lease.end_date)} />
          <InfoRow label="Notice Period" value={`${lease.notice_period_days} days`} />
          <InfoRow label="Invoice Day" value={`Day ${lease.invoice_day}`} />
          <InfoRow label="Payment Due" value={`${lease.payment_due_days} days after invoice`} />
        </div>

        {/* Invoice History */}
        <div className="space-y-2">
          <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest border-b border-white/5 pb-2 mb-2">
            Invoice History ({invoices.length})
          </h4>
          {invoices.length > 0 ? (
            <div className="space-y-2">
              {invoices.slice(0, 6).map((inv) => (
                <div key={inv.id} className="flex items-center justify-between p-2.5 rounded-lg bg-dark-800/50 border border-white/5">
                  <div>
                    <p className="text-xs text-white font-medium">{inv.invoice_number}</p>
                    <p className="text-[10px] text-dark-500">{formatDate(inv.period_start)} — {formatDate(inv.period_end)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-white font-semibold">{formatCurrency(parseFloat(inv.total_amount))}</p>
                    <span className={`text-[10px] uppercase font-bold ${getStatusColor(inv.status)}`}>
                      {inv.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-dark-500 text-center py-4">No invoices generated yet.</p>
          )}
        </div>

        {/* Notes */}
        {lease.notes && (
          <div className="space-y-1">
            <h4 className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Notes</h4>
            <p className="text-xs text-dark-400 bg-dark-800/50 p-3 rounded-lg">{lease.notes}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-6 border-t border-white/5 bg-dark-800/30 flex gap-3">
        <button
          onClick={() => openSidePanel('lease-form', { lease })}
          className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
        >
          <Edit3 size={16} /> Edit Details
        </button>
        <button
          onClick={() => openSidePanel('rental-invoice-form', { lease })}
          className="flex-1 btn-secondary py-3 flex items-center justify-center gap-2"
        >
          <FileText size={16} /> New Charge
        </button>
      </div>
    </div>
  )
}
