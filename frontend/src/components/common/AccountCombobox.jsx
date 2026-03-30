import { useState, useEffect, useRef } from 'react'
import { Search, User, Briefcase, Building2, Hash, ChevronDown, Check } from 'lucide-react'
import { financeAPI } from '@/services/api'
import { motion, AnimatePresence } from 'framer-motion'

export default function AccountCombobox({ value, onChange, placeholder = "Search account or entity..." }) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const containerRef = useRef(null)

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fetch results when search changes
  useEffect(() => {
    if (!search.trim()) {
      setResults([])
      return
    }

    const timer = setTimeout(async () => {
      setIsLoading(true)
      try {
        const res = await financeAPI.accounts.search(search)
        const data = res.data?.results || res.data || []
        setResults(Array.isArray(data) ? data : [])
        setSelectedIndex(-1)
      } catch (err) {
        console.error('Search failed:', err)
      } finally {
        setIsLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [search])

  const handleSelect = (item) => {
    onChange(item)
    setIsOpen(false)
    setSearch('')
  }

  const getIcon = (type) => {
    switch (type) {
      case 'customer': return <User size={14} className="text-emerald-400" />
      case 'supplier': return <Building2 size={14} className="text-primary" />
      case 'employee': return <Briefcase size={14} className="text-amber-400" />
      default: return <Hash size={14} className="text-dark-400" />
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <div 
        className={`form-input w-full flex items-center justify-between gap-2 cursor-pointer transition-all ${isOpen ? 'border-primary ring-1 ring-primary/20' : 'border-transparent hover:border-white/10'}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {value ? (
            <>
              {getIcon(value.type)}
              <span className="text-xs text-white truncate">{value.display || value.name}</span>
            </>
          ) : (
            <span className="text-xs text-dark-500 truncate">{placeholder}</span>
          )}
        </div>
        <ChevronDown size={14} className={`text-dark-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute z-50 top-full left-0 right-0 mt-2 bg-dark-900 border border-white/5 rounded-xl shadow-2xl overflow-hidden min-w-[300px]"
          >
            <div className="p-2 border-b border-white/5 bg-white/2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
                <input
                  autoFocus
                  type="text"
                  className="w-full bg-dark-800 border-none focus:ring-0 text-xs text-white pl-9 pr-3 py-2 rounded-lg"
                  placeholder="Type to search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto custom-scrollbar">
              {isLoading && (
                <div className="p-4 text-center text-[10px] text-dark-500 uppercase tracking-widest animate-pulse">
                  Searching...
                </div>
              )}

              {!isLoading && results.length === 0 && search && (
                <div className="p-4 text-center text-xs text-dark-500">
                  No matching accounts or entities found.
                </div>
              )}

              {!isLoading && results.length === 0 && !search && (
                <div className="p-4 text-center text-[10px] text-dark-500 uppercase tracking-widest">
                  Start typing to find entities...
                </div>
              )}

              {results.map((item, idx) => (
                <button
                  type="button"
                  key={item.id}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors group ${idx === selectedIndex ? 'bg-white/5' : ''}`}
                  onClick={() => handleSelect(item)}
                >
                  <div className="w-8 h-8 rounded-lg bg-dark-800 flex items-center justify-center group-hover:bg-dark-700 transition-colors">
                    {getIcon(item.type)}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="text-xs text-white font-medium truncate">{item.name}</div>
                    <div className="text-[10px] text-dark-500 font-mono flex items-center gap-1.5 uppercase">
                      {item.type} • {item.code}
                    </div>
                  </div>
                  {value?.id === item.id && <Check size={14} className="text-primary" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
