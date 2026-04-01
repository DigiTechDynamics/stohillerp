// Stohill Properties - CRM Kanban Board (Odoo-parity: DnD, bulk select, lead score, next activity)
import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Plus, TrendingUp, Calendar, CheckSquare, Square,
  Flame, Snowflake, Thermometer, AlertCircle, Clock
} from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { crmAPI } from '@/services/api'
import { formatCurrency } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'

// ─────────────────────────────────────────────────────────────────────────────
// Lead Score Badge
// ─────────────────────────────────────────────────────────────────────────────
function LeadScoreBadge({ score, rating }) {
  if (!score && !rating) return null
  const isHot = rating === 'hot' || score >= 70
  const isWarm = rating === 'warm' || (score >= 40 && score < 70)

  if (isHot) return (
    <div className="flex items-center gap-0.5 text-[9px] text-red-400 font-bold">
      <Flame size={10} className="fill-red-400" />
    </div>
  )
  if (isWarm) return (
    <div className="flex items-center gap-0.5 text-[9px] text-amber-400 font-bold">
      <Thermometer size={10} />
    </div>
  )
  return (
    <div className="flex items-center gap-0.5 text-[9px] text-blue-400 font-bold">
      <Snowflake size={10} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Draggable Opportunity Card
// ─────────────────────────────────────────────────────────────────────────────
function OpportunityCard({ opp, onClick, isSelected, onToggleSelect }) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: opp.id,
    data: { opp },
  })

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: 999,
    opacity: isDragging ? 0.4 : 1,
  } : undefined

  const priorityColor = {
    '3': 'border-l-red-500',
    '2': 'border-l-orange-500',
    '1': 'border-l-primary',
    '0': 'border-l-dark-600',
  }[opp.priority] || 'border-l-dark-600'

  const isStale = opp.is_stale
  const hasOverdueActivity = opp.next_activity?.is_overdue
  const hasNextActivity = !!opp.next_activity

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      layout
      whileHover={{ y: -2, scale: 1.01 }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-dark-700/50 backdrop-blur-md border border-white/5 border-l-2 ${priorityColor}
                  rounded-xl p-4 cursor-pointer group relative
                  ${isSelected ? 'ring-2 ring-primary/50 bg-primary/5' : 'hover:border-primary/30 hover:bg-white/5'}
                  ${isStale ? 'bg-red-500/[0.03] border-red-500/20' : ''}
                  shadow-sm hover:shadow-xl hover:shadow-black/20 transition-all`}
    >
      {/* Drag handle strip */}
      <div
        {...listeners}
        className="absolute inset-x-0 top-0 h-5 cursor-grab active:cursor-grabbing rounded-t-xl"
        onClick={e => e.stopPropagation()}
      />

      {/* Checkbox + Header row */}
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); onToggleSelect(opp.id) }}
            className="flex-shrink-0 text-dark-600 hover:text-primary transition-colors"
          >
            {isSelected ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
          </button>
          <p className="text-[10px] text-primary font-mono tracking-tighter opacity-80 uppercase">{opp.reference}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {isStale && (
            <span className="text-[8px] bg-red-500 text-white font-black px-1.5 py-0.5 rounded uppercase tracking-tighter animate-pulse">
              Stale
            </span>
          )}
          <LeadScoreBadge score={opp.lead_score} rating={opp.rating} />
        </div>
      </div>


      {/* Thumbnail + Title Group */}
      <div className="flex gap-3 mb-3" onClick={onClick}>
        {opp.property_thumbnail && (
          <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border border-white/10 group-hover:border-primary/30 transition-colors">
            <img 
              src={opp.property_thumbnail} 
              alt="Property" 
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-white leading-tight group-hover:text-primary transition-colors cursor-pointer line-clamp-2">
            {opp.title}
          </h4>
          <p className="text-[10px] text-dark-400 mt-1 truncate">{opp.contact_display}</p>
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1 mb-3">
        {opp.tags?.map(tag => (
          <span
            key={tag.id}
            className="text-[9px] px-1.5 py-0.5 rounded-md uppercase font-bold tracking-wider"
            style={{ backgroundColor: `${tag.color}15`, color: tag.color, border: `1px solid ${tag.color}25` }}
          >
            {tag.name}
          </span>
        ))}
      </div>

      {/* Footer / Revenue */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5" onClick={onClick}>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-dark-600 flex items-center justify-center text-[7px] font-bold text-dark-300 border border-white/5 ring-1 ring-white/5">
            {opp.contact_display?.[0] || '?'}
          </div>
          <span className="text-[9px] text-dark-500 font-mono tracking-tighter uppercase">{opp.property_ref || 'No Property'}</span>
        </div>

        <div className="text-right">
          <p className="text-[11px] font-bold text-white font-mono">
            {formatCurrency(parseFloat(opp.expected_revenue || '0'), 'USD')}
          </p>
          {opp.probability > 0 && <p className="text-[9px] text-dark-500 font-bold">{opp.probability}%</p>}
        </div>
      </div>

      {/* Next activity indicator */}
      {hasNextActivity && (
        <div className={`mt-2 flex items-center gap-2 text-[10px] p-1.5 rounded-lg border ${
          hasOverdueActivity
            ? 'text-red-400 bg-red-500/5 border-red-500/10'
            : 'text-emerald-400 bg-emerald-500/5 border-emerald-500/10'
        }`}>
          {hasOverdueActivity ? <AlertCircle size={10} /> : <Clock size={10} />}
          <span className="truncate">{opp.next_activity.subject}</span>
        </div>
      )}
    </motion.div>
  )
}

// Ghost card shown during drag
function DragGhostCard({ opp }) {
  if (!opp) return null
  return (
    <div className="bg-dark-700 border border-primary/40 rounded-xl p-3.5 shadow-2xl shadow-primary/20 w-80 opacity-95">
      <p className="text-[10px] text-primary font-mono">{opp.reference}</p>
      <h4 className="text-sm font-semibold text-white mt-1">{opp.title}</h4>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Droppable Kanban Column
// ─────────────────────────────────────────────────────────────────────────────
function KanbanColumn({ column, isLead, selectedIds, onToggleSelect, onCardClick }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.stage_id })
  const openPanel = useUIStore(s => s.openSidePanel)

  return (
    <div className="flex-shrink-0 w-80 flex flex-col h-full max-h-full">
      {/* Column Header */}
      <div className="mb-4 px-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: column.color || '#E5A645' }} />
            <span className="text-sm font-bold text-white uppercase tracking-widest">{column.stage_name}</span>
          </div>
          <span className="text-[10px] font-bold bg-dark-700 text-dark-400 px-2 py-0.5 rounded-full border border-white/5">
            {column.count || 0}
          </span>
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5 text-dark-500">
            <TrendingUp size={10} className="text-primary" />
            <span className="font-mono font-bold text-dark-400">
              {formatCurrency(parseFloat(column.total_revenue || '0'), 'USD')}
            </span>
          </div>
          <span className="text-dark-600 font-bold uppercase tracking-tighter text-[9px]">{column.probability}% Prob.</span>
        </div>
      </div>

      {/* Drop Zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 space-y-3 p-2.5 rounded-2xl overflow-y-auto scrollbar-hide transition-all duration-150 ${
          isOver
            ? 'bg-primary/5 border-2 border-primary/30 border-dashed'
            : 'bg-dark-800/40 border border-white/5'
        }`}
      >
        {column.opportunities?.map((opp) => (
          <OpportunityCard
            key={opp.id}
            opp={opp}
            isSelected={selectedIds.includes(opp.id)}
            onToggleSelect={onToggleSelect}
            onClick={() => onCardClick(opp.id, isLead)}
          />
        ))}

        {(!column.opportunities || column.opportunities.length === 0) && (
          <div className="flex flex-col items-center justify-center py-12 text-[10px] text-dark-600 border border-dashed border-white/5 rounded-xl bg-white/[0.01]">
            <span className="uppercase tracking-widest font-bold opacity-30">No active deals</span>
          </div>
        )}

        <button
          onClick={() => openPanel('opportunity-form', { opportunity: { stage: column.stage_id, is_lead: isLead } })}
          className="w-full py-2.5 rounded-xl border border-dashed border-white/10
                     text-xs font-bold uppercase tracking-wider text-dark-500 hover:text-primary hover:border-primary/40 hover:bg-primary/5
                     transition-all flex items-center justify-center gap-2 mt-2 group"
        >
          <Plus size={14} className="group-hover:scale-110 transition-transform" />
          Quick Add
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Kanban Board
// ─────────────────────────────────────────────────────────────────────────────
export default function KanbanBoard({ pipelineId, isLead = false, selectedIds = [], onToggleSelect, onClearSelection, filters = {} }) {
  const queryClient = useQueryClient()
  const openPanel = useUIStore(s => s.openSidePanel)
  const [activeCard, setActiveCard] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const { data: columns, isLoading } = useQuery({
    queryKey: ['kanban', { pipelineId, isLead, ...filters }],
    queryFn: async () => {
      const params = { pipeline: pipelineId, is_lead: isLead, ...filters }
      // Remove empty filter values
      Object.keys(params).forEach(k => (params[k] === '' || params[k] === undefined || (Array.isArray(params[k]) && params[k].length === 0)) && delete params[k])
      const res = await crmAPI.opportunities.kanban(params)
      return res.data
    },
  })

  const moveStageMutation = useMutation({
    mutationFn: ({ opportunityId, stageId }) =>
      crmAPI.opportunities.moveStage(opportunityId, stageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
    }
  })

  const initMutation = useMutation({
    mutationFn: async () => {
      const pipelineRes = await crmAPI.pipelines.create({
        name: isLead ? 'Global Lead Pipeline' : 'Standard Sales Pipeline',
        pipeline_type: 'sale',
        is_default: !isLead
      })
      const newPipelineId = pipelineRes.data.id
      const stages = [
        { name: 'Initial Contact', stage_type: 'initial', position: 0, color: '#6366F1', probability: 10 },
        { name: 'Qualification', stage_type: 'qualified', position: 1, color: '#8B5CF6', probability: 30 },
        { name: 'Analysis', stage_type: 'qualified', position: 2, color: '#A855F7', probability: 50 },
        { name: 'Proposal', stage_type: 'offer', position: 3, color: '#EC4899', probability: 70 },
        { name: 'Negotiation', stage_type: 'negotiation', position: 4, color: '#F59E0B', probability: 90 },
        { name: 'Closed Won', stage_type: 'won', position: 5, color: '#10B981', is_terminal: true, is_won: true, probability: 100 },
        { name: 'Closed Lost', stage_type: 'lost', position: 6, color: '#EF4444', is_terminal: true, probability: 0 }
      ]
      for (const stage of stages) {
        await crmAPI.pipelines.stages.create({ ...stage, pipeline: newPipelineId })
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kanban'] })
  })

  const handleDragStart = useCallback((event) => {
    const opp = event.active.data.current?.opp
    setActiveCard(opp || null)
  }, [])

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event
    setActiveCard(null)
    if (!over || active.id === over.id) return

    // over.id is the stage_id of the drop target
    const targetStageId = over.id
    moveStageMutation.mutate({
      opportunityId: active.id,
      stageId: targetStageId,
    })
  }, [moveStageMutation])

  const handleCardClick = useCallback((id, leadStatus) => {
    openPanel('crm-detail', { id, type: leadStatus ? 'lead' : 'opp' })
  }, [openPanel])

  if (isLoading) {
    return (
      <div className="flex gap-6 overflow-x-auto h-full pb-4 scrollbar-hide">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex-shrink-0 w-80 h-full bg-dark-800/50 rounded-2xl animate-pulse border border-white/5 p-4 space-y-4">
            <div className="h-6 w-32 bg-white/5 rounded-lg" />
            <div className="h-24 w-full bg-white/5 rounded-xl" />
            <div className="h-24 w-full bg-white/5 rounded-xl" />
          </div>
        ))}
      </div>
    )
  }

  if (!columns || columns.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full max-w-xl mx-auto text-center px-6">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <TrendingUp size={40} className="text-primary animate-pulse" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2 tracking-tight">Pipeline Not Configured</h3>
        <p className="text-dark-400 text-sm mb-8 leading-relaxed">
          Initialize your stages to start tracking {isLead ? 'leads' : 'opportunities'} and potential revenue.
        </p>
        <button
          onClick={() => initMutation.mutate()}
          disabled={initMutation.isPending}
          className="btn-primary px-10 h-12 flex items-center gap-3 font-bold uppercase tracking-wider text-xs"
        >
          {initMutation.isPending ? 'Building Stages...' : <><Plus size={18} /> Initialize {isLead ? 'Lead' : 'Sales'} Pipeline</>}
        </button>
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-6 overflow-x-auto h-full pb-4 items-start scrollbar-hide">
        {columns?.map((col) => (
          <KanbanColumn
            key={col.stage_id}
            column={col}
            isLead={isLead}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
            onCardClick={handleCardClick}
          />
        ))}
      </div>

      {/* Drag overlay – floating ghost card */}
      <DragOverlay>
        {activeCard ? <DragGhostCard opp={activeCard} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
