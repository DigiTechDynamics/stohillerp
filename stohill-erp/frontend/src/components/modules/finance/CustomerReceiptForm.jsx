import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { Save, AlertCircle, DollarSign, Wallet, Calendar } from 'lucide-react'
import { financeAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import { formatCurrency } from '@/utils/format'
import CurrencySelect from '@/components/common/CurrencySelect'

export default function CustomerReceiptForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel, sidePanelData } = useUIStore()
  const [error, setError] = useState(null)
  
  const [formData, setFormData] = useState({
    customer: sidePanelData?.customer?.id || '',
    bank_account: '',
    receipt_date: new Date().toISOString().split('T')[0],
    receipt_reference: '',
    amount: '0.00',
    currency: '',
    notes: ''
  })

  // Fetch Customers
  const { data: customersData } = useQuery({
    queryKey: ['ar-customers'],
    queryFn: () => financeAPI.ar.customers.list({ is_active: true }),
  })
  const customers = customersData?.data?.results || customersData?.data || []

  // Fetch Bank Accounts
  const { data: bankAccountsData } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => financeAPI.bank.accounts.list(),
  })
  const bankAccounts = bankAccountsData?.data?.results || bankAccountsData?.data || []

  const mutation = useMutation({
    mutationFn: async (payload) => {
      const res = await financeAPI.ar.receipts.create(payload)
      // Auto-post after creation
      await financeAPI.ar.receipts.post(res.data.id)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ar-receipts'] })
      queryClient.invalidateQueries({ queryKey: ['ar-customers'] })
      queryClient.invalidateQueries({ queryKey: ['finance-entries'] })
      closeSidePanel()
    },
    onError: (err) => {
      const resp = err.response?.data
      setError(resp?.detail || resp?.message || 'Failed to record and post receipt.')
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

  const selectedCustomer = customers.find(c => c.id === formData.customer)

  return (
    <div className="flex flex-col h-full bg-dark-900">
      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        <form id="ar-receipt-form" onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
              <Wallet size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Record Customer Receipt</h3>
              <p className="text-xs text-dark-500">Log a payment received from a customer.</p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2">
              <AlertCircle size={14} className="flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Customer *</label>
            <select 
              name="customer" 
              value={formData.customer} 
              onChange={handleChange} 
              required 
              className="form-input w-full"
            >
              <option value="">Select Customer</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name} (Balance: {formatCurrency(c.balance)})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <CurrencySelect 
              value={formData.currency}
              onChange={(val) => setFormData(prev => ({ ...prev, currency: val }))}
              label="Receipt Currency"
            />
          </div>

          {selectedCustomer && (
            <div className="p-4 rounded-xl bg-dark-800/50 border border-white/5 flex items-center justify-between">
              <span className="text-xs text-dark-400 font-medium uppercase tracking-wider">Current Balance Due:</span>
              <span className="text-sm font-bold text-white">{formatCurrency(selectedCustomer.balance)}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Deposit To *</label>
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
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Receipt Date *</label>
              <div className="relative">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
                <input 
                  type="date" 
                  name="receipt_date" 
                  value={formData.receipt_date} 
                  onChange={handleChange} 
                  required 
                  className="form-input w-full pl-9" 
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Amount Received *</label>
              <div className="relative">
                <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
                <input 
                  type="number" 
                  step="0.01"
                  name="amount" 
                  value={formData.amount} 
                  onChange={handleChange} 
                  required 
                  className="form-input w-full pl-9 text-lg font-bold text-emerald-400" 
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Receipt Reference</label>
              <input 
                type="text" 
                name="receipt_reference" 
                value={formData.receipt_reference} 
                onChange={handleChange} 
                placeholder="e.g. EFT-12345" 
                className="form-input w-full" 
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Internal Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              className="form-input w-full resize-none"
              placeholder="Record payment details or check numbers..."
            />
          </div>
        </form>
      </div>

      <div className="p-6 border-t border-white/5 bg-dark-800/30 flex gap-3">
        <button
          type="submit"
          form="ar-receipt-form"
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
