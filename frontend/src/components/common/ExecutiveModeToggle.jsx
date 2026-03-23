// Stohil Properties - Executive Mode Toggle
// Switches between standard and executive dashboard views
import { motion } from 'framer-motion'
import { Zap } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { authAPI } from '@/services/api'

export default function ExecutiveModeToggle() {
  const { user, executiveMode, toggleExecutiveMode } = useAuthStore()

  const handleToggle = async () => {
    toggleExecutiveMode()
    // Persist to backend
    try {
      await authAPI.updateMe({ executive_mode: !executiveMode })
    } catch (err) {
      console.warn('Failed to persist executive mode preference:', err)
      /* Ignore — local state already updated */
    }
  }

  // Only show for users with executive dashboard access
  const canUse = user?.roles?.some((r) =>
    r.role_type === 'super_admin' || r.role_type === 'executive' || r.can_view_executive_dashboard
  )
  if (!canUse) return null

  return (
    <button
      onClick={handleToggle}
      className={`sidebar-item w-full justify-between transition-all ${executiveMode ? 'text-primary bg-primary/10 border border-primary/20' : ''
        }`}
    >
      <div className="flex items-center gap-2.5">
        <Zap size={16} className={executiveMode ? 'text-primary' : 'text-dark-500'} />
        <span className="text-sm">Executive Mode</span>
      </div>

      {/* Toggle pill */}
      <div
        className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${executiveMode ? 'bg-primary' : 'bg-dark-600'
          }`}
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
