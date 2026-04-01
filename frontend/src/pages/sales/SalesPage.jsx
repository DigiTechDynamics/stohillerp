// Stohill Properties - Sales and Brokerage Page
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, TrendingUp, DollarSign, Briefcase, Filter, ArrowUpRight, FileText } from 'lucide-react'
import { salesAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'

import DataManagementButtons from '@/components/common/DataManagementButtons'
import Pagination from '@/components/common/Pagination'
import { useQueryClient } from '@tanstack/react-query'

export default function SalesPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('-created_at')
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()
  const openPanel = useUIStore((s) => s.openSidePanel)

  const { data, isLoading } = useQuery({
    queryKey: ['sales-transactions', { search, status, ordering: sort, page }],
    queryFn: () => salesAPI.list({ search, status, ordering: sort, page }),
  })

  const transactions = data?.data?.results || []

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-white">Sales & Brokerage</h1>
          <p className="text-dark-400 text-sm mt-1">Track deals, commissions and completions</p>
        </div>
        <div className="flex items-center gap-3">
          <DataManagementButtons 
            module="sales" 
            filters={{ search, status, ordering: sort, page }}
            onImportSuccess={() => queryClient.invalidateQueries({ queryKey: ['sales-transactions'] })} 
          />
          <button className="btn-primary flex items-center gap-2" onClick={() => openPanel('sale-form')}>
            <Plus size={16} /> New Transaction
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'YTD Revenue', value: '$12.5M', trend: 15, icon: DollarSign, color: 'from-emerald-400/20 to-emerald-400/5', iconColor: 'text-emerald-400' },
          { label: 'Active Deals', value: '24', trend: 8, icon: Briefcase, color: 'from-primary/20 to-primary/5', iconColor: 'text-primary' },
          { label: 'Pending Completion', value: '$4.2M', trend: -2, icon: TrendingUp, color: 'from-amber-400/20 to-amber-400/5', iconColor: 'text-amber-400' },
          { label: 'Completed (MTD)', value: '8', trend: 12, icon: FileText, color: 'from-purple-400/20 to-purple-400/5', iconColor: 'text-purple-400' },
        ].map((stat, i) => (
          <div key={i} className={`card p-5 relative overflow-hidden group hover:border-primary/30 transition-all duration-300`}>
            <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${stat.color} blur-2xl -mr-8 -mt-8 opacity-50 group-hover:opacity-100 transition-opacity`} />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-2 rounded-lg bg-dark-800 border border-white/5 ${stat.iconColor}`}>
                  <stat.icon size={20} />
                </div>
                <div className={`flex items-center gap-1 text-[11px] font-black ${stat.trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {stat.trend >= 0 ? '↑' : '↓'}{Math.abs(stat.trend)}%
                </div>
              </div>
              <p className="text-2xl font-bold text-white tracking-tight">{stat.value}</p>
              <p className="text-xs text-dark-400 font-medium mt-1 uppercase tracking-wider">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
          <input
            type="text"
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="form-input pl-9"
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          className="form-input w-auto min-w-[150px]"
        >
          <option value="">All Statuses</option>
          <option value="offer_submitted">Offer Submitted</option>
          <option value="offer_accepted">Offer Accepted</option>
          <option value="suspensive">Suspensive Conditions</option>
          <option value="bond_approved">Bond Approved</option>
          <option value="transfer">Transfer in Progress</option>
          <option value="registered">Registered / Complete</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value); setPage(1) }}
          className="form-input w-auto min-w-[150px]"
        >
          <option value="-created_at">Newest First</option>
          <option value="sale_reference">Reference (A-Z)</option>
          <option value="-sale_reference">Reference (Z-A)</option>
          <option value="property__name">Property (A-Z)</option>
          <option value="-sale_price">Highest Value</option>
        </select>
      </div>

      {/* Main Content */}
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Property / Asset</th>
              <th>Client</th>
              <th>Sale Price</th>
              <th className="text-emerald-400">Commission</th>
              <th>Status</th>
              <th>Closing Date</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout">
              {transactions.map((tx) => (
                <motion.tr
                  key={tx.id}
                  layout={false}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-white/2 transition-colors cursor-pointer"
                  onClick={() => openPanel('sale-detail', { sale: tx })}
                >
                  <td className="px-4 py-3 font-mono text-xs text-primary">{tx.sale_reference}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-white font-medium">{tx.property_name || 'Generic Asset'}</p>
                    <p className="text-[10px] text-dark-500 uppercase tracking-wider">{tx.property_ref}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-dark-300">{tx.buyer_name || tx.seller_name}</td>
                  <td className="px-4 py-3 text-sm text-white font-semibold">
                    {formatCurrency(parseFloat(tx.sale_price), tx.currency_code)}
                  </td>
                  <td className="px-4 py-3 text-sm text-emerald-400 font-medium">
                    {formatCurrency(parseFloat(tx.commission_amount || 0), tx.currency_code)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge text-[10px] uppercase">
                      {tx.status?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-dark-400">{tx.closing_date ? formatDate(tx.closing_date) : 'TBD - Awaiting Confirmation'}</td>
                </motion.tr>
              ))}
            </AnimatePresence>
            {transactions.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="text-center py-20">
                  <Briefcase size={40} className="mx-auto mb-3 text-dark-600" />
                  <p className="text-dark-400">No transactions found.</p>
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
  )
}
