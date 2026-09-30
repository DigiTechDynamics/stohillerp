import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Landmark, ArrowRightLeft, Wand2, CheckCircle2, AlertCircle, Info, RefreshCw, Undo2, Receipt } from 'lucide-react'
import { bankingAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'
import { toast } from 'react-hot-toast'

const errorText = (error, fallback) => {
  const message = error?.response?.data?.error?.message
  if (typeof message === 'string') return message
  return message?.detail || fallback
}

// Match bank statement lines to the bank account's ledger lines. Amounts are
// signed the same way on both sides: money in positive, money out negative.
export default function ReconciliationWorkspace({ accountId }) {
  const queryClient = useQueryClient()
  const [statementId, setStatementId] = useState('')
  const [selectedBankLine, setSelectedBankLine] = useState(null)
  const [selectedLedgerLine, setSelectedLedgerLine] = useState(null)
  const [adjustmentAccount, setAdjustmentAccount] = useState('')
  const [busy, setBusy] = useState(false)

  const { data: statementsData, isLoading: loadingStatements } = useQuery({
    queryKey: ['banking-statements', { accountId }],
    queryFn: () => bankingAPI.statements.list({ bank_account: accountId, ordering: '-statement_date' }),
    enabled: !!accountId,
  })
  const { data: ledgerData } = useQuery({
    queryKey: ['banking-unmatched-ledger', accountId],
    queryFn: () => bankingAPI.accounts.unmatchedLedger(accountId),
    enabled: !!accountId,
  })
  const { data: reportData } = useQuery({
    queryKey: ['banking-reconciliation', accountId],
    queryFn: () => bankingAPI.accounts.reconciliation(accountId),
    enabled: !!accountId,
  })

  const statements = statementsData?.data?.results || []
  const statement = statements.find(s => s.id === statementId) || statements[0] || null
  const statementLines = statement?.lines || []
  const ledgerLines = ledgerData?.data || []
  const report = reportData?.data

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['banking-statements'] })
    queryClient.invalidateQueries({ queryKey: ['banking-unmatched-ledger', accountId] })
    queryClient.invalidateQueries({ queryKey: ['banking-reconciliation', accountId] })
    queryClient.invalidateQueries({ queryKey: ['banking-accounts'] })
    setSelectedBankLine(null)
    setSelectedLedgerLine(null)
  }

  const run = async (fn, success, failure) => {
    setBusy(true)
    try {
      const result = await fn()
      toast.success(typeof success === 'function' ? success(result) : success)
      refresh()
    } catch (error) {
      toast.error(errorText(error, failure))
    } finally {
      setBusy(false)
    }
  }

  const amountsDiffer = selectedBankLine && selectedLedgerLine
    && parseFloat(selectedBankLine.amount) !== parseFloat(selectedLedgerLine.amount)

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Reconciliation</h2>
          <p className="text-dark-400 text-sm mt-0.5">Match bank statement lines with ledger transactions</p>
        </div>
        <div className="flex items-center gap-3">
          {statements.length > 1 && (
            <select className="form-input text-xs" aria-label="Statement" value={statement?.id || ''}
              onChange={e => setStatementId(e.target.value)}>
              {statements.map(s => <option key={s.id} value={s.id}>{s.reference} ({s.statement_date})</option>)}
            </select>
          )}
          <button className="btn-primary" disabled={!statement || busy}
            onClick={() => run(() => bankingAPI.statements.auto_match(statement.id),
              ({ data }) => `${data.matches_found} matched, ${data.adjustments_posted} posted by rules`,
              'Auto-match failed.')}>
            {busy ? <RefreshCw size={16} className="animate-spin" /> : <Wand2 size={16} />} Run Auto-Match
          </button>
        </div>
      </div>

      {report && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            ['Balance per bank', report.balance_per_bank],
            ['Deposits in transit', report.deposits_in_transit],
            ['Unpresented payments', report.unpresented_payments],
            ['Balance per books', report.balance_per_books],
            ['Difference', report.difference],
          ].map(([label, value]) => (
            <div key={label} className={`card p-3 ${label === 'Difference' && parseFloat(value) !== 0 ? 'border-rose-500/40' : ''}`}>
              <p className="text-[10px] text-dark-400 font-bold uppercase">{label}</p>
              <p className="text-sm font-mono text-white">{formatCurrency(value)}</p>
            </div>
          ))}
        </div>
      )}

      {!statement && !loadingStatements && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-center gap-3">
          <Info size={18} className="text-blue-400 shrink-0" />
          <p className="text-sm text-blue-100">No statement for this account yet. Import one to start matching.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-dark-400 uppercase tracking-widest flex items-center gap-2 px-1">
            <Landmark size={14} className="text-primary" /> Statement {statement?.reference || ''}
          </h3>
          <div className="card overflow-hidden bg-dark-800/50">
            <div className="overflow-x-auto max-h-[560px] custom-scrollbar">
              <table className="data-table">
                <thead>
                  <tr className="sticky top-0 bg-dark-800 z-10">
                    <th>Date</th><th>Description</th><th className="text-right">Amount</th><th className="w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {statementLines.map(line => (
                    <tr key={line.id} className={line.is_reconciled ? 'opacity-60' : ''}>
                      <td className="whitespace-nowrap tabular-nums">{formatDate(line.transaction_date)}</td>
                      <td>
                        <div className="text-sm text-dark-300 truncate max-w-[200px]" title={line.description}>{line.description}</div>
                        <div className="text-[10px] text-dark-500 font-mono">{line.reference}{line.ledger_reference ? ` → ${line.ledger_reference}` : ''}</div>
                      </td>
                      <td className={`text-right font-semibold tabular-nums ${parseFloat(line.amount) < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                        {formatCurrency(line.amount)}
                      </td>
                      <td className="text-right">
                        {line.is_reconciled ? (
                          <button className="p-1.5 text-emerald-400 hover:text-amber-300" title="Undo match" disabled={busy}
                            onClick={() => run(() => bankingAPI.lines.unreconcile(line.id), 'Match removed.', 'Could not undo.')}>
                            <span className="inline-flex items-center gap-1 text-[10px]"><CheckCircle2 size={14} /><Undo2 size={12} /></span>
                          </button>
                        ) : (
                          <button
                            onClick={() => setSelectedBankLine(selectedBankLine?.id === line.id ? null : line)}
                            className={`px-3 py-1 rounded text-xs font-bold uppercase ${selectedBankLine?.id === line.id ? 'bg-amber-500 text-dark-900' : 'bg-white/5 text-dark-300 hover:text-white'}`}>
                            {selectedBankLine?.id === line.id ? 'Selected' : 'Select'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {statementLines.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-16 text-dark-500 italic text-sm">No statement lines</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-bold text-dark-400 uppercase tracking-widest flex items-center gap-2 px-1">
            <ArrowRightLeft size={14} className="text-amber-400" /> Unmatched ledger lines
          </h3>
          <div className="card overflow-hidden bg-dark-800/50">
            <div className="overflow-x-auto max-h-[560px] custom-scrollbar">
              <table className="data-table">
                <thead>
                  <tr className="sticky top-0 bg-dark-800 z-10">
                    <th>Date</th><th>Reference</th><th className="text-right">Amount</th><th className="w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerLines.map(line => {
                    const suggested = selectedBankLine && parseFloat(selectedBankLine.amount) === parseFloat(line.amount)
                    return (
                      <tr key={line.id} className={suggested ? 'bg-emerald-500/5' : ''}>
                        <td className="whitespace-nowrap tabular-nums">{formatDate(line.date)}</td>
                        <td>
                          <div className="text-sm text-dark-300 font-mono">{line.reference}</div>
                          <div className="text-xs text-dark-500 truncate max-w-[200px]">{line.description}</div>
                        </td>
                        <td className={`text-right font-semibold tabular-nums ${parseFloat(line.amount) < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                          {formatCurrency(line.amount)}
                        </td>
                        <td className="text-right">
                          <button
                            onClick={() => setSelectedLedgerLine(selectedLedgerLine?.id === line.id ? null : line)}
                            className={`px-3 py-1 rounded text-xs font-bold uppercase ${selectedLedgerLine?.id === line.id ? 'bg-amber-500 text-dark-900' : suggested ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-dark-300 hover:text-white'}`}>
                            {selectedLedgerLine?.id === line.id ? 'Selected' : 'Select'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {ledgerLines.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-16 text-dark-500 italic text-sm">Every ledger line is matched</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {selectedBankLine && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-dark-800 border-2 border-amber-500/50 rounded-2xl shadow-2xl p-4 flex flex-wrap items-center justify-between gap-6 z-50 w-full max-w-3xl">
          <div className="flex gap-8 items-center">
            <div>
              <p className="text-[10px] text-amber-500 font-bold uppercase mb-1">Bank line</p>
              <p className="text-lg font-mono text-white">{formatCurrency(selectedBankLine.amount)}</p>
            </div>
            <ArrowRightLeft size={20} className="text-dark-400" />
            <div>
              <p className="text-[10px] text-amber-500 font-bold uppercase mb-1">Ledger line</p>
              <p className="text-lg font-mono text-white">{selectedLedgerLine ? formatCurrency(selectedLedgerLine.amount) : '---'}</p>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            {amountsDiffer && (
              <span className="flex items-center gap-2 text-red-400 text-xs font-bold uppercase"><AlertCircle size={14} /> Amounts differ</span>
            )}
            {selectedLedgerLine ? (
              <button className="btn-primary" disabled={busy || amountsDiffer}
                onClick={() => run(() => bankingAPI.lines.reconcile(selectedBankLine.id, { journal_line_id: selectedLedgerLine.id }),
                  'Matched and reconciled.', 'Could not match these lines.')}>
                <Wand2 size={16} /> Match
              </button>
            ) : (
              <>
                <input className="form-input text-xs w-36" placeholder="Account code, e.g. 5920"
                  aria-label="Adjustment account" value={adjustmentAccount} onChange={e => setAdjustmentAccount(e.target.value.trim())} />
                <button className="btn-secondary" disabled={busy || !adjustmentAccount}
                  title="Book this statement-only item (bank charge, interest) and reconcile it"
                  onClick={() => run(() => bankingAPI.lines.postAdjustment(selectedBankLine.id, { account_code: adjustmentAccount }),
                    'Posted and reconciled.', 'Could not post the adjustment.')}>
                  <Receipt size={16} /> Post to ledger
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
