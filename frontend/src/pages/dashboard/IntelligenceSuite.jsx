import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  LayoutDashboard, TrendingUp, RefreshCw, 
  Calendar, ArrowRight, ChevronDown, 
  Shield, DollarSign, Key, Users, Box 
} from 'lucide-react'
import ExecutiveDashboard from './ExecutiveDashboard'
import AnalyticsDashboard from './AnalyticsDashboard'
import FinanceDashboard from './FinanceDashboard'
import RentalDashboard from './RentalDashboard'
import SupplyChainDashboard from './SupplyChainDashboard'
import HRDashboard from './HRDashboard'
import AgentDashboard from './AgentDashboard'
import { useAuthStore } from '@/stores/authStore'

export default function IntelligenceSuite() {
  const user = useAuthStore((s) => s.user)
  const executiveMode = useAuthStore((s) => s.executiveMode)
  
  // Role Detection Logic
  const roles = user?.roles?.map(r => r.role_type) || []
  const isSuperAdmin = roles.includes('super_admin') || roles.includes('admin') || user?.is_superuser
  const isExecutive = roles.includes('executive')
  const isFinance = roles.includes('finance_manager') || roles.includes('accountant')
  const isRental = roles.includes('rental_manager')
  const isHR = roles.includes('hr_manager')
  const isSales = roles.includes('sales_manager')
  const isAgent = roles.includes('agent')

  const executiveTabs = [
    { id: 'command_center', label: 'Command Center', icon: LayoutDashboard },
    { id: 'bi', label: 'Business Intelligence', icon: TrendingUp },
  ]

  const viewOptions = [
    { id: 'executive', label: 'Executive Insights', icon: Shield, roles: ['super_admin', 'admin', 'executive'] },
    { id: 'finance', label: 'Finance Dashboard', icon: DollarSign, roles: ['finance_manager', 'accountant', 'super_admin'] },
    { id: 'rental', label: 'Rental Management', icon: Key, roles: ['rental_manager', 'super_admin'] },
    { id: 'supply_chain', label: 'Supply Chain', icon: Box, roles: ['procurement_manager', 'inventory_manager', 'super_admin'] },
    { id: 'hr', label: 'Human Resources', icon: Users, roles: ['hr_manager', 'super_admin'] },
    { id: 'agent', label: 'Agent Portal', icon: Users, roles: ['agent', 'super_admin'] },
  ]

  // Determine available views for this user
  const availableViews = viewOptions.filter(option => 
    isSuperAdmin || option.roles.some(r => roles.includes(r))
  )

  // Determine initial view based on role
  const getInitialView = () => {
    if (isSuperAdmin || isExecutive) return 'executive'
    if (isFinance) return 'finance'
    if (isRental) return 'rental'
    if (isHR) return 'hr'
    if (isAgent) return 'agent'
    if (isSales) return 'executive' // Sales defaults to executive-lite
    return availableViews[0]?.id || 'executive'
  }

  const [activeView, setActiveView] = useState(getInitialView())
  const [activeTab, setActiveTab] = useState('command_center') 
  const [showViewSelector, setShowViewSelector] = useState(false)

  // Allow switching if user has more than 1 view available
  const canSwitchViews = isSuperAdmin || availableViews.length > 1

  // Update view automatically if user is fetched after initial load
  useEffect(() => {
    setActiveView(getInitialView())
  }, [user])

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }

  const currentViewLabel = viewOptions.find(v => v.id === activeView)?.label || 'Dashboard'

  return (
    <div className="min-h-screen bg-dark-950">
      {/* ── Consolidated Header ─────────────────────────────────────── */}
      <div className="px-6 pt-8 pb-4 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3 mb-1"
            >
              <div className="w-1.5 h-6 bg-primary rounded-full" />
              <div className="relative">
                <button 
                  onClick={() => canSwitchViews && setShowViewSelector(!showViewSelector)}
                  className={`flex items-center gap-2 group ${canSwitchViews ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <h1 className="font-display text-2xl lg:text-3xl text-white">
                    {activeView === 'executive' && executiveMode ? 'Executive Intelligence Suite' : currentViewLabel}
                  </h1>
                  {canSwitchViews && (
                    <ChevronDown size={20} className={`text-dark-500 group-hover:text-primary transition-transform ${showViewSelector ? 'rotate-180' : ''}`} />
                  )}
                </button>

                {/* View Selector Dropdown */}
                <AnimatePresence>
                  {showViewSelector && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowViewSelector(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute left-0 mt-2 w-64 bg-dark-900 border border-white/10 rounded-2xl shadow-2xl z-50 p-2 backdrop-blur-xl"
                      >
                        <div className="px-3 py-2 text-[10px] font-bold text-dark-500 uppercase tracking-widest border-b border-white/5 mb-1">
                          Switch View Mode
                        </div>
                        {availableViews.map((option) => (
                          <button
                            key={option.id}
                            onClick={() => {
                              setActiveView(option.id)
                              setShowViewSelector(false)
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                              activeView === option.id ? 'bg-primary/10 text-primary' : 'text-dark-300 hover:bg-white/5'
                            }`}
                          >
                            <option.icon size={16} />
                            <span className="text-sm font-medium">{option.label}</span>
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
            <p className="text-dark-400 text-sm flex items-center gap-2">
              <Calendar size={14} className="text-primary" />
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {/* Tab Switcher (Only visible for Executive View) */}
          {activeView === 'executive' && (
            <div className="flex bg-dark-900/50 p-1 rounded-2xl border border-white/5 backdrop-blur-sm self-start">
              {executiveTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    relative px-5 py-2.5 rounded-xl transition-all duration-300 flex items-center gap-2.5 group
                    ${activeTab === tab.id ? 'text-dark-900' : 'text-dark-400 hover:text-white'}
                  `}
                >
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="activeDashTab"
                      className="absolute inset-0 bg-primary shadow-[0_0_15px_rgba(229,166,69,0.3)] rounded-xl"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <tab.icon size={16} className="relative z-10" />
                  <div className="relative z-10 text-left">
                    <span className="block text-xs font-bold uppercase tracking-wider">{tab.label}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Dashboard Content ───────────────────────────────────────── */}
      <div className="relative px-6 pb-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView === 'executive' ? activeTab : activeView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {activeView === 'executive' && (
              activeTab === 'command_center' ? <ExecutiveDashboard isEmbedded /> : <AnalyticsDashboard isEmbedded />
            )}
            {activeView === 'finance' && <FinanceDashboard />}
            {activeView === 'rental' && <RentalDashboard />}
            {activeView === 'supply_chain' && <SupplyChainDashboard />}
            {activeView === 'hr' && <HRDashboard />}
            {activeView === 'agent' && <AgentDashboard />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
