import React, { useState, useEffect, useCallback } from 'react'
import { Command } from 'cmdk'
import { 
  Search, LayoutDashboard, Briefcase, TrendingUp, Building2, 
  DollarSign, Users, Award, Settings, FileText, 
  Plus, UserPlus, Building, Calculator, Receipt,
  ChevronRight, Sparkles, Command as CommandIcon
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import { motion, AnimatePresence } from 'framer-motion'

const navigationItems = [
  { label: 'Dashboard', icon: <LayoutDashboard size={16} />, path: '/dashboard' },
  { label: 'CRM / Sales', icon: <TrendingUp size={16} />, path: '/crm' },
  { label: 'Properties', icon: <Building2 size={16} />, path: '/properties' },
  { label: 'Tenants & Rentals', icon: <Building size={16} />, path: '/rentals' },
  { label: 'Finance & Accounts', icon: <DollarSign size={16} />, path: '/finance' },
  { label: 'Human Resources', icon: <Users size={16} />, path: '/hr' },
  { label: 'Payroll Management', icon: <Calculator size={16} />, path: '/payroll' },
  { label: 'Settings', icon: <Settings size={16} />, path: '/admin/settings' },
]

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const { theme, openSidePanel } = useUIStore()
  const navigate = useNavigate()

  // Shortcuts
  useEffect(() => {
    const down = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  // Dynamic Search
  useEffect(() => {
    if (search.length < 2) {
      setResults([])
      return
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const { data } = await authAPI.globalSearch(search)
        setResults(data)
      } catch (err) {
        console.error('Search error:', err)
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [search])

  const runCommand = useCallback((command) => {
    setOpen(false)
    command()
  }, [])

  return (
    <AnimatePresence>
      {open && (
        <Command.Dialog 
          open={open} 
          onOpenChange={setOpen} 
          label="Global Command Palette"
          className="fixed inset-0 z-[1000] flex items-start justify-center pt-[15vh] px-4 sm:px-6"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-dark-900/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className={`relative w-full max-w-2xl overflow-hidden rounded-2xl border shadow-[0_30px_60px_rgba(0,0,0,0.5)] 
                        ${theme === 'light' ? 'bg-white border-border-color' : 'bg-dark-900 border-white/10 opacity-95 backdrop-blur-xl'}`}
          >
            <div className="flex items-center border-b border-white/5 px-4">
              <Search className="mr-3 text-dark-500" size={18} />
              <Command.Input
                placeholder="Search for records, features or actions..."
                value={search}
                onValueChange={setSearch}
                className={`h-14 w-full bg-transparent text-sm font-medium outline-none placeholder:text-dark-500
                           ${theme === 'light' ? 'text-dark-900' : 'text-white'}`}
              />
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-dark-800/50 border border-white/5">
                 <span className="text-[10px] font-bold text-dark-400">ESC</span>
              </div>
            </div>

            <Command.List className="max-h-[60vh] overflow-y-auto overflow-x-hidden p-2 custom-scrollbar">
              <Command.Empty className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Sparkles size={24} className="text-primary" />
                </div>
                <p className="text-sm font-semibold text-dark-300">No results found for "{search}"</p>
                <p className="text-xs text-dark-500 mt-1">Try a different keyword or browse modules below</p>
              </Command.Empty>

              {/* Dynamic Search Results */}
              {results.length > 0 && (
                <Command.Group heading={<span className="px-3 py-1 text-[10px] font-bold text-dark-500 uppercase tracking-widest">Global Search</span>}>
                  {results.map((result) => (
                    <Command.Item
                      key={result.id}
                      onSelect={() => runCommand(() => navigate(result.url))}
                      className={`group flex items-center gap-4 rounded-xl px-4 py-3 cursor-pointer transition-all
                                 ${theme === 'light' ? 'hover:bg-primary/5' : 'hover:bg-white/5'}`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-dark-800 flex items-center justify-center text-primary group-data-[selected]:bg-primary group-data-[selected]:text-dark-900 transition-colors">
                        <FileText size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold truncate ${theme === 'light' ? 'text-dark-900' : 'text-white'}`}>{result.title}</p>
                        <p className="text-xs text-dark-500 font-medium truncate">{result.category} • {result.subtitle}</p>
                      </div>
                      <ChevronRight size={14} className="text-dark-600 opacity-0 group-data-[selected]:opacity-100 transition-all -translate-x-2 group-data-[selected]:translate-x-0" />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* Quick Actions */}
              {!search && (
                <Command.Group heading={<span className="px-3 py-1 text-[10px] font-bold text-dark-500 uppercase tracking-widest">Quick Actions</span>}>
                  <Command.Item
                    onSelect={() => runCommand(() => openSidePanel('opportunity-form', { is_lead: true }))}
                    className={`group flex items-center gap-4 rounded-xl px-4 py-3 cursor-pointer transition-all
                               ${theme === 'light' ? 'hover:bg-primary/5' : 'hover:bg-white/5'}`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 group-data-[selected]:bg-blue-500 group-data-[selected]:text-white transition-colors">
                      <UserPlus size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${theme === 'light' ? 'text-dark-900' : 'text-white'}`}>Create New Lead</p>
                      <p className="text-xs text-dark-500 font-medium truncate">CRM • Start a fresh sales lifecycle</p>
                    </div>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => runCommand(() => openSidePanel('contact-form'))}
                    className={`group flex items-center gap-4 rounded-xl px-4 py-3 cursor-pointer transition-all
                               ${theme === 'light' ? 'hover:bg-primary/5' : 'hover:bg-white/5'}`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-data-[selected]:bg-emerald-500 group-data-[selected]:text-white transition-colors">
                      <Users size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${theme === 'light' ? 'text-dark-900' : 'text-white'}`}>Add Business Contact</p>
                      <p className="text-xs text-dark-500 font-medium truncate">CRM • Link to Lead or Property</p>
                    </div>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => runCommand(() => openSidePanel('property-form'))}
                    className={`group flex items-center gap-4 rounded-xl px-4 py-3 cursor-pointer transition-all
                               ${theme === 'light' ? 'hover:bg-primary/5' : 'hover:bg-white/5'}`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 group-data-[selected]:bg-amber-500 group-data-[selected]:text-white transition-colors">
                      <Building2 size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${theme === 'light' ? 'text-dark-900' : 'text-white'}`}>Record New Property</p>
                      <p className="text-xs text-dark-500 font-medium truncate">Operations • Add to master listing</p>
                    </div>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => runCommand(() => navigate('/finance/entries/new'))}
                    className={`group flex items-center gap-4 rounded-xl px-4 py-3 cursor-pointer transition-all
                               ${theme === 'light' ? 'hover:bg-primary/5' : 'hover:bg-white/5'}`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 group-data-[selected]:bg-purple-500 group-data-[selected]:text-white transition-colors">
                      <FileText size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${theme === 'light' ? 'text-dark-900' : 'text-white'}`}>Post Journal Entry</p>
                      <p className="text-xs text-dark-500 font-medium truncate">Finance • Manual GL adjustment</p>
                    </div>
                  </Command.Item>
                </Command.Group>
              )}

              {/* Navigation */}
              {!search && (
                <Command.Group heading={<span className="px-3 py-1 text-[10px] font-bold text-dark-500 uppercase tracking-widest">Navigation</span>}>
                  {navigationItems.map((item) => (
                    <Command.Item
                      key={item.path}
                      onSelect={() => runCommand(() => navigate(item.path))}
                      className={`group flex items-center gap-4 rounded-xl px-4 py-3 cursor-pointer transition-all
                                 ${theme === 'light' ? 'hover:bg-primary/5' : 'hover:bg-white/5'}`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-dark-700/50 flex items-center justify-center text-dark-400 group-data-[selected]:bg-primary group-data-[selected]:text-dark-900 transition-colors">
                        {item.icon}
                      </div>
                      <p className={`text-sm font-bold ${theme === 'light' ? 'text-dark-900' : 'text-white'}`}>{item.label}</p>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>

            <div className={`flex items-center justify-between px-4 py-3 border-t text-[10px] font-bold text-dark-500 uppercase tracking-tighter
                            ${theme === 'light' ? 'bg-surface-main/50 border-border-color' : 'bg-dark-800/50 border-white/5'}`}>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5"><ChevronRight size={10} /> Select</span>
                <span className="flex items-center gap-1.5"><CommandIcon size={10} /> Search</span>
              </div>
              <p className="flex items-center gap-1">Stohill Universal Search <Sparkles size={8} className="text-primary" /></p>
            </div>
          </motion.div>
        </Command.Dialog>
      )}
    </AnimatePresence>
  )
}
