import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  X, Save, User, Mail, Phone, 
  Info, Camera, Upload, Trash2
} from 'lucide-react'
import { authAPI } from '@/services/api'
import { useUIStore, useAuthStore } from '@/stores/authStore'

export default function UserProfileForm() {
  const { user, setUser } = useAuthStore()
  const closePanel = useUIStore(s => s.closeSidePanel)
  const queryClient = useQueryClient()
  
  const [formData, setFormData] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    phone: user?.phone || '',
  })
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || null)

  const mutation = useMutation({
    mutationFn: (data) => authAPI.updateMe(data),
    onSuccess: (response) => {
      setUser(response.data)
      queryClient.invalidateQueries({ queryKey: ['current-user'] })
      closePanel()
    }
  })

  const handleAvatarChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setAvatarFile(file)
      setAvatarPreview(URL.createObjectURL(file))
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    
    // Use FormData for multipart/form-data upload
    const data = new FormData()
    data.append('first_name', formData.first_name)
    data.append('last_name', formData.last_name)
    data.append('phone', formData.phone)
    
    if (avatarFile) {
      data.append('avatar', avatarFile)
    }
    
    mutation.mutate(data)
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
            <h2 className="text-lg font-display text-white">My Profile</h2>
            <p className="text-[10px] text-dark-400 uppercase tracking-widest font-bold">Personal Information</p>
          </div>
        </div>
        <button onClick={closePanel} className="btn-ghost p-2 rounded-full">
          <X size={20} />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {/* Avatar Section */}
        <section className="flex flex-col items-center py-4">
          <div className="relative group">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary to-orange-500 
                            flex items-center justify-center text-dark-900 text-3xl font-bold shadow-xl overflow-hidden border-2 border-white/10">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span>{user?.first_name?.[0]}{user?.last_name?.[0]}</span>
              )}
            </div>
            <input 
              type="file" 
              id="avatar-upload" 
              className="hidden" 
              accept="image/*"
              onChange={handleAvatarChange}
            />
            <label 
              htmlFor="avatar-upload"
              className="absolute -bottom-2 -right-2 p-2 rounded-lg bg-dark-800 border border-white/10 
                         text-dark-400 hover:text-white hover:border-primary/50 transition-all shadow-lg cursor-pointer group-hover:scale-110"
              title="Change Avatar"
            >
              <Camera size={16} />
            </label>
          </div>
          <p className="mt-4 text-xs text-dark-400">Manage your persona across the Stohill ecosystem</p>
        </section>

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
            <label className="form-label">Email Address (Read Only)</label>
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-600" />
              <input
                type="email"
                readOnly
                disabled
                className="form-input pl-10 bg-dark-900/50 border-white/5 text-dark-500 cursor-not-allowed"
                value={user?.email || ''}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="form-label">Phone Number</label>
            <div className="relative">
              <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
              <input
                type="tel"
                className="form-input pl-10"
                placeholder="+263..."
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
          </div>
        </section>

        {/* Security Note */}
        <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
          <p className="text-[10px] text-emerald-400 font-medium leading-relaxed">
            Role assignments and account status can only be modified by the System Administrator. 
            For permission changes, please contact the IT department.
          </p>
        </div>
      </form>

      {/* Footer */}
      <div className="p-4 border-t border-white/5 bg-dark-900/50">
        <button
          onClick={handleSubmit}
          disabled={mutation.isPending}
          className="btn-primary w-full h-11"
        >
          {mutation.isPending ? 'Updating Profile...' : 'Save Profile Changes'}
          {!mutation.isPending && <Save size={18} />}
        </button>
      </div>
    </div>
  )
}
