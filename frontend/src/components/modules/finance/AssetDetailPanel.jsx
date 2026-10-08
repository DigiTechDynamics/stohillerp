import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, DollarSign, History, TrendingDown, ShieldCheck, List } from 'lucide-react'
import { fixedAssetsAPI } from '@/services/api'
import CrudTable from '@/components/common/CrudTable'

const METHODS = [
  ['straight_line', 'Straight line'], ['declining_balance', 'Declining balance'],
  ['double_declining', 'Double declining'], ['units_of_production', 'Units of production'], ['manual', 'Manual'],
]
import { formatCurrency, formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'

export default function AssetDetailPanel({ asset }) {
  const { openSidePanel } = useUIStore()
  const queryClient = useQueryClient()
  const { data: transactions, isLoading } = useQuery({
    queryKey: ['asset-transactions', asset?.id],
    queryFn: () => fixedAssetsAPI.transactions.list({ asset: asset?.id }),
    enabled: !!asset?.id
  })

  // Get the statutory book
  const statutoryBook = asset?.books?.find(b => b.book_type === 'Statutory')

  return (
    <div className="flex flex-col h-full bg-dark-900 text-white">
      {/* Header Info */}
      <div className="p-6 border-b border-white/5 bg-gradient-to-br from-primary/5 to-transparent">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/10">
            {asset?.code}
          </span>
          <span className={`badge text-[10px] uppercase font-bold ${
            asset?.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-dark-700 text-dark-400'
          }`}>
            {asset?.status}
          </span>
        </div>
        <h2 className="text-2xl font-bold text-white leading-tight">{asset?.name}</h2>
        <p className="text-dark-400 text-sm mt-1">{asset?.category_name}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {/* Financial Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-dark-800/50 border border-white/5 rounded-2xl p-4">
            <p className="text-[10px] text-dark-500 uppercase font-bold tracking-wider mb-1">Acquisition Cost</p>
            <p className="text-xl font-bold text-white">{formatCurrency(asset?.acquisition_cost || 0)}</p>
            <div className="flex items-center gap-1 text-[10px] text-dark-400 mt-2">
              <Calendar size={10} /> {formatDate(asset?.acquisition_date)}
            </div>
          </div>
          <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4">
            <p className="text-[10px] text-primary/80 uppercase font-bold tracking-wider mb-1">Net Book Value</p>
            <p className="text-xl font-bold text-white">
              {statutoryBook ? formatCurrency(statutoryBook.current_nbv) : '—'}
            </p>
            <div className="flex items-center gap-1 text-[10px] text-primary/60 mt-2 italic">
              <TrendingDown size={10} /> Depreciation applied
            </div>
          </div>
        </div>

        {/* Book Configuration */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-dark-500 mb-2">
            <ShieldCheck size={16} />
            <span className="text-sm font-bold uppercase tracking-widest">Asset Book Details</span>
          </div>
          <div className="bg-dark-800/30 rounded-2xl border border-white/5 overflow-hidden">
            <div className="p-4 border-b border-white/5 flex justify-between items-center">
              <span className="text-xs font-medium text-white">Depreciation Method</span>
              <span className="text-xs text-dark-400 capitalize">{statutoryBook?.method?.replace(/_/g, ' ')}</span>
            </div>
            <div className="p-4 border-b border-white/5 flex justify-between items-center">
              <span className="text-xs font-medium text-white">Useful Life</span>
              <span className="text-xs text-dark-400">{statutoryBook?.useful_life_months} Months</span>
            </div>
            <div className="p-4 border-b border-white/5 flex justify-between items-center">
              <span className="text-xs font-medium text-white">Accumulated Depreciation</span>
              <span className="text-xs text-rose-400">{formatCurrency(statutoryBook?.accumulated_depreciation || 0)}</span>
            </div>
            <div className="p-4 flex justify-between items-center">
              <span className="text-xs font-medium text-white">Last Depr. Date</span>
              <span className="text-xs text-dark-400">{statutoryBook?.last_depreciation_date ? formatDate(statutoryBook.last_depreciation_date) : 'Never'}</span>
            </div>
          </div>
        </section>

        {/* Depreciation books */}
        <section>
          <CrudTable compact title="Depreciation books" label="book" queryKey={['asset-books']} api={fixedAssetsAPI.books}
            params={{ asset: asset.id }}
            description="Only books that post to the GL (normally Statutory) depreciate in the ledger; others, such as Tax, are tracked alongside."
            columns={[
              { key: 'book_type', label: 'Book' },
              { key: 'method', label: 'Method', render: (r) => METHODS.find(([v]) => v === r.method)?.[1] || r.method },
              { key: 'useful_life_months', label: 'Life (months)', align: 'right' },
              { key: 'current_nbv', label: 'NBV', align: 'right', render: (r) => formatCurrency(r.current_nbv, asset.currency_code) },
              { key: 'posts_to_gl', label: 'Posts', render: (r) => (r.posts_to_gl ? 'GL' : 'Memo') },
            ]}
            fields={[
              { key: 'book_type', label: 'Book', required: true, placeholder: 'Tax', readOnlyOnEdit: true },
              { key: 'method', label: 'Method', type: 'select', options: METHODS, required: true },
              { key: 'useful_life_months', label: 'Useful life (months)', type: 'number', required: true },
              { key: 'salvage_value', label: 'Salvage value', type: 'number' },
              { key: 'depreciation_rate', label: 'Rate % (declining)', type: 'number', nullable: true },
              { key: 'total_expected_units', label: 'Expected units', type: 'number', nullable: true },
              { key: 'posts_to_gl', label: 'Posts to the GL', type: 'checkbox' },
            ]}
            defaults={{ book_type: 'Tax', method: 'straight_line', useful_life_months: 60, salvage_value: 0, posts_to_gl: false }}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ['fixed-assets'] })} />
        </section>

        {/* Locations */}
        <section>
          <CrudTable compact title="Location history" label="location" queryKey={['asset-locations']} api={fixedAssetsAPI.locations}
            params={{ asset: asset.id }}
            description="Record each move; the most recent transfer is where the asset is now."
            columns={[
              { key: 'transfer_date', label: 'From', render: (r) => formatDate(r.transfer_date) },
              { key: 'location_name', label: 'Location' },
              { key: 'department', label: 'Department', render: (r) => r.department || '—' },
            ]}
            fields={[
              { key: 'location_name', label: 'Location', required: true },
              { key: 'department', label: 'Department' },
              { key: 'transfer_date', label: 'Transfer date', type: 'date', required: true },
              { key: 'notes', label: 'Notes', type: 'textarea', span: 2 },
            ]}
            defaults={{ transfer_date: new Date().toISOString().slice(0, 10) }} />
        </section>

        {/* Transaction History */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-dark-500 mb-2">
            <History size={16} />
            <span className="text-sm font-bold uppercase tracking-widest">Transaction History</span>
          </div>
          
          <div className="space-y-3">
            {isLoading ? (
              <div className="py-10 text-center text-dark-500 animate-pulse">Loading history...</div>
            ) : transactions?.results?.length > 0 ? (
              transactions.results.map((tx) => (
                <div key={tx.id} className="bg-dark-800/20 border border-white/5 rounded-xl p-4 flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${
                      tx.transaction_type === 'depreciation' ? 'bg-rose-500/10 text-rose-500' :
                      tx.transaction_type === 'acquisition' ? 'bg-emerald-500/10 text-emerald-500' :
                      'bg-blue-500/10 text-blue-500'
                    }`}>
                      <DollarSign size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white capitalize">{tx.transaction_type}</p>
                      <p className="text-[10px] text-dark-500 mt-0.5">{formatDate(tx.transaction_date)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${
                      tx.transaction_type === 'depreciation' ? 'text-rose-400' : 'text-white'
                    }`}>
                      {tx.transaction_type === 'depreciation' ? '-' : ''}{formatCurrency(tx.amount)}
                    </p>
                    {tx.journal_entry_ref && (
                      <p className="text-[9px] text-primary mt-1 font-mono uppercase">{tx.journal_entry_ref}</p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="py-10 text-center border border-dashed border-white/5 rounded-2xl">
                <List size={24} className="mx-auto text-dark-700 mb-2" />
                <p className="text-[10px] text-dark-500 italic uppercase tracking-wider">No transactions recorded</p>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="p-6 border-t border-white/5 flex gap-3">
        <button 
          className="flex-1 btn-primary py-2.5 shadow-lg shadow-primary/20"
          disabled={asset.status === 'disposed' || asset.status === 'scrapped'}
          onClick={() => openSidePanel('asset-form', { asset })}
        >
          Edit Asset
        </button>
        <button 
          className="btn-secondary px-6"
          disabled={asset.status === 'disposed' || asset.status === 'scrapped'}
          onClick={() => openSidePanel('asset-disposal', { asset })}
        >
          Disposal
        </button>
      </div>
    </div>
  )
}
