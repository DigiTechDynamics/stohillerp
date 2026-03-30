import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, X, Settings, Link as LinkIcon, AlertCircle } from 'lucide-react'
import { fixedAssetsAPI } from '@/services/api'
import AccountCombobox from '@/components/common/AccountCombobox'

export default function AssetCategoryForm({ category, onClose }) {
  const queryClient = useQueryClient()
  const isEditing = !!category

  const [formData, setFormData] = useState({
    code: category?.code || '',
    name: category?.name || '',
    description: category?.description || '',
    asset_cost_account: category?.asset_cost_account || '',
    accum_depr_account: category?.accum_depr_account || '',
    depr_expense_account: category?.depr_expense_account || '',
    disposal_gain_loss_account: category?.disposal_gain_loss_account || '',
  })

  const mutation = useMutation({
    mutationFn: (data) => 
      isEditing 
        ? fixedAssetsAPI.categories.update(category.id, data)
        : fixedAssetsAPI.categories.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-categories'] })
      onClose()
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    mutation.mutate(formData)
  }

  return (
    <div className="flex flex-col h-full bg-dark-900 text-white">
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{isEditing ? 'Edit Category' : 'New Asset Category'}</h2>
          <p className="text-dark-400 text-xs mt-1">Configure financial mappings for asset groups.</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-dark-400 transition-colors">
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {/* Identity */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Settings size={16} />
            <span className="text-xs font-bold uppercase tracking-widest">Category Identity</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Code</label>
              <input 
                type="text" 
                required 
                className="form-input w-full" 
                placeholder="e.g. IT"
                value={formData.code}
                onChange={e => setFormData({...formData, code: e.target.value})}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Category Name</label>
              <input 
                type="text" 
                required 
                className="form-input w-full" 
                placeholder="e.g. IT Equipment"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
          </div>
        </section>

        {/* GL Mappings */}
        <section className="space-y-6">
          <div className="flex items-center gap-2 text-emerald-500">
            <LinkIcon size={16} />
            <span className="text-xs font-bold uppercase tracking-widest">General Ledger Mappings</span>
          </div>
          
          <div className="bg-dark-800/50 p-5 rounded-2xl border border-white/5 space-y-5">
            <div className="space-y-1.5 text-xs">
              <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Asset Cost Account (Balance Sheet)</label>
              <AccountCombobox 
                value={formData.asset_cost_account}
                onChange={acc => setFormData({...formData, asset_cost_account: acc.id})}
              />
              <p className="text-[9px] text-dark-500 italic mt-1">Dr upon acquisition, Cr upon disposal.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Accumulated Depreciation (Contra-Asset)</label>
              <AccountCombobox 
                value={formData.accum_depr_account}
                onChange={acc => setFormData({...formData, accum_depr_account: acc.id})}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Depreciation Expense (P&L)</label>
              <AccountCombobox 
                value={formData.depr_expense_account}
                onChange={acc => setFormData({...formData, depr_expense_account: acc.id})}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Disposal Gain/Loss (P&L)</label>
              <AccountCombobox 
                value={formData.disposal_gain_loss_account}
                onChange={acc => setFormData({...formData, disposal_gain_loss_account: acc.id})}
              />
            </div>
          </div>
        </section>

        <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl flex gap-3">
          <AlertCircle className="text-orange-500 shrink-0" size={18} />
          <p className="text-[10px] text-orange-400 leading-relaxed">
            Changing these mappings will only affect future postings. Historical transactions will remain linked to their original accounts.
          </p>
        </div>
      </form>

      <div className="p-6 border-t border-white/5 bg-dark-900/80 backdrop-blur-xl flex items-center justify-end gap-3 mt-auto">
        <button 
          type="button"
          onClick={onClose}
          className="px-6 py-2.5 rounded-xl text-sm font-medium text-dark-400 hover:text-white transition-all"
        >
          Cancel
        </button>
        <button 
          onClick={handleSubmit}
          disabled={mutation.isPending}
          className="btn-primary px-8 py-2.5 flex items-center gap-2 shadow-lg shadow-primary/20"
        >
          <Save size={18} />
          {mutation.isPending ? 'Saving...' : 'Save Category'}
        </button>
      </div>
    </div>
  )
}
