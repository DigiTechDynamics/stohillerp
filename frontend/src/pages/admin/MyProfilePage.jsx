import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  User, Mail, Phone, Shield, 
  Calendar, MapPin, Edit3, 
  Settings, Key, Bell, ShieldCheck
} from 'lucide-react'
import { useAuthStore, useUIStore } from '@/stores/authStore'
import UserProfileForm from '@/components/modules/admin/UserProfileForm'

export default function MyProfilePage() {
  const { user } = useAuthStore()
  const openPanel = useUIStore(s => s.openSidePanel)

  const handleEditProfile = () => {
    openPanel('my-profile')
  }

  const sections = [
    {
      title: 'Security & Access',
      icon: Shield,
      items: [
        { label: 'Role', value: user?.roles?.[0]?.name || 'Super Admin', color: 'text-primary' },
        { label: 'Status', value: user?.status || 'Active', color: 'text-emerald-400' },
        { label: 'Two-Factor', value: 'Not Enabled', color: 'text-dark-500' }
      ]
    },
    {
      title: 'System Preferences',
      icon: Settings,
      items: [
        { label: 'Theme', value: 'Dynamic (Auto)', color: 'text-dark-300' },
        { label: 'Language', value: 'English (UK)', color: 'text-dark-300' },
        { label: 'Timezone', value: 'CAT (GMT+2)', color: 'text-dark-300' }
      ]
    }
  ]

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-8">
      {/* Header / Hero Section */}
      <section className="relative overflow-hidden rounded-[2rem] bg-dark-900 border border-white/5 p-8 lg:p-12 shadow-2xl">
        {/* Background Accents */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] -mr-32 -mt-32 rounded-full" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-orange-500/10 blur-[100px] -ml-32 -mb-32 rounded-full" />

        <div className="relative flex flex-col lg:flex-row items-center gap-8">
          {/* Avatar */}
          <div className="relative group">
            <div className="w-32 h-32 lg:w-40 lg:h-40 rounded-3xl bg-gradient-to-br from-primary to-orange-500 
                            flex items-center justify-center text-dark-900 text-4xl lg:text-5xl font-bold shadow-2xl relative z-10">
              {user?.avatar ? (
                <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover rounded-3xl" />
              ) : (
                <span>{user?.first_name?.[0]}{user?.last_name?.[0]}</span>
              )}
            </div>
            <div className="absolute -inset-2 bg-primary/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {/* User Info */}
          <div className="flex-1 text-center lg:text-left space-y-4">
            <div>
              <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-4 mb-2">
                <h1 className="text-3xl lg:text-4xl font-display text-white">{user?.full_name}</h1>
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider mx-auto lg:mx-0">
                  {user?.roles?.[0]?.role_type?.replace(/_/g, ' ') || 'Super Admin'}
                </span>
              </div>
              <p className="text-dark-400 flex items-center justify-center lg:justify-start gap-2">
                <Mail size={14} />
                {user?.email}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 pt-2">
              <div className="flex items-center gap-2 text-dark-500 text-sm">
                <Phone size={14} className="text-dark-400" />
                {user?.phone || 'No phone set'}
              </div>
              <div className="flex items-center gap-2 text-dark-500 text-sm">
                <Calendar size={14} className="text-dark-400" />
                Joined {new Date(user?.date_joined).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button 
              onClick={handleEditProfile}
              className="btn-primary px-6 h-12 rounded-2xl shadow-gold flex items-center gap-2"
            >
              <Edit3 size={18} />
              Edit Profile
            </button>
          </div>
        </div>
      </section>

      {/* Grid Content */}
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Left Column: Details */}
        <div className="lg:col-span-2 space-y-8">
          {/* Quick Stats / Info */}
          <div className="grid sm:grid-cols-2 gap-4">
            {sections.map((section) => (
              <div key={section.title} className="bg-dark-900/50 border border-white/5 rounded-[1.5rem] p-6 space-y-4">
                <div className="flex items-center gap-3 text-white/50">
                  <section.icon size={18} />
                  <h3 className="text-xs font-bold uppercase tracking-widest">{section.title}</h3>
                </div>
                <div className="space-y-3">
                  {section.items.map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-sm text-dark-400">{item.label}</span>
                      <span className={`text-sm font-semibold ${item.color}`}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Activity Log Placeholder */}
          <div className="bg-dark-900 border border-white/5 rounded-[1.5rem] overflow-hidden">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldCheck size={20} className="text-primary" />
                <h2 className="text-lg font-display text-white">Recent Security Activity</h2>
              </div>
              <button className="text-[10px] font-bold text-dark-500 hover:text-white uppercase tracking-widest transition-colors">
                View Full Log
              </button>
            </div>
            <div className="p-6 italic text-dark-600 text-sm text-center py-12">
              All secure sessions and password changes are logged for your protection.
              <br />
              No suspicious activity detected in the last 30 days.
            </div>
          </div>
        </div>

        {/* Right Column: Settings Quick Links */}
        <div className="space-y-6">
          <div className="bg-dark-900/50 border border-white/5 rounded-[1.5rem] p-6 space-y-6">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Account Actions</h2>
            
            <button className="w-full flex items-center justify-between p-4 rounded-xl bg-dark-800/50 border border-white/5 hover:border-primary/30 transition-all group">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Key size={18} />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-white group-hover:text-primary transition-colors">Change Password</p>
                  <p className="text-[10px] text-dark-500">Last changed 4 months ago</p>
                </div>
              </div>
            </button>

            <button className="w-full flex items-center justify-between p-4 rounded-xl bg-dark-800/50 border border-white/5 hover:border-primary/30 transition-all group">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400">
                  <Bell size={18} />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-white group-hover:text-orange-400 transition-colors">Notification Settings</p>
                  <p className="text-[10px] text-dark-500">Customize your alerts</p>
                </div>
              </div>
            </button>
          </div>

          {/* Support Card */}
          <div className="rounded-[1.5rem] bg-gradient-to-br from-primary/20 to-orange-500/20 border border-primary/20 p-6 space-y-4">
            <h3 className="font-display text-white">Need help?</h3>
            <p className="text-xs text-dark-300 leading-relaxed">
              If you believe your account has been compromised or need to request additional processing privileges, please contact the Stohill IT Support team.
            </p>
            <button className="w-full h-10 rounded-xl bg-primary text-dark-900 text-xs font-bold shadow-gold hover:scale-[1.02] active:scale-[0.98] transition-all">
              Contact Support
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
