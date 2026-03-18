import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Calendar, Hash, FileText, ArrowRightLeft, User, Clock, CheckCircle2, AlertCircle } from 'lucide-react'
import { financeAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'

export default function JournalEntryDetailPanel({ entry: initialEntry }) {
  const navigate = useNavigate()
  const { closeSidePanel } = useUIStore()

  // Fetch full detail with lines
  const { data, isLoading } = useQuery({
    queryKey: ['journal-entry', initialEntry.id],
    queryFn: () => financeAPI.entries.detail(initialEntry.id),
    initialData: { data: initialEntry }
  })

  const entry = data?.data || initialEntry

  if (isLoading) return <div className="p-20 text-center text-dark-400">Loading details...</div>

  return (
    <div className="p-6 space-y-6">
      {/* Header Info */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-primary bg-primary/10 px-2.5 py-1 rounded-lg">
            <Hash size={12} />
            {entry.reference}
          </div>
          <span className={`badge text-[10px] uppercase font-bold
            ${entry.status === 'posted' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-dark-700 text-dark-400'}`}>
            {entry.status}
          </span>
        </div>

        <div>
           <h2 className="text-xl font-semibold text-white">{entry.description}</h2>
           <p className="text-dark-400 text-xs mt-1 italic">{entry.narration || 'No additional narration provided.'}</p>
        </div>
      </div>

      {/* Meta Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-dark-800/50 border border-white/5 rounded-xl p-3">
          <p className="text-[10px] text-dark-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
            <Calendar size={10} /> Posting Date
          </p>
          <p className="text-sm text-white font-medium">{formatDate(entry.entry_date)}</p>
          <p className="text-[9px] text-dark-500 mt-1">{entry.period_name}</p>
        </div>
        <div className="bg-dark-800/50 border border-white/5 rounded-xl p-3">
          <p className="text-[10px] text-dark-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
            <FileText size={10} /> Journal
          </p>
          <p className="text-sm text-white font-medium truncate">{entry.journal_name || 'General Journal'}</p>
          <p className="text-[9px] text-dark-500 mt-1 font-mono uppercase">{entry.journal_code || 'GJ'}</p>
        </div>
      </div>

      {entry.source_reference && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hash size={12} className="text-primary" />
            <span className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Source Ref</span>
          </div>
          <span className="text-sm font-mono text-primary font-medium">{entry.source_reference}</span>
        </div>
      )}

      {/* Lines Section */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-bold text-dark-500 uppercase tracking-widest flex items-center gap-2">
          <ArrowRightLeft size={12} /> Entry Lines
        </h3>
        
        <div className="card overflow-hidden !bg-dark-900 border border-white/5">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-white/2 border-b border-white/5">
                <th className="px-3 py-2 text-dark-400 font-medium">Account</th>
                <th className="px-3 py-2 text-dark-400 font-medium text-right">Debit</th>
                <th className="px-3 py-2 text-dark-400 font-medium text-right">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {entry.lines?.map((line, idx) => (
                <tr key={idx} className="hover:bg-white/2 transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="text-white font-medium">{line.account_name}</div>
                    {line.entity_name && (
                      <div className="text-[10px] text-primary/80 font-medium mt-0.5">
                        Ref: {line.entity_name}
                      </div>
                    )}
                    <div className="text-[10px] text-dark-500 font-mono">{line.account_code}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-400">
                    {line.side === 'debit' ? formatCurrency(parseFloat(line.amount)) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-primary">
                    {line.side === 'credit' ? formatCurrency(parseFloat(line.amount)) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-white/2 font-bold border-t border-white/5">
              <tr>
                <td className="px-3 py-2 text-dark-300">Total</td>
                <td className="px-3 py-2 text-right text-white">{formatCurrency(parseFloat(entry.total_debits))}</td>
                <td className="px-3 py-2 text-right text-white">{formatCurrency(parseFloat(entry.total_credits))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Audit Info */}
      <div className="bg-dark-800/30 rounded-xl p-4 border border-white/5 space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-[10px] text-dark-400">
            <Clock size={12} />
            Created {formatDate(entry.created_at)}
          </div>
          <div className="flex items-center gap-1.5">
             <User size={10} className="text-dark-500" />
             <span className="text-[10px] text-dark-300">{entry.created_by_name || 'System'}</span>
          </div>
        </div>
        {entry.status === 'posted' && (
          <div className="flex justify-between items-center pt-2 border-t border-white/5">
            <div className="flex items-center gap-2 text-[10px] text-emerald-400">
              <CheckCircle2 size={12} />
              Posted By
            </div>
            <div className="flex items-center gap-1.5">
               <User size={10} className="text-dark-500" />
               <span className="text-[10px] text-white">System Admin</span>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="pt-6 flex gap-3">
        {entry.status === 'draft' && (
          <button 
            onClick={() => {
              navigate(`/finance/entries/${entry.id}/edit`)
              closeSidePanel()
            }}
            className="flex-1 btn-primary py-3"
          >
            Edit Draft
          </button>
        )}
        {entry.status === 'posted' && (
          <button className="flex-1 btn-secondary py-3 text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center justify-center gap-2">
            <AlertCircle size={16} /> Reverse Entry
          </button>
        )}
      </div>
    </div>
  )
}
