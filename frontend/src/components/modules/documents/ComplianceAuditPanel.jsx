import { useQuery } from '@tanstack/react-query'
import { Shield, CheckCircle2, AlertCircle, Clock, Info, X } from 'lucide-react'
import { documentsAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import { formatDate } from '@/utils/format'
import { motion } from 'framer-motion'

const STATUS_STYLE = {
  good: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
  warning: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  critical: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
  none: 'text-dark-400 bg-dark-700 border-white/5',
}
const band = (score) => (score === null || score === undefined ? 'none' : score >= 90 ? 'good' : score >= 70 ? 'warning' : 'critical')
const LABEL = { expired: 'Expired', non_compliant: 'Non-compliant', pending: 'Pending', expiring: 'Expiring soon' }

// Compliance score by requirement, computed from the compliance records.
export default function ComplianceAuditPanel() {
  const { closeSidePanel } = useUIStore()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['compliance-summary'],
    queryFn: () => documentsAPI.compliance.summary(),
  })
  const summary = data?.data
  const overall = summary?.overall_score

  return (
    <div className="flex flex-col h-full bg-dark-900">
      <div className="p-6 border-b border-white/5 bg-gradient-to-br from-primary/5 to-transparent flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Shield size={20} className="text-primary" /> Compliance Audit
          </h2>
          <p className="text-[10px] text-dark-500 uppercase tracking-widest mt-1">From compliance records, as of today</p>
        </div>
        <button onClick={closeSidePanel} className="p-2 text-dark-400 hover:text-white transition-colors" aria-label="Close">
          <X size={20} />
        </button>
      </div>

      <div className="p-6 flex-1 overflow-y-auto space-y-8 custom-scrollbar">
        {isLoading && <p className="text-dark-400 text-sm">Loading...</p>}
        {isError && <p className="text-rose-400 text-sm">Could not load the compliance summary.</p>}

        {summary && summary.record_count === 0 && (
          <div className="card p-6 text-center space-y-2">
            <Info size={28} className="mx-auto text-dark-500" />
            <p className="text-white font-medium">No compliance records yet</p>
            <p className="text-xs text-dark-400">
              Add requirements (e.g. KYC, tax clearance, insurance) and record each client's or employee's status
              against them. The score is calculated from those records.
            </p>
          </div>
        )}

        {summary && summary.record_count > 0 && (
          <>
            <div className="card p-5 bg-dark-800/30 border-white/5 overflow-hidden relative">
              <div className="absolute top-0 right-0 p-3 opacity-5"><Shield size={80} /></div>
              <div className="relative z-10">
                <p className="text-[10px] text-dark-500 font-bold uppercase tracking-[0.2em] mb-4">Overall score</p>
                <div className="flex items-end gap-3">
                  <span className="text-4xl font-bold font-display text-white">{overall ?? '—'}{overall !== null ? '%' : ''}</span>
                  <span className={`text-xs font-bold mb-1.5 flex items-center gap-1 ${band(overall) === 'good' ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {band(overall) === 'good' ? <><CheckCircle2 size={12} /> In good standing</> : <><Clock size={12} /> Requires review</>}
                  </span>
                </div>
                <div className="mt-4 w-full h-1.5 bg-dark-900 rounded-full overflow-hidden border border-white/5">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${overall || 0}%` }}
                    className="h-full bg-gradient-to-r from-amber-500 to-emerald-500" />
                </div>
                <p className="text-[10px] text-dark-500 mt-2">
                  {summary.record_count} records · valid records ÷ records that apply (exempt excluded) ·
                  compliant records expiring within {summary.expiring_window_days} days count as valid but are flagged.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-bold text-dark-500 uppercase tracking-[0.2em]">By requirement</h3>
              {summary.requirements.map((r) => (
                <div key={r.requirement} className="card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${STATUS_STYLE[band(r.score)]}`}>
                        {band(r.score) === 'good' ? <CheckCircle2 size={18} /> : band(r.score) === 'warning' ? <Info size={18} /> : <AlertCircle size={18} />}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-white truncate">{r.requirement}</h4>
                        <p className="text-[10px] text-dark-500 mt-0.5">
                          {r.compliant} compliant · {r.expiring} expiring · {r.expired} expired · {r.non_compliant} non-compliant · {r.pending} pending
                          {r.exempt ? ` · ${r.exempt} exempt` : ''}
                        </p>
                        {r.last_updated && <p className="text-[10px] text-dark-600">Last updated {formatDate(r.last_updated)}</p>}
                      </div>
                    </div>
                    <p className="text-sm font-bold text-white">{r.score ?? '—'}{r.score !== null ? '%' : ''}</p>
                  </div>
                </div>
              ))}
            </div>

            {summary.attention.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-dark-500 uppercase tracking-[0.2em]">Needs attention</h3>
                {summary.attention.map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-xs border-b border-white/5 pb-2">
                    <span className="text-dark-300">{a.requirement}{a.party ? ` — ${a.party}` : ''}</span>
                    <span className="text-dark-400">
                      {LABEL[a.status] || a.status}{a.expiry_date ? ` (${formatDate(a.expiry_date)})` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="p-6 border-t border-white/5 bg-dark-800/30">
        <button onClick={closeSidePanel} className="w-full btn-secondary py-3 flex items-center justify-center gap-2">
          Close
        </button>
      </div>
    </div>
  )
}
