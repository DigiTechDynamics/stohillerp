import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { financeAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import { toast } from 'react-hot-toast'
import { Loader2, Calendar } from 'lucide-react'

export default function FiscalYearForm() {
  const { sidePanelData, closeSidePanel } = useUIStore()
  const queryClient = useQueryClient()
  const fiscalYear = sidePanelData?.fiscalYear

  const [formData, setFormData] = useState({
    name: fiscalYear?.name || '',
    start_date: fiscalYear?.start_date || '',
    end_date: fiscalYear?.end_date || ''
  })

  const mutation = useMutation({
    mutationFn: (data) => {
      if (fiscalYear?.id) {
        return financeAPI.fiscalYears.update(fiscalYear.id, data)
      }
      return financeAPI.fiscalYears.create(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] })
      toast.success(fiscalYear ? 'Fiscal year updated' : 'Fiscal year created')
      closeSidePanel()
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Operation failed')
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
          <label className="text-xs font-bold text-dark-500 uppercase tracking-wider">Fiscal Year Name</label>
          <input
            required
            type="text"
            className="form-input"
            placeholder="e.g. FY 2026 or 2026/27"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
          />
          <p className="text-[10px] text-dark-500 mt-1">
            Standard format: FY 2026 or 2026/27
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-dark-500 uppercase tracking-wider">Start Date</label>
            <input
              required
              type="date"
              className="form-input"
              value={formData.start_date}
              onChange={e => setFormData({ ...formData, start_date: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-dark-500 uppercase tracking-wider">End Date</label>
            <input
              required
              type="date"
              className="form-input"
              value={formData.end_date}
              onChange={e => setFormData({ ...formData, end_date: e.target.value })}
            />
          </div>
        </div>

        <div className="pt-6 border-t border-white/5 flex gap-3">
          <button type="button" onClick={closeSidePanel} className="flex-1 btn-secondary py-2">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 btn-primary py-2 flex items-center justify-center gap-2">
            {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Calendar size={16} />}
            {fiscalYear ? 'Update' : 'Create'} Year
          </button>
        </div>
      </form>
    </div>
  )
}
