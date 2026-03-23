import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Landmark, ArrowRightLeft, ArrowRight, Wand2, 
  History, CheckCircle2, AlertCircle, Info, RefreshCw
} from 'lucide-react'
import { bankingAPI, financeAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'
import { toast } from 'react-hot-toast'

export default function ReconciliationWorkspace({ accountId }) {
  const [processing, setProcessing] = useState(false)

  const { data: statementsData, isLoading: loadingStmt, refetch: refetchStmt } = useQuery({
    queryKey: ['banking-statements', { accountId }],
    queryFn: () => bankingAPI.statements.list({ bank_account: accountId, ordering: '-statement_date' }),
    enabled: !!accountId
  })

  const { data: glEntriesData, isLoading: loadingGL } = useQuery({
    queryKey: ['finance-entries-recon'],
    queryFn: () => financeAPI.entries.list({ status: 'posted' })
  })

  const statement = statementsData?.data?.results?.[0] || null
  const statementLines = statement?.lines || []
  const systemEntries = glEntriesData?.data?.results || []

  const handleAutoMatch = async () => {
    if (!statement) return
    setProcessing(true)
    try {
      const { data } = await bankingAPI.statements.auto_match(statement.id)
      toast.success(`${data.matches_found} matches found and applied!`)
      refetchStmt()
    } catch (error) {
      console.error('Auto-match failed', error)
      toast.error('Auto-match failed. Please check backend logs.')
    } finally {
      setProcessing(false)
    }
  }

  if (!accountId) {
    return (
      <div className="card p-12 text-center border-dashed border-white/10">
        <Landmark size={40} className="mx-auto mb-3 text-dark-600" />
        <p className="text-dark-400">Select a bank account to begin reconciliation</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Workspace Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            Reconciliation: {statement?.bank_account_code || 'Account'}
          </h2>
          <p className="text-dark-400 text-sm mt-0.5">Match bank lines with ledger transactions</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-secondary">
            <History size={16} /> History
          </button>
          <button 
            className="btn-primary" 
            onClick={handleAutoMatch}
            disabled={!statement || processing}
          >
            {processing ? <RefreshCw size={16} className="animate-spin" /> : <Wand2 size={16} />}
            {processing ? 'Processing...' : 'Run Auto-Match'}
          </button>
        </div>
      </div>

      {!statement && !loadingStmt && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-center gap-3">
          <Info size={18} className="text-blue-400 shrink-0" />
          <p className="text-sm text-blue-100">No active statement found for this account. Import a statement to start matching.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bank Side */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-dark-400 uppercase tracking-widest flex items-center gap-2">
              <Landmark size={14} className="text-primary" /> Bank Statement Lines
            </h3>
            <span className="text-[10px] text-dark-500 font-mono">Statement: {statement?.reference || 'N/A'}</span>
          </div>
          <div className="card overflow-hidden bg-dark-800/50">
            <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
              <table className="data-table">
                <thead>
                  <tr className="sticky top-0 bg-dark-800 z-10">
                    <th>Date</th>
                    <th>Description</th>
                    <th className="text-right">Amount</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {statementLines.map((line) => (
                    <tr key={line.id} className={line.is_reconciled ? 'opacity-50' : ''}>
                      <td className="whitespace-nowrap tabular-nums">{formatDate(line.transaction_date)}</td>
                      <td>
                        <div className="text-sm text-dark-300 truncate max-w-[180px]" title={line.description}>
                          {line.description}
                        </div>
                        <div className="text-[10px] text-dark-500 font-mono">{line.reference}</div>
                      </td>
                      <td className="text-right font-semibold text-white tabular-nums">
                        {formatCurrency(line.amount)}
                      </td>
                      <td className="text-right">
                        {line.is_reconciled ? (
                          <div className="p-2 text-emerald-400" title="Reconciled">
                            <CheckCircle2 size={16} />
                          </div>
                        ) : (
                          <button className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors" title="Match Manually">
                            <ArrowRight size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {statementLines.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-20 text-dark-500 italic text-sm">
                        No lines found in the current statement
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Ledger Side */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-dark-400 uppercase tracking-widest flex items-center gap-2">
              <ArrowRightLeft size={14} className="text-amber-400" /> Ledger Transactions
            </h3>
            <span className="text-[10px] text-dark-500 font-mono">GL Account: {statement?.bank_account_code || 'N/A'}</span>
          </div>
          <div className="card overflow-hidden bg-dark-800/50">
            <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
              <table className="data-table">
                <thead>
                  <tr className="sticky top-0 bg-dark-800 z-10">
                    <th>Date</th>
                    <th>Reference</th>
                    <th className="text-right">Amount</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {systemEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-white/5 transition-colors">
                      <td className="whitespace-nowrap tabular-nums">{formatDate(entry.entry_date)}</td>
                      <td>
                        <div className="text-sm text-dark-300 font-mono">{entry.reference}</div>
                        <div className="text-xs text-dark-500 truncate max-w-[180px]">{entry.description}</div>
                      </td>
                      <td className="text-right font-semibold text-white tabular-nums">
                        {formatCurrency(entry.total_debits)}
                      </td>
                      <td className="text-right">
                        <button className="text-xs font-semibold text-primary hover:text-white transition-colors">
                          Match
                        </button>
                      </td>
                    </tr>
                  ))}
                  {systemEntries.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-20 text-dark-500 italic text-sm">
                        No unmatched ledger entries found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
