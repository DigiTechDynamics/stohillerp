// Stohill Properties - Financial Management Page
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DollarSign, PieChart, TrendingUp, ArrowRightLeft, FileText, Search, Plus, ListChecks, Calendar, Settings
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { financeAPI } from '@/services/api'
import { formatCurrency } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import DataManagementButtons from '@/components/common/DataManagementButtons'
import Pagination from '@/components/common/Pagination'
import { useQueryClient } from '@tanstack/react-query'

import CurrenciesTab from './CurrenciesTab'

export default function FinancePage() {
  const [tab, setTab] = useState('gl') // 'gl' or 'currencies'
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()
  const openPanel = useUIStore((s) => s.openSidePanel)

  const { data: summaryData } = useQuery({
    queryKey: ['finance-summary'],
    queryFn: () => financeAPI.summary(),
  })
  const summary = summaryData?.data || {}

  const { data, isLoading } = useQuery({
    queryKey: ['finance-accounts', { search, page }],
    queryFn: () => financeAPI.accounts.list({ search, page }),
  })

  const accounts = data?.data?.results || data?.data || []

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-white">General Ledger & Financial Control</h1>
          <p className="text-dark-400 text-sm mt-1">Manage Chart of Accounts, Journal Entries and Reports</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/finance/entries" className="btn-secondary flex items-center gap-2">
            <ArrowRightLeft size={16} /> Journal Entries
          </Link>
          <Link to="/finance/reports" className="btn-secondary flex items-center gap-2">
            <FileText size={16} /> Reports
          </Link>
          <Link to="/finance/periods" className="btn-secondary flex items-center gap-2">
            <Calendar size={16} /> Periods
          </Link>
          <Link to="/finance/posting-profiles" className="btn-secondary flex items-center gap-2">
            <Settings size={16} /> Posting Profiles
          </Link>
          <button className="btn-primary flex items-center gap-2" onClick={() => openPanel('account-form')}>
            <Plus size={16} /> New Account
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-white/5 pb-px">
        <button
          onClick={() => { setTab('gl'); setPage(1) }}
          className={`px-4 py-3 text-sm font-medium transition-all relative ${tab === 'gl' ? 'text-primary' : 'text-dark-400 hover:text-white'}`}
        >
          General Ledger
          {tab === 'gl' && <motion.div layoutId="activeTabFinance" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-gold" />}
        </button>
        <button
          onClick={() => { setTab('currencies'); setPage(1) }}
          className={`px-4 py-3 text-sm font-medium transition-all relative ${tab === 'currencies' ? 'text-primary' : 'text-dark-400 hover:text-white'}`}
        >
          Currencies & Rates
          {tab === 'currencies' && <motion.div layoutId="activeTabFinance" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-gold" />}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {tab === 'gl' ? (
          <motion.div
            key="gl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Financial Health Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="card p-5 bg-gradient-to-br from-primary/10 to-transparent">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                    <DollarSign size={24} />
                  </div>
                  <span className="text-[10px] text-primary font-bold uppercase tracking-wider">Cash Position</span>
                </div>
                <p className="text-2xl font-semibold text-white">{formatCurrency(parseFloat(summary.cash_position || 0), 'USD')}</p>
                <p className="text-xs text-dark-400 mt-1 flex items-center gap-1">
                  <TrendingUp size={12} className="text-emerald-400" />
                  Real-time balance
                </p>
              </div>

              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <ListChecks size={24} />
                  </div>
                  <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Accounts Receivable</span>
                </div>
                <p className="text-2xl font-semibold text-white">{formatCurrency(parseFloat(summary.accounts_receivable || 0), 'USD')}</p>
                <p className="text-xs text-dark-400 mt-1">{summary.overdue_count || 0} overdue invoices pending</p>
              </div>

              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
                    <PieChart size={24} />
                  </div>
                  <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">Operating Margin</span>
                </div>
                <p className="text-2xl font-semibold text-white">{summary.operating_margin || 0}%</p>
                <p className="text-xs text-dark-400 mt-1">Targets: {summary.operating_target || 35.0}% by Q4</p>
              </div>
            </div>

            {/* Chart of Accounts */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Chart of Accounts</h2>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
                    <input
                      type="text"
                      placeholder="Search accounts..."
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                      className="form-input pl-9 w-64 h-9 text-xs"
                    />
                  </div>
                  <DataManagementButtons 
                    module="coa" 
                    onImportSuccess={() => queryClient.invalidateQueries({ queryKey: ['finance-accounts'] })} 
                  />
                </div>
              </div>

              <div className="card overflow-hidden">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Account Name</th>
                      <th>Type</th>
                      <th className="text-right">Balance</th>
                      <th className="w-24">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((acc) => (
                      <tr key={acc.id} className="hover:bg-white/2 cursor-pointer transition-colors" onClick={() => openPanel('account-detail', { account: acc })}>
                        <td className="px-4 py-3 font-mono text-xs text-primary">{acc.code}</td>
                        <td className="px-4 py-3 text-sm text-white font-medium">{acc.name}</td>
                        <td className="px-4 py-3 text-xs text-dark-400 uppercase tracking-wider">{acc.account_type}</td>
                        <td className="px-4 py-3 text-sm text-white font-semibold text-right">
                          {formatCurrency(acc.current_balance || 0, acc.currency_code)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="badge-primary text-[10px] uppercase">Active</span>
                        </td>
                      </tr>
                    ))}
                    {accounts.length === 0 && !isLoading && (
                      <tr>
                        <td colSpan={5} className="text-center py-16 text-dark-400">
                          No accounts found in this search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <Pagination 
                currentPage={page}
                totalPages={data?.data?.total_pages}
                totalCount={data?.data?.count}
                onPageChange={setPage}
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="currencies"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <CurrenciesTab />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
