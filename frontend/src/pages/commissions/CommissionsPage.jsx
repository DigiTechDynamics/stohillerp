// Stohill Properties - Commission Management Page
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, DollarSign, Award, CheckCircle2, Clock, Calculator } from 'lucide-react'
import { commissionsAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import Pagination from '@/components/common/Pagination'

export default function CommissionsPage() {
  const [activeTab, setActiveTab] = useState('records')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('-calculation_date')
  const [page, setPage] = useState(1)
  const openPanel = useUIStore((s) => s.openSidePanel)

  const { data: recordsData, isLoading: loadingRecords } = useQuery({
    queryKey: ['commissions-records', { search, ordering: sort, page }],
    queryFn: () => commissionsAPI.list({ search, ordering: sort, page }),
    enabled: activeTab === 'records'
  })

  const { data: structuresData, isLoading: loadingStructures } = useQuery({
    queryKey: ['commissions-structures', { page }],
    queryFn: () => commissionsAPI.structures.list({ page }),
    enabled: activeTab === 'structures'
  })

  const { data: statsRes } = useQuery({ queryKey: ['commission-stats'], queryFn: () => commissionsAPI.stats() })
  const stats = statsRes?.data

  const records = recordsData?.data?.results || []
  const structures = structuresData?.data?.results || []

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-white">Commissions & Incentives</h1>
          <p className="text-dark-400 text-sm mt-1">Track agent earnings, approvals and structures</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 w-full max-w-sm mr-4">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="form-input pl-9 w-full"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => { setSort(e.target.value); setPage(1) }}
              className="form-input w-auto min-w-[150px]"
            >
              <option value="-calculation_date">Newest First</option>
              <option value="-amount">Highest Amount</option>
              <option value="reference">Reference (A-Z)</option>
            </select>
          </div>
          <button className="btn-secondary flex items-center gap-2" onClick={() => openPanel('commission-calculator')}>
            <Calculator size={16} /> Calculator
          </button>
          <button className="btn-primary flex items-center gap-2" onClick={() => openPanel('commission-structure-form')}>
            <Award size={16} /> New Structure
          </button>
        </div>
      </div>
      <div className="flex border-b border-white/10 mt-6">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'records' ? 'border-primary text-primary' : 'border-transparent text-dark-400 hover:text-white'
          }`}
          onClick={() => { setActiveTab('records'); setPage(1) }}
        >
          Commission Records
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'structures' ? 'border-primary text-primary' : 'border-transparent text-dark-400 hover:text-white'
          }`}
          onClick={() => { setActiveTab('structures'); setPage(1) }}
        >
          Commission Structures
        </button>
      </div>
      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Paid (YTD)', value: stats ? formatCurrency(stats.paid_ytd) : '—', icon: CheckCircle2, color: 'text-emerald-400' },
          { label: 'Awaiting approval', value: stats ? formatCurrency(stats.pending_approval) : '—',
            sub: stats && parseFloat(stats.approved_unpaid) > 0 ? `${formatCurrency(stats.approved_unpaid)} approved, unpaid` : null,
            icon: Clock, color: 'text-amber-400' },
          { label: 'Top earner (this month)', value: stats?.top_earner_mtd?.name || (stats ? 'None yet' : '—'),
            sub: stats?.top_earner_mtd ? formatCurrency(stats.top_earner_mtd.total) : null, icon: Award, color: 'text-primary' },
          { label: 'Average commission (YTD)', value: stats?.average_ytd ? formatCurrency(stats.average_ytd) : '—',
            sub: stats ? `${stats.count_ytd} approved or paid` : null, icon: DollarSign, color: 'text-blue-400' },
        ].map((stat, i) => (
          <div key={i} className="card p-4">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center ${stat.color}`}>
                <stat.icon size={16} />
              </div>
              <div>
                <p className="text-lg font-semibold text-white">{stat.value}</p>
                <p className="text-[10px] text-dark-500 uppercase tracking-wider">{stat.label}</p>
                {stat.sub && <p className="text-[10px] text-dark-400">{stat.sub}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div className="card overflow-hidden">
        {activeTab === 'records' ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Agent</th>
                <th>Deal</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {records.map((record) => (
                  <motion.tr
                    key={record.id}
                    layout={false}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-white/2 transition-colors cursor-pointer"
                    onClick={() => openPanel('commission-detail', { record })}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-primary">{record.reference}</td>
                    <td className="px-4 py-3 text-sm text-white font-medium">{record.agent_name}</td>
                    <td className="px-4 py-3 text-sm text-dark-300">{record.property_ref || 'Direct Record'}</td>
                    <td className="px-4 py-3 text-sm text-white font-semibold">
                      {formatCurrency(parseFloat(record.net_commission), record.currency_code)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge text-[10px] uppercase font-bold
                        ${record.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' :
                          record.status === 'pending' ? 'bg-amber-500/10 text-amber-400' : 'bg-dark-700 text-dark-400'}`}>
                        {record.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-dark-400">{formatDate(record.created_at)}</td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {records.length === 0 && !loadingRecords && (
                <tr>
                  <td colSpan={6} className="text-center py-20">
                    <Award size={40} className="mx-auto mb-3 text-dark-600" />
                    <p className="text-dark-400">No commission records found.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Structure Name</th>
                <th>Base Rate</th>
                <th>Type</th>
                <th>Tiers</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {structures.map((struct) => (
                  <motion.tr
                    key={struct.id}
                    layout={false}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-white/2 transition-colors cursor-pointer"
                    onClick={() => openPanel('commission-structure-form', { structure: struct })}
                  >
                    <td className="px-4 py-3 text-sm text-white font-medium">{struct.name}</td>
                    <td className="px-4 py-3 text-sm text-primary font-semibold">{struct.base_rate}%</td>
                    <td className="px-4 py-3 text-xs text-dark-300 uppercase tracking-wider">{struct.calculation_type || 'Standard'}</td>
                    <td className="px-4 py-3 text-sm text-dark-400">{struct.tiers?.length || 0} configured</td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {structures.length === 0 && !loadingStructures && (
                <tr>
                  <td colSpan={4} className="text-center py-20">
                    <Calculator size={40} className="mx-auto mb-3 text-dark-600" />
                    <p className="text-dark-400">No commission structures found.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Pagination 
        currentPage={page}
        totalPages={activeTab === 'records' ? recordsData?.data?.total_pages : structuresData?.data?.total_pages}
        totalCount={activeTab === 'records' ? recordsData?.data?.count : structuresData?.data?.count}
        onPageChange={setPage}
      />
    </div>
  )
}
