import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, Play, AlertCircle, Info, Calculator, CheckCircle2 } from 'lucide-react'
import { fixedAssetsAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import { formatDate } from '@/utils/format'
import { toast } from 'react-hot-toast'

export default function RunDepreciationForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel } = useUIStore()
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  
  const [formData, setFormData] = useState({
    end_date: new Date().toISOString().split('T')[0],
    description: `Depreciation run as at ${new Date().toLocaleDateString()}`,
    dry_run: false
  })

  const mutation = useMutation({
    mutationFn: (data) => fixedAssetsAPI.assets.runDepreciation(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['fixed-assets'])
      queryClient.invalidateQueries(['asset-transactions'])
      queryClient.invalidateQueries(['finance-entries'])
      setSuccess(true)
      toast.success('Depreciation run completed successfully')
      setTimeout(() => closeSidePanel(), 2000)
    },
    onError: (err) => {
      const resp = err.response?.data
      setError(resp?.error?.message || resp?.detail || resp || 'Failed to execute depreciation run')
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    mutation.mutate(formData)
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 mb-2">
          <CheckCircle2 size={40} />
        </div>
        <h3 className="text-xl font-bold text-white">Depreciation Completed</h3>
        <p className="text-dark-400 text-sm">Asset books have been updated and journal entries recorded.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-dark-900 text-white">
      {/* Header */}
      <div className="p-6 border-b border-white/5 bg-gradient-to-br from-primary/5 to-transparent">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/20">
            <Calculator size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Run Depreciation</h2>
            <p className="text-dark-400 text-xs">Calculate and post periodic depreciation entries.</p>
          </div>
        </div>
      </div>

      <form id="depreciation-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-3">
            <AlertCircle size={18} className="shrink-0" />
            <p>{typeof error === 'object' ? JSON.stringify(error) : error}</p>
          </div>
        )}

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest flex items-center gap-2">
              <Calendar size={12} className="text-primary" />
              Depreciation End Date
            </label>
            <input 
              type="date" 
              required
              className="form-input w-full text-lg py-3 font-semibold"
              value={formData.end_date}
              onChange={e => setFormData({ ...formData, end_date: e.target.value })}
            />
            <p className="text-[10px] text-dark-500 italic">Depreciation will be calculated from the last run date up to this date.</p>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Description / Batch Note</label>
            <input 
              type="text"
              placeholder="e.g. Monthly depreciation - March 2024"
              className="form-input w-full"
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div className="p-4 rounded-2xl bg-dark-800/50 border border-white/5 space-y-4">
             <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Simulate Run (Dry Run)</p>
                  <p className="text-[10px] text-dark-500">Calculate values without posting to GL.</p>
                </div>
                <div 
                  onClick={() => setFormData({ ...formData, dry_run: !formData.dry_run })}
                  className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${formData.dry_run ? 'bg-primary' : 'bg-dark-600'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${formData.dry_run ? 'translate-x-6' : 'translate-x-0'}`} />
                </div>
             </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl flex gap-3">
          <Info className="text-blue-500 shrink-0" size={18} />
          <div className="space-y-1">
            <p className="text-xs font-bold text-blue-400 uppercase tracking-wider">Process Overview</p>
            <p className="text-[10px] text-blue-300 leading-relaxed">
              This process will iterate through all active fixed assets, calculate depreciation according to their assigned methods (SL, RB, etc.), and generate balanced journal entries in the General Ledger.
            </p>
          </div>
        </div>
      </form>

      {/* Footer */}
      <div className="p-6 border-t border-white/5 bg-dark-900/80 backdrop-blur-xl flex items-center gap-3">
        <button 
          type="button"
          onClick={closeSidePanel}
          className="flex-1 px-6 py-3 rounded-xl text-sm font-medium text-dark-400 hover:text-white transition-all bg-dark-800 border border-white/5"
        >
          Cancel
        </button>
        <button 
          type="submit"
          form="depreciation-form"
          disabled={mutation.isPending}
          className="flex-[2] btn-primary py-3 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
        >
          {mutation.isPending ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Play size={18} />
              Execute Run
            </>
          )}
        </button>
      </div>
    </div>
  )
}
