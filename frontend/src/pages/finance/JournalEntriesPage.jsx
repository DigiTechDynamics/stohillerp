import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, ArrowRightLeft, Calendar, User, CheckCircle } from 'lucide-react'
import { financeAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'
import Pagination from '@/components/common/Pagination'
import RecordActions from '@/components/common/RecordActions'

export default function JournalEntriesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('-created_at')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['journal-batches', { search, ordering: sort, page }],
    queryFn: () => financeAPI.batches.list({ search, ordering: sort, page }),
  })

  // The backend paginated response
  const batches = data?.data?.results || []

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-white">Journal Batches</h1>
          <p className="text-dark-400 text-sm mt-1">Review, approve and post financial batches</p>
        </div>
        <div className="flex items-center gap-3">
            <button 
                className="btn-secondary flex items-center gap-2" 
                onClick={() => navigate('/finance/approvals')} // Future dashboard
            >
              <CheckCircle size={16} /> Approvals Dashboard
            </button>
            <button 
                className="btn-primary flex items-center gap-2" 
                onClick={() => navigate('/finance/entries/new')}
            >
              <Plus size={16} /> Capture New Batch
            </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 w-full max-w-2xl">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
          <input
            type="text"
            placeholder="Search batches by number or description..."
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
          <option value="-created_at">Newest First</option>
          <option value="batch_number">Batch Number (A-Z)</option>
          <option value="-batch_number">Batch Number (Z-A)</option>
        </select>
      </div>

      {/* Batches List */}
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Batch Number</th>
              <th>Date</th>
              <th>Description</th>
              <th className="text-right">Total Debit</th>
              <th>Maker</th>
              <th>Status</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            <AnimatePresence mode="popLayout">
              {batches.map((batch) => (
                <motion.tr
                  key={batch.id}
                  layout={false}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-white/2 transition-colors cursor-pointer group"
                  onClick={() => navigate(`/finance/entries/${batch.id}/edit`)}
                >
                  <td className="px-5 py-4 font-mono text-xs text-primary font-bold">{batch.batch_number}</td>
                  <td className="px-5 py-4 text-sm text-dark-300">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={12} className="text-dark-500" />
                      {formatDate(batch.created_at)}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-white font-medium max-w-md truncate">
                    {batch.description}
                  </td>
                  <td className="px-5 py-4 text-sm text-white font-mono font-semibold text-right">
                    {formatCurrency(parseFloat(batch.total_debits))}
                  </td>
                  <td className="px-5 py-4 text-sm text-dark-300">
                      <div className="flex items-center gap-1.5">
                          <User size={12} className="text-dark-500"/>
                          {batch.maker_name}
                      </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`badge text-[10px] uppercase font-bold
                      ${batch.status === 'posted' ? 'bg-emerald-500/10 text-emerald-400' :
                        batch.status === 'approved' ? 'bg-blue-500/10 text-blue-400' :
                        batch.status === 'pending_approval' ? 'bg-amber-500/10 text-amber-400' :
                        'bg-dark-700 text-dark-400'}`}>
                      {batch.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <RecordActions record={batch} label="journal batch"
                      onEdit={() => navigate(`/finance/entries/${batch.id}/edit`)}
                      deleteFn={financeAPI.batches.delete} invalidate={['journal-batches']} />
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
            {batches.length === 0 && !isLoading && (
              <tr>
                <td colSpan={7} className="text-center py-24">
                  <div className="flex flex-col items-center justify-center opacity-50">
                    <ArrowRightLeft size={32} className="mb-4 text-dark-400" />
                    <p className="text-dark-300 font-medium">No journal batches found.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.data?.count > 0 && (
          <Pagination 
            currentPage={page}
            totalPages={data?.data?.total_pages}
            totalCount={data?.data?.count}
            onPageChange={setPage}
          />
      )}
    </div>
  )
}
