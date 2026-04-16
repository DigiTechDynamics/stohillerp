import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Plus, UserPlus, TrendingUp, FileText, 
  Receipt, Building2, Home, ChevronRight,
  MousePointer2, Briefcase, DollarSign
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useUIStore } from '@/stores/authStore'

const actionGroups = [
  {
    title: 'Sales & CRM',
    icon: <Briefcase size={12} className="text-blue-400" />,
    items: [
      { label: 'New Lead', icon: <UserPlus size={14} />, panel: 'opportunity-form', data: { is_lead: true } },
      { label: 'New Deal', icon: <TrendingUp size={14} />, panel: 'opportunity-form', data: { is_lead: false } },
      { label: 'Add Contact', icon: <UserPlus size={14} />, panel: 'contact-form' },
    ]
  },
  {
    title: 'Finance & Accounting',
    icon: <DollarSign size={12} className="text-emerald-400" />,
    items: [
      { label: 'Journal Entry', icon: <FileText size={14} />, path: '/finance/entries/new' },
      { label: 'Sales Invoice', icon: <Receipt size={14} />, panel: 'new-ar-invoice' },
      { label: 'Customer Receipt', icon: <Receipt size={14} />, panel: 'new-ar-receipt' },
    ]
  },
  {
    title: 'Property Operations',
    icon: <Building2 size={12} className="text-amber-400" />,
    items: [
      { label: 'Record Property', icon: <Building2 size={14} />, panel: 'property-form' },
      { label: 'New Lease', icon: <Home size={14} />, panel: 'lease-form' },
    ]
  }
]

export default function QuickActionCenter() {
  const [isOpen, setIsOpen] = useState(false)
  const { theme, openSidePanel } = useUIStore()
  const dropdownRef = useRef(null)
  const navigate = useNavigate()

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

  const handleAction = (item) => {
    setIsOpen(false)
    if (item.path) {
      navigate(item.path)
    } else if (item.panel) {
      openSidePanel(item.panel, item.data || {})
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-center w-8 h-8 rounded-xl transition-all shadow-lg 
                    ${isOpen 
                      ? 'bg-primary text-dark-900 scale-110 shadow-primary/30' 
                      : (theme === 'light' ? 'bg-dark-900 text-white hover:bg-black' : 'bg-primary/10 text-primary hover:bg-primary/20')}`}
      >
        <motion.div
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <Plus size={18} />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className={`absolute right-0 mt-3 w-64 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] z-[100] overflow-hidden border
                        ${theme === 'light' ? 'bg-white border-border-color' : 'bg-dark-900 border-white/10 opacity-95 backdrop-blur-xl'}`}
          >
            <div className={`px-4 py-3 border-b ${theme === 'light' ? 'bg-surface-main/50 border-border-color' : 'bg-dark-800/50 border-white/10'}`}>
              <h3 className={`text-xs font-bold uppercase tracking-widest ${theme === 'light' ? 'text-dark-900' : 'text-white'}`}>Quick Create</h3>
              <p className="text-[10px] text-dark-500 font-medium">Capture new records instantly</p>
            </div>

            <div className="p-2 space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar">
              {actionGroups.map((group, gIdx) => (
                <div key={gIdx} className="space-y-1">
                  <div className="flex items-center gap-2 px-3 py-1">
                    {group.icon}
                    <span className="text-[10px] font-bold text-dark-500 uppercase tracking-tighter">{group.title}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-0.5">
                    {group.items.map((item, iIdx) => (
                      <button
                        key={iIdx}
                        onClick={() => handleAction(item)}
                        className={`group flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-left
                                   ${theme === 'light' ? 'hover:bg-primary/5' : 'hover:bg-white/5'}`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all group-hover:scale-110
                                        ${theme === 'light' ? 'bg-surface-main border border-border-color text-dark-600' : 'bg-dark-700 border border-white/5 text-dark-400'}`}>
                          {item.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold ${theme === 'light' ? 'text-dark-900' : 'text-white'} group-hover:text-primary transition-colors`}>
                            {item.label}
                          </p>
                        </div>
                        <ChevronRight size={10} className="text-dark-600 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className={`px-4 py-3 border-t text-center ${theme === 'light' ? 'bg-surface-main/50 border-border-color' : 'bg-dark-800/50 border-white/10'}`}>
              <p className="text-[9px] text-dark-500 flex items-center justify-center gap-1">
                <MousePointer2 size={10} /> Shift + Click to open in new tab
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
