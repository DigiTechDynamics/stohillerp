import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, Search, Box, TrendingUp, Settings, History, Calendar, DollarSign } from 'lucide-react'
import { fixedAssetsAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import RecordActions from '@/components/common/RecordActions'
import DataManagementButtons from '@/components/common/DataManagementButtons'
import Pagination from '@/components/common/Pagination'

export default function AssetsPage() {
  const queryClient = useQueryClient()
  const { openSidePanel } = useUIStore()
  const [searchTerm, setSearchTerm] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [page, setPage] = useState(1)
  const [showHistory, setShowHistory] = useState(false)

  // Data Fetching
  const { data: assetsData, isLoading } = useQuery({
    queryKey: ['fixed-assets', activeCategory, searchTerm, page],
    queryFn: () => fixedAssetsAPI.assets.list({ 
      category: activeCategory !== 'all' ? activeCategory : undefined,
      search: searchTerm,
      page
    }),
  })

  const { data: categoriesData } = useQuery({
    queryKey: ['asset-categories'],
    queryFn: () => fixedAssetsAPI.categories.list(),
  })

  const totalNBV = assetsData?.data?.results?.reduce((sum, asset) => {
    const statutoryBook = asset.books?.find(b => b.book_type === 'Statutory')
    return sum + (statutoryBook ? parseFloat(statutoryBook.current_nbv) : 0)
  }, 0) || 0

  const totalCost = assetsData?.data?.results?.reduce((sum, asset) => sum + parseFloat(asset.acquisition_cost || 0), 0) || 0

  const assets = assetsData?.data?.results || []
  const assetsCount = assetsData?.data?.count || 0
  const categories = categoriesData?.data?.results || []

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Fixed Asset Register</h1>
          <p className="text-dark-400 mt-1">Manage non-current assets and automated depreciation runs.</p>
        </div>
        <div className="flex items-center gap-3">
          <DataManagementButtons 
            module="assets" 
            onImportSuccess={() => queryClient.invalidateQueries({ queryKey: ['fixed-assets'] })} 
          />
          <button 
            className="btn-secondary flex items-center gap-2"
            onClick={() => openSidePanel('run-depreciation')}
          >
            <Calendar size={18} /> Run Depreciation
          </button>
          <button 
            className="btn-primary flex items-center gap-2"
            onClick={() => openSidePanel('asset-form')}
          >
            <Plus size={18} /> New Asset
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-dark-800/50 border border-white/5 rounded-2xl p-6 relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <Box size={80} className="text-primary" />
          </div>
          <p className="text-sm font-medium text-dark-400 uppercase tracking-wider">Total Assets</p>
          <p className="text-4xl font-bold text-white mt-2">{assetsCount}</p>
          <div className="flex items-center gap-2 mt-4 text-xs text-dark-500">
            <span className="bg-white/5 px-2 py-1 rounded">Across {categories.length} Categories</span>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-dark-800/50 border border-white/5 rounded-2xl p-6 relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <DollarSign size={80} className="text-emerald-500" />
          </div>
          <p className="text-sm font-medium text-dark-400 uppercase tracking-wider">Acquisition Cost</p>
          <p className="text-4xl font-bold text-white mt-2">{formatCurrency(totalCost)}</p>
          <p className="text-xs text-emerald-400 mt-4 flex items-center gap-1">
             Original investment value
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-primary/10 border border-primary/20 rounded-2xl p-6 relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <TrendingUp size={80} className="text-primary" />
          </div>
          <p className="text-sm font-medium text-primary/80 uppercase tracking-wider">Net Book Value</p>
          <p className="text-4xl font-bold text-white mt-2">{formatCurrency(totalNBV)}</p>
          <p className="text-xs text-primary/60 mt-4 italic">
            Current balance sheet value
          </p>
        </motion.div>
      </div>

      {/* Filters and Table */}
      <div className="bg-dark-800/30 border border-white/5 rounded-2xl overflow-hidden backdrop-blur-sm">
        <div className="p-6 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" size={18} />
            <input 
              type="text" 
              placeholder="Search assets by name or code..."
              className="w-full bg-dark-900/50 border border-white/5 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
            />
          </div>
          <div className="flex items-center gap-3">
             <div className="flex bg-dark-900/50 p-1 rounded-xl border border-white/5">
                <button 
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${activeCategory === 'all' ? 'bg-primary text-white shadow-lg' : 'text-dark-400 hover:text-white'}`}
                  onClick={() => { setActiveCategory('all'); setPage(1) }}
                >
                  All Assets
                </button>
                {categories.map(cat => (
                  <button 
                    key={cat.id}
                    className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${activeCategory === cat.id ? 'bg-primary text-white shadow-lg' : 'text-dark-400 hover:text-white'}`}
                    onClick={() => { setActiveCategory(cat.id); setPage(1) }}
                  >
                    {cat.name}
                  </button>
                ))}
             </div>
             <button title="Asset history" aria-pressed={showHistory} onClick={() => setShowHistory((v) => !v)}
               className={`p-2.5 border rounded-xl transition-colors ${showHistory ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-dark-800 border-white/5 text-dark-400 hover:text-white'}`}>
               <History size={18} />
             </button>
             <button className="p-2.5 bg-dark-800 border border-white/5 rounded-xl text-dark-400 hover:text-white transition-colors" onClick={() => openSidePanel('asset-category-form')}>
               <Settings size={18} />
             </button>
          </div>
        </div>

        {showHistory ? <AssetHistory category={activeCategory !== 'all' ? activeCategory : undefined} /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-dark-900/50 text-[10px] uppercase font-bold text-dark-500 tracking-widest border-b border-white/5">
                <th className="px-6 py-4">Asset Code</th>
                <th className="px-6 py-4">Name & Category</th>
                <th className="px-6 py-4">Acquisition</th>
                <th className="px-6 py-4 text-right">Cost</th>
                <th className="px-6 py-4 text-right">Acc. Depr</th>
                <th className="px-6 py-4 text-right">NBV (Statutory)</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan="8" className="px-6 py-20 text-center">
                    <div className="flex justify-center flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-dark-400 text-sm">Loading asset register...</span>
                    </div>
                  </td>
                </tr>
              ) : assets.map((asset) => {
                const statutoryBook = asset.books?.find(b => b.book_type === 'Statutory')
                return (
                  <tr 
                    key={asset.id} 
                    className="hover:bg-white/[0.02] transition-colors cursor-pointer group"
                    onClick={() => openSidePanel('asset-detail', { asset })}
                  >
                    <td className="px-6 py-4">
                      <span className="text-xs font-mono text-primary bg-primary/5 px-2 py-1 rounded border border-primary/10">
                        {asset.code}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-white group-hover:text-primary transition-colors">{asset.name}</p>
                      <p className="text-[10px] text-dark-500 mt-0.5">{asset.category_name}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-white">{formatDate(asset.acquisition_date)}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-xs font-medium text-white">{formatCurrency(asset.acquisition_cost, asset.currency_code)}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-xs font-medium text-rose-400/80">
                        {statutoryBook ? formatCurrency(statutoryBook.accumulated_depreciation, asset.currency_code) : '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-bold text-white">
                        {statutoryBook ? formatCurrency(statutoryBook.current_nbv, asset.currency_code) : '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`badge text-[10px] uppercase font-bold ${
                        asset.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' :
                        asset.status === 'cip' ? 'bg-blue-500/10 text-blue-500' :
                        'bg-dark-700 text-dark-400'
                      }`}>
                        {asset.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <RecordActions record={asset} label="asset" onEdit={() => openSidePanel('asset-form', { asset })}
                        deleteFn={fixedAssetsAPI.assets.delete} invalidate={['fixed-assets']} />
                    </td>
                  </tr>
                )
              })}
              {assets.length === 0 && (
                <tr>
                  <td colSpan="8" className="px-6 py-20 text-center">
                    <Box size={40} className="mx-auto text-dark-700 mb-3" />
                    <p className="text-white font-medium">No assets found</p>
                    <p className="text-xs text-dark-500 mt-1">Start by adding your first fixed asset to the register.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {!showHistory && (
        <Pagination
          currentPage={page}
          totalPages={assetsData?.data?.total_pages}
          totalCount={assetsData?.data?.count}
          onPageChange={setPage}
        />
      )}
    </div>
  )
}

// Every acquisition, depreciation run, revaluation and disposal across the register.
const HISTORY_TYPES = [['', 'All events'], ['acquisition', 'Acquisition'], ['depreciation', 'Depreciation'],
  ['revaluation', 'Revaluation'], ['impairment', 'Impairment'], ['disposal', 'Disposal']]

function AssetHistory({ category }) {
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['asset-history', type, category, page],
    queryFn: async () => (await fixedAssetsAPI.transactions.list({
      transaction_type: type || undefined, asset__category: category, page,
    })).data,
  })
  const rows = data?.results || []
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Asset history</h3>
        <select className="form-input w-auto text-xs" aria-label="Event type" value={type} onChange={(e) => { setType(e.target.value); setPage(1) }}>
          {HISTORY_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr><th>Date</th><th>Asset</th><th>Event</th><th>Book</th><th className="text-right">Amount</th><th>Journal</th></tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="text-xs">{formatDate(t.transaction_date)}</td>
                <td className="text-sm text-white">{t.asset_code} <span className="text-dark-400">{t.asset_name}</span></td>
                <td><span className="badge-gray text-[10px] uppercase">{t.transaction_type_display}</span></td>
                <td className="text-xs">{t.book_type}</td>
                <td className="text-right font-mono text-sm">{formatCurrency(t.amount)}</td>
                <td className="text-xs font-mono">{t.journal_reference || '—'}</td>
              </tr>
            ))}
            {!rows.length && !isLoading && (
              <tr><td colSpan={6} className="text-center py-12 text-dark-400">No asset events yet. Depreciation runs and disposals appear here.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination currentPage={page} totalPages={data?.total_pages} totalCount={data?.count} onPageChange={setPage} />
    </div>
  )
}
