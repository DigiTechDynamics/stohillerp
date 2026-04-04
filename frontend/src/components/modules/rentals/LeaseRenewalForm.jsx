// Stohill Properties - Lease Renewal Form
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, DollarSign, RefreshCw, X } from 'lucide-react'
import { rentalsAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import { formatDate, formatCurrency } from '@/utils/format'

export default function LeaseRenewalForm() {
  const { sidePanelData, closeSidePanel } = useUIStore()
  const queryClient = useQueryClient()
  const lease = sidePanelData?.lease

  const [formData, setFormData] = useState({
    start_date: '',
    end_date: '',
    monthly_rental: lease?.monthly_rental || '',
  })

  const [error, setError] = useState(null)

  const renewalMutation = useMutation({
    mutationFn: (data) => rentalsAPI.leases.renew(lease.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-leases'] })
      queryClient.invalidateQueries({ queryKey: ['rental-stats'] })
      closeSidePanel()
    },
    onError: (err) => {
      setError(err.response?.data?.error || 'Failed to renew lease. Please check terms.')
    }
  })

  if (!lease) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    renewalMutation.mutate(formData)
  }

  return (
    <div className="flex flex-col h-full bg-dark-900 overflow-y-auto">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <RefreshCw size={20} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Renew Lease</h3>
              <p className="text-[10px] text-dark-500 uppercase">Agreement: {lease.lease_number}</p>
            </div>
          </div>
          <button onClick={closeSidePanel} className="text-dark-500 hover:text-white p-2">
            <X size={20} />
          </button>
        </div>

        {/* Current Context */}
        <div className="p-4 rounded-xl bg-dark-800/50 border border-white/5 grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-dark-500 uppercase mb-0.5">Current Rental</p>
            <p className="text-sm text-white font-medium">{formatCurrency(lease.monthly_rental, lease.currency_code || 'USD')}</p>
          </div>
          <div>
            <p className="text-[10px] text-dark-500 uppercase mb-0.5">Current End Date</p>
            <p className="text-sm text-white font-medium">{formatDate(lease.end_date)}</p>
          </div>
        </div>

        {/* Renewal Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-dark-500 uppercase mb-1.5 block">Renewal Start Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" size={16} />
                <input
                  type="date"
                  required
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="form-input pl-10"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-dark-500 uppercase mb-1.5 block">New End Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" size={16} />
                <input
                  type="date"
                  required
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="form-input pl-10"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-dark-500 uppercase mb-1.5 block">Updated Monthly Rental</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" size={16} />
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.monthly_rental}
                  onChange={(e) => setFormData({ ...formData, monthly_rental: e.target.value })}
                  className="form-input pl-10"
                  placeholder="0.00"
                />
              </div>
              <p className="text-[9px] text-dark-500 mt-1 italic">Leave as is to keep same rental amount.</p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              {error}
            </div>
          )}

          <div className="pt-6 border-t border-white/5 space-y-3">
            <button
              type="submit"
              disabled={renewalMutation.isPending}
              className="w-full btn-primary py-3 flex items-center justify-center gap-2"
            >
              <RefreshCw size={18} className={renewalMutation.isPending ? 'animate-spin' : ''} />
              {renewalMutation.isPending ? 'Processing Renewal...' : 'Finalize Renewal'}
            </button>
            <p className="text-[9px] text-center text-dark-500 px-4">
              Renewing will mark the current lease as "Renewed" and create a new "Active" agreement with the terms provided.
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
