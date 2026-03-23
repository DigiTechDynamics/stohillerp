import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { Save, AlertCircle, User, Hash, DollarSign } from 'lucide-react'
import { financeAPI, crmAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import CurrencySelect from '@/components/common/CurrencySelect'

export default function CustomerForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel, sidePanelData } = useUIStore()
  const [error, setError] = useState(null)
  
  const customer = sidePanelData?.customer
  const isEditing = !!customer?.id

  const [formData, setFormData] = useState({
    name: customer?.name || '',
    contact_link: customer?.contact_link || '',
    ar_account: customer?.ar_account || '',
    credit_limit: customer?.credit_limit || '0.00',
    tax_number: customer?.tax_number || '',
    email: customer?.email || '',
    phone: customer?.phone || '',
    address: customer?.address || '',
    is_active: customer?.is_active ?? true,
    currency: customer?.currency || '',
  })

  // Fetch AR Accounts
  const { data: accountsData } = useQuery({
    queryKey: ['finance-accounts', { sub_type: 'receivable' }],
    queryFn: () => financeAPI.accounts.list({ account_sub_type: 'receivable' }),
  })
  const arAccounts = accountsData?.data?.results || accountsData?.data || []

  // Fetch Contacts
  const { data: contactsData } = useQuery({
    queryKey: ['crm-contacts'],
    queryFn: () => crmAPI.contacts.list(),
  })
  const contacts = contactsData?.data?.results || contactsData?.data || []

  const mutation = useMutation({
    mutationFn: (data) => 
      isEditing 
        ? financeAPI.ar.customers.update(customer.id, data)
        : financeAPI.ar.customers.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ar-customers'] })
      closeSidePanel()
    },
    onError: (err) => {
      const resp = err.response?.data
      setError(resp?.detail || resp?.message || 'Failed to save customer.')
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

  return (
    <div className="p-6 space-y-6">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2">
            <AlertCircle size={14} className="flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Customer / Business Name</label>
          <div className="relative">
            <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Acme Corp"
              required
              className="form-input w-full pl-9"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Link to CRM Contact</label>
            <select
              name="contact_link"
              value={formData.contact_link}
              onChange={handleChange}
              className="form-input w-full"
            >
              <option value="">No Contact Link</option>
              {contacts.map(c => (
                <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">AR Control Account</label>
            <select
              name="ar_account"
              value={formData.ar_account}
              onChange={handleChange}
              required
              className="form-input w-full"
            >
              <option value="">Select Account</option>
              {arAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>[{acc.code}] {acc.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <CurrencySelect 
            value={formData.currency}
            onChange={(val) => setFormData(prev => ({ ...prev, currency: val }))}
            label="Default Currency"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Credit Limit</label>
            <div className="relative">
              <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
              <input
                type="number"
                step="0.01"
                name="credit_limit"
                value={formData.credit_limit}
                onChange={handleChange}
                className="form-input w-full pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Tax Number (VAT/GST)</label>
            <div className="relative">
              <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
              <input
                type="text"
                name="tax_number"
                value={formData.tax_number}
                onChange={handleChange}
                className="form-input w-full pl-9"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Email Address</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="form-input w-full"
              placeholder="customer@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Phone Number</label>
            <input
              type="text"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="form-input w-full"
              placeholder="+27..."
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Billing Address</label>
          <textarea
            name="address"
            value={formData.address}
            onChange={handleChange}
            rows={2}
            className="form-input w-full resize-none"
            placeholder="Street, City, Postal Code..."
          />
        </div>

        <div className="flex items-center gap-6 pt-2">
           <label className="flex items-center gap-2 cursor-pointer group">
              <input 
                type="checkbox" 
                name="is_active"
                checked={formData.is_active}
                onChange={handleChange}
                className="hidden peer"
              />
              <div className="w-4 h-4 rounded border border-white/10 bg-dark-800 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all flex items-center justify-center">
                <Save size={10} className="text-dark-900 opacity-0 peer-checked:opacity-100" />
              </div>
              <span className="text-xs text-dark-300 group-hover:text-white transition-colors">Active Customer</span>
           </label>
        </div>

        <div className="pt-6 flex gap-3">
          <button 
            type="submit" 
            disabled={mutation.isPending}
            className="flex-1 btn-primary py-2.5 flex items-center justify-center gap-2"
          >
            {mutation.isPending ? 'Saving...' : <><Save size={16} /> {isEditing ? 'Update Customer' : 'Save Customer'}</>}
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
