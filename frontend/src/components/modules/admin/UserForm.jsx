import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Save, User, Mail, Shield, CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { adminAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'

export default function UserForm({ id, initialData }) {
  const closePanel = useUIStore(s => s.closeSidePanel)
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    email: '',
    first_name: '',
    last_name: '',
    phone: '',
    status: 'active',
    role_ids: initialData?.roles?.map(r => r.id) || initialData?.role_ids || [],
    ...initialData
  })

  // Fetch roles from the real API
  const { data: rolesData, isLoading: isLoadingRoles, isError: isErrorRoles } = useQuery({
    queryKey: ['admin-roles-list'],
    queryFn: () => adminAPI.roles.list()
  })

  const rolesDataRaw = rolesData?.data
  const roles = Array.isArray(rolesDataRaw) ? rolesDataRaw : (rolesDataRaw?.results || [])

  const mutation = useMutation({
    mutationFn: (data) => id ? adminAPI.users.update(id, data) : adminAPI.users.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      closePanel()
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    mutation.mutate(formData)
  }

  const toggleRole = (roleId) => {
    setFormData(prev => ({
      ...prev,
      role_ids: prev.role_ids.includes(roleId)
        ? prev.role_ids.filter(rid => rid !== roleId)
        : [...prev.role_ids, roleId]
    }))
  }

  return (
    <div className="flex flex-col h-full bg-dark-950">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5 bg-dark-900/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-gold-sm">
            <User size={20} />
          </div>
          <div>
            <h2 className="text-lg font-display text-white">{id ? 'Edit User' : 'New User'}</h2>
            <p className="text-[10px] text-dark-400 uppercase tracking-widest font-bold">Account & Permissions</p>
          </div>
        </div>
        <button onClick={closePanel} className="btn-ghost p-2 rounded-full">
          <X size={20} />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {/* Basic Info Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-white/50 mb-2">
            <Info size={14} />
            <span className="text-xs font-semibold uppercase tracking-wider">Identity & Contact</span>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="form-label">First Name</label>
              <input
                type="text"
                required
                className="form-input"
                value={formData.first_name}
                onChange={e => setFormData({ ...formData, first_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Last Name</label>
              <input
                type="text"
                required
                className="form-input"
                value={formData.last_name}
                onChange={e => setFormData({ ...formData, last_name: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="form-label">Email Address</label>
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
              <input
                type="email"
                required
                className="form-input pl-10"
                placeholder="email@example.com"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>

          {!id && (
            <div className="space-y-1.5 text-rose-400/70 text-xs bg-rose-500/5 p-3 rounded-lg border border-rose-500/10">
              <AlertCircle size={14} className="inline mr-2" />
              New users will receive an email to set their initial password.
            </div>
          )}
        </section>

        {/* Roles Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-white/50 mb-2">
            <Shield size={14} />
            <span className="text-xs font-semibold uppercase tracking-wider">Roles & Authorization</span>
          </div>

          <div className="grid gap-3">
            {isLoadingRoles && (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-[10px] text-dark-500 uppercase tracking-widest">Fetching Roles...</p>
              </div>
            )}
            {isErrorRoles && (
              <div className="p-4 bg-rose-500/5 border border-rose-500/10 rounded-xl text-center">
                <AlertCircle size={18} className="mx-auto text-rose-500 mb-2" />
                <p className="text-xs text-rose-400 font-medium">Failed to load roles</p>
                <button 
                  type="button"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-roles-list'] })}
                  className="mt-2 text-[10px] text-primary hover:underline uppercase font-bold"
                >
                  Try Again
                </button>
              </div>
            )}
            {!isLoadingRoles && !isErrorRoles && roles.length === 0 && (
              <div className="text-center py-6 bg-dark-900/20 rounded-xl border border-dashed border-white/5">
                <p className="text-xs text-dark-500 italic">No roles defined yet</p>
              </div>
            )}
            {!isLoadingRoles && roles.map(role => (
              <div 
                key={role.id}
                onClick={() => toggleRole(role.id)}
                className={`
                  p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between
                  ${formData.role_ids.includes(role.id) 
                    ? 'bg-primary/5 border-primary/30' 
                    : 'bg-dark-900/30 border-white/5 hover:border-white/10'}
                `}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${formData.role_ids.includes(role.id) ? 'bg-primary text-dark-900' : 'bg-dark-800 text-dark-400'}`}>
                    <Shield size={16} />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-white">{role.name}</h4>
                    <p className="text-[10px] text-dark-500">{role.description}</p>
                  </div>
                </div>
                {formData.role_ids.includes(role.id) && (
                  <CheckCircle2 size={18} className="text-primary" />
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Status Toggle */}
        <section className="pt-4 border-t border-white/5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-white">Active Status</h4>
              <p className="text-[10px] text-dark-500">Allow user to sign in to the platform</p>
            </div>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, status: prev.status === 'active' ? 'inactive' : 'active' }))}
              className={`
                w-12 h-6 rounded-full relative transition-colors
                ${formData.status === 'active' ? 'bg-emerald-500' : 'bg-dark-700'}
              `}
            >
              <div className={`
                absolute top-1 w-4 h-4 rounded-full bg-white transition-all
                ${formData.status === 'active' ? 'right-1' : 'left-1'}
              `} />
            </button>
          </div>
        </section>
      </form>

      {/* Footer */}
      <div className="p-4 border-t border-white/5 bg-dark-900/50">
        <button
          onClick={handleSubmit}
          disabled={mutation.isPending}
          className="btn-primary w-full h-11"
        >
          {mutation.isPending ? 'Saving...' : id ? 'Save Changes' : 'Create User Account'}
          {!mutation.isPending && <Save size={18} />}
        </button>
      </div>
    </div>
  )
}
