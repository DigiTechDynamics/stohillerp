import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, AlertCircle, Percent, Hash, FileText } from 'lucide-react'
import { financeAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import { toast } from 'react-hot-toast'
import AccountCombobox from '@/components/common/AccountCombobox'

export default function TaxCodeForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel, sidePanelData } = useUIStore()
  const [error, setError] = useState(null)
  
  const taxCode = sidePanelData?.taxCode
  const isEditing = !!taxCode?.id

  const [formData, setFormData] = useState({
    code: taxCode?.code || '',
    name: taxCode?.name || '',
    rate: taxCode?.rate || '0.00',
    description: taxCode?.description || '',
    is_active: taxCode?.is_active ?? true,
    collected_account_obj: taxCode?.collected_account_obj || null, // We'll handle account objects in state
    paid_account_obj: taxCode?.paid_account_obj || null
  })

  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        rate: parseFloat(data.rate),
        collected_account: data.collected_account_obj?.id || null,
        paid_account: data.paid_account_obj?.id || null
      }
      delete payload.collected_account_obj
      delete payload.paid_account_obj
      
      return isEditing 
        ? financeAPI.tax.codes.update(taxCode.id, payload)
        : financeAPI.tax.codes.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-codes'] })
      toast.success(`Tax code ${isEditing ? 'updated' : 'created'} successfully`)
      closeSidePanel()
    },
    onError: (err) => {
      const resp = err.response?.data
      setError(resp?.detail || resp?.message || Object.values(resp || {}).flat()[0] || 'Failed to save tax code.')
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

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Tax Code *</label>
            <div className="relative">
              <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
              <input
                type="text"
                name="code"
                value={formData.code}
                onChange={handleChange}
                placeholder="e.g. VAT15"
                required
                className="form-input w-full pl-9 uppercase"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Rate (%) *</label>
            <div className="relative">
              <Percent size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
              <input
                type="number"
                step="0.01"
                name="rate"
                value={formData.rate}
                onChange={handleChange}
                placeholder="15.00"
                required
                className="form-input w-full pl-9"
              />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Display Name *</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g. Standard VAT (15%)"
            required
            className="form-input w-full"
          />
        </div>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest text-emerald-400">Captured VAT Account (Output)</label>
            <AccountCombobox 
              value={formData.collected_account_obj}
              onChange={(acc) => setFormData(prev => ({ ...prev, collected_account_obj: acc }))}
              placeholder="Search liability account..."
            />
            <p className="text-[9px] text-dark-500">Account used for tax collected on Sales.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest text-primary">Paid VAT Account (Input)</label>
            <AccountCombobox 
              value={formData.paid_account_obj}
              onChange={(acc) => setFormData(prev => ({ ...prev, paid_account_obj: acc }))}
              placeholder="Search asset account..."
            />
            <p className="text-[9px] text-dark-500">Account used for tax paid on Purchases.</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Description</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={2}
            className="form-input w-full resize-none"
            placeholder="Additional details about this tax code..."
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
              <span className="text-xs text-dark-300 group-hover:text-white transition-colors">Active Tax Code</span>
           </label>
        </div>

        <div className="pt-6 flex gap-3">
          <button 
            type="submit" 
            disabled={mutation.isPending}
            className="flex-1 btn-primary py-2.5 flex items-center justify-center gap-2"
          >
            {mutation.isPending ? 'Saving...' : <><Save size={16} /> {isEditing ? 'Update Tax Code' : 'Create Tax Code'}</>}
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
