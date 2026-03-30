// Stohill Properties - Theme Toggle Component
// Switches between dark (default) and light mode with smooth animation
import { Sun, Moon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '@/stores/authStore'

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useUIStore()
  const isLight = theme === 'light'

  return (
    <button
      id="theme-toggle-btn"
      onClick={toggleTheme}
      title={isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
      className={`
        relative flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium
        border transition-all duration-200 group
        ${isLight
          ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
          : 'bg-dark-800 border-white/10 text-dark-400 hover:border-primary/40 hover:text-white'
        }
        ${className}
      `}
      style={{
        backgroundColor: isLight ? 'rgba(255,248,235,0.9)' : 'var(--bg-card)',
        borderColor: isLight ? 'rgba(229,166,69,0.3)' : 'var(--border-subtle)',
        color: isLight ? '#7c5a0c' : 'var(--text-muted)',
      }}
    >
      {/* Animated icon switcher */}
      <div className="relative w-4 h-4 flex items-center justify-center">
        <AnimatePresence mode="wait" initial={false}>
          {isLight ? (
            <motion.div
              key="sun"
              initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.2 }}
              className="absolute"
            >
              <Sun size={15} className="text-amber-500" />
            </motion.div>
          ) : (
            <motion.div
              key="moon"
              initial={{ rotate: 90, opacity: 0, scale: 0.5 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              exit={{ rotate: -90, opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.2 }}
              className="absolute"
            >
              <Moon size={15} className="text-primary" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Label */}
      <span className="text-xs font-semibold tracking-wide hidden sm:inline" style={{ color: 'inherit' }}>
        {isLight ? 'Light' : 'Dark'}
      </span>

      {/* Toggle pill indicator */}
      <div
        className="w-8 h-4 rounded-full relative transition-colors duration-300 flex-shrink-0"
        style={{ backgroundColor: isLight ? 'rgba(229,166,69,0.3)' : 'rgba(229,166,69,0.15)' }}
      >
        <motion.div
          animate={{ x: isLight ? 16 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="absolute top-0.5 w-3 h-3 rounded-full shadow-sm"
          style={{ backgroundColor: 'var(--primary)' }}
        />
      </div>
    </button>
  )
}
