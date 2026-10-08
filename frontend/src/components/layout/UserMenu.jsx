// Stohill Properties - Top-bar user menu: who is signed in, personal settings, sign out.
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut } from 'lucide-react'
import ExecutiveModeToggle, { canUseExecutiveMode } from '@/components/common/ExecutiveModeToggle'
import { signOut } from '@/services/api'

// What the top bar shows for the signed-in user. Missing data shows neutral
// placeholders: never an invented name or role.
export function userDisplay(user) {
  const name = user?.full_name?.trim() || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email || 'Signed in'
  const role = user?.roles?.[0]?.name || user?.roles?.[0]?.role_type?.replace(/_/g, ' ') || (user?.is_superuser ? 'Superuser' : '')
  const initials = ((user?.first_name?.[0] || '') + (user?.last_name?.[0] || '')).toUpperCase()
    || (user?.email?.[0] || '?').toUpperCase()
  return { name, role, initials }
}

export default function UserMenu({ user }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const { name, role, initials } = userDisplay(user)

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

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="User menu"
        className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-white/5 transition-colors">
        <div className="flex-col items-end hidden sm:flex">
          <p className="text-xs font-semibold text-white leading-none">{name}</p>
          {role && (
            <p className="text-[10px] text-primary font-bold uppercase tracking-wider mt-1 opacity-70">{role}</p>
          )}
        </div>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-orange-500 flex items-center justify-center text-[#111] text-xs font-bold shadow-lg">
          {initials}
        </div>
        <ChevronDown size={14} className="text-dark-400 hidden sm:block" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-xl border border-white/10 bg-dark-800 shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <p className="text-sm font-semibold text-white truncate">{name}</p>
            {user?.email && <p className="text-xs text-dark-400 truncate">{user.email}</p>}
          </div>
          {canUseExecutiveMode(user) && (
            <div className="p-2 border-b border-white/5">
              <p className="px-3 pt-1 pb-2 text-[10px] font-bold text-dark-500 uppercase tracking-widest">My settings</p>
              <ExecutiveModeToggle />
              <p className="px-3 pt-2 text-[11px] text-dark-500">Shows the dashboard as the executive command center.</p>
            </div>
          )}
          <div className="p-2">
            <button type="button" onClick={() => signOut()}
              className="sidebar-item w-full text-red-400/80 hover:text-red-400 hover:bg-red-500/10">
              <LogOut size={16} /> <span className="text-sm">Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
