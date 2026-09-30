import { useState } from 'react'
import { Landmark, Calendar, Save, X } from 'lucide-react'
import { useUIStore } from '@/stores/authStore'
import { payrollAPI } from '@/services/api'

export default function PayrollRunForm({ data, onSuccess }) {
  const { closeSidePanel } = useUIStore()
  const [loading, setLoading] = useState(false)
  const isEdit = !!data?.id

  const [formData, setFormData] = useState({
    name: data?.name || '',
    period_start: data?.period_start || '',
    period_end: data?.period_end || '',
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (isEdit) {
        await payrollAPI.runs.update(data.id, formData)
      } else {
        await payrollAPI.runs.create(formData)
      }
      onSuccess?.()
      closeSidePanel()
    } catch (err) {
      console.error('Failed to save payroll run:', err)
      alert('Failed to save payroll run. Please check entries.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-dark-900">
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Landmark className="text-primary" size={20} />
          </div>
          <div>
            <h2 className="text-lg font-display text-white">
              {isEdit ? 'Edit Payroll Run' : 'New Payroll Run'}
            </h2>
            <p className="text-xs text-dark-400">Define payroll period and details</p>
          </div>
        </div>
        <button onClick={closeSidePanel} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
          <X size={20} className="text-dark-400" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        <div className="space-y-2">
          <label className="text-xs font-bold text-dark-400 uppercase tracking-widest">Run Name</label>
          <input
            type="text"
            required
            placeholder="e.g. March 2024 Monthly"
            className="w-full bg-dark-800 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary/50 transition-all font-body"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-dark-400 uppercase tracking-widest">Start Date</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-500" size={16} />
              <input
                type="date"
                required
                className="w-full bg-dark-800 border border-white/5 rounded-xl pl-12 pr-4 py-3 text-white focus:outline-none focus:border-primary/50 transition-all font-body"
                value={formData.period_start}
                onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-dark-400 uppercase tracking-widest">End Date</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-500" size={16} />
              <input
                type="date"
                required
                className="w-full bg-dark-800 border border-white/5 rounded-xl pl-12 pr-4 py-3 text-white focus:outline-none focus:border-primary/50 transition-all font-body"
                value={formData.period_end}
                onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
          <p className="text-xs text-primary leading-relaxed">
            <strong>Note:</strong> Creating a run is the first step. Once created, you can use the "Process" action to automatically generate payment items for all active employees and agents based on their base salary and approved commissions for this period.
          </p>
        </div>
      </form>

      <div className="p-6 border-t border-white/5 flex gap-3 bg-dark-900/50 backdrop-blur-md">
        <button
          type="button"
          onClick={closeSidePanel}
          className="flex-1 px-4 py-3 rounded-xl border border-white/5 text-white text-sm font-semibold hover:bg-white/5 transition-all"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          onClick={handleSubmit}
          className="flex-1 bg-primary text-dark-900 px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary-hover transition-all disabled:opacity-50"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-dark-900/30 border-t-dark-900 rounded-full animate-spin" />
          ) : (
            <>
              <Save size={18} />
              {isEdit ? 'Update Run' : 'Create Run'}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
