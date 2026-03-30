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
            <div key={dept.id} className="group relative p-5 rounded-2xl bg-white/2 border border-white/5 hover:border-primary/30 transition-all duration-300">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-dark-800 flex items-center justify-center text-dark-400 group-hover:text-primary transition-colors">
                    <Users size={18} />
                  </div>
                  <div>
                    <h4 className="text-base font-semibold text-white group-hover:text-primary transition-colors">
                      {dept.name}
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                       <span className="text-[10px] font-mono text-dark-500 bg-dark-800 px-2 py-0.5 rounded border border-white/5">
                         {dept.code}
                       </span>
                       {dept.manager_name ? (
                         <p className="text-xs text-dark-400 flex items-center gap-1.5 ml-2">
                           <User size={12} className="text-primary/60" />
                           Manager: <span className="text-dark-200">{dept.manager_name}</span>
                         </p>
                       ) : (
                         <p className="text-xs text-dark-500 italic ml-2">No manager assigned</p>
                       )}
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => openPanel('department-form', { department: dept })}
                  className="p-2 rounded-lg bg-white/5 text-dark-500 hover:text-white hover:bg-white/10 transition-all opacity-0 group-hover:opacity-100"
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
