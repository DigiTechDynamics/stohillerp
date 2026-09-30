// Stohill Properties - Lease Detail Panel
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Key, Building2, User, Calendar, DollarSign, TrendingUp,
  FileText, Edit3, AlertTriangle, CheckCircle2
} from 'lucide-react'
import { rentalsAPI } from '@/services/api'
import { formatCurrency, formatDate, getStatusColor } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import LeaseActions from './LeaseActions'

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
  const lease = sidePanelData?.lease
  const [adjusting, setAdjusting] = useState(false)
  const [newRental, setNewRental] = useState(lease?.monthly_rental || '')

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

  if (!lease) return null

  const escalatedAmount = parseFloat(lease.monthly_rental) * (1 + parseFloat(lease.rental_escalation_rate || 0) / 100)

  return (
    <div className="flex flex-col h-full bg-dark-900 overflow-y-auto scrollbar-hide">
      <div className="p-6 space-y-6">
        {/* Header Card */}
        <div className="bg-gradient-to-br from-primary/10 to-transparent rounded-2xl p-5 border border-primary/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary">
              <Key size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{lease.lease_number}</h3>
              <span className={`badge text-[10px] uppercase font-bold ${getStatusColor(lease.status)}`}>
                {lease.status?.replace(/_/g, ' ')}
              </span>
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

        <LeaseActions lease={lease} />

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
          <Edit3 size={16} /> Edit Lease
        </button>
        <button
          onClick={() => openSidePanel('rental-invoice-form', { lease })}
          className="flex-1 btn-secondary py-3 flex items-center justify-center gap-2"
        >
          <FileText size={16} /> Manual Invoice
        </button>
      </div>
    </div>
  )
}
