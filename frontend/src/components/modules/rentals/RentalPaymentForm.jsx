// Stohil Properties - Rental Payment Form
import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, AlertCircle, DollarSign, Calculator, Info } from 'lucide-react'
import { rentalsAPI } from '@/services/api'
import { formatCurrency } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'

export default function RentalPaymentForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel, sidePanelData } = useUIStore()
  const [error, setError] = useState(null)

  // SidePanelData contains the invoice we are paying against
  const invoice = sidePanelData?.invoice

  const [formData, setFormData] = useState({
    invoice: invoice?.id || '',
    payment_date: new Date().toISOString().split('T')[0],
    amount: '',
    withholding_tax: '0.00',
    amount_from_balance: '0.00',
    payment_method: 'bank_transfer',
    reference: '',
    notes: '',
  })

  const [totalApplied, setTotalApplied] = useState(0)

  // Auto-calculate total applied payment
  useEffect(() => {
    const cash = parseFloat(formData.amount) || 0
    const tax = parseFloat(formData.withholding_tax) || 0
    const balance = parseFloat(formData.amount_from_balance) || 0
    setTotalApplied(cash + tax + balance)
  }, [formData.amount, formData.withholding_tax, formData.amount_from_balance])

  const mutation = useMutation({
    mutationFn: (data) => rentalsAPI.payments.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['rental-stats'] })
      closeSidePanel()
    },
    onError: (err) => {
      const resp = err.response?.data
      setError(resp?.error?.message || resp || 'Failed to record payment')
    },
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    
    // Basic validation
    if (totalApplied <= 0) {
      setError('Total payment amount must be greater than zero')
      return
    }

    mutation.mutate(formData)
  }

  return (
    <div className="flex flex-col h-full bg-dark-900 text-white">
      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        <form id="rental-payment-form" onSubmit={handleSubmit} className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/20">
              <DollarSign size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Record Rental Payment</h3>
              <p className="text-xs text-dark-500">Apply cash, tax credits, or balance deductions.</p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2">
              <AlertCircle size={14} className="flex-shrink-0" />
              <p>{typeof error === 'object' ? JSON.stringify(error) : error}</p>
            </div>
          )}

          {/* Invoice Summary */}
          {invoice && (
            <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-dark-400 uppercase font-bold tracking-wider">Invoice #</span>
                <span className="text-primary font-mono">{invoice.invoice_number}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-dark-400 uppercase font-bold tracking-wider">Tenant</span>
                <span className="text-white">{invoice.tenant_name}</span>
              </div>
              <div className="flex justify-between items-center text-sm pt-2 border-t border-white/5">
                <span className="text-dark-400 font-medium">Balance Due</span>
                <span className="text-red-400 font-bold">{formatCurrency(parseFloat(invoice.balance_due))}</span>
              </div>
            </div>
          )}

          {/* Payment Details */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest border-b border-white/5 pb-2">
              Payment Breakdown
            </h4>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Payment Date *</label>
                <input type="date" name="payment_date" value={formData.payment_date} onChange={handleChange} required className="form-input w-full" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Method *</label>
                <select name="payment_method" value={formData.payment_method} onChange={handleChange} required className="form-input w-full uppercase text-[10px] font-bold">
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            {/* Deduction Fields */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest flex items-center gap-1.5">
                  Amount Received (Cash/Bank) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500 text-xs">$</span>
                  <input type="number" step="0.01" name="amount" value={formData.amount} onChange={handleChange} required className="form-input w-full pl-7" placeholder="0.00" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                    Withholding Tax <Info size={10} title="Tax deducted by tenant at source" />
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500 text-xs">$</span>
                    <input type="number" step="0.01" name="withholding_tax" value={formData.withholding_tax} onChange={handleChange} className="form-input w-full pl-7 border-amber-500/20 focus:border-amber-500" placeholder="0.00" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                    From Tenant Balance <Info size={10} title="Deduct from existing credit/deposit" />
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500 text-xs">$</span>
                    <input type="number" step="0.01" name="amount_from_balance" value={formData.amount_from_balance} onChange={handleChange} className="form-input w-full pl-7 border-emerald-500/20 focus:border-emerald-500" placeholder="0.00" />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Reference / Receipt # *</label>
              <input type="text" name="reference" value={formData.reference} onChange={handleChange} required className="form-input w-full" placeholder="e.g. TRF-99221" />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Notes</label>
              <textarea name="notes" value={formData.notes} onChange={handleChange} rows={2} className="form-input w-full resize-none" placeholder="Optional payment details..." />
            </div>

            {/* Calculated Total Applied */}
            <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calculator size={16} className="text-primary" />
                  <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Total Applied to Invoice</span>
                </div>
                <span className="text-xl font-bold text-white">
                  {formatCurrency(totalApplied)}
                </span>
              </div>
              {invoice && totalApplied > parseFloat(invoice.balance_due) && (
                <p className="text-[10px] text-amber-400 mt-2 flex items-center gap-1">
                  <AlertCircle size={10} /> Note: Payment exceeds balance due. Residual will remain as credit.
                </p>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-white/5 bg-dark-800/30 flex gap-3">
        <button
          type="submit"
          form="rental-payment-form"
          disabled={mutation.isPending}
          className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
        >
          {mutation.isPending ? 'Recording...' : <><Save size={18} /> Record Payment</>}
        </button>
        <button type="button" onClick={closeSidePanel} className="btn-secondary px-8 py-3">
          Cancel
        </button>
      </div>
    </div>
  )
}
