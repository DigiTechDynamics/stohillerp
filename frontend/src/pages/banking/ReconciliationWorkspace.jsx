import React, { useState } from 'react'
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
  const [expandedLines, setExpandedLines] = useState(new Set())
  const [selectedBankLine, setSelectedBankLine] = useState(null)
  const [selectedLedgerLine, setSelectedLedgerLine] = useState(null)
  const [reconciling, setReconciling] = useState(false)

  const toggleLine = (id) => {
    setExpandedLines(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
      setSelectedBankLine(null)
      setSelectedLedgerLine(null)
    } catch (error) {
      console.error('Auto-match failed', error)
      toast.error('Auto-match failed. Please check backend logs.')
    } finally {
      setProcessing(false)
    }
  }

  const handleManualMatch = async () => {
    if (!selectedBankLine || !selectedLedgerLine) return
    setReconciling(true)
    try {
      await bankingAPI.lines.reconcile(selectedBankLine.id, { ledger_line_id: selectedLedgerLine.id })
      toast.success('Successfully matched and reconciled.')
      refetchStmt()
      setSelectedBankLine(null)
      setSelectedLedgerLine(null)
    } catch (error) {
      toast.error('Failed to match lines. Make sure amounts sum correctly.')
    } finally {
      setReconciling(false)
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
                    <React.Fragment key={line.id}>
                      <tr className={line.is_reconciled ? 'opacity-50' : ''}>
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
                            <div className="p-2 text-emerald-400 flex justify-end" title="Reconciled">
                              <CheckCircle2 size={16} />
                            </div>
                          ) : (
                            <button 
                              onClick={() => setSelectedBankLine(selectedBankLine?.id === line.id ? null : line)}
                              className={`px-3 py-1 transition-all rounded text-xs font-bold uppercase tracking-wider ${selectedBankLine?.id === line.id ? 'bg-amber-500 text-dark-900 shadow-[0_0_15px_rgba(245,158,11,0.5)]' : 'bg-white/5 text-dark-300 hover:text-white'}`}
                            >
                              {selectedBankLine?.id === line.id ? 'Selected' : 'Select'}
                            </button>
                          )}
                        </td>
                      </tr>
                      <AnimatePresence>
                        {expandedLines.has(line.id) && (
                          <motion.tr
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                          >
                            <td colSpan={4} className="px-6 py-4 bg-dark-800/80 border-y border-white/5">
                              <div className="flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest">Line Details</h4>
                                  <span className="text-[10px] text-dark-500 font-mono">ID: {line.id}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-6 text-[11px]">
                                  <div>
                                    <p className="text-dark-500 mb-1 uppercase tracking-tighter">Full Description</p>
                                    <p className="text-white bg-dark-700/50 p-2 rounded border border-white/5">{line.description}</p>
                                  </div>
                                  <div>
                                    <p className="text-dark-500 mb-1 uppercase tracking-tighter">Bank Reference</p>
                                    <p className="text-white bg-dark-700/50 p-2 rounded border border-white/5">{line.reference || 'None'}</p>
                                  </div>
                                  <div>
                                    <p className="text-dark-500 mb-1 uppercase tracking-tighter">Transaction Hash</p>
                                    <p className="text-dark-400 font-mono mt-2 truncate">{line.id.substring(0, 16)}...</p>
                                  </div>
                                </div>
                                <div className="pt-2 flex justify-end">
                                   <button className="btn-primary flex items-center gap-2 text-[10px] py-1.5 px-3">
                                      <Wand2 size={12} /> Find Suggested Matches
                                   </button>
                                </div>
                              </div>
                            </td>
                          </motion.tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
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
                        <button 
                          onClick={() => setSelectedLedgerLine(selectedLedgerLine?.id === entry.lines[0]?.id ? null : entry.lines[0])}
                          className={`px-3 py-1 transition-all rounded text-xs font-bold uppercase tracking-wider ${selectedLedgerLine?.id === entry.lines[0]?.id ? 'bg-amber-500 text-dark-900 shadow-[0_0_15px_rgba(245,158,11,0.5)]' : 'bg-white/5 text-dark-300 hover:text-white'}`}
                        >
                          {selectedLedgerLine?.id === entry.lines[0]?.id ? 'Selected' : 'Select'}
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
      {/* Match Bar */}
      <AnimatePresence>
        {(selectedBankLine || selectedLedgerLine) && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-dark-800 border-2 border-amber-500/50 rounded-2xl shadow-2xl p-4 flex items-center justify-between gap-8 z-50 w-full max-w-2xl"
          >
             <div className="flex gap-10 items-center">
                 <div>
                     <p className="text-[10px] text-amber-500 font-bold uppercase tracking-widest mb-1">Bank Line</p>
                     <p className="text-lg font-mono text-white">
                        {selectedBankLine ? formatCurrency(selectedBankLine.amount) : '---'}
                     </p>
                 </div>
                 <ArrowRightLeft size={20} className="text-dark-400" />
                 <div>
                     <p className="text-[10px] text-amber-500 font-bold uppercase tracking-widest mb-1">Ledger Line</p>
                     <p className="text-lg font-mono text-white">
                        {selectedLedgerLine ? formatCurrency(selectedLedgerLine.amount || selectedLedgerLine.amount_currency) : '---'}
                     </p>
                 </div>
             </div>
             
             <div className="flex gap-3 items-center">
                 {Math.abs(parseFloat(selectedBankLine?.amount || 0)) !== parseFloat(selectedLedgerLine?.amount || selectedLedgerLine?.amount_currency || 0) && selectedBankLine && selectedLedgerLine ? (
                    <div className="flex items-center gap-2 text-red-500 text-xs font-bold uppercase tracking-widest mr-4 bg-red-500/10 px-3 py-1.5 rounded">
                        <AlertCircle size={14} /> Amounts Differ
                    </div>
                 ) : null}
                 <button 
                    disabled={!selectedBankLine || !selectedLedgerLine || reconciling}
                    onClick={handleManualMatch}
                    className="btn-primary flex items-center gap-2 px-6 shadow-gold disabled:opacity-50 disabled:shadow-none"
                 >
                    {reconciling ? <RefreshCw size={16} className="animate-spin" /> : <Wand2 size={16} />}
                    {reconciling ? 'Matching...' : 'Match & Reconcile'}
                 </button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
