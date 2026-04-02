import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Bell, Check, CheckCheck, Info, AlertTriangle, 
  CheckCircle2, XCircle, ExternalLink, Clock, Loader2
} from 'lucide-react'
import { useNotificationStore } from '@/stores/notificationStore'
import { formatRelative } from '@/utils/format'
import { useNavigate } from 'react-router-dom'
import { useUIStore } from '@/stores/authStore'

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const { 
    notifications, unreadCount, loading, fetchNotifications, 
    markAsRead, markAllAsRead, startPolling, stopPolling 
  } = useNotificationStore()
  const { theme } = useUIStore()
  const dropdownRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    startPolling()
    return () => stopPolling()
  }, [])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const getLevelIcon = (level) => {
    switch (level) {
      case 'success': return <CheckCircle2 size={16} className="text-green-400" />
      case 'warning': return <AlertTriangle size={16} className="text-amber-400" />
      case 'error': return <XCircle size={16} className="text-red-400" />
      default: return <Info size={16} className="text-blue-400" />
    }
  }

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id)
    }
    if (notification.link) {
      navigate(notification.link)
    }
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`btn-ghost p-2 relative group rounded-xl transition-all ${isOpen ? (theme === 'light' ? 'bg-primary/10' : 'bg-white/10') : ''}`}
      >
        <Bell 
          size={18} 
          className={`${isOpen ? 'text-primary' : (theme === 'light' ? 'text-dark-600' : 'text-dark-400')} group-hover:text-primary transition-colors`} 
        />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-dark-900 ring-2 ring-dark-900 shadow-sm animate-in fade-in zoom-in duration-300">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className={`absolute right-[-80px] sm:right-0 mt-3 w-[calc(100vw-32px)] sm:w-96 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] z-[100] overflow-hidden border
                        ${theme === 'light' ? 'bg-white border-border-color' : 'bg-dark-900 border-white/10 opacity-95 backdrop-blur-xl'}`}
          >
            {/* Header */}
            <div className={`px-5 py-4 border-b flex items-center justify-between
                            ${theme === 'light' ? 'bg-surface-main/50 border-border-color' : 'bg-dark-800/50 border-white/10'}`}>
              <div>
                <h3 className={`text-sm font-bold ${theme === 'light' ? 'text-dark-900' : 'text-white'}`}>Notifications</h3>
                <p className="text-[10px] text-dark-400 font-medium">You have {unreadCount} unread alerts</p>
              </div>
              <button 
                onClick={markAllAsRead}
                disabled={unreadCount === 0 || loading}
                className="text-[10px] font-bold text-primary uppercase tracking-wider hover:text-primary-light disabled:opacity-30 transition-colors py-1 px-2 rounded-md hover:bg-primary/5"
              >
                Mark all as read
              </button>
            </div>

            {/* List */}
            <div className="max-h-[450px] overflow-y-auto custom-scrollbar">
              {loading && notifications.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-3">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full border-2 border-primary/20 animate-ping absolute inset-0" />
                    <Loader2 size={32} className="text-primary animate-spin relative z-10" />
                  </div>
                  <p className="text-xs text-dark-400 font-medium animate-pulse">Syncing activity...</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center opacity-40 text-center px-8">
                  <div className={`w-16 h-16 rounded-2xl mb-4 flex items-center justify-center ${theme === 'light' ? 'bg-black/5' : 'bg-white/5'}`}>
                    <Bell size={32} className="text-dark-400" />
                  </div>
                  <h4 className="text-sm font-semibold mb-1">All caught up!</h4>
                  <p className="text-xs max-w-[200px]">No new notifications at the moment. We'll alert you when something happens.</p>
                </div>
              ) : (
                <div className="divide-y divide-border-color/50">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={`px-5 py-4 flex gap-4 cursor-pointer transition-all relative group/item
                                 ${theme === 'light' ? 'hover:bg-black/[0.02]' : 'hover:bg-white/[0.03]'}
                                 ${!n.is_read ? (theme === 'light' ? 'bg-primary/5' : 'bg-primary/10') : ''}`}
                    >
                      {!n.is_read && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary shadow-[0_0_10px_rgba(var(--color-primary),0.5)]" />
                      )}
                      
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm transition-transform group-hover/item:scale-110
                                      ${theme === 'light' ? 'bg-white border border-border-color' : 'bg-dark-700 border border-white/5'}`}>
                        {getLevelIcon(n.level)}
                      </div>

                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className={`text-[10px] font-bold uppercase tracking-widest ${theme === 'light' ? 'text-dark-500' : 'text-dark-400'}`}>
                            {n.module || 'System'}
                          </p>
                          <div className="flex items-center gap-1 text-[10px] text-dark-500 font-medium">
                            <Clock size={10} />
                            {formatRelative(n.created_at)}
                          </div>
                        </div>
                        <p className={`text-sm leading-snug break-words ${!n.is_read ? (theme === 'light' ? 'font-bold text-dark-900' : 'font-bold text-white') : 'text-dark-300'}`}>
                          {n.actor_name ? <span className="text-primary font-bold">{n.actor_name} </span> : ''}
                          {n.verb} {n.target_name || ''}
                        </p>
                        {n.description && (
                          <p className="text-xs text-dark-500 line-clamp-2 leading-relaxed mt-1">
                            {n.description}
                          </p>
                        )}
                      </div>

                      {n.link && (
                        <div className="flex flex-col justify-center opacity-0 group-hover/item:opacity-100 transition-opacity">
                          <div className={`p-1.5 rounded-lg ${theme === 'light' ? 'bg-black/5' : 'bg-white/5'}`}>
                            <ExternalLink size={14} className="text-primary" />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className={`px-4 py-3 border-t text-center
                             ${theme === 'light' ? 'bg-surface-main/50 border-border-color' : 'bg-dark-800/50 border-white/10'}`}>
              <button 
                onClick={() => navigate('/notifications')}
                className={`text-[10px] font-bold uppercase tracking-widest transition-all py-2 px-4 rounded-lg w-full
                           ${theme === 'light' ? 'text-dark-600 hover:bg-black/5' : 'text-dark-400 hover:text-white hover:bg-white/5'}`}
              >
                View full activity history
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
