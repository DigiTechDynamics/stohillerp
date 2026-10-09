import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, AlertCircle, Briefcase } from 'lucide-react'
import { hrAPI, apiErrorMessage } from '@/services/api'
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

  // Only employees with a manager profile can manage a department.
  const { data: mgrData } = useQuery({
    queryKey: ['hr-managers'],
    queryFn: () => hrAPI.employees.list({ is_manager: true, page_size: 500 }),
  })
  const managers = mgrData?.data?.results || []
  const { data: staffData } = useQuery({
    queryKey: ['hr-employees-lite', 'department', department?.id],
    queryFn: () => hrAPI.employees.list({ department: department.id, page_size: 500 }),
    enabled: isEditing,
  })
  const staff = staffData?.data?.results || []

  const mutation = useMutation({
    mutationFn: (data) => 
      isEditing 
        ? hrAPI.departments.update(department.id, data)
        : hrAPI.departments.create(data),
    onSuccess: () => {
      for (const key of ['hr-departments', 'hr-employees', 'hr-employees-lite', 'departments']) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
      closeSidePanel()
    },
    onError: (err) => setError(apiErrorMessage(err, 'An error occurred')),
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    mutation.mutate({ ...formData, manager: formData.manager || null })
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
              <p>{error}</p>
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
              <select name="manager" value={formData.manager || ''} onChange={handleChange} className="form-input w-full">
                <option value="">No manager yet</option>
                {managers.map(e => (
                  <option key={e.id} value={e.id}>{e.full_name}{e.job_position_name ? ` (${e.job_position_name})` : ''}</option>
                ))}
              </select>
              <p className="text-[11px] text-dark-400">
                {managers.length
                  ? 'Only employees with a manager profile are listed. Everyone in the department reports to this manager.'
                  : 'No employee has a manager profile yet: tick "Manager profile" on an employee (Job & Role tab) first.'}
              </p>
            </div>

            {isEditing && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Staff ({staff.length})</label>
                {staff.length === 0 && <p className="text-xs text-dark-500">Nobody is in this department yet.</p>}
                {staff.map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-xs py-1 border-b border-white/5">
                    <span className="text-dark-200">{e.full_name}</span>
                    <span className="text-dark-500">
                      {e.id === formData.manager ? 'Manager' : e.staff_type === 'agent' ? 'Agent' : 'Employee'}
                    </span>
                  </div>
                ))}
              </div>
            )}
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
