// Stohill Properties - Rental Invoice Form
import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, AlertCircle, Receipt, Calculator } from 'lucide-react'
import { rentalsAPI } from '@/services/api'
import { formatCurrency } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'

export default function RentalInvoiceForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel, sidePanelData } = useUIStore()
  const [error, setError] = useState(null)

  // Pre-fill from lease if provided
  const lease = sidePanelData?.lease

  const [formData, setFormData] = useState({
    lease: lease?.id || '',
    period_start: '',
    period_end: '',
    due_date: '',
    rental_amount: lease?.monthly_rental || '',
    vat_amount: '0.00',
    late_payment_fee: '0.00',
    total_amount: '',
    balance_due: '',
    status: 'sent',
  })

  // Fetch leases for dropdown
  const { data: leasesRes } = useQuery({
    queryKey: ['rental-leases-lite'],
    queryFn: () => rentalsAPI.leases.list({ status: 'active', page_size: 500 }),
  })
  const leases = leasesRes?.data?.results || []
  const leasesLoaded = !!leasesRes

  // Auto-calculate totals
  useEffect(() => {
    const rental = parseFloat(formData.rental_amount) || 0
    const vat = parseFloat(formData.vat_amount) || 0
    const lateFee = parseFloat(formData.late_payment_fee) || 0
    const total = rental + vat + lateFee
    setFormData((prev) => ({
      ...prev,
      total_amount: total.toFixed(2),
      balance_due: total.toFixed(2),
    }))
  }, [formData.rental_amount, formData.vat_amount, formData.late_payment_fee])

  // Auto-fill rental amount when lease changes
  const handleLeaseChange = (leaseId) => {
    const selected = leases.find((l) => String(l.id) === String(leaseId))
    setFormData((prev) => ({
      ...prev,
      lease: leaseId,
      rental_amount: selected?.monthly_rental || prev.rental_amount,
    }))
  }

  const mutation = useMutation({
    mutationFn: (data) => rentalsAPI.invoices.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['rental-stats'] })
      closeSidePanel()
    },
    onError: (err) => {
      const resp = err.response?.data
      setError(resp?.error?.message || resp || 'Failed to create invoice')
    },
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === 'lease') {
      handleLeaseChange(value)
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }))
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    mutation.mutate(formData)
  }

  return (
    <div className="flex flex-col h-full bg-dark-900">
      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        <form id="rental-invoice-form" onSubmit={handleSubmit} className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
              <Receipt size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">New Rental Invoice</h3>
              <p className="text-xs text-dark-500">Generate an invoice for a lease period.</p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2">
              <AlertCircle size={14} className="flex-shrink-0" />
              <p>{typeof error === 'object' ? JSON.stringify(error) : error}</p>
            </div>
          )}

          {/* Lease Selection */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Lease *</label>
              <select name="lease" value={formData.lease} onChange={handleChange} required className="form-input w-full">
                <option value="">Select Lease</option>
                {leases.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.lease_number} — {l.property_name} ({l.tenant_name})
                  </option>
                ))}
              </select>
              {leasesLoaded && leases.length === 0 && (
                <p className="text-xs text-amber-400">
                  No active leases. Only active leases can be invoiced: open the lease and set its status to Active.
                </p>
              )}
            </div>

            {lease && (
              <div className="p-3 rounded-lg bg-dark-800/50 border border-white/5 text-xs space-y-1">
                <p className="text-dark-400">Property: <span className="text-white">{lease.property_name}</span></p>
                <p className="text-dark-400">Tenant: <span className="text-white">{lease.tenant_name}</span></p>
                <p className="text-dark-400">Monthly Rate: <span className="text-emerald-400 font-semibold">{formatCurrency(parseFloat(lease.monthly_rental))}</span></p>
              </div>
            )}
          </div>

          {/* Period */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest border-b border-white/5 pb-2">
              Invoice Period
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Period Start *</label>
                <input type="date" name="period_start" value={formData.period_start} onChange={handleChange} required className="form-input w-full" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Period End *</label>
                <input type="date" name="period_end" value={formData.period_end} onChange={handleChange} required className="form-input w-full" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Due Date *</label>
              <input type="date" name="due_date" value={formData.due_date} onChange={handleChange} required className="form-input w-full" />
            </div>
          </div>

          {/* Amounts */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest border-b border-white/5 pb-2">
              Amounts
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Rental Amount *</label>
                <input type="number" step="0.01" name="rental_amount" value={formData.rental_amount} onChange={handleChange} required className="form-input w-full" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">VAT Amount</label>
                <input type="number" step="0.01" name="vat_amount" value={formData.vat_amount} onChange={handleChange} className="form-input w-full" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Late Payment Fee</label>
              <input type="number" step="0.01" name="late_payment_fee" value={formData.late_payment_fee} onChange={handleChange} className="form-input w-full" />
            </div>

            {/* Calculated Total */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calculator size={16} className="text-emerald-400" />
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Invoice Total</span>
                </div>
                <span className="text-xl font-bold text-white">
                  {formatCurrency(parseFloat(formData.total_amount) || 0)}
                </span>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-white/5 bg-dark-800/30 flex gap-3">
        <button
          type="submit"
          form="rental-invoice-form"
          disabled={mutation.isPending}
          className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
        >
          {mutation.isPending ? 'Creating...' : <><Save size={18} /> Create Invoice</>}
        </button>
        <button type="button" onClick={closeSidePanel} className="btn-secondary px-8 py-3">
          Cancel
        </button>
      </div>
    </div>
  )
}
