import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import { toast } from 'react-hot-toast'
import { Loader2, TrendingUp } from 'lucide-react'

export default function ExchangeRateForm() {
  const { sidePanelData, closeSidePanel } = useUIStore()
  const queryClient = useQueryClient()
  const rate = sidePanelData?.rate

  const { data: currenciesData } = useQuery({
    queryKey: ['currencies'],
    queryFn: () => api.get('/finance/currencies/').then(r => r.data)
  })

  const currencies = (currenciesData?.results || currenciesData || []).filter(c => !c.is_base)

  const [formData, setFormData] = useState({
    currency: rate?.currency || '',
    effective_date: rate?.effective_date || new Date().toISOString().split('T')[0],
    rate: rate?.rate || ''
  })

  const mutation = useMutation({
    mutationFn: (data) => {
      if (rate?.id) {
        return api.patch(`/finance/exchange-rates/${rate.id}/`, data)
      }
      return api.post('/finance/exchange-rates/', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['exchange-rates'])
      toast.success(rate ? 'Rate updated' : 'Rate captured')
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
          <label className="text-xs font-bold text-dark-500 uppercase tracking-wider">Currency</label>
          <select
            required
            className="form-input"
            value={formData.currency}
            onChange={e => setFormData({ ...formData, currency: e.target.value })}
          >
            <option value="">Select Currency</option>
            {currencies.map(c => (
              <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-dark-500 uppercase tracking-wider">Effective Date</label>
          <input
            required
            type="date"
            className="form-input"
            value={formData.effective_date}
            onChange={e => setFormData({ ...formData, effective_date: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-dark-500 uppercase tracking-wider">Exchange Rate (to Base)</label>
          <div className="relative">
            <input
              required
              type="number"
              step="0.000001"
              className="form-input pr-12"
              placeholder="0.000000"
              value={formData.rate}
              onChange={e => setFormData({ ...formData, rate: e.target.value })}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-dark-500 uppercase">
              1 Base =
            </div>
          </div>
          <p className="text-[10px] text-dark-500 mt-1">
            Example: If 1 USD = 19.50 ZAR and USD is Base, enter 19.50.
          </p>
        </div>

        <div className="pt-6 border-t border-white/5 flex gap-3">
          <button type="button" onClick={closeSidePanel} className="flex-1 btn-secondary py-2">Cancel</button>
          <button type="submit" disabled={mutation.isLoading} className="flex-1 btn-primary py-2 flex items-center justify-center gap-2">
            {mutation.isLoading ? <Loader2 size={16} className="animate-spin" /> : <TrendingUp size={16} />}
            {rate ? 'Update' : 'Capture'} Rate
          </button>
        </div>
      </form>
    </div>
  )
}
