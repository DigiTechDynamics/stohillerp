import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { DollarSign, Percent, Plus, RefreshCw, Loader2 } from 'lucide-react'
import api from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'
import { toast } from 'react-hot-toast'
import { useUIStore } from '@/stores/authStore'

export default function CurrenciesTab() {
  const [subTab, setSubTab] = useState('currencies') // 'currencies' or 'rates'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 border-b border-navbar pb-2">
        <button
          onClick={() => setSubTab('currencies')}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${subTab === 'currencies' ? 'text-primary border-b-2 border-primary -mb-[9px]' : 'text-dark-400 hover:text-white'}`}
        >
          <DollarSign size={16} />
          Currencies
        </button>
        <button
          onClick={() => setSubTab('rates')}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${subTab === 'rates' ? 'text-primary border-b-2 border-primary -mb-[9px]' : 'text-dark-400 hover:text-white'}`}
        >
          <Percent size={16} />
          Exchange Rates
        </button>
      </div>

      <motion.div
        key={subTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
      >
        {subTab === 'currencies' ? <CurrenciesList /> : <ExchangeRatesList />}
      </motion.div>
    </div>
  )
}

function CurrenciesList() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['currencies'],
    queryFn: () => api.get('/finance/currencies/').then(r => r.data)
  })
  const openPanel = useUIStore(s => s.openSidePanel)

  const currencies = data?.results || data || []

  if (isLoading) return <div className="flex py-20 justify-center"><Loader2 className="animate-spin text-primary" size={32} /></div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-white font-medium">System Currencies</h3>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => refetch()}><RefreshCw size={14} /> Refresh</button>
          <button className="btn-primary" onClick={() => openPanel('currency-form')}><Plus size={14} /> Add Currency</button>
        </div>
      </div>
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th><DollarSign size={14} className="inline mr-1 text-primary"/>Code</th>
              <th>Name</th>
              <th>Symbol</th>
              <th>Base Currency</th>
              <th className="text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {currencies.map(c => (
              <tr key={c.id} className="hover:bg-white/5 cursor-pointer transition-colors" onClick={() => openPanel('currency-form', { currency: c })}>
                <td className="font-mono text-white text-sm">{c.code}</td>
                <td className="text-dark-300">{c.name}</td>
                <td className="text-dark-300">{c.symbol || '-'}</td>
                <td>
                  {c.is_base ? <span className="badge-primary">Base</span> : <span className="text-dark-500">-</span>}
                </td>
                <td className="text-center">
                  {c.is_active ? <span className="badge-green">Active</span> : <span className="badge-gray">Inactive</span>}
                </td>
              </tr>
            ))}
            {currencies.length === 0 && (
              <tr><td colSpan={5} className="text-center py-6 text-dark-500">No currencies configured.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ExchangeRatesList() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['exchange-rates'],
    queryFn: () => api.get('/finance/exchange-rates/').then(r => r.data)
  })
  const openPanel = useUIStore(s => s.openSidePanel)

  const rates = data?.results || data || []

  if (isLoading) return <div className="flex py-20 justify-center"><Loader2 className="animate-spin text-amber-400" size={32} /></div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-white font-medium">Exchange Rates</h3>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => refetch()}><RefreshCw size={14} /> Refresh</button>
          <button className="btn-primary" onClick={() => openPanel('exchange-rate-form')}><Plus size={14} /> Add Rate</button>
        </div>
      </div>
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Currency</th>
              <th>Date</th>
              <th className="text-right">Rate To Base</th>
            </tr>
          </thead>
          <tbody>
            {rates.map(r => (
              <tr key={r.id} className="hover:bg-white/5 cursor-pointer transition-colors" onClick={() => openPanel('exchange-rate-form', { rate: r })}>
                <td className="text-sm font-medium text-white">{r.currency_code || '-'}</td>
                <td className="text-dark-300">{formatDate(r.date || r.effective_date)}</td>
                <td className="font-mono text-right text-emerald-400">{parseFloat(r.rate).toFixed(6)}</td>
              </tr>
            ))}
            {rates.length === 0 && (
              <tr><td colSpan={3} className="text-center py-6 text-dark-500">No exchange rates configured.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
