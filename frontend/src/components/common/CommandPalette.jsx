// Stohil Properties - Command Palette (⌘K)
// Global search and action launcher
import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Search, Building2, Users, TrendingUp, Home,
  DollarSign, Award, FileText, UserCog, LayoutDashboard,
  ArrowRight, BookOpen, FileBarChart, X, Landmark
} from 'lucide-react'
import { useUIStore } from '@/stores/authStore'

export default function CommandPalette() {
  const { commandPaletteOpen, closeCommandPalette } = useUIStore()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const commands = [
    { id: 'dashboard', label: 'Executive Dashboard', description: 'Command Center', icon: <LayoutDashboard size={16} />, action: () => navigate('/dashboard'), category: 'Navigation', keywords: ['dashboard', 'home', 'kpi'] },
    { id: 'properties', label: 'Properties', description: 'Property portfolio', icon: <Building2 size={16} />, action: () => navigate('/properties'), category: 'Navigation', keywords: ['property', 'listing', 'real estate'] },
    { id: 'crm', label: 'CRM Pipeline', description: 'Contacts & leads', icon: <Users size={16} />, action: () => navigate('/crm'), category: 'Navigation', keywords: ['crm', 'contacts', 'leads', 'pipeline'] },
    { id: 'kanban', label: 'Kanban Board', description: 'Deal pipeline view', icon: <Users size={16} />, action: () => navigate('/crm/kanban'), category: 'Navigation', keywords: ['kanban', 'deals', 'opportunities'] },
    { id: 'sales', label: 'Sales & Deals', description: 'Sale transactions', icon: <TrendingUp size={16} />, action: () => navigate('/sales'), category: 'Navigation', keywords: ['sales', 'deals', 'transactions'] },
    { id: 'rentals', label: 'Rental Management', description: 'Leases & tenants', icon: <Home size={16} />, action: () => navigate('/rentals'), category: 'Navigation', keywords: ['rental', 'lease', 'tenant', 'invoice'] },
    { id: 'finance', label: 'Finance', description: 'Accounting & GL', icon: <Landmark size={16} />, action: () => navigate('/finance'), category: 'Navigation', keywords: ['finance', 'accounting', 'journal', 'ledger'] },
    { id: 'journal', label: 'Journal Entries', description: 'GL postings', icon: <BookOpen size={16} />, action: () => navigate('/finance/journal'), category: 'Finance', keywords: ['journal', 'entry', 'debit', 'credit', 'posting'] },
    { id: 'reports', label: 'Financial Reports', description: 'P&L, Balance Sheet', icon: <FileBarChart size={16} />, action: () => navigate('/finance/reports'), category: 'Finance', keywords: ['report', 'income', 'balance sheet', 'trial balance', 'p&l'] },
    { id: 'commissions', label: 'Commissions', description: 'Agent commission tracking', icon: <Award size={16} />, action: () => navigate('/commissions'), category: 'Navigation', keywords: ['commission', 'agent', 'payout'] },
    { id: 'documents', label: 'Documents', description: 'Files & compliance', icon: <FileText size={16} />, action: () => navigate('/documents'), category: 'Navigation', keywords: ['document', 'file', 'compliance', 'fica'] },
    { id: 'hr', label: 'HR & Agents', description: 'Employee management', icon: <UserCog size={16} />, action: () => navigate('/hr'), category: 'Navigation', keywords: ['hr', 'employee', 'agent', 'leave', 'payroll'] },
  ]

  const filtered = query
    ? commands.filter((c) => {
      const q = query.toLowerCase()
      return (
        c.label.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.keywords.some((k) => k.includes(q))
      )
    })
    : commands

  const grouped = filtered.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {})

  const flatFiltered = Object.values(grouped).flat()

  const handleSelect = useCallback((item) => {
    item.action()
    closeCommandPalette()
    setQuery('')
    setSelectedIndex(0)
  }, [closeCommandPalette])

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        commandPaletteOpen ? closeCommandPalette() : useUIStore.getState().openCommandPalette()
      }
      if (!commandPaletteOpen) return
      if (e.key === 'Escape') { closeCommandPalette(); setQuery('') }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, flatFiltered.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' && flatFiltered[selectedIndex]) { handleSelect(flatFiltered[selectedIndex]) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [commandPaletteOpen, flatFiltered, selectedIndex, handleSelect, closeCommandPalette])

  useEffect(() => { setSelectedIndex(0) }, [query])

  return (
    <AnimatePresence>
      {commandPaletteOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            onClick={() => { closeCommandPalette(); setQuery('') }}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 z-[70] w-full max-w-xl p-4"
          >
            <div className="bg-dark-800 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
                <Search size={18} className="text-dark-400 flex-shrink-0" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search pages, actions, records..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="flex-1 bg-transparent text-white placeholder-dark-400 text-sm outline-none"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="text-dark-400 hover:text-white">
                    <X size={16} />
                  </button>
                )}
                <kbd className="px-1.5 py-0.5 rounded text-[10px] bg-dark-700 text-dark-400 font-mono border border-white/5">
                  ESC
                </kbd>
              </div>

              <div className="max-h-80 overflow-y-auto py-2 custom-scrollbar">
                {Object.entries(grouped).map(([category, items]) => (
                  <div key={category}>
                    <p className="px-4 py-1.5 text-[10px] font-bold text-dark-500 uppercase tracking-widest">
                      {category}
                    </p>
                    {items.map((item) => {
                      const globalIndex = flatFiltered.indexOf(item)
                      return (
                        <button
                          key={item.id}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors
                            ${globalIndex === selectedIndex ? 'bg-primary/10 text-white' : 'text-dark-300 hover:bg-white/5'}`}
                          onClick={() => handleSelect(item)}
                          onMouseEnter={() => setSelectedIndex(globalIndex)}
                        >
                          <span className={globalIndex === selectedIndex ? 'text-primary' : 'text-dark-400'}>
                            {item.icon}
                          </span>
                          <span className="flex-1 text-left">{item.label}</span>
                          {item.description && (
                            <span className="text-xs text-dark-500">{item.description}</span>
                          )}
                          {globalIndex === selectedIndex && (
                            <ArrowRight size={14} className="text-primary" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                ))}
                {flatFiltered.length === 0 && (
                  <div className="py-8 text-center text-dark-400 text-sm">
                    No results for "{query}"
                  </div>
                )}
              </div>

              <div className="px-4 py-2.5 border-t border-white/5 flex items-center gap-4 text-[10px] text-dark-500">
                <div className="flex items-center gap-1"><kbd className="font-mono bg-dark-700 px-1 rounded border border-white/5">↑↓</kbd> navigate</div>
                <div className="flex items-center gap-1"><kbd className="font-mono bg-dark-700 px-1 rounded border border-white/5">↵</kbd> select</div>
                <div className="flex items-center gap-1"><kbd className="font-mono bg-dark-700 px-1 rounded border border-white/5">⌘K</kbd> close</div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
