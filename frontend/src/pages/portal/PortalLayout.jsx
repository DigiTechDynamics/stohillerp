// Tenant self-service portal shell: its own header and navigation, no ERP chrome.
import { Suspense } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Home, FileText, ScrollText, Wrench, LogOut } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useCompanyProfile } from '@/hooks/useCompanyProfile'
import { signOut } from '@/services/api'
import BrandLogo from '@/components/common/BrandLogo'
import PageLoader from '@/components/common/PageLoader'

const NAV = [
  { to: '/portal', label: 'Home', icon: Home, end: true },
  { to: '/portal/invoices', label: 'Invoices & payments', icon: FileText },
  { to: '/portal/statement', label: 'Statement', icon: ScrollText },
  { to: '/portal/maintenance', label: 'Maintenance', icon: Wrench },
]

export default function PortalLayout() {
  const user = useAuthStore((s) => s.user)
  const company = useCompanyProfile()
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-dark-950 text-dark-100 font-body">
      <header className="border-b border-white/5 bg-dark-900">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandLogo className="w-8 h-8" />
            <div>
              <p className="font-display text-white leading-none">{company.data?.name || 'Tenant portal'}</p>
              <p className="text-[10px] text-primary/70 uppercase tracking-[0.15em]">Tenant portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-dark-400 hidden sm:inline">{user?.first_name} {user?.last_name}</span>
            <button className="btn-ghost text-xs" onClick={async () => { await signOut(); navigate('/login') }}>
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
        <nav className="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `flex items-center gap-2 px-3 pb-3 pt-1 border-b-2 text-xs font-bold uppercase tracking-wider whitespace-nowrap ${
                isActive ? 'border-primary text-primary' : 'border-transparent text-dark-500 hover:text-dark-300'}`}>
              <Icon size={14} /> {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Suspense fallback={<PageLoader />}>
          {company.isLoading ? <PageLoader /> : <Outlet />}
        </Suspense>
      </main>
    </div>
  )
}
