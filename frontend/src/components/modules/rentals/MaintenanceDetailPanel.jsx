// Stohill Properties - Maintenance Detail & Management Panel
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Wrench, Building2, User, Calendar, DollarSign,
  AlertTriangle, CheckCircle2, Clock, Play, Save, ChevronRight
} from 'lucide-react'
import { rentalsAPI } from '@/services/api'
import { formatCurrency, formatDate, getStatusColor } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'

function InfoRow({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="text-[10px] text-dark-500 uppercase tracking-widest">{label}</span>
      <span className={`text-xs font-medium ${accent || 'text-white'}`}>{value || '—'}</span>
    </div>
  )
}

export default function MaintenanceDetailPanel() {
  const { sidePanelData, closeSidePanel } = useUIStore()
  const queryClient = useQueryClient()
  const ticket = sidePanelData?.ticket
  
  const [resolutionNotes, setResolutionNotes] = useState(ticket?.resolution_notes || '')
  const [actualCost, setActualCost] = useState(ticket?.actual_cost || '')
  const [contractor, setContractor] = useState(ticket?.assigned_contractor || '')

  const statusMutation = useMutation({
    mutationFn: (newStatus) => rentalsAPI.maintenance.updateStatus(ticket.id, {
      status: newStatus,
      resolution_notes: resolutionNotes,
      actual_cost: actualCost,
      assigned_contractor: contractor
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-maintenance'] })
      queryClient.invalidateQueries({ queryKey: ['rental-stats'] })
      closeSidePanel()
    },
  })

  const saveMutation = useMutation({
    mutationFn: (data) => rentalsAPI.maintenance.update(ticket.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-maintenance'] })
      closeSidePanel()
    },
  })

  if (!ticket) return null

  const isClosed = ['completed', 'closed', 'cancelled'].includes(ticket.status)

  return (
    <div className="flex flex-col h-full bg-dark-900 overflow-y-auto scrollbar-hide">
      <div className="p-6 space-y-6">
        {/* Header Ribbon */}
        <div className={`p-4 rounded-2xl border ${
          ticket.priority === 'emergency' ? 'bg-red-500/10 border-red-500/20' :
          ticket.priority === 'high' ? 'bg-amber-500/10 border-amber-500/20' :
          'bg-primary/10 border-primary/20'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                ticket.priority === 'emergency' ? 'text-red-400 bg-red-500/10' :
                ticket.priority === 'high' ? 'text-amber-400 bg-amber-500/10' :
                'text-primary bg-primary/10'
              }`}>
                <Wrench size={24} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">{ticket.reference}</h3>
                <span className={`badge text-[10px] font-bold uppercase ${getStatusColor(ticket.status)}`}>
                  {ticket.status?.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-dark-500 uppercase tracking-widest">Priority</p>
              <p className={`text-xs font-bold uppercase ${
                ticket.priority === 'emergency' ? 'text-red-400' :
                ticket.priority === 'high' ? 'text-amber-400' :
                'text-primary'
              }`}>{ticket.priority}</p>
            </div>
          </div>
        </div>

        {/* Core Details */}
        <div className="space-y-4">
          <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest border-b border-white/5 pb-2">
            Ticket Details
          </h4>
          <InfoRow label="Category" value={ticket.category} />
          <InfoRow label="Reported On" value={formatDate(ticket.created_at)} />
          <div className="py-2">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest mb-1.5">Description</p>
            <p className="text-xs text-dark-300 bg-white/2 p-3 rounded-xl leading-relaxed border border-white/5">
              {ticket.description}
            </p>
          </div>
        </div>

        {/* Association Details */}
        <div className="space-y-4">
          <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest border-b border-white/5 pb-2">
            Location & Contact
          </h4>
          <InfoRow label="Property" value={ticket.property_name} accent="text-primary" />
          <InfoRow label="Ref #" value={ticket.property_ref} />
          <InfoRow label="Tenant / Reported By" value={ticket.tenant_name || 'Guest / Public'} />
          {ticket.lease_number && <InfoRow label="Linked Lease" value={ticket.lease_number} />}
        </div>

        {/* Management Controls */}
        {!isClosed && (
          <div className="space-y-6 pt-4">
            <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest border-b border-emerald-500/10 pb-2">
              Management Center
            </h4>

            {/* Contractor Assignment */}
            <div className="space-y-1.5 font-sans">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Assign Contractor / Handyman</label>
              <input 
                type="text" 
                value={contractor} 
                onChange={(e) => setContractor(e.target.value)}
                placeholder="Name or Company..." 
                className="form-input w-full" 
              />
            </div>

            {/* Cost Controls */}
            <div className="grid grid-cols-2 gap-4 font-sans">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Estimated Cost</label>
                <div className="text-sm font-medium text-white p-2.5 rounded-xl bg-dark-800 border border-white/5">
                  {ticket.estimated_cost ? formatCurrency(parseFloat(ticket.estimated_cost)) : '--'}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Actual Cost</label>
                <div className="relative">
                  <DollarSign size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400" />
                  <input 
                    type="number" 
                    step="0.01" 
                    value={actualCost} 
                    onChange={(e) => setActualCost(e.target.value)}
                    placeholder="0.00" 
                    className="form-input w-full pl-8 border-emerald-500/20 focus:border-emerald-500/50" 
                  />
                </div>
              </div>
            </div>

            {/* Status Transitions */}
            <div className="space-y-3 pt-2">
              <p className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Action Pipeline</p>
              <div className="grid grid-cols-2 gap-2">
                {ticket.status === 'logged' && (
                  <button 
                    onClick={() => statusMutation.mutate('acknowledged')}
                    className="flex items-center justify-center gap-2 py-3 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20 hover:bg-blue-500/20 transition-all font-bold text-xs uppercase"
                  >
                    <Clock size={14} /> Acknowledge
                  </button>
                )}
                {(ticket.status === 'logged' || ticket.status === 'acknowledged') && (
                  <button 
                    onClick={() => statusMutation.mutate('in_progress')}
                    className="flex items-center justify-center gap-2 py-3 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20 hover:bg-amber-500/20 transition-all font-bold text-xs uppercase"
                  >
                    <Play size={14} /> Start Service
                  </button>
                )}
                {ticket.status === 'in_progress' && (
                  <button 
                    onClick={() => statusMutation.mutate('pending_parts')}
                    className="flex items-center justify-center gap-2 py-3 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20 hover:bg-purple-500/20 transition-all font-bold text-xs uppercase"
                  >
                    <Clock size={14} /> On Hold
                  </button>
                )}
              </div>
            </div>

            {/* Finalization Section */}
            <div className="bg-emerald-500/5 rounded-2xl p-4 space-y-4 border border-emerald-500/10">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Completion / Resolution Notes</label>
                <textarea 
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={3} 
                  placeholder="Record what was fixed and any warranty info..." 
                  className="form-input w-full border-emerald-500/10 focus:border-emerald-500/30"
                ></textarea>
              </div>
              <button 
                onClick={() => statusMutation.mutate('completed')}
                className="w-full btn-primary py-4 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 border-none shadow-lg shadow-emerald-900/20"
              >
                <CheckCircle2 size={18} /> Complete & Close Ticket
              </button>
            </div>
          </div>
        )}

        {/* Conclusion Summary */}
        {isClosed && (
          <div className="bg-emerald-500/5 rounded-2xl p-4 space-y-3 border border-emerald-500/10 animate-in fade-in duration-500">
            <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Resolution Summary</h4>
            <InfoRow label="Completed Date" value={formatDate(ticket.completed_date)} accent="text-emerald-400" />
            <InfoRow label="Contractor" value={ticket.assigned_contractor} />
            <InfoRow label="Actual cost" value={formatCurrency(parseFloat(ticket.actual_cost))} accent="text-emerald-400" />
            <div className="pt-2">
              <p className="text-[10px] text-dark-500 uppercase tracking-widest mb-1">Notes</p>
              <p className="text-xs text-emerald-400/70 italic">"{ticket.resolution_notes || 'No notes recorded.'}"</p>
            </div>
          </div>
        )}
      </div>

      {/* Basic Edit / Footer */}
      {!isClosed && (
        <div className="p-6 border-t border-white/5 bg-dark-800/30 mt-auto">
          <button 
            onClick={() => saveMutation.mutate({ assigned_contractor: contractor, actual_cost: actualCost, resolution_notes: resolutionNotes })}
            disabled={saveMutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-widest text-dark-400 hover:text-white transition-colors"
          >
            <Save size={14} /> {saveMutation.isPending ? 'Saving...' : 'Save Draft Changes'}
          </button>
        </div>
      )}
    </div>
  )
}
