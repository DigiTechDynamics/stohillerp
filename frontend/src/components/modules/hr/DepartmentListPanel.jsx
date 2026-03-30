import { useQuery } from '@tanstack/react-query'
import { Building2, Plus, Edit2, Users } from 'lucide-react'
import { hrAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'

export default function DepartmentListPanel() {
  const openPanel = useUIStore(s => s.openSidePanel)
  
  const { data: deptsData, isLoading } = useQuery({
    queryKey: ['hr-departments'],
    queryFn: () => hrAPI.departments.list(),
  })
  
  const departments = deptsData?.data?.results || deptsData?.data || []

  return (
    <div className="flex flex-col h-full bg-dark-900">
      <div className="p-6 border-b border-white/5 bg-dark-800/50 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Building2 size={20} className="text-primary" /> Manage Departments
        </h2>
        <button onClick={() => openPanel('department-form')} className="btn-primary flex items-center gap-2 py-2">
          <Plus size={16} /> New Department
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide space-y-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-32 text-dark-400">Loading...</div>
        ) : departments.length === 0 ? (
          <div className="text-center py-20">
            <Building2 size={40} className="mx-auto mb-3 text-dark-600" />
            <p className="text-dark-400">No departments found.</p>
          </div>
        ) : (
          departments.map(dept => (
            <div key={dept.id} className="card p-4 space-y-3 hover:border-white/10 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                    {dept.name} <span className="badge text-[10px] bg-dark-800 text-dark-300">{dept.code}</span>
                  </h4>
                  {dept.manager && (
                    <p className="text-xs text-dark-400 mt-1 flex items-center gap-1.5">
                      <Users size={12} /> Required Manager Info Included
                    </p>
                  )}
                </div>
                <button 
                  onClick={() => openPanel('department-form', { department: dept })}
                  className="p-2 rounded-lg bg-white/5 text-dark-400 hover:text-white hover:bg-white/10 transition-colors"
                  title="Edit Department"
                >
                  <Edit2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
