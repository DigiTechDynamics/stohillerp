import { useQuery } from '@tanstack/react-query'
import { Edit2, TrendingUp, TrendingDown, Clock, Search, FileText } from 'lucide-react'
import { financeAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'

export default function AccountDetailPanel({ account }) {
  const { openSidePanel } = useUIStore()

  const { data: txnsData, isLoading } = useQuery({
    queryKey: ['account-transactions', account.id],
    queryFn: () => financeAPI.transactions.list({ account: account.id }),
    enabled: !!account.id
  })

  const transactions = txnsData?.data?.results || []

  return (
    <div className="p-6 space-y-6">
      {/* Account Hero */}
      <div className="bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 rounded-2xl p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">{account.code}</span>
            <h2 className="text-2xl font-semibold text-white mt-1.5">{account.name}</h2>
            <p className="text-xs text-dark-400 uppercase tracking-widest mt-1">{account.account_type} • {account.account_sub_type}</p>
          </div>
          <button 
            onClick={() => openSidePanel('account-form', { account })}
            className="p-2 bg-dark-800 hover:bg-primary hover:text-dark-900 text-dark-400 rounded-xl transition-all"
            title="Edit Account"
          >
            <Edit2 size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-white/5">
          <div>
            <p className="text-[10px] text-dark-500 uppercase tracking-widest mb-1">Current Balance</p>
            <p className="text-xl font-semibold text-white">{formatCurrency(account.current_balance)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest mb-1">Normal Balance</p>
            <p className="text-xs font-medium text-dark-300 uppercase">{account.normal_balance}</p>
          </div>
        </div>
      </div>

      {/* Description */}
      {account.description && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-dark-500 uppercase tracking-widest">Description</h3>
          <p className="text-sm text-dark-300 leading-relaxed">{account.description}</p>
        </div>
      )}

      {/* Transactions Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-dark-500 uppercase tracking-widest flex items-center gap-2">
            <Clock size={12} /> Transaction History
          </h3>
          <span className="text-[10px] text-dark-600 font-mono">{transactions.length} entries</span>
        </div>

        <div className="space-y-2">
          {isLoading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-dark-800 rounded-xl animate-pulse" />
            ))
          ) : transactions.length > 0 ? (
            transactions.map((txn) => (
              <div key={txn.id} className="bg-dark-800/40 border border-white/5 p-3 rounded-xl hover:border-white/10 transition-colors group">
                <div className="flex justify-between items-start mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-primary">{txn.entry_reference || 'REF-UNK'}</span>
                    <span className="text-[10px] text-dark-500">{formatDate(txn.entry_date)}</span>
                  </div>
                  <div className={`flex items-center gap-1 text-sm font-semibold ${txn.side === 'debit' ? 'text-emerald-400' : 'text-primary'}`}>
                    {txn.side === 'debit' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {formatCurrency(txn.amount)}
                  </div>
                </div>
                <div className="flex justify-between items-end">
                  <p className="text-xs text-white truncate max-w-[200px]">{txn.description || 'No description'}</p>
                  <span className="text-[10px] text-dark-600 uppercase font-mono">{txn.side}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="py-12 text-center border border-dashed border-white/5 rounded-2xl">
              <FileText size={32} className="text-dark-700 mx-auto mb-3" />
              <p className="text-sm text-dark-500 font-medium">No transactions found</p>
              <p className="text-xs text-dark-600 mt-1">Transactions appear once journal entries are posted.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
