// Stohill Properties - Agent Management Page
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, User, Briefcase, MapPin, Mail, Phone, Filter, MoreVertical, BadgeCheck } from 'lucide-react'
import { hrAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'

import DataManagementButtons from '@/components/common/DataManagementButtons'
import Pagination from '@/components/common/Pagination'
import { useQueryClient } from '@tanstack/react-query'

export default function AgentsPage() {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('first_name')
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()
  const openPanel = useUIStore((s) => s.openSidePanel)

  const { data, isLoading } = useQuery({
    queryKey: ['hr-employees', { search, ordering: sort, page }],
    queryFn: () => hrAPI.employees.list({ search, ordering: sort, page }),
  })

  // Filter to just show agents if possible based on job_title or department
  const employees = data?.data?.results || []
  // For now, we assume this page acts as the dedicated Agent view
  const agents = employees.filter(emp => emp.job_title?.toLowerCase().includes('agent') || emp.department_name?.toLowerCase().includes('agent') || true); // fallback to all for now

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-white">Agent Profiles</h1>
          <p className="text-dark-400 text-sm mt-1">Manage field agents and brokers</p>
        </div>
        <div className="flex items-center gap-3">
          <DataManagementButtons 
            module="agents" 
            onImportSuccess={() => queryClient.invalidateQueries({ queryKey: ['hr-agents'] })} 
          />
          <button className="btn-primary flex items-center gap-2" onClick={() => openPanel('employee-form')}>
            <Plus size={16} /> New Agent
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3 w-full max-w-lg">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
            <input
              type="text"
              placeholder="Search agents..."
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
        </div>
      </div>

      {/* Main Content */}
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Agent Name</th>
              <th>Contact Info</th>
              <th>Role</th>
              <th>Location</th>
              <th>Status</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout">
              {agents.map((emp) => (
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
                        {emp.first_name?.[0]}{emp.last_name?.[0]}
                      </div>
                      <div>
                        <p className="text-sm text-white font-medium">{emp.first_name} {emp.last_name}</p>
                        <p className="text-xs text-dark-400 font-mono">{emp.employee_number}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-dark-300 space-y-1">
                    <div className="flex items-center gap-1.5"><Mail size={12} className="text-dark-500" /> {emp.email}</div>
                    <div className="flex items-center gap-1.5"><Phone size={12} className="text-dark-500" /> {emp.phone || '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-dark-300">
                    <p className="font-medium text-white">{emp.job_title}</p>
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
                  <td className="px-4 py-3">
                    <button className="p-1 hover:text-white transition-colors">
                      <MoreVertical size={16} />
                    </button>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
            {agents.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="text-center py-20">
                  <User size={40} className="mx-auto mb-3 text-dark-600" />
                  <p className="text-dark-400">No agent records found.</p>
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
    </div>
  )
}
