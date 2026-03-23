import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { Save, AlertCircle, Landmark, CreditCard, DollarSign } from 'lucide-react'
import { bankingAPI, financeAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import CurrencySelect from '@/components/common/CurrencySelect'

export default function BankAccountForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel, sidePanelData } = useUIStore()
  const account = sidePanelData?.account
  const isEditing = !!account?.id
  const [error, setError] = useState(null)

  const [formData, setFormData] = useState({
    code: account?.code || '',
    bank_name: account?.bank_name || '',
    branch_code: account?.branch_code || '',
    account_number: account?.account_number || '',
    account_type: account?.account_type || 'current',
    currency: account?.currency || '',
    gl_account: account?.gl_account || '',
    opening_balance: account?.opening_balance || '0.00',
    is_active: account?.is_active ?? true,
  })

  // Fetch Chart of Accounts (filtered for bank-compatible accounts)
  const { data: accountsData } = useQuery({
    queryKey: ['finance-accounts-bank'],
    queryFn: () => financeAPI.accounts.list({ account_sub_type: 'bank' }),
  })
  const glAccounts = accountsData?.data?.results || []

  const mutation = useMutation({
    mutationFn: (data) => 
      isEditing 
        ? bankingAPI.accounts.update(account.id, data)
        : bankingAPI.accounts.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banking-accounts'] })
      closeSidePanel()
    },
    onError: (err) => {
      const resp = err.response?.data
      setError(resp?.detail || resp?.message || 'Failed to save bank account.')
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    mutation.mutate(formData)
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  return (
    <div className="flex flex-col h-full bg-dark-900">
      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        <form id="bank-account-form" onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/20">
              <Landmark size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{isEditing ? 'Edit Bank Account' : 'New Bank Account'}</h3>
              <p className="text-xs text-dark-500">Configure corporate banking connectivity.</p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2">
              <AlertCircle size={14} className="flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Internal Code *</label>
              <input
                type="text"
                name="code"
                value={formData.code}
                onChange={handleChange}
                placeholder="e.g. FNB-OPER-01"
                required
                className="form-input w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Account Type</label>
              <select 
                name="account_type" 
                value={formData.account_type} 
                onChange={handleChange} 
                className="form-input w-full"
              >
                <option value="current">Current/Checking</option>
                <option value="savings">Savings</option>
                <option value="credit">Credit Card</option>
                <option value="loan">Loan Account</option>
                <option value="investment">Investment</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Bank Name *</label>
            <input
              type="text"
              name="bank_name"
              value={formData.bank_name}
              onChange={handleChange}
              placeholder="e.g. First National Bank"
              required
              className="form-input w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Branch Code</label>
              <input
                type="text"
                name="branch_code"
                value={formData.branch_code}
                onChange={handleChange}
                className="form-input w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Account Number *</label>
              <input
                type="text"
                name="account_number"
                value={formData.account_number}
                onChange={handleChange}
                required
                className="form-input w-full font-mono"
              />
            </div>
          </div>

          <div className="p-5 bg-dark-800/50 rounded-2xl border border-white/5 space-y-4">
            <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2 flex items-center gap-2">
              <DollarSign size={12} /> Financial Setup
            </h4>
            
            <div className="grid grid-cols-1 gap-4">
              <CurrencySelect 
                value={formData.currency}
                onChange={(val) => setFormData(prev => ({ ...prev, currency: val }))}
                label="Account Currency"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">GL Control Account *</label>
              <select 
                name="gl_account" 
                value={formData.gl_account} 
                onChange={handleChange} 
                required 
                className="form-input w-full"
              >
                <option value="">Select GL Account</option>
                {glAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Opening Balance</label>
              <input
                type="number"
                name="opening_balance"
                value={formData.opening_balance}
                onChange={handleChange}
                step="0.01"
                className="form-input w-full"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 cursor-pointer group">
            <input 
              type="checkbox" 
              name="is_active"
              checked={formData.is_active}
              onChange={handleChange}
              className="form-checkbox bg-dark-800 border-white/10 rounded text-primary focus:ring-primary/20"
            />
            <span className="text-xs text-dark-400 group-hover:text-white transition-colors">Account is active for transactions</span>
          </div>
        </form>
      </div>

      <div className="p-6 border-t border-white/5 bg-dark-800/30 flex gap-3">
        <button
          type="submit"
          form="bank-account-form"
          disabled={mutation.isPending}
          className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
        >
          {mutation.isPending ? 'Saving...' : <><Save size={18} /> {isEditing ? 'Update Account' : 'Create Account'}</>}
        </button>
        <button type="button" onClick={closeSidePanel} className="btn-secondary px-8 py-3">
          Cancel
        </button>
      </div>
    </div>
  )
}
