import { useState, useEffect, useMemo } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { Check, Save, AlertCircle } from 'lucide-react'
import { financeAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'

const SUB_TYPE_OPTIONS = {
  asset: [
    { value: 'current_asset', label: 'Current Asset' },
    { value: 'fixed_asset', label: 'Fixed Asset' },
    { value: 'investment', label: 'Investment' },
    { value: 'bank', label: 'Bank / Cash' },
    { value: 'receivable', label: 'Accounts Receivable' },
  ],
  liability: [
    { value: 'current_liability', label: 'Current Liability' },
    { value: 'long_term_liability', label: 'Long-Term Liability' },
    { value: 'payable', label: 'Accounts Payable' },
    { value: 'tax_liability', label: 'Tax Liability' },
  ],
  equity: [
    { value: 'retained_earnings', label: 'Retained Earnings' },
    { value: 'share_capital', label: 'Share Capital' },
  ],
  revenue: [
    { value: 'operating_revenue', label: 'Operating Revenue' },
    { value: 'other_income', label: 'Other Income' },
  ],
  expense: [
    { value: 'operating_expense', label: 'Operating Expense' },
    { value: 'cost_of_sales', label: 'Cost of Sales' },
    { value: 'admin_expense', label: 'Administrative Expense' },
    { value: 'depreciation', label: 'Depreciation' },
  ]
}

const ENTRY_TYPE_OPTIONS = [
  { value: 'manual', label: 'Manual Entry' },
  { value: 'sales', label: 'Sales Transaction' },
  { value: 'rental', label: 'Rental Transaction' },
  { value: 'commission', label: 'Commission' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'depreciation', label: 'Depreciation' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'reversal', label: 'Reversal Entry' },
  { value: 'opening_balance', label: 'Opening Balance' },
]

export default function AccountForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel, sidePanelData } = useUIStore()
  const [error, setError] = useState(null)
  
  const account = sidePanelData?.account
  const isEditing = !!account?.id

  const [formData, setFormData] = useState({
    code: account?.code || '',
    name: account?.name || '',
    account_type: account?.account_type || 'asset',
    account_sub_type: account?.account_sub_type || 'current_asset',
    currency: account?.currency || '',
    description: account?.description || '',
    is_active: account?.is_active ?? true,
    allow_direct_posting: account?.allow_direct_posting ?? true,
    allow_manual_entry: account?.allow_manual_entry ?? true,
    allowed_transaction_types: account?.allowed_transaction_types || []
  })

  // Fetch Currencies
  const { data: currenciesData } = useQuery({
    queryKey: ['currencies'],
    queryFn: () => financeAPI.currencies.list(),
  })
  const currencies = useMemo(() => currenciesData?.data?.results || currenciesData?.data || [], [currenciesData])

  // Ensure default currency is set for new accounts
  useEffect(() => {
    if (!isEditing && !formData.currency && currencies.length > 0) {
      const base = currencies.find(c => c.is_base) || currencies[0]
      if (base) setFormData(prev => ({ ...prev, currency: base.id }))
    }
  }, [currencies, isEditing, formData.currency])

  // Update sub-type when type changes
  const handleTypeChange = (e) => {
    const newType = e.target.value
    setFormData(prev => ({
      ...prev,
      account_type: newType,
      account_sub_type: SUB_TYPE_OPTIONS[newType]?.[0]?.value || ''
    }))
  }

  const mutation = useMutation({
    mutationFn: (data) => 
      isEditing 
        ? financeAPI.accounts.update(account.id, data)
        : financeAPI.accounts.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-accounts'] })
      closeSidePanel()
    },
    onError: (err) => {
      const resp = err.response?.data
      const backendError = resp?.error?.message || resp
      
      if (backendError && typeof backendError === 'object') {
        const firstError = Object.values(backendError)[0]
        setError(Array.isArray(firstError) ? firstError[0] : JSON.stringify(firstError))
      } else if (resp?.error?.message && typeof resp.error.message === 'string') {
        setError(resp.error.message)
      } else {
        setError(`Failed to ${isEditing ? 'update' : 'create'} account. Please check the fields.`)
      }
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    mutation.mutate(formData)
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleTransactionTypeToggle = (typeValue) => {
    setFormData(prev => {
      const current = prev.allowed_transaction_types || []
      const updated = current.includes(typeValue)
        ? current.filter(t => t !== typeValue)
        : [...current, typeValue]
      return { ...prev, allowed_transaction_types: updated }
    })
  }

  return (
    <div className="p-6 space-y-6">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2">
            <AlertCircle size={14} className="flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Account Code</label>
            <input
              type="text"
              name="code"
              value={formData.code}
              onChange={handleChange}
              placeholder="e.g. 1000"
              required
              className="form-input w-full"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Type</label>
            <select
              name="account_type"
              value={formData.account_type}
              onChange={handleTypeChange}
              className="form-input w-full"
            >
              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
              <option value="equity">Equity</option>
              <option value="revenue">Revenue</option>
              <option value="expense">Expense</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Sub-Type</label>
          <select
            name="account_sub_type"
            value={formData.account_sub_type}
            onChange={handleChange}
            required
            className="form-input w-full"
          >
            {SUB_TYPE_OPTIONS[formData.account_type]?.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Account Name</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Petty Cash"
              required
              className="form-input w-full font-medium"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Currency</label>
            <select
              name="currency"
              value={formData.currency}
              onChange={handleChange}
              required
              className="form-input w-full"
            >
              <option value="">Select Currency</option>
              {currencies.map(c => (
                <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Description</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={3}
            className="form-input w-full resize-none"
            placeholder="Optional purpose of this account..."
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2">
           <label className="flex items-center gap-2 cursor-pointer group">
              <input 
                type="checkbox" 
                name="allow_direct_posting"
                checked={formData.allow_direct_posting}
                onChange={handleChange}
                className="hidden peer"
              />
              <div className="w-4 h-4 rounded border border-white/10 bg-dark-800 peer-checked:bg-primary peer-checked:border-primary transition-all flex items-center justify-center">
                <Check size={10} className="text-dark-900 opacity-0 peer-checked:opacity-100" />
              </div>
              <span className="text-xs text-dark-300 group-hover:text-white transition-colors">Direct Posting</span>
           </label>

           <label className="flex items-center gap-2 cursor-pointer group">
              <input 
                type="checkbox" 
                name="allow_manual_entry"
                checked={formData.allow_manual_entry}
                onChange={handleChange}
                className="hidden peer"
              />
              <div className="w-4 h-4 rounded border border-white/10 bg-dark-800 peer-checked:bg-primary peer-checked:border-primary transition-all flex items-center justify-center">
                <Check size={10} className="text-dark-900 opacity-0 peer-checked:opacity-100" />
              </div>
              <span className="text-xs text-dark-300 group-hover:text-white transition-colors">Allow Manual Entries</span>
           </label>
           
           <label className="flex items-center gap-2 cursor-pointer group">
              <input 
                type="checkbox" 
                name="is_active"
                checked={formData.is_active}
                onChange={handleChange}
                className="hidden peer"
              />
              <div className="w-4 h-4 rounded border border-white/10 bg-dark-800 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all flex items-center justify-center">
                <Check size={10} className="text-dark-900 opacity-0 peer-checked:opacity-100" />
              </div>
              <span className="text-xs text-dark-300 group-hover:text-white transition-colors">Account Active</span>
           </label>
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Allowed Transaction Types</label>
          <div className="p-3 rounded-xl bg-dark-800/50 border border-white/5 grid grid-cols-2 gap-2">
            {ENTRY_TYPE_OPTIONS.map(opt => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer group">
                <input 
                  type="checkbox"
                  checked={formData.allowed_transaction_types.includes(opt.value)}
                  onChange={() => handleTransactionTypeToggle(opt.value)}
                  className="hidden peer"
                />
                <div className="w-3.5 h-3.5 rounded border border-white/10 bg-dark-900 peer-checked:bg-primary/50 peer-checked:border-primary transition-all flex items-center justify-center">
                  <Check size={8} className="text-white opacity-0 peer-checked:opacity-100" />
                </div>
                <span className="text-[11px] text-dark-400 group-hover:text-dark-200 transition-colors">{opt.label}</span>
              </label>
            ))}
          </div>
          <p className="text-[10px] text-dark-500 italic">Leave empty to allow all transaction types.</p>
        </div>

        <div className="pt-6 flex gap-3">
          <button 
            type="submit" 
            disabled={mutation.isPending}
            className="flex-1 btn-primary py-2.5 flex items-center justify-center gap-2"
          >
            {mutation.isPending ? (isEditing ? 'Updating...' : 'Creating...') : <><Save size={16} /> {isEditing ? 'Update Account' : 'Save Account'}</>}
          </button>
          <button 
            type="button" 
            onClick={closeSidePanel}
            className="btn-secondary px-6 py-2.5"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
