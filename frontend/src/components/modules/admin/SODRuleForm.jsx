import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Save, Wand2, AlertTriangle, Info } from 'lucide-react'
import { adminAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'

export default function SODRuleForm({ id, initialData }) {
  const closePanel = useUIStore(s => s.closeSidePanel)
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    name: '',
    module_a: initialData?.module_a || '',
    module_b: initialData?.module_b || '',
    severity: initialData?.severity || 'critical',
    description: initialData?.description || '',
    ...initialData
  })

  const { data: modulesData, isLoading: isLoadingModules } = useQuery({
    queryKey: ['admin-modules'],
    queryFn: () => adminAPI.modules.list()
  })
  const modulesDataRaw = modulesData?.data
  const modules = Array.isArray(modulesDataRaw) ? modulesDataRaw : (modulesDataRaw?.results || [])

  const mutation = useMutation({
    mutationFn: (data) => id ? adminAPI.sodRules.update(id, data) : adminAPI.sodRules.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sod-rules'] })
      closePanel()
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formData.module_a || !formData.module_b) return
    mutation.mutate(formData)
  }

  return (
    <div className="flex flex-col h-full bg-dark-950">
      <div className="flex items-center justify-between p-4 border-b border-white/5 bg-dark-900/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-gold-sm">
            <Wand2 size={20} />
          </div>
          <div>
            <h2 className="text-lg font-display text-white">{id ? 'Edit SOD Rule' : 'New SOD Rule'}</h2>
            <p className="text-[10px] text-dark-400 uppercase tracking-widest font-bold">Conflict Policy</p>
          </div>
        </div>
        <button onClick={closePanel} className="btn-ghost p-2 rounded-full">
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        <div className="space-y-1.5">
          <label className="form-label">Rule Name</label>
          <input
            type="text"
            required
            className="form-input"
            placeholder="e.g. Sales vs AR Separation"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="form-label">Primary Module</label>
            <select 
              className="form-input"
              value={formData.module_a}
              onChange={e => setFormData({ ...formData, module_a: e.target.value })}
            >
              <option value="">Select module...</option>
              {modules.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="form-label">Conflicting Module</label>
            <select 
              className="form-input"
              value={formData.module_b}
              onChange={e => setFormData({ ...formData, module_b: e.target.value })}
            >
              <option value="">Select module...</option>
              {modules.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="form-label">Severity Level</label>
          <div className="grid grid-cols-3 gap-2">
            {['critical', 'warning', 'advisory'].map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setFormData({ ...formData, severity: level })}
                className={`
                  py-2 px-3 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all
                  ${formData.severity === level 
                    ? 'bg-primary border-primary text-dark-900 shadow-gold-sm' 
                    : 'bg-dark-900 border-white/5 text-dark-400 hover:border-white/10'}
                `}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="form-label">Reasoning / Description</label>
          <textarea
            className="form-input min-h-[100px] py-3"
            placeholder="Explain why these modules should not be accessed by the same user..."
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
          />
        </div>

        <div className="bg-orange-500/5 border border-orange-500/10 p-4 rounded-xl flex gap-3">
          <AlertTriangle className="text-orange-500 shrink-0" size={18} />
          <p className="text-[11px] text-dark-400 leading-relaxed">
            <span className="text-orange-500 font-bold block mb-1 uppercase tracking-tighter">Warning</span>
            Critical rules will prevent user saving if a conflict is detected. Warning rules will show a notice but allow bypass.
          </p>
        </div>
      </form>

      <div className="p-4 border-t border-white/5 bg-dark-900/50">
        <button
          onClick={handleSubmit}
          disabled={mutation.isPending || !formData.module_a || !formData.module_b}
          className="btn-primary w-full h-11"
        >
          {mutation.isPending ? 'Saving...' : id ? 'Save Policy' : 'Create SOD Policy'}
          {!mutation.isPending && <Save size={18} />}
        </button>
      </div>
    </div>
  )
}
