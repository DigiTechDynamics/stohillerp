import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, Shield, LayoutGrid, Wand2, Plus, Search, ShieldCheck, ShieldAlert, UserPlus, AlertTriangle, Key
} from 'lucide-react'
import { adminAPI, apiErrorMessage } from '@/services/api'
import { alertDialog, confirmDialog } from '@/components/common/Dialogs'
import { useUIStore } from '@/stores/authStore'
import Pagination from '@/components/common/Pagination'
import RecordActions from '@/components/common/RecordActions'
import PasswordResetModal from '@/components/modules/admin/PasswordResetModal'

export default function UserAccessPage() {
  const [tab, setTab] = useState('users')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [resetModalUser, setResetModalUser] = useState(null)
  const openPanel = useUIStore(s => s.openSidePanel)

  const tabs = [
    { id: 'users', label: 'Users & Roles', icon: Users },
    { id: 'roles', label: 'Role Definitions', icon: Shield },
    { id: 'modules', label: 'System Modules', icon: LayoutGrid },
    { id: 'sod', label: 'SOD Matrix', icon: Wand2 },
  ]

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-white">User Access Management</h1>
          <p className="text-dark-400 text-sm mt-1">Configure RBAC, module access and Segregation of Duties</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            className="btn-primary"
            onClick={() => openPanel('user-form')}
          >
            <UserPlus size={16} />
            Create User
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/5 pb-px">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setPage(1) }}
            className={`
              px-4 py-3 text-sm font-medium transition-all relative flex items-center gap-2
              ${tab === t.id ? 'text-primary' : 'text-dark-400 hover:text-white'}
            `}
          >
            <t.icon size={16} />
            {t.label}
            {tab === t.id && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-gold"
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        <AnimatePresence mode="wait">
          {tab === 'users' && (
            <UserList 
              search={search} 
              setSearch={setSearch} 
              page={page} 
              setPage={setPage} 
              onResetPassword={setResetModalUser} 
            />
          )}
          {tab === 'roles' && <RoleList page={page} setPage={setPage} />}
          {tab === 'modules' && <ModuleList page={page} setPage={setPage} />}
          {tab === 'sod' && <SODMatrix page={page} setPage={setPage} />}
        </AnimatePresence>

        <PasswordResetModal 
          user={resetModalUser}
          isOpen={!!resetModalUser}
          onClose={() => setResetModalUser(null)}
        />
      </div>
    </div>
  )
}

function UserList({ search, setSearch, page, setPage, onResetPassword }) {
  const openPanel = useUIStore(s => s.openSidePanel)
  const { data: usersData } = useQuery({
    queryKey: ['admin-users', { search, page }],
    queryFn: () => adminAPI.users.list({ search, page })
  })

  const usersDataRaw = usersData?.data
  const users = Array.isArray(usersDataRaw) ? usersDataRaw : (usersDataRaw?.results || [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="form-input pl-9"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Status</th>
              <th>Roles</th>
              <th>Module Access</th>
              <th>SOD Status</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-orange-500/20 flex items-center justify-center text-primary font-bold text-xs">
                      {user.first_name?.[0]}{user.last_name?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{user.full_name}</p>
                      <p className="text-[10px] text-dark-500">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`badge-${user.status === 'active' ? 'green' : 'gray'} text-[10px] uppercase`}>
                    {user.status}
                  </span>
                </td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {user.roles?.map(role => (
                      <span key={role.id} className="badge-primary text-[9px] py-0 px-1.5 h-auto">
                        {role.name}
                      </span>
                    )) || <span className="text-dark-500 italic text-[10px]">No roles assigned</span>}
                  </div>
                </td>
                <td>
                  <div className="text-[10px] text-dark-400">
                    {user.accessible_modules?.length || 0} Modules
                  </div>
                </td>
                <td>
                   <div className="flex items-center gap-1.5">
                    {user.sod_conflicts?.length > 0 ? (
                      <div className="flex items-center gap-1 text-rose-400 text-[10px] font-bold">
                        <ShieldAlert size={12} />
                        {user.sod_conflicts.length} Conflicts
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-emerald-400 text-[10px] font-bold">
                        <ShieldCheck size={12} />
                        Compliant
                      </div>
                    )}
                   </div>
                </td>
                <td className="text-right">
                  <div className="flex justify-end gap-1">
                    <button 
                      className="p-2 text-dark-500 hover:text-primary transition-colors"
                      title="Set Password"
                      onClick={() => onResetPassword(user)}
                    >
                      <Key size={14} />
                    </button>
                    <RecordActions record={user} label="user"
                      onEdit={() => openPanel('user-form', { id: user.id, initialData: user })}
                      deleteFn={adminAPI.users.delete} invalidate={['admin-users']} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination 
        currentPage={page}
        totalPages={usersData?.data?.total_pages}
        totalCount={usersData?.data?.count}
        onPageChange={setPage}
      />
    </motion.div>
  )
}

function RoleList({ page, setPage }) {
  const openPanel = useUIStore(s => s.openSidePanel)
  const { data: rolesData } = useQuery({
    queryKey: ['admin-roles', { page }],
    queryFn: () => adminAPI.roles.list({ page })
  })

  const rolesDataRaw = rolesData?.data
  const roles = Array.isArray(rolesDataRaw) ? rolesDataRaw : (rolesDataRaw?.results || [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
    >
      {roles.map((role) => (
        <div key={role.id} className="card p-5 space-y-4 group hover:border-primary/30 transition-all">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Shield size={20} />
            </div>
            <RecordActions record={role} label="role"
              onEdit={() => openPanel('role-form', { id: role.id, initialData: role })}
              deleteFn={adminAPI.roles.delete} invalidate={['admin-roles']} />
          </div>
          <div>
            <h3 className="text-white font-medium">{role.name}</h3>
            <p className="text-[10px] text-primary font-bold uppercase tracking-wider">{role.role_type}</p>
            <p className="text-xs text-dark-400 mt-2 line-clamp-2">{role.description || 'No description provided.'}</p>
          </div>
          <div className="pt-4 border-t border-white/5">
            <p className="text-[10px] text-dark-500 uppercase font-bold tracking-widest mb-2">Module Access</p>
            <div className="flex flex-wrap gap-1.5">
              {role.modules?.map(m => (
                <span key={m.id} className="px-2 py-0.5 rounded-md bg-dark-800 text-dark-300 text-[9px] font-medium border border-white/5">
                  {m.name}
                </span>
              ))}
              {(!role.modules || role.modules.length === 0) && (
                <span className="text-[10px] text-dark-600 italic">No modules assigned</span>
              )}
            </div>
          </div>
        </div>
      ))}
      <button 
        onClick={() => openPanel('role-form')}
        className="card border-dashed border-white/10 bg-transparent flex flex-col items-center justify-center p-8 gap-3 text-dark-500 hover:text-primary hover:border-primary/30 transition-all"
      >
        <div className="w-12 h-12 rounded-full bg-dark-900 flex items-center justify-center border border-white/5">
          <Plus size={24} />
        </div>
        <span className="text-sm font-medium">New Role Definition</span>
      </button>

      <div className="col-span-full mt-6">
        <Pagination 
          currentPage={page}
          totalPages={rolesData?.data?.total_pages}
          totalCount={rolesData?.data?.count}
          onPageChange={setPage}
        />
      </div>
    </motion.div>
  )
}

function ModuleList({ page, setPage }) {
  const { data: modulesData } = useQuery({
    queryKey: ['admin-modules', { page }],
    queryFn: () => adminAPI.modules.list({ page })
  })

  const modulesDataRaw = modulesData?.data
  const modules = Array.isArray(modulesDataRaw) ? modulesDataRaw : (modulesDataRaw?.results || [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
    >
      {modules.map((m) => (
        <div key={m.id} className="card p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-dark-800 flex items-center justify-center text-dark-400 border border-white/5">
             <LayoutGrid size={18} />
          </div>
          <div>
            <h4 className="text-sm font-medium text-white">{m.name}</h4>
            <p className="text-[10px] text-dark-500 font-mono tracking-tighter">{m.code}</p>
          </div>
        </div>
      ))}

      <div className="col-span-full mt-6">
        <Pagination 
          currentPage={page}
          totalPages={modulesData?.data?.total_pages}
          totalCount={modulesData?.data?.count}
          onPageChange={setPage}
        />
      </div>
    </motion.div>
  )
}

function SODMatrix({ page, setPage }) {
  const openPanel = useUIStore(s => s.openSidePanel)
  const queryClient = useQueryClient()
  const [suggesting, setSuggesting] = useState(false)

  // Offer the standard conflicting pairs that no rule covers yet.
  const suggestRules = async () => {
    setSuggesting(true)
    try {
      const { data: suggestions } = await adminAPI.sodRules.suggestions()
      if (!suggestions.length) {
        await alertDialog({ title: 'Nothing to suggest', message: 'Every standard conflict is already covered by a rule.' })
        return
      }
      const list = suggestions.map((s) => `• ${s.name} (${s.module_a_name} / ${s.module_b_name}, ${s.severity})`).join('\n')
      const ok = await confirmDialog({
        title: `Add ${suggestions.length} suggested rule${suggestions.length === 1 ? '' : 's'}?`,
        message: `${list}\n\nYou can edit or delete them afterwards.`,
        confirmLabel: 'Add rules',
      })
      if (!ok) return
      // The display names are not fields of a rule.
      await Promise.all(suggestions.map((s) => adminAPI.sodRules.create({
        name: s.name, module_a: s.module_a, module_b: s.module_b, severity: s.severity, description: s.description,
      })))
      queryClient.invalidateQueries({ queryKey: ['admin-sod-rules'] })
      toast.success(`${suggestions.length} rule(s) added.`)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not add the suggested rules.'))
    } finally {
      setSuggesting(false)
    }
  }
  const { data: rulesData } = useQuery({
    queryKey: ['admin-sod-rules', { page }],
    queryFn: () => adminAPI.sodRules.list({ page })
  })

  const rulesDataRaw = rulesData?.data
  const rules = Array.isArray(rulesDataRaw) ? rulesDataRaw : (rulesDataRaw?.results || [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">Conflicting Module Pairs</h3>
        <button className="btn-ghost text-xs gap-1.5 px-3" onClick={suggestRules} disabled={suggesting}>
          <Wand2 size={13} />
          {suggesting ? 'Checking...' : 'Auto-Suggest Rules'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {rules.map((rule) => (
          <div key={rule.id} className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-white">{rule.name}</h4>
              <div className="flex items-center gap-2">
                <span className={`badge-${rule.severity === 'critical' ? 'red' : 'orange'} text-[10px] uppercase font-bold`}>
                  {rule.severity}
                </span>
                <RecordActions record={rule} label="segregation-of-duties rule" size={12}
                  onEdit={() => openPanel('sod-rule-form', { id: rule.id, initialData: rule })}
                  deleteFn={adminAPI.sodRules.delete} invalidate={['admin-sod-rules']} />
              </div>
            </div>
            <div className="flex items-center gap-3 py-2">
              <div className="flex-1 p-2 rounded-lg bg-dark-900 border border-white/5 text-center">
                <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Module A</p>
                <p className="text-xs text-white">{rule.module_a_name}</p>
              </div>
              <div className="text-dark-600">
                <AlertTriangle size={16} />
              </div>
              <div className="flex-1 p-2 rounded-lg bg-dark-900 border border-white/5 text-center">
                <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Module B</p>
                <p className="text-xs text-white">{rule.module_b_name}</p>
              </div>
            </div>
            <p className="text-xs text-dark-400 border-t border-white/5 pt-3">
              {rule.description}
            </p>
          </div>
        ))}

        <button 
          onClick={() => openPanel('sod-rule-form')}
          className="card border-dashed border-white/10 bg-transparent flex items-center justify-center p-6 gap-3 text-dark-500 hover:text-primary hover:border-primary/30 transition-all h-full"
        >
           <Plus size={20} />
           <span className="text-sm font-medium">Add Conflict Rule</span>
        </button>
      </div>

      <Pagination 
        currentPage={page}
        totalPages={rulesData?.data?.total_pages}
        totalCount={rulesData?.data?.count}
        onPageChange={setPage}
      />
    </motion.div>
  )
}
