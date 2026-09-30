import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, AlertCircle, Briefcase } from 'lucide-react'
import { hrAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'

export default function DepartmentForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel, sidePanelData } = useUIStore()
  const [error, setError] = useState(null)
  
  const department = sidePanelData?.department
  const isEditing = !!department?.id

  const [formData, setFormData] = useState({
    name: department?.name || '',
    code: department?.code || '',
    manager: department?.manager || '',
  })

  const { data: empsData } = useQuery({
    queryKey: ['hr-employees-lite'],
    queryFn: () => hrAPI.employees.list({ page_size: 1000 }),
  })
  const employees = empsData?.data?.results || []

  const mutation = useMutation({
    mutationFn: (data) => 
      isEditing 
        ? hrAPI.departments.update(department.id, data)
        : hrAPI.departments.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-departments'] })
      closeSidePanel()
    },
    onError: (err) => {
      const resp = err.response?.data
      setError(resp?.error?.message || resp || 'An error occurred')
    }
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    mutation.mutate(formData)
  }

  return (
    <div className="flex flex-col h-full bg-dark-900">
      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        <form id="department-form" onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/20">
              <Briefcase size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{isEditing ? 'Edit Department' : 'New Department'}</h3>
              <p className="text-xs text-dark-500">Define organizational units and managers.</p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2">
              <AlertCircle size={14} className="flex-shrink-0" />
              <p>{typeof error === 'object' ? JSON.stringify(error) : error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Department Name</label>
              <input 
                name="name" 
                value={formData.name} 
                onChange={handleChange} 
                required 
                placeholder="e.g. Sales, Marketing, HR"
                className="form-input w-full" 
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Department Code</label>
              <input 
                name="code" 
                value={formData.code} 
                onChange={handleChange} 
                required 
                placeholder="e.g. SL, MK, HR"
                className="form-input w-full font-mono" 
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Department Manager</label>
              <select name="manager" value={formData.manager} onChange={handleChange} className="form-input w-full">
                <option value="">Select Manager</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
                ))}
              </select>
            </div>
          </div>
        </form>
      </div>

      <div className="p-6 border-t border-white/5 bg-dark-800/30 flex gap-3">
        <button
          type="submit"
          form="department-form"
          disabled={mutation.isPending}
          className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
        >
          {mutation.isPending ? 'Saving...' : <><Save size={18} /> {isEditing ? 'Update Department' : 'Create Department'}</>}
        </button>
        <button
          type="button"
          onClick={closeSidePanel}
          className="btn-secondary px-8 py-3"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
