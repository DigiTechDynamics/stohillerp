import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import { toast } from 'react-hot-toast'
import { Loader2, DollarSign } from 'lucide-react'

export default function CurrencyForm() {
  const { sidePanelData, closeSidePanel } = useUIStore()
  const queryClient = useQueryClient()
  const currency = sidePanelData?.currency

  const [formData, setFormData] = useState({
    code: currency?.code || '',
    name: currency?.name || '',
    symbol: currency?.symbol || '',
    is_base: currency?.is_base || false,
    is_active: currency?.is_active ?? true
  })

  const mutation = useMutation({
    mutationFn: (data) => {
      if (currency?.id) {
        return api.patch(`/finance/currencies/${currency.id}/`, data)
      }
      return api.post('/finance/currencies/', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['currencies'])
      toast.success(currency ? 'Currency updated' : 'Currency created')
      closeSidePanel()
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Operation failed')
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    mutation.mutate(formData)
  }

  return (
    <div className="p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-dark-500 uppercase tracking-wider">Currency Code</label>
          <input
            required
            type="text"
            className="form-input"
            placeholder="e.g. USD, ZAR"
            value={formData.code}
            onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
            maxLength={3}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-dark-500 uppercase tracking-wider">Name</label>
          <input
            required
            type="text"
            className="form-input"
            placeholder="e.g. US Dollar"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-dark-500 uppercase tracking-wider">Symbol</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. $"
            value={formData.symbol}
            onChange={e => setFormData({ ...formData, symbol: e.target.value })}
          />
        </div>

        <div className="flex items-center gap-6 pt-2">
          <label className="flex items-center gap-2 cursor-pointer group">
            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${formData.is_base ? 'bg-primary border-primary' : 'border-white/10 group-hover:border-primary/50'}`}>
              <input
                type="checkbox"
                className="hidden"
                checked={formData.is_base}
                onChange={e => setFormData({ ...formData, is_base: e.target.checked })}
              />
              {formData.is_base && <div className="w-1.5 h-1.5 rounded-full bg-dark-900" />}
            </div>
            <span className="text-sm text-dark-200">Base Currency</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer group">
            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${formData.is_active ? 'bg-green-500 border-green-500' : 'border-white/10 group-hover:border-green-500/50'}`}>
              <input
                type="checkbox"
                className="hidden"
                checked={formData.is_active}
                onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
              />
              {formData.is_active && <div className="w-1.5 h-1.5 rounded-full bg-dark-900" />}
            </div>
            <span className="text-sm text-dark-200">Active</span>
          </label>
        </div>

        <div className="pt-6 border-t border-white/5 flex gap-3">
          <button type="button" onClick={closeSidePanel} className="flex-1 btn-secondary py-2">Cancel</button>
          <button type="submit" disabled={mutation.isLoading} className="flex-1 btn-primary py-2 flex items-center justify-center gap-2">
            {mutation.isLoading ? <Loader2 size={16} className="animate-spin" /> : <DollarSign size={16} />}
            {currency ? 'Update' : 'Create'} Currency
          </button>
        </div>
      </form>
    </div>
  )
}
