import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Landmark, ArrowDownLeft, ArrowUpRight, Search, Filter, Calendar } from 'lucide-react'
import { bankingAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'

export default function BankTransactionView() {
  const { sidePanelData } = useUIStore()
  const account = sidePanelData?.account
  const [search, setSearch] = useState('')

  const { data: linesData, isLoading } = useQuery({
    queryKey: ['bank-transactions', account?.id, search],
    queryFn: () => bankingAPI.lines.list({ statement__bank_account: account?.id, search, page_size: 200 }),
    enabled: !!account?.id
  })

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
          <button className="btn-secondary px-3">
            <Filter size={16} />
          </button>
          <button className="btn-secondary px-3">
            <Calendar size={16} />
          </button>
        </div>
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
