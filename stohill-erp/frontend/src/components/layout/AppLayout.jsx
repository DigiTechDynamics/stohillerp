// Stohil Properties - Main Application Layout
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Building2, Users, TrendingUp, Home, DollarSign,
  Award, FileText, UserCog, ChevronLeft, ChevronRight, Search,
  Bell, LogOut, Settings, Zap, Menu, X, Landmark, Briefcase, FileSearch, Box
} from 'lucide-react'
import { useState } from 'react'
import { useAuthStore, useUIStore } from '@/stores/authStore'
import CommandPalette from '@/components/common/CommandPalette'
import SidePanelContainer from '@/components/common/SidePanelContainer'
import ExecutiveModeToggle from '@/components/common/ExecutiveModeToggle'

const navItems = [
  // Overview
  { path: '/dashboard', label: 'Command Center', icon: LayoutDashboard, group: 'Overview', module: 'dashboard' },
  // Operations
  { path: '/crm', label: 'CRM Pipeline', icon: Users, group: 'Operations', module: 'crm' },
  { path: '/properties', label: 'Properties', icon: Building2, group: 'Operations', module: 'properties' },
  { path: '/rentals', label: 'Rental Management', icon: Home, group: 'Operations', module: 'rentals' },
  { path: '/sales', label: 'Sales & Deals', icon: TrendingUp, group: 'Operations', module: 'sales' },
  // Finance
  { path: '/finance/ap', label: 'Accounts Payable', icon: Briefcase, group: 'Finance', module: 'finance_ap' },
  { path: '/finance/ar', label: 'Accounts Receivable', icon: FileSearch, group: 'Finance', module: 'finance_ar' },
  { path: '/finance/bank', label: 'Bank & Cash', icon: Landmark, group: 'Finance', module: 'banking' },
  { path: '/commissions', label: 'Commissions', icon: Award, group: 'Finance', module: 'commissions' },
  { path: '/finance', label: 'GL & Financial Control', icon: Landmark, group: 'Finance', module: 'finance_gl' },
  { path: '/finance/assets', label: 'Fixed Assets', icon: Box, group: 'Finance', module: 'fixed_assets' },
  { path: '/finance/tax', label: 'Tax & VAT', icon: Zap, group: 'Finance', module: 'tax' },
  { path: '/payroll', label: 'Payroll', icon: Landmark, group: 'Finance', module: 'payroll' },
  // Admin
  { path: '/documents', label: 'Documents', icon: FileText, group: 'Admin', module: 'documents' },
  { path: '/hr', label: 'HR Management', icon: UserCog, group: 'Admin', module: 'hr' },
  { path: '/agents', label: 'Agent Profiles', icon: Users, group: 'Admin', module: 'agents' },
  { path: '/admin/access', label: 'User Access Control', icon: UserCog, group: 'Admin', module: 'admin' },
]

export default function AppLayout() {
  const { user, logout } = useAuthStore()
  const { sidebarCollapsed, toggleSidebar, openCommandPalette } = useUIStore()
  const [mobileOpen, setMobileOpen] = useState(false)

  const groups = ['Overview', 'Operations', 'Finance', 'Admin']

  return (
    <div className="flex h-screen overflow-hidden bg-dark-950 text-dark-100 font-body">
      {/* Mobile Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 bg-black/70 z-40 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        animate={{ width: sidebarCollapsed ? 72 : 260 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className={`
          fixed lg:static z-50 h-full flex flex-col
          bg-dark-900 border-r border-white/5
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          transition-transform duration-200
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/5">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 shadow-gold">
            <Building2 size={18} className="text-dark-900" />
          </div>
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="overflow-hidden whitespace-nowrap"
              >
                <span className="font-display text-white text-lg leading-none">Stohil Properties</span>
                <span className="block text-[10px] text-primary/70 font-body tracking-[0.15em] uppercase">
                  ERP Platform
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5 custom-scrollbar">
          {groups.map((group) => {
            const accessibleModules = user?.accessible_modules || []
            const isAdmin = user?.roles?.some(r => ['super_admin', 'admin'].includes(r.role_type))
            
            const items = navItems.filter((n) => 
               n.group === group && (
                 accessibleModules.includes(n.module) || 
                 n.module === 'dashboard'
               )
            )
            
            if (items.length === 0) return null

            return (
              <div key={group} className="mb-4">
                {!sidebarCollapsed && (
                  <p className="px-3 py-1.5 text-[10px] font-bold text-dark-500 uppercase tracking-widest">
                    {group}
                  </p>
                )}
                {items.map(({ path, label, icon: Icon }) => (
                  <NavLink
                    key={path}
                    to={path}
                    end
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `sidebar-item ${isActive ? 'active' : ''} ${sidebarCollapsed ? 'justify-center px-0' : ''}`
                    }
                    title={sidebarCollapsed ? label : ''}
                  >
                    <Icon size={18} className="sidebar-icon flex-shrink-0" />
                    <AnimatePresence>
                      {!sidebarCollapsed && (
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="text-sm truncate"
                        >
                          {label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="border-t border-white/5 p-3 space-y-2">
          {!sidebarCollapsed && <ExecutiveModeToggle />}
          <button
            onClick={() => logout()}
            className="sidebar-item w-full text-red-400/80 hover:text-red-400 hover:bg-red-500/10"
          >
            <LogOut size={16} className="flex-shrink-0" />
            {!sidebarCollapsed && <span className="text-sm">Sign Out</span>}
          </button>
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={toggleSidebar}
          className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full
                     bg-dark-800 border border-white/10 items-center justify-center
                     hover:bg-dark-700 hover:border-primary/50 transition-all z-10"
        >
          {sidebarCollapsed
            ? <ChevronRight size={12} className="text-dark-400" />
            : <ChevronLeft size={12} className="text-dark-400" />
          }
        </button>
      </motion.aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-14 flex items-center justify-between px-4 lg:px-6
                            border-b border-white/5 bg-dark-900/80 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden btn-ghost p-2"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            {/* Command Palette Trigger */}
            <button
              onClick={openCommandPalette}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-800/50
                         border border-white/5 text-dark-400 text-sm
                         hover:border-primary/30 hover:text-white transition-all group lg:w-64"
            >
              <Search size={14} />
              <span className="hidden sm:inline">Search anything...</span>
              <div className="hidden lg:flex items-center gap-1 ml-auto">
                <kbd className="px-1.5 py-0.5 rounded text-[10px] bg-dark-700 text-dark-400 font-mono border border-white/5 group-hover:border-primary/20">
                  ⌘
                </kbd>
                <kbd className="px-1.5 py-0.5 rounded text-[10px] bg-dark-700 text-dark-400 font-mono border border-white/5 group-hover:border-primary/20">
                  K
                </kbd>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button className="btn-ghost p-2 relative group">
              <Bell size={18} className="text-dark-400 group-hover:text-white transition-colors" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary ring-2 ring-dark-900" />
            </button>

            <div className="h-8 w-px bg-white/5 mx-1" />

            <div className="flex items-center gap-2.5">
              <div className="flex flex-col items-end hidden sm:flex">
                <p className="text-xs font-semibold text-white leading-none">{user?.full_name || 'Admin User'}</p>
                <p className="text-[10px] text-primary font-bold uppercase tracking-wider mt-1 opacity-70">
                  {user?.roles?.[0]?.role_type?.replace(/_/g, ' ') || 'Super Admin'}
                </p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-orange-500 
                              flex items-center justify-center text-dark-900 text-xs font-bold shadow-lg">
                {user?.first_name?.[0]}{user?.last_name?.[0]}
              </div>
            </div>
          </div>
        </header>

        {/* Page View */}
        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <Outlet />
        </main>
      </div>

      {/* Global Modals/Panels */}
      <CommandPalette />
      <SidePanelContainer />
    </div>
  )
}
