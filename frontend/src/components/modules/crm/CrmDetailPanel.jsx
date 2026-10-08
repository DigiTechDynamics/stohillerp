import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  User, Mail, Phone, TrendingUp, Clock, CheckCircle, ArrowRight, Tag as TagIcon, Building2, AlertCircle, ChevronRight, Trophy, XCircle, Zap, Flame, Thermometer, Snowflake, Activity as ActivityIcon, Loader2
} from 'lucide-react'
import { crmAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import { toast } from 'react-hot-toast'
import Chatter from '@/components/common/Chatter'
import LostReasonModal from './LostReasonModal'

// ─────────────────────────────────────────────────────────────────────────────
// Inline Quick-Activity Panel
// ─────────────────────────────────────────────────────────────────────────────
function InlineActivityForm({ opportunityId, onClose }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    activity_type: 'call',
    subject: '',
    due_date: '',
    description: '',
  })

  const mutation = useMutation({
    mutationFn: (data) => crmAPI.activities.create({ ...data, opportunity: opportunityId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-opportunity', opportunityId] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
      toast.success('Activity scheduled')
      onClose()
    },
    onError: () => toast.error('Failed to schedule activity')
  })

  const TYPES = [
    { value: 'call', label: '📞 Call' },
    { value: 'email', label: '📧 Email' },
    { value: 'meeting', label: '🤝 Meeting' },
    { value: 'viewing', label: '🏠 Viewing' },
    { value: 'task', label: '✅ Task' },
    { value: 'whatsapp', label: '💬 WhatsApp' },
  ]

  return (
    <div className="bg-dark-700/60 border border-white/10 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
          <ActivityIcon size={11} /> Schedule Activity
        </p>
        <button onClick={onClose} className="text-dark-600 hover:text-dark-400 text-xs">✕</button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={form.activity_type}
          onChange={e => setForm(p => ({ ...p, activity_type: e.target.value }))}
          className="form-input text-xs h-9"
        >
          {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input
          type="datetime-local"
          value={form.due_date}
          onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
          className="form-input text-xs h-9"
        />
      </div>
      <input
        type="text"
        placeholder="Subject / description"
        value={form.subject}
        onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
        className="form-input w-full text-xs h-9"
        autoFocus
      />
      <div className="flex gap-2">
        <button
          onClick={() => form.subject && mutation.mutate(form)}
          disabled={!form.subject || mutation.isPending}
          className="flex-1 btn-primary py-2 text-xs flex items-center justify-center gap-2"
        >
          {mutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <><Zap size={12} /> Schedule</>}
        </button>
        <button onClick={onClose} className="btn-secondary px-4 py-2 text-xs">Cancel</button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Detail Panel
// ─────────────────────────────────────────────────────────────────────────────
export default function CrmDetailPanel({ id }) {
  const closePanel = useUIStore(s => s.closeSidePanel)
  const openPanel = useUIStore(s => s.openSidePanel)
  const queryClient = useQueryClient()
  const [showLostModal, setShowLostModal] = useState(false)
  const [showActivityForm, setShowActivityForm] = useState(false)

  const { data: oppRes, isLoading } = useQuery({
    queryKey: ['crm-opportunity', id],
    queryFn: () => crmAPI.opportunities.detail(id),
    enabled: !!id
  })

  const opp = oppRes?.data

  const moveStageMutation = useMutation({
    mutationFn: (stageId) => crmAPI.opportunities.moveStage(id, stageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-opportunity', id] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
      toast.success('Stage updated')
    }
  })

  const convertMutation = useMutation({
    mutationFn: () => crmAPI.opportunities.convertToOpportunity(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-opportunity', id] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
      toast.success('Lead converted to opportunity!')
    }
  })

  const wonMutation = useMutation({
    mutationFn: () => crmAPI.opportunities.markWon(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-opportunity', id] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
      toast.success('🏆 Deal marked as WON!')
    },
    onError: () => toast.error('Failed to mark as won')
  })

  if (isLoading) {
    return (
      <div className="p-8 space-y-6 animate-pulse">
        <div className="h-4 w-24 bg-dark-700 rounded" />
        <div className="h-8 w-64 bg-dark-700 rounded" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-24 bg-dark-800 rounded-xl" />
          <div className="h-24 bg-dark-800 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!opp) return (
    <div className="p-12 text-center space-y-4">
      <AlertCircle size={48} className="mx-auto text-dark-600 mb-4" />
      <h3 className="text-white font-medium">Record not found</h3>
      <p className="text-dark-500 text-xs">The requested deal or lead detail could not be retrieved.</p>
      <button onClick={closePanel} className="btn-secondary px-6">Close Panel</button>
    </div>
  )

  const isWon = opp.stage_data?.is_won || opp.pipeline_stages?.find(s => s.id === opp.stage)?.is_won
  const isLost = opp.pipeline_stages?.find(s => s.id === opp.stage)?.is_terminal && !isWon

  return (
    <div className="flex flex-col h-full bg-dark-900 overflow-hidden">
      {/* Odoo-style Stage Progress Bar */}
      <div className="bg-dark-800/80 border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide mb-2">
          {opp.pipeline_stages?.filter(s => !s.is_terminal).map((stage, idx) => {
            const isCurrent = stage.id === opp.stage
            const currentIdx = opp.pipeline_stages?.findIndex(s => s.id === opp.stage) ?? -1
            const isPast = !isCurrent && currentIdx > idx
            return (
              <div key={stage.id} className="flex items-center">
                <button
                  onClick={() => moveStageMutation.mutate(stage.id)}
                  disabled={isCurrent || moveStageMutation.isPending}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5
                    ${isCurrent ? 'bg-primary text-white shadow-lg shadow-primary/20' :
                      isPast ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-dark-500 hover:text-dark-300'}`}
                >
                  {isPast && <CheckCircle size={11} />}
                  {stage.name}
                </button>
                {idx < (opp.pipeline_stages?.filter(s => !s.is_terminal).length || 0) - 1 && (
                  <ChevronRight size={14} className="text-dark-700 mx-0.5" />
                )}
              </div>
            )
          })}
        </div>

        {/* Action Buttons Row */}
        <div className="flex items-center gap-2 flex-wrap">
          {opp.is_lead && (
            <button
              onClick={() => convertMutation.mutate()}
              disabled={convertMutation.isPending}
              className="btn-primary h-7 px-3 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5"
            >
              {convertMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <><TrendingUp size={11} /> Convert</>}
            </button>
          )}
          {!opp.is_lead && !isWon && !isLost && (
            <>
              <button
                onClick={() => wonMutation.mutate()}
                disabled={wonMutation.isPending}
                className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
              >
                {wonMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <><Trophy size={11} /> Mark Won</>}
              </button>
              <button
                onClick={() => setShowLostModal(true)}
                className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-bold uppercase tracking-widest hover:bg-red-500/20 transition-all"
              >
                <XCircle size={11} /> Mark Lost
              </button>
            </>
          )}
          {isWon && (
            <span className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-widest">
              <Trophy size={11} /> WON
            </span>
          )}
          {isLost && (
            <span className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-bold uppercase tracking-widest">
              <XCircle size={11} /> LOST {opp.lost_reason_name ? `— ${opp.lost_reason_name}` : ''}
            </span>
          )}

          {/* Schedule Activity Quick Button */}
          <button
            onClick={() => setShowActivityForm(!showActivityForm)}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-white/5 border border-white/10 text-dark-400 text-[10px] font-bold uppercase tracking-widest hover:text-white hover:border-primary/30 transition-all ml-auto"
          >
            <ActivityIcon size={11} /> Activity
          </button>
          <button
            onClick={() => openPanel('opportunity-form', { opportunity: opp })}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-white/5 border border-white/10 text-dark-400 text-[10px] font-bold uppercase tracking-widest hover:text-white transition-all"
          >
            Edit
          </button>
        </div>
      </div>

      {/* Inline Activity Form */}
      {showActivityForm && (
        <div className="px-6 pt-4">
          <InlineActivityForm opportunityId={id} onClose={() => setShowActivityForm(false)} />
        </div>
      )}

      {/* Main Content Split View */}
      <div className="flex-1 flex flex-col md:flex-row min-w-0 overflow-hidden">
        {/* Left Side: Details */}
        <div className="md:w-[60%] min-w-0 border-b md:border-b-0 md:border-r border-white/5 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <header>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-lg border border-primary/20 tracking-tighter">
                {opp.reference}
              </span>
              <div className="flex gap-1.5">
                {[...Array(3)].map((_, i) => (
                  <TagIcon
                    key={i}
                    size={14}
                    className={i < (parseInt(opp.priority) || 0) ? 'text-amber-400 fill-amber-400' : 'text-dark-700'}
                  />
                ))}
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight leading-tight mb-2">
              {opp.title}
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {opp.tags?.map(tag => (
                <span key={tag.id} className="text-[9px] font-bold px-2 py-0.5 rounded bg-dark-800 text-dark-400 border border-white/5 uppercase tracking-wider" style={{ borderLeftColor: tag.color, borderLeftWidth: '3px' }}>
                  {tag.name}
                </span>
              ))}
            </div>
          </header>

          {/* Financials */}
          <section className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <p className="text-[10px] text-dark-500 font-bold uppercase tracking-widest">Expected Revenue</p>
              <p className="text-xl font-mono font-bold text-white tracking-tighter">
                {formatCurrency(parseFloat(opp.expected_revenue || '0'), opp.currency_code)}
              </p>
              <p className="text-[10px] text-dark-500 font-bold italic">at {opp.probability}% probability</p>
            </div>
            <div className="space-y-1 text-right">
              <p className="text-[10px] text-dark-500 font-bold uppercase tracking-widest">Expected Close</p>
              <p className="text-sm font-bold text-white">
                {opp.expected_closing ? formatDate(opp.expected_closing) : 'Not set'}
              </p>
              <p className="text-[10px] text-dark-500 font-bold uppercase tracking-widest mt-2">Assigned Agent</p>
              <p className="text-xs text-primary font-bold">{opp.assigned_agent_name || 'Unassigned'}</p>
            </div>
          </section>

          {/* Next scheduled activity */}
          {opp.next_activity_date && (
            <section className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 flex items-center gap-3">
              <Clock size={16} className="text-amber-500 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Next Scheduled Activity</p>
                <p className="text-xs text-dark-300">{formatDate(opp.next_activity_date)}</p>
              </div>
            </section>
          )}

          {/* Contact */}
          <section className="bg-dark-800/40 rounded-2xl border border-white/5 p-5 space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-inner">
                <User size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-dark-500 font-bold uppercase tracking-widest">Contact Person</p>
                <h3 className="text-base font-bold text-white truncate">{opp.contact_display || 'Anonymous Lead'}</h3>
                {opp.contact_obj?.company && (
                  <p className="text-[10px] text-dark-500">{opp.contact_obj.company}</p>
                )}
              </div>
              {opp.contact && (
                <button
                  onClick={() => openPanel('contact-detail', { contactId: opp.contact, contact: opp.contact_obj })}
                  className="p-2 rounded-lg bg-white/5 text-dark-400 hover:text-primary hover:bg-primary/10 transition-all"
                >
                  <ArrowRight size={16} />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
              <div className="flex items-center gap-3">
                <Mail size={14} className="text-dark-500" />
                <span className="text-xs text-dark-300 truncate">{opp.contact_email || 'No email'}</span>
              </div>
              <div className="flex items-center gap-3">
                <Phone size={14} className="text-dark-500" />
                <span className="text-xs text-dark-300">{opp.contact_phone || 'No phone'}</span>
              </div>
            </div>

            {/* Lead score */}
            {opp.contact_obj?.lead_score !== undefined && (
              <div className="flex items-center gap-3 pt-2 border-t border-white/5">
                {opp.contact_obj.lead_score >= 70 ? <Flame size={14} className="text-red-400" /> :
                  opp.contact_obj.lead_score >= 40 ? <Thermometer size={14} className="text-amber-400" /> :
                    <Snowflake size={14} className="text-blue-400" />}
                <div>
                  <p className="text-[10px] text-dark-500 font-bold uppercase tracking-widest">Lead Score</p>
                  <p className="text-xs font-bold text-white">{opp.contact_obj.lead_score} / 100</p>
                </div>
              </div>
            )}

            {opp.property_ref && (
              <div className="flex items-center gap-3 pt-4 mt-2 border-t border-white/5">
                <Building2 size={14} className="text-emerald-400" />
                <div>
                  <p className="text-[10px] text-dark-500 font-bold uppercase tracking-widest">Interested Property</p>
                  <p className="text-xs text-white font-semibold">{opp.property_name} ({opp.property_ref})</p>
                </div>
              </div>
            )}
          </section>

          {/* Internal notes */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-dark-500 uppercase tracking-widest flex items-center gap-2">
              <AlertCircle size={14} className="text-amber-500" /> Internal Notes
            </h3>
            <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4">
              <p className="text-xs text-dark-300 leading-relaxed italic">
                {opp.internal_notes || 'No internal notes recorded yet. Use the chatter to add communication history.'}
              </p>
            </div>
          </section>
        </div>

        {/* Right Side: Chatter & Activities */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <Chatter
            opportunityId={id}
            opportunityData={opp}
            contactId={opp.contact}
            contactData={opp.contact_obj || {
              id: opp.contact,
              first_name: opp.contact_display?.split(' ')[0],
              last_name: opp.contact_display?.split(' ')[1]
            }}
          />
        </div>
      </div>

      {/* Lost Reason Modal */}
      {showLostModal && (
        <LostReasonModal
          opportunityId={id}
          onClose={() => setShowLostModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['crm-opportunity', id] })
            queryClient.invalidateQueries({ queryKey: ['kanban'] })
          }}
        />
      )}
    </div>
  )
}
