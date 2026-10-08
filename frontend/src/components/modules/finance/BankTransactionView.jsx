import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Landmark, ArrowDownLeft, ArrowUpRight, Search, Filter, Calendar, X } from 'lucide-react'
import { bankingAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'

export default function BankTransactionView() {
  const { sidePanelData } = useUIStore()
  const account = sidePanelData?.account
  const [search, setSearch] = useState('')
  const [show, setShow] = useState('all')          // all | in | out | reconciled | unreconciled
  const [dates, setDates] = useState({ from: '', to: '' })
  const [panel, setPanel] = useState(null)         // 'filter' | 'dates' | null

  const filterParams = {
    in: { amount__gt: 0 }, out: { amount__lt: 0 },
    reconciled: { is_reconciled: true }, unreconciled: { is_reconciled: false },
  }[show] || {}
  const { data: linesData, isLoading } = useQuery({
    queryKey: ['bank-transactions', account?.id, search, show, dates],
    queryFn: () => bankingAPI.lines.list({
      statement__bank_account: account?.id, search, page_size: 200, ...filterParams,
      transaction_date__gte: dates.from || undefined, transaction_date__lte: dates.to || undefined,
    }),
    enabled: !!account?.id
  })
  const filtersOn = show !== 'all'
  const datesOn = !!(dates.from || dates.to)

  const transactions = linesData?.data?.results || []

  if (!account) return <div className="p-12 text-center text-dark-500">No account selected</div>

  return (
    <div className="flex flex-col h-full bg-dark-900">
      <div className="p-6 border-b border-white/5">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-primary border border-white/5">
            <Landmark size={24} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{account.bank_name} - {account.code}</h3>
            <p className="text-xs text-dark-500">{account.account_number}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-dark-500 uppercase tracking-widest font-bold">Balance</p>
            <p className="stat-value text-xl">{formatCurrency(account.current_balance)}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
            <input
              type="text"
              placeholder="Search reference or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 w-full"
            />
          </div>
          <button className={`btn-secondary px-3 ${filtersOn ? 'border-primary text-primary' : ''}`} title="Filter"
            aria-expanded={panel === 'filter'} onClick={() => setPanel(panel === 'filter' ? null : 'filter')}>
            <Filter size={16} />
          </button>
          <button className={`btn-secondary px-3 ${datesOn ? 'border-primary text-primary' : ''}`} title="Date range"
            aria-expanded={panel === 'dates'} onClick={() => setPanel(panel === 'dates' ? null : 'dates')}>
            <Calendar size={16} />
          </button>
        </div>

        {panel === 'filter' && (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Show transactions">
            {[['all', 'All'], ['in', 'Money in'], ['out', 'Money out'], ['unreconciled', 'Unreconciled'], ['reconciled', 'Reconciled']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setShow(v)} aria-pressed={show === v}
                className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${show === v ? 'bg-primary/10 border-primary/40 text-primary' : 'border-white/10 text-dark-400 hover:text-white'}`}>
                {l}
              </button>
            ))}
          </div>
        )}
        {panel === 'dates' && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="text-xs text-dark-400">From
              <input type="date" className="form-input w-auto ml-2" value={dates.from} onChange={(e) => setDates({ ...dates, from: e.target.value })} />
            </label>
            <label className="text-xs text-dark-400">To
              <input type="date" className="form-input w-auto ml-2" value={dates.to} onChange={(e) => setDates({ ...dates, to: e.target.value })} />
            </label>
            {datesOn && (
              <button type="button" className="btn-ghost text-xs" onClick={() => setDates({ from: '', to: '' })}><X size={12} /> Clear</button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <table className="data-table">
          <thead className="sticky top-0 bg-dark-900 z-10 shadow-sm">
            <tr>
              <th>Date</th>
              <th>Description / Ref</th>
              <th className="text-right">Amount</th>
              <th className="text-center w-12">Status</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id} className="group hover:bg-white/5 transition-colors">
                <td className="whitespace-nowrap tabular-nums text-xs text-dark-300">
                  {formatDate(tx.transaction_date)}
                </td>
                <td>
                  <div className="text-sm text-white font-medium truncate max-w-[200px]" title={tx.description}>
                    {tx.description}
                  </div>
                  <div className="text-[10px] text-dark-500 font-mono tracking-tighter">
                    {tx.reference}
                  </div>
                </td>
                <td className="text-right">
                  <div className={`text-sm font-semibold flex items-center justify-end gap-1 ${tx.amount > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {tx.amount > 0 ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                    {formatCurrency(tx.amount)}
                  </div>
                </td>
                <td className="text-center">
                  <div className={`w-2 h-2 rounded-full mx-auto ${tx.is_reconciled ? 'bg-emerald-500 shadow-emerald-500/50' : 'bg-amber-500 shadow-amber-500/50'}`} 
                       title={tx.is_reconciled ? 'Reconciled' : 'Unreconciled'} />
                </td>
              </tr>
            ))}
            {transactions.length === 0 && !isLoading && (
              <tr>
                <td colSpan={4} className="text-center py-20 text-dark-500 italic text-sm">
                  No transactions found for this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Internal import for store
import { useUIStore } from '@/stores/authStore'
