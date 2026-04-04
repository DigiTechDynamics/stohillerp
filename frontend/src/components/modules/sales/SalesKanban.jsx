// Stohill Properties – Sales Pipeline Kanban Board
// Drag-and-drop deal cards across lifecycle columns.
// Uses native HTML5 drag API (no extra dependency needed).

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2,
  User,
  DollarSign,
  Calendar,
  ArrowRight,
  RefreshCw,
  LayoutGrid,
  Loader2,
  Globe,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { salesAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'

// ── Stage colour mapping ──────────────────────────────────────────────────────
const STAGE_META = {
  offer_submitted: {
    label: 'Offer Submitted',
    gradient: 'from-blue-500/30 to-blue-500/5',
    border: 'border-blue-500/40',
    badge: 'bg-blue-500/20 text-blue-300',
    dot: 'bg-blue-400',
  },
  offer_accepted: {
    label: 'Offer Accepted',
    gradient: 'from-cyan-500/30 to-cyan-500/5',
    border: 'border-cyan-500/40',
    badge: 'bg-cyan-500/20 text-cyan-300',
    dot: 'bg-cyan-400',
  },
  suspensive: {
    label: 'Suspensive Conditions',
    gradient: 'from-amber-500/30 to-amber-500/5',
    border: 'border-amber-500/40',
    badge: 'bg-amber-500/20 text-amber-300',
    dot: 'bg-amber-400',
  },
  bond_approved: {
    label: 'Bond Approved',
    gradient: 'from-violet-500/30 to-violet-500/5',
    border: 'border-violet-500/40',
    badge: 'bg-violet-500/20 text-violet-300',
    dot: 'bg-violet-400',
  },
  transfer: {
    label: 'Transfer in Progress',
    gradient: 'from-orange-500/30 to-orange-500/5',
    border: 'border-orange-500/40',
    badge: 'bg-orange-500/20 text-orange-300',
    dot: 'bg-orange-400',
  },
  registered: {
    label: 'Registered / Complete',
    gradient: 'from-emerald-500/30 to-emerald-500/5',
    border: 'border-emerald-500/40',
    badge: 'bg-emerald-500/20 text-emerald-300',
    dot: 'bg-emerald-400',
  },
  cancelled: {
    label: 'Cancelled / Fallen Through',
    gradient: 'from-red-500/10 to-red-500/5',
    border: 'border-red-500/20',
    badge: 'bg-red-500/10 text-red-400',
    dot: 'bg-red-500',
  },
}

// ── Deal Card ─────────────────────────────────────────────────────────────────
function DealCard({ deal, onDragStart, onClick }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('dealId', deal.id)
        e.dataTransfer.setData('fromStatus', deal.status)
        onDragStart(deal.id)
      }}
      className="group bg-dark-800 border border-white/8 rounded-xl p-3.5 cursor-grab active:cursor-grabbing
                 hover:border-white/20 hover:shadow-lg hover:shadow-black/30 transition-all duration-200 select-none"
      onClick={() => onClick(deal)}
    >
      {/* Property */}
      <div className="flex items-start gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-dark-700 border border-white/5 mt-0.5 shrink-0">
          <Building2 size={12} className="text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-white leading-tight truncate">
            {deal.property_name || 'Unnamed Property'}
          </p>
          <p className="text-[10px] text-dark-400 font-mono mt-0.5">{deal.property_ref}</p>
        </div>
      </div>

      {/* Client */}
      <div className="flex items-center gap-1.5 mb-2.5">
        <User size={11} className="text-dark-500 shrink-0" />
        <span className="text-[12px] text-dark-300 truncate">{deal.buyer_name || '—'}</span>
      </div>

      {/* Sale Price */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <DollarSign size={11} className="text-emerald-400 shrink-0" />
          <span className="text-[13px] font-bold text-emerald-400">
            {formatCurrency(parseFloat(deal.sale_price || 0), deal.currency_code)}
          </span>
        </div>
        {deal.offer_date && (
          <div className="flex items-center gap-1 text-dark-500">
            <Calendar size={10} />
            <span className="text-[10px]">{formatDate(deal.offer_date)}</span>
          </div>
        )}
      </div>

      {/* Reference */}
      <div className="mt-2.5 pt-2.5 border-t border-white/5 flex items-center justify-between">
        <span className="font-mono text-[10px] text-primary/80">{deal.sale_reference}</span>
        <ArrowRight
          size={12}
          className="text-dark-600 group-hover:text-primary group-hover:translate-x-0.5 transition-all"
        />
      </div>
    </motion.div>
  )
}

// ── Column ────────────────────────────────────────────────────────────────────
function KanbanColumn({ column, onDrop, onDragOver, onDragLeave, isDragOver, onCardClick }) {
  const meta = STAGE_META[column.id] || {}

  return (
    <div
      className={`flex flex-col rounded-2xl border transition-all duration-200 min-w-[260px] max-w-[280px] h-full
        ${isDragOver
          ? 'border-primary/60 bg-primary/5 shadow-lg shadow-primary/10'
          : `${meta.border || 'border-white/8'} bg-dark-900/60`
        }`}
      onDragOver={(e) => { e.preventDefault(); onDragOver(column.id) }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault()
        const dealId = e.dataTransfer.getData('dealId')
        const fromStatus = e.dataTransfer.getData('fromStatus')
        onDrop(dealId, column.id, fromStatus)
      }}
    >
      {/* Column Header */}
      <div className={`p-3.5 rounded-t-2xl bg-gradient-to-b ${meta.gradient || ''} border-b border-white/5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${meta.dot || 'bg-dark-400'}`} />
            <span className="text-[12px] font-semibold text-white/90">{column.label}</span>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.badge || 'bg-dark-700 text-dark-300'}`}>
            {column.deals.length}
          </span>
        </div>
        {column.total_value > 0 && (
          <p className="text-[11px] text-dark-400 mt-1.5 font-medium">
            {formatCurrency(column.total_value, 'USD')} total
          </p>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {column.deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              onDragStart={() => {}}
              onClick={onCardClick}
            />
          ))}
        </AnimatePresence>
        {column.deals.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 opacity-40">
            <LayoutGrid size={24} className="text-dark-600 mb-2" />
            <p className="text-[11px] text-dark-500">No deals here</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SalesKanban({ onDealClick }) {
  const queryClient = useQueryClient()
  const [dragOverCol, setDragOverCol] = useState(null)
  const [syncStatus, setSyncStatus] = useState(null) // 'ok' | 'error'

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['sales-kanban'],
    queryFn: () => salesAPI.kanban(),
    refetchInterval: 30_000, // auto refresh every 30s
  })

  const mutation = useMutation({
    mutationFn: ({ id, status }) => salesAPI.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-kanban'] })
      queryClient.invalidateQueries({ queryKey: ['sales-transactions'] })
      setSyncStatus('ok')
      setTimeout(() => setSyncStatus(null), 3000)
    },
    onError: () => {
      setSyncStatus('error')
      setTimeout(() => setSyncStatus(null), 4000)
    },
  })

  const columns = data?.data?.columns || []

  const handleDrop = (dealId, toStatus, fromStatus) => {
    if (toStatus === fromStatus) return
    mutation.mutate({ id: dealId, status: toStatus })
    setDragOverCol(null)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Board toolbar */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <p className="text-sm text-dark-400">
            {columns.reduce((a, c) => a + c.deals.length, 0)} active deals
          </p>
          {syncStatus === 'ok' && (
            <div className="flex items-center gap-1.5 text-emerald-400 text-[12px]">
              <Globe size={12} />
              <CheckCircle2 size={12} />
              <span>Synced to website</span>
            </div>
          )}
          {syncStatus === 'error' && (
            <div className="flex items-center gap-1.5 text-red-400 text-[12px]">
              <AlertCircle size={12} />
              <span>Sync failed – check logs</span>
            </div>
          )}
        </div>
        <button
          className="btn-ghost text-xs flex items-center gap-1.5"
          onClick={() => refetch()}
          disabled={isRefetching}
        >
          <RefreshCw size={13} className={isRefetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Board */}
      {isLoading ? (
        <div className="flex items-center justify-center flex-1 gap-3 text-dark-400">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">Loading pipeline...</span>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1 min-h-0 custom-scrollbar">
          {columns.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col}
              onDrop={handleDrop}
              onDragOver={(id) => setDragOverCol(id)}
              onDragLeave={() => setDragOverCol(null)}
              isDragOver={dragOverCol === col.id}
              onCardClick={onDealClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}
