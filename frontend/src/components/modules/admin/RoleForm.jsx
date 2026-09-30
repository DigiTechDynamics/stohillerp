import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Save, Shield, LayoutGrid } from 'lucide-react'
import { adminAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'

export default function RoleForm({ id, initialData }) {
  const closePanel = useUIStore(s => s.closeSidePanel)
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    name: '',
    role_type: '',
    description: '',
    module_ids: initialData?.modules?.map(m => m.id) || [],
    ...initialData
  })

  const { data: modulesData } = useQuery({
    queryKey: ['admin-modules'],
    queryFn: () => adminAPI.modules.list()
  })
  const modulesDataRaw = modulesData?.data
  const modules = Array.isArray(modulesDataRaw) ? modulesDataRaw : (modulesDataRaw?.results || [])

  const mutation = useMutation({
    mutationFn: (data) => id ? adminAPI.roles.update(id, data) : adminAPI.roles.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-roles'] })
      closePanel()
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    mutation.mutate(formData)
  }

  const toggleModule = (moduleId) => {
    setFormData(prev => ({
      ...prev,
      module_ids: prev.module_ids.includes(moduleId)
        ? prev.module_ids.filter(mid => mid !== moduleId)
        : [...prev.module_ids, moduleId]
    }))
  }

  return (
    <div className="flex flex-col h-full bg-dark-950">
      <div className="flex items-center justify-between p-4 border-b border-white/5 bg-dark-900/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-gold-sm">
            <Shield size={20} />
          </div>
          <div>
            <h2 className="text-lg font-display text-white">{id ? 'Edit Role' : 'New Role'}</h2>
            <p className="text-[10px] text-dark-400 uppercase tracking-widest font-bold">Permissions Definition</p>
          </div>
        </div>
        <button onClick={closePanel} className="btn-ghost p-2 rounded-full">
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        <section className="space-y-4">
          <div className="space-y-1.5">
            <label className="form-label">Role Name</label>
            <input
              type="text"
              required
              className="form-input"
              placeholder="e.g. Finance Auditor"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <label className="form-label">Role Code / Type</label>
            <input
              type="text"
              required
              className="form-input font-mono text-xs"
              placeholder="e.g. finance_auditor"
              value={formData.role_type}
              onChange={e => setFormData({ ...formData, role_type: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <label className="form-label">Description</label>
            <textarea
              className="form-input min-h-[80px] py-3"
              placeholder="Describe the responsibilities of this role..."
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-white/50 mb-2">
            <LayoutGrid size={14} />
            <span className="text-xs font-semibold uppercase tracking-wider">Module Access</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {modules.map(module => (
              <div 
                key={module.id}
                onClick={() => toggleModule(module.id)}
                className={`
                  p-2.5 rounded-lg border cursor-pointer transition-all flex items-center gap-2.5
                  ${formData.module_ids.includes(module.id) 
                    ? 'bg-primary/5 border-primary/30' 
                    : 'bg-dark-900/30 border-white/5 hover:border-white/10'}
                `}
              >
                <div className={`p-1.5 rounded-md ${formData.module_ids.includes(module.id) ? 'bg-primary text-dark-900' : 'bg-dark-800 text-dark-400'}`}>
                  <LayoutGrid size={14} />
                </div>
                <span className={`text-xs font-medium ${formData.module_ids.includes(module.id) ? 'text-white' : 'text-dark-400'}`}>
                  {module.name}
                </span>
              </div>
            ))}
          </div>
        </section>
      </form>

      <div className="p-4 border-t border-white/5 bg-dark-900/50">
        <button
          onClick={handleSubmit}
          disabled={mutation.isPending}
          className="btn-primary w-full h-11"
        >
          {mutation.isPending ? 'Saving...' : id ? 'Save Changes' : 'Create Role'}
          {!mutation.isPending && <Save size={18} />}
        </button>
      </div>
    </div>
  )
}
