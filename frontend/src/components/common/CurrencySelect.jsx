import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Check, Coins } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCurrencies } from '@/hooks/useCurrencies'

export default function CurrencySelect({ 
  value, 
  onChange, 
  label = "Currency",
  placeholder = "Select Currency",
  error = null,
  disabled = false,
  required = false,
  valueKey = 'id',   // 'code' for models keyed by currency code (e.g. bank accounts)
  defaultToBase = false,  // pick the base currency when nothing is chosen yet
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)

  const { currencies, baseCurrency, isLoading } = useCurrencies()

  useEffect(() => {
    if (defaultToBase && !value && baseCurrency) onChange(baseCurrency[valueKey])
  }, [defaultToBase, value, baseCurrency, valueKey, onChange])

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

  const selectedCurrency = currencies.find(c => c.id === value || c.code === value)

  const handleSelect = (currency) => {
    onChange(currency[valueKey])
    setIsOpen(false)
  }

  return (
    <div className="flex flex-col gap-1.5" ref={containerRef}>
      {label && (
        <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest ml-1">
          {label} {required && <span className="text-primary">*</span>}
        </label>
      )}
      
      <div className="relative">
        <button
          type="button"
          disabled={disabled || isLoading}
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between gap-3 px-4 py-3 bg-dark-800/50 border rounded-xl transition-all duration-300 group
            ${isOpen ? 'border-primary ring-4 ring-primary/10 shadow-lg shadow-primary/5' : 'border-white/5 hover:border-white/10 hover:bg-dark-800'}
            ${error ? 'border-red-500/50 ring-4 ring-red-500/10' : ''}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors 
              ${isOpen ? 'bg-primary/20 text-primary' : 'bg-dark-700 text-dark-400 group-hover:text-white group-hover:bg-dark-600'}
            `}>
              <Coins size={16} />
            </div>
            <div className="flex flex-col items-start overflow-hidden">
              {selectedCurrency ? (
                <>
                  <span className="text-xs font-semibold text-white truncate">{selectedCurrency.code}</span>
                  <span className="text-[10px] text-dark-500 truncate">{selectedCurrency.name}</span>
                </>
              ) : (
                <span className="text-xs text-dark-500 truncate">{isLoading ? 'Loading...' : placeholder}</span>
              )}
            </div>
          </div>
          <ChevronDown size={14} className={`text-dark-500 transition-transform duration-300 ${isOpen ? 'rotate-180 text-primary' : ''}`} />
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="absolute z-[100] top-full left-0 right-0 mt-2 p-2 bg-dark-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-white/5"
            >
              <div className="max-h-60 overflow-y-auto custom-scrollbar flex flex-col gap-1">
                {currencies.map((currency) => (
                  <button
                    key={currency.id}
                    type="button"
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group
                      ${(value === currency.id || value === currency.code) ? 'bg-primary/10 border border-primary/20' : 'hover:bg-white/5 border border-transparent'}
                    `}
                    onClick={() => handleSelect(currency)}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs
                      ${(value === currency.id || value === currency.code) ? 'bg-primary text-white' : 'bg-dark-800 text-dark-400 group-hover:bg-dark-700 group-hover:text-white'}
                    `}>
                      {currency.symbol || currency.code[0]}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className={`text-xs font-semibold truncate ${(value === currency.id || value === currency.code) ? 'text-primary' : 'text-white'}`}>
                        {currency.code}
                      </div>
                      <div className="text-[10px] text-dark-500 truncate">{currency.name}</div>
                    </div>
                    {(value === currency.id || value === currency.code) && (
                      <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                        <Check size={12} className="text-white" />
                      </div>
                    )}
                  </button>
                ))}
                {currencies.length === 0 && !isLoading && (
                  <div className="p-4 text-center text-xs text-dark-500 italic">
                    No currencies available
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {error && <span className="text-[10px] font-medium text-red-400 ml-1">{error}</span>}
    </div>
  )
}
