// Stohill Properties - Executive Mode Toggle
// Switches between the standard and the executive dashboard. The preference is
// saved on the user record (PATCH core/me/), so it follows the user across
// devices and sign-ins.
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Zap } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '@/stores/authStore'
import { authAPI, apiErrorMessage } from '@/services/api'

export function canUseExecutiveMode(user) {
  return !!user && (user.is_superuser || user.roles?.some((r) =>
    r.role_type === 'super_admin' || r.role_type === 'executive' || r.can_view_executive_dashboard
  ))
}

export default function ExecutiveModeToggle({ className = '' }) {
  const user = useAuthStore((s) => s.user)
  const executiveMode = useAuthStore((s) => s.executiveMode)
  const setExecutiveMode = useAuthStore((s) => s.setExecutiveMode)
  const setUser = useAuthStore((s) => s.setUser)
  const [saving, setSaving] = useState(false)

  if (!canUseExecutiveMode(user)) return null

  const handleToggle = async () => {
    const next = !executiveMode
    setExecutiveMode(next)
    setSaving(true)
    try {
      const { data } = await authAPI.updateMe({ executive_mode: next })
      setUser({ ...user, ...data })
      toast.success(next ? 'Executive mode on.' : 'Executive mode off.')
    } catch (err) {
      setExecutiveMode(!next)
      toast.error(apiErrorMessage(err, 'Could not save the executive mode setting.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={executiveMode}
      disabled={saving}
      onClick={handleToggle}
      className={`sidebar-item w-full justify-between transition-all ${executiveMode ? 'text-primary bg-primary/10 border border-primary/20' : ''} ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <Zap size={16} className={executiveMode ? 'text-primary' : 'text-dark-500'} />
        <span className="text-sm">Executive Mode</span>
      </div>

      {/* Toggle pill */}
      <div
        className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${executiveMode ? 'bg-primary' : 'bg-dark-600'}`}
      >
        <motion.div
          animate={{ x: executiveMode ? 16 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm"
        />
      </div>
    </button>
  )
}
