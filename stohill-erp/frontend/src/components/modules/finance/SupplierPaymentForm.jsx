import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { Save, AlertCircle, DollarSign, Wallet, Calendar } from 'lucide-react'
import { financeAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import { formatCurrency } from '@/utils/format'
import CurrencySelect from '@/components/common/CurrencySelect'

export default function SupplierPaymentForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel, sidePanelData } = useUIStore()
  const [error, setError] = useState(null)
  
  const [formData, setFormData] = useState({
    supplier: sidePanelData?.supplier?.id || '',
    bank_account: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_reference: '',
    amount: '0.00',
    currency: '',
    notes: ''
  })

  // Fetch Suppliers
  const { data: suppliersData } = useQuery({
    queryKey: ['ap-suppliers'],
    queryFn: () => financeAPI.ap.suppliers.list({ is_active: true }),
  })
  const suppliers = suppliersData?.data?.results || suppliersData?.data || []

  // Fetch Bank Accounts 
  const { data: bankAccountsData } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => financeAPI.bank.accounts.list(),
  })
  const bankAccounts = bankAccountsData?.data?.results || bankAccountsData?.data || []

  const mutation = useMutation({
    mutationFn: async (payload) => {
      const res = await financeAPI.ap.payments.create(payload)
      // Auto-post after creation
      await financeAPI.ap.payments.post(res.data.id)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ap-payments'] })
      queryClient.invalidateQueries({ queryKey: ['ap-suppliers'] })
      queryClient.invalidateQueries({ queryKey: ['finance-entries'] })
      closeSidePanel()
    },
    onError: (err) => {
      const resp = err.response?.data
      setError(resp?.detail || resp?.message || 'Failed to record and post payment.')
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    mutation.mutate(formData)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const selectedSupplier = suppliers.find(s => s.id === formData.supplier)

  return (
    <div className="flex flex-col h-full bg-dark-900">
      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        <form id="ap-payment-form" onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-400 border border-amber-500/20">
              <Wallet size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Record Supplier Payment</h3>
              <p className="text-xs text-dark-500">Log an outgoing payment to a vendor.</p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2">
              <AlertCircle size={14} className="flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Supplier *</label>
            <select 
              name="supplier" 
              value={formData.supplier} 
              onChange={handleChange} 
              required 
              className="form-input w-full"
            >
              <option value="">Select Supplier</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name} (Balance: {formatCurrency(s.balance)})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <CurrencySelect 
              value={formData.currency}
              onChange={(val) => setFormData(prev => ({ ...prev, currency: val }))}
              label="Payment Currency"
            />
          </div>

          {selectedSupplier && (
            <div className="p-4 rounded-xl bg-dark-800/50 border border-white/5 flex items-center justify-between">
              <span className="text-xs text-dark-400 font-medium uppercase tracking-wider">Balance Owed:</span>
              <span className="text-sm font-bold text-white">{formatCurrency(selectedSupplier.balance)}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Pay From *</label>
              <select 
                name="bank_account" 
                value={formData.bank_account} 
                onChange={handleChange} 
                required 
                className="form-input w-full"
              >
                <option value="">Select Bank Account</option>
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>{b.bank_name} - {b.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Payment Date *</label>
              <div className="relative">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
                <input 
                  type="date" 
                  name="payment_date" 
                  value={formData.payment_date} 
                  onChange={handleChange} 
                  required 
                  className="form-input w-full pl-9" 
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Amount Paid *</label>
              <div className="relative">
                <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
                <input 
                  type="number" 
                  step="0.01"
                  name="amount" 
                  value={formData.amount} 
                  onChange={handleChange} 
                  required 
                  className="form-input w-full pl-9 text-lg font-bold text-white" 
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Reference / Check #</label>
              <input 
                type="text" 
                name="payment_reference" 
                value={formData.payment_reference} 
                onChange={handleChange} 
                placeholder="e.g. EFT-98765" 
                className="form-input w-full" 
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Internal Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              className="form-input w-full resize-none"
              placeholder="Record payment details..."
            />
          </div>
        </form>
      </div>

      <div className="p-6 border-t border-white/5 bg-dark-800/30 flex gap-3">
        <button
          type="submit"
          form="ap-payment-form"
          disabled={mutation.isPending}
          className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
        >
          {mutation.isPending ? 'Recording...' : <><Save size={18} /> Record & Post Payment</>}
        </button>
        <button type="button" onClick={closeSidePanel} className="btn-secondary px-8 py-3">
          Cancel
        </button>
      </div>
    </div>
  )
}
