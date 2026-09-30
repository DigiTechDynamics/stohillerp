// Stohill Properties - Commission Detail Panel
import { useUIStore } from '@/stores/authStore'
import { X, Award, Building2, User, CheckCircle2, Calendar } from 'lucide-react'
import { formatCurrency, formatDate } from '@/utils/format'

export default function CommissionDetailPanel() {
  const closePanel = useUIStore((s) => s.closeSidePanel)
  const payload = useUIStore((s) => s.panelPayload)
  const record = payload?.record

  if (!record) return null

  return (
    <div className="flex flex-col h-full bg-dark-950">
      <div className="flex items-center justify-between p-6 border-b border-white/10 bg-dark-900">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
            <Award size={20} />
          </div>
          <div>
            <h2 className="text-xl font-display text-white">Commission Record</h2>
            <p className="text-sm font-mono text-primary">{record.reference}</p>
          </div>
        </div>
        <button onClick={closePanel} className="p-2 hover:bg-white/5 rounded-full transition-colors">
          <X size={20} className="text-dark-400 hover:text-white" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {/* Status & Amount */}
        <div className="flex justify-between items-center bg-dark-800 p-4 rounded-xl border border-white/5">
          <div>
            <p className="text-xs text-dark-400 uppercase tracking-widest mb-1">Status</p>
            <span className={`badge text-xs uppercase font-bold
              ${record.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' :
                record.status === 'pending' ? 'bg-amber-500/10 text-amber-400' : 'bg-dark-700 text-dark-400'}`}>
              {record.status}
            </span>
          </div>
          <div className="text-right">
            <p className="text-xs text-dark-400 uppercase tracking-widest mb-1">Calculated Amount</p>
            <p className="text-2xl font-bold text-white leading-none">{formatCurrency(parseFloat(record.net_commission))}</p>
          </div>
        </div>

        {/* Details List */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-dark-300 border-b border-white/5 pb-2">Record Details</h3>
          
          <div className="flex items-center gap-3 text-sm">
            <User size={16} className="text-dark-500 w-5" />
            <span className="text-dark-400 w-24">Agent</span>
            <span className="text-white font-medium">{record.agent_name}</span>
          </div>
          
          <div className="flex items-center gap-3 text-sm">
            <Building2 size={16} className="text-dark-500 w-5" />
            <span className="text-dark-400 w-24">Transaction</span>
            <span className="text-white font-medium">{record.property_ref || 'N/A'}</span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <Calendar size={16} className="text-dark-500 w-5" />
            <span className="text-dark-400 w-24">Calculation Date</span>
            <span className="text-white">{formatDate(record.created_at)}</span>
          </div>

          {record.approved_date && (
            <div className="flex items-center gap-3 text-sm">
              <CheckCircle2 size={16} className="text-dark-500 w-5" />
              <span className="text-dark-400 w-24">Approved Date</span>
              <span className="text-white">{formatDate(record.approved_date)}</span>
            </div>
          )}
        </div>

        {record.notes && (
          <div className="space-y-2 pt-4 border-t border-white/5">
            <h3 className="text-sm font-medium text-dark-300">Notes</h3>
            <p className="text-sm text-dark-400 bg-dark-800 p-3 rounded-lg border border-white/5">
              {record.notes}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
