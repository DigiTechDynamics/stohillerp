// Stohill Properties - Notification bell
// Unread count from the API (polled), a dropdown of recent notifications,
// mark one or all as read, and a click-through to the related screen.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, AlertTriangle, Info, Zap, Loader2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { notificationsAPI } from '@/services/api'

const LEVEL_ICON = {
  action: { icon: Zap, className: 'text-primary bg-primary/10' },
  warning: { icon: AlertTriangle, className: 'text-amber-500 bg-amber-500/10' },
  info: { icon: Info, className: 'text-sky-500 bg-sky-500/10' },
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: count = 0 } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => (await notificationsAPI.unreadCount()).data.count,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  })
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: async () => (await notificationsAPI.inbox({ page_size: 15 })).data.results || [],
    enabled: open,
    staleTime: 0,
  })

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const escape = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] })

  const openItem = async (item) => {
    if (!item.is_read) {
      await notificationsAPI.markRead(item.id).catch(() => {})
      refresh()
    }
    setOpen(false)
    if (item.link) navigate(item.link)
  }

  const markAll = async () => {
    await notificationsAPI.markAllRead().catch(() => {})
    refresh()
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn-ghost p-2 relative group"
        aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={18} className="text-dark-400 group-hover:text-white transition-colors" />
        {count > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-[10px] font-bold leading-4 text-center text-[#111] ring-2 ring-dark-900">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-dark-800 shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <p className="text-sm font-semibold text-white">Notifications</p>
            <button type="button" className="btn-ghost text-xs px-2 py-1" onClick={markAll} disabled={!count}>
              <CheckCheck size={14} /> Mark all read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto custom-scrollbar">
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-primary" /></div>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-dark-400">You have no notifications.</p>
            ) : (
              items.map((item) => {
                const level = LEVEL_ICON[item.level] || LEVEL_ICON.info
                const Icon = level.icon
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openItem(item)}
                    className={`w-full text-left flex gap-3 px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors ${item.is_read ? 'opacity-70' : ''}`}
                  >
                    <span className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${level.className}`}>
                      <Icon size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start gap-2">
                        <span className={`text-sm text-white ${item.is_read ? '' : 'font-semibold'}`}>{item.title}</span>
                        {!item.is_read && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                      </span>
                      {item.body && <span className="block text-xs text-dark-400 mt-0.5 line-clamp-2">{item.body}</span>}
                      <span className="block text-[11px] text-dark-500 mt-1">
                        {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                      </span>
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
