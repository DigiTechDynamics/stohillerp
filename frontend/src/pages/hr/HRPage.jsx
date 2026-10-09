// Stohill Properties - HR Management Page
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, User, Briefcase, MapPin, Mail, Phone } from 'lucide-react'
import { hrAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import DataManagementButtons from '@/components/common/DataManagementButtons'
import Pagination from '@/components/common/Pagination'
import RecordActions from '@/components/common/RecordActions'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { AttendanceTab, LeaveAllocationsTab } from '@/components/modules/hr/HRTabs'
import { SettingsButton } from '@/components/common/SettingsPage'
import StaffTypeBadge from '@/components/modules/hr/StaffTypeBadge'
import { LeaveBalancesTab } from '@/components/modules/hr/LeaveBalances'

const TABS = [['employees', 'Employees'], ['balances', 'Leave balances'], ['attendance', 'Attendance'], ['allocations', 'Leave allocations']]

export default function HRPage() {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('first_name')
  const [page, setPage] = useState(1)
  const [tab, setTab] = useState('employees')
  const [staffType, setStaffType] = useState('')
  const queryClient = useQueryClient()
  const openPanel = useUIStore((s) => s.openSidePanel)
  const location = useLocation()

  useEffect(() => {
    if (location.pathname === '/hr/leave-management') {
      openPanel('leave-management')
    }
  }, [location.pathname, openPanel])

  const { data, isLoading } = useQuery({
    queryKey: ['hr-employees', { search, ordering: sort, page, staffType }],
    queryFn: () => hrAPI.employees.list({ search, ordering: sort, page, ...(staffType ? { staff_type: staffType } : {}) }),
  })

  const { data: deptData } = useQuery({
    queryKey: ['hr-departments'],
    queryFn: () => hrAPI.departments.list(),
  })

  const employees = data?.data?.results || []
  const departments = deptData?.data?.results || []

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-white">Human Resources</h1>
          <p className="text-dark-400 text-sm mt-1">Manage staff, departments and leave</p>
        </div>
        <div className="flex items-center gap-3">
          <SettingsButton to="/hr/settings" />
          <DataManagementButtons 
            module="employees" 
            filters={{ search, ordering: sort, page }}
            onImportSuccess={() => queryClient.invalidateQueries({ queryKey: ['hr-employees'] })} 
          />
          <button className="btn-primary flex items-center gap-2" onClick={() => openPanel('employee-form')}>
            <Plus size={16} /> New Employee
          </button>
        </div>
      </div>

      {/* Departments Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {departments.map((dept) => (
          <button type="button" key={dept.id} onClick={() => openPanel('department-form', { department: dept })}
            title={dept.manager_name ? 'Change manager / view staff' : 'Add a manager'}
            className="card p-3 border-white/5 bg-dark-800/50 hover:border-primary/30 transition-all cursor-pointer group text-left">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-3 group-hover:scale-110 transition-transform">
              <Briefcase size={20} />
            </div>
            <p className="text-sm font-bold text-white truncate text-left">{dept.name}</p>
            <div className="flex flex-col items-start mt-1">
              <span className="text-[8px] text-dark-500 font-bold uppercase tracking-widest">Manager · {dept.employee_count ?? 0} staff</span>
              {dept.manager_name
                ? <p className="text-[10px] text-primary truncate w-full text-left">{dept.manager_name}</p>
                : <p className="text-[10px] text-amber-400 truncate w-full text-left flex items-center gap-1"><Plus size={10} /> Add manager</p>}
            </div>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/5" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === id ? 'border-primary text-primary' : 'border-transparent text-dark-400 hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'balances' && <LeaveBalancesTab />}
      {tab === 'attendance' && <AttendanceTab />}
      {tab === 'allocations' && <LeaveAllocationsTab />}

      {tab === 'employees' && (<>
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3 w-full max-w-lg">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
            <input
              type="text"
              placeholder="Search employees..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="form-input pl-9 w-full"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1) }}
            className="form-input w-auto min-w-[150px]"
          >
            <option value="first_name">Name (A-Z)</option>
            <option value="-first_name">Name (Z-A)</option>
            <option value="employee_number">ID (A-Z)</option>
            <option value="-created_at">Newest First</option>
          </select>
          <select aria-label="Staff type" value={staffType} onChange={(e) => { setStaffType(e.target.value); setPage(1) }}
            className="form-input w-auto min-w-[150px]">
            <option value="">All staff</option>
            <option value="employee">Company employees</option>
            <option value="agent">Agents</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-xs" onClick={() => openPanel('department-list')}>Manage Departments</button>
          <button className="btn-secondary text-xs" onClick={() => openPanel('leave-management')}>Manage Leave</button>
        </div>
      </div>

      {/* Main Content */}
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Employee Info</th>
              <th>Contact Info</th>
              <th>Type</th>
              <th>Dept / Role</th>
              <th>Location</th>
              <th>Status</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout">
              {employees.map((emp) => (
                <motion.tr
                  key={emp.id}
                  layout={false}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-white/2 transition-colors cursor-pointer"
                  onClick={() => openPanel('employee-detail', { employee: emp })}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-dark-700 flex items-center justify-center text-xs font-semibold text-primary border border-white/5">
                        {emp.full_name?.[0]}
                      </div>
                      <div>
                        <p className="text-sm text-white font-medium">{emp.full_name}</p>
                        <p className="text-xs text-dark-400 font-mono">{emp.employee_number}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-dark-300 space-y-1">
                    <div className="flex items-center gap-1.5"><Mail size={12} className="text-dark-500" /> {emp.email}</div>
                    <div className="flex items-center gap-1.5"><Phone size={12} className="text-dark-500" /> {emp.phone || '—'}</div>
                  </td>
                  <td className="px-4 py-3"><StaffTypeBadge employee={emp} /></td>
                  <td className="px-4 py-3 text-sm text-dark-300">
                    <p className="font-medium text-white">{emp.job_position_name}</p>
                    <p className="text-[10px] text-dark-500 uppercase">{emp.department_name}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-dark-300">
                    <div className="flex items-center gap-1.5"><MapPin size={12} className="text-dark-500" /> {emp.office_location || 'Main Office'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge text-[10px] uppercase
                      ${emp.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {emp.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RecordActions record={emp} label="employee" onEdit={() => openPanel('employee-form', { employee: emp })}
                      deleteFn={hrAPI.employees.delete} invalidate={['hr-employees']} />
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
            {employees.length === 0 && !isLoading && (
              <tr>
                <td colSpan={7} className="text-center py-20">
                  <User size={40} className="mx-auto mb-3 text-dark-600" />
                  <p className="text-dark-400">No staff records found.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination 
        currentPage={page}
        totalPages={data?.data?.total_pages}
        totalCount={data?.data?.count}
        onPageChange={setPage}
      />
      </>)}
    </div>
  )
}
