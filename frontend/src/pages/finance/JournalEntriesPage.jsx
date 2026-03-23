import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, ArrowRightLeft, FileCheck, FileX, Filter, MoreVertical, Calendar } from 'lucide-react'
import { financeAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import Pagination from '@/components/common/Pagination'

export default function JournalEntriesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('-entry_date')
  const [page, setPage] = useState(1)
  const openPanel = useUIStore((s) => s.openSidePanel)

  const { data, isLoading } = useQuery({
    queryKey: ['journal-entries', { search, ordering: sort, page }],
    queryFn: () => financeAPI.entries.list({ search, ordering: sort, page }),
  })

  const entries = data?.data?.results || data?.data || []

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-white">Journal Entries</h1>
          <p className="text-dark-400 text-sm mt-1">Review and post manual journal adjustments</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => navigate('/finance/entries/new')}>
          <Plus size={16} /> New Entry
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 w-full max-w-2xl">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
          <input
            type="text"
            placeholder="Search entries..."
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
          <option value="-entry_date">Newest First</option>
          <option value="reference">Reference (A-Z)</option>
          <option value="-reference">Reference (Z-A)</option>
        </select>
      </div>

      {/* Entries List */}
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Date</th>
              <th>Description</th>
              <th className="text-right">Total Amount</th>
              <th>Status</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout">
              {entries.map((entry) => (
                <motion.tr
                  key={entry.id}
                  layout={false}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-white/2 transition-colors cursor-pointer"
                  onClick={() => openPanel('journal-entry-detail', { entry })}
                >
                  <td className="px-4 py-3 font-mono text-xs text-primary">{entry.reference}</td>
                  <td className="px-4 py-3 text-sm text-dark-300">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={12} className="text-dark-500" />
                      {formatDate(entry.entry_date)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-white max-w-md truncate">{entry.description}</td>
                  <td className="px-4 py-3 text-sm text-white font-semibold text-right">
                    {formatCurrency(parseFloat(entry.total_debits))}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge text-[10px] uppercase font-bold
                      ${entry.status === 'posted' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-dark-700 text-dark-400'}`}>
                      {entry.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button className="p-1 hover:text-white transition-colors">
                      <MoreVertical size={16} />
                    </button>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
            {entries.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="text-center py-20">
                  <ArrowRightLeft size={40} className="mx-auto mb-3 text-dark-600" />
                  <p className="text-dark-400">No journal entries found.</p>
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
