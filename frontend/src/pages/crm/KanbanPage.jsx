// Stohil Properties - CRM Kanban Board
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, DollarSign, Calendar, User, TrendingUp } from 'lucide-react'
import { crmAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import toast from 'react-hot-toast'

function OpportunityCard({ opp, onMoveStage }) {
  const priorityColor = {
    urgent: 'border-l-red-500',
    high: 'border-l-orange-500',
    medium: 'border-l-primary',
    low: 'border-l-dark-600',
  }[opp.priority] || 'border-l-dark-600'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-dark-700 border border-white/5 border-l-2 ${priorityColor}
                  rounded-lg p-3 cursor-pointer hover:bg-white/5 transition-all group`}
      onClick={() => useUIStore.getState().openSidePanel('opportunity-form', { opportunity: opp })}
    >
      <p className="text-xs text-primary font-mono mb-1">{opp.reference}</p>
      <h4 className="text-sm font-medium text-white leading-snug mb-2">{opp.title}</h4>
      {opp.contact_name && (
        <div className="flex items-center gap-1 text-xs text-dark-400 mb-1.5">
          <User size={11} /> {opp.contact_name}
        </div>
      )}
      {opp.property_ref && (
        <div className="text-xs text-dark-500 mb-2">🏠 {opp.property_ref}</div>
      )}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
        {opp.expected_value && parseFloat(opp.expected_value) > 0 ? (
          <div className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
            <DollarSign size={11} />
            {formatCurrency(parseFloat(opp.expected_value), opp.currency_code || 'USD')}
          </div>
        ) : <span />}
        {opp.expected_close_date && (
          <div className="flex items-center gap-1 text-xs text-dark-500">
            <Calendar size={11} />
            {formatDate(opp.expected_close_date)}
          </div>
        )}
      </div>
    </motion.div>
  )
}

function KanbanColumn({ column }) {
  const openPanel = useUIStore(s => s.openSidePanel)
  const total = column.opportunities?.reduce((sum, o) => sum + parseFloat(o.expected_value || '0'), 0) || 0

  return (
    <div className="flex-shrink-0 w-80">
      {/* Column Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: column.color || '#E5A645' }} />
          <span className="text-sm font-semibold text-white">{column.stage_name}</span>
          <span className="badge-gray text-xs px-1.5 py-0.5">{column.opportunities?.length || 0}</span>
        </div>
      </div>
      {total > 0 && (
        <p className="text-xs text-dark-400 px-1 mb-3">
          <TrendingUp size={10} className="inline mr-1" />
          {formatCurrency(total, 'USD')} pipeline
        </p>
      )}

      {/* Cards */}
      <div className="space-y-2 min-h-[300px] p-2 rounded-xl bg-dark-800/50 border border-white/5">
        {column.opportunities?.map((opp) => (
          <OpportunityCard key={opp.id} opp={opp} />
        ))}
        {(!column.opportunities || column.opportunities.length === 0) && (
          <div className="flex items-center justify-center h-24 text-xs text-dark-600">
            No opportunities
          </div>
        )}
        <button 
          onClick={() => openPanel('opportunity-form', { opportunity: { stage: column.stage_id } })}
          className="w-full py-2 rounded-lg border border-dashed border-white/10
                           text-xs text-dark-500 hover:text-dark-400 hover:bg-white/5
                           transition-all flex items-center justify-center gap-1 mt-2">
          <Plus size={12} /> Add Deal
        </button>
      </div>
    </div>
  )
}

export default function KanbanPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['kanban'],
    queryFn: async () => {
      const res = await crmAPI.opportunities.kanban()
      return res.data
    },
  })

  const columns = data || []
  const totalValue = columns.reduce(
    (sum, col) => sum + (col.opportunities?.reduce((s, o) => s + parseFloat(o.expected_value || '0'), 0) || 0), 0
  )
  const totalDeals = columns.reduce((sum, col) => sum + (col.opportunities?.length || 0), 0)

  return (
    <div className="p-4 lg:p-6 flex flex-col h-full space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="font-display text-2xl text-white">CRM Pipeline</h1>
          <p className="text-dark-400 text-sm mt-1">
            {totalDeals} active deals · Pipeline tracked per currency
          </p>
        </div>
        <button 
          onClick={() => useUIStore.getState().openSidePanel('opportunity-form')}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={16} /> New Opportunity
        </button>
      </div>

      {/* Kanban Board */}
      {isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex-shrink-0 w-80 h-[500px] bg-dark-800 rounded-xl animate-pulse border border-white/5" />
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1 items-start">
          {columns.map((col) => (
            <KanbanColumn key={col.stage_id} column={col} />
          ))}
          {columns.length === 0 && (
            <div className="flex-1 text-center py-20 bg-dark-800/30 rounded-2xl border border-dashed border-white/5">
              <TrendingUp size={40} className="mx-auto mb-3 text-dark-600" />
              <p className="text-dark-400 text-sm">No pipeline stages configured.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
