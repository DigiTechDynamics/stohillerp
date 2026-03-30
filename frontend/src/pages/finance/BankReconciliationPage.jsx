import { useState, useMemo } from 'react'
import { Plus, Search, FileText, CheckCircle, RefreshCw, Layers } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { bankingAPI, financeAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import DataManagementButtons from '@/components/common/DataManagementButtons'
import Pagination from '@/components/common/Pagination'
import { useQueryClient } from '@tanstack/react-query'

export default function BankReconciliationPage() {
  const [activeTab, setActiveTab] = useState('reconcile')
  const [selectedBankTxn, setSelectedBankTxn] = useState(null)
  const [bankPage, setBankPage] = useState(1)
  const [glPage, setGlPage] = useState(1)
  const queryClient = useQueryClient()
  const openPanel = useUIStore((s) => s.openSidePanel)
  
  // Real data for Bank Statement Lines
  const { data: bankLinesRaw, isLoading: loadingBank } = useQuery({
    queryKey: ['banking-lines', { page: bankPage, reconciled: false }],
    queryFn: () => bankingAPI.lines.list({ page: bankPage, reconciled: false }),
    enabled: activeTab === 'reconcile'
  })
  const bankLines = bankLinesRaw?.data?.results || []

  // Real data for GL Journal Entries
  const { data: glEntriesRaw, isLoading: loadingGL } = useQuery({
    queryKey: ['finance-entries', { page: glPage, status: 'posted' }],
    queryFn: () => financeAPI.entries.list({ page: glPage, status: 'posted' }),
    enabled: !!selectedBankTxn
  })
  const glEntries = glEntriesRaw?.data?.results || []

  const handleReconcile = async (glTxnId) => {
    try {
      await bankingAPI.lines.reconcile(selectedBankTxn.id, { journal_line_id: glTxnId })
      queryClient.invalidateQueries({ queryKey: ['banking-lines'] })
      setSelectedBankTxn(null)
    } catch (err) {
      console.error('Reconciliation failed:', err)
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-white">Bank Reconciliation</h1>
          <p className="text-dark-400 text-sm mt-1">Match bank statement lines to system journal entries</p>
        </div>
        <div className="flex gap-3">
          <button className="btn-secondary flex items-center gap-2">
            <RefreshCw size={16} /> Sync Feed
          </button>
          <DataManagementButtons 
            module="statements" 
            onImportSuccess={() => queryClient.invalidateQueries({ queryKey: ['banking-statements'] })} 
          />
        </div>
      </div>

      <div className="flex border-b border-white/10 gap-6">
        {['reconcile', 'accounts', 'rules'].map(tab => (
          <button
            key={tab}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab 
                ? 'border-primary text-primary' 
                : 'border-transparent text-dark-400 hover:text-white'
            }`}
            onClick={() => { setActiveTab(tab); setBankPage(1); setGlPage(1) }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'reconcile' && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[500px]">
          {/* Left Side: Bank Statement Lines */}
          <div className="card flex flex-col overflow-hidden border border-primary/20 bg-dark-900/50">
            <div className="p-4 border-b border-white/10 bg-dark-800/50 flex justify-between items-center">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Layers size={16} className="text-primary" /> Bank Statement Lines
              </h3>
              <span className="badge-primary text-[10px]">{bankLinesRaw?.data?.count || 0} Pending</span>
            </div>
            <div className="overflow-y-auto custom-scrollbar flex-1 p-2">
              {bankLines.map(txn => (
                <div 
                  key={txn.id}
                  onClick={() => !txn.reconciled && setSelectedBankTxn(txn)}
                  className={`p-4 mb-2 rounded-lg border transition-all ${
                    txn.reconciled 
                      ? 'border-white/5 bg-white/2 opacity-50 cursor-not-allowed' 
                      : selectedBankTxn?.id === txn.id
                        ? 'border-primary bg-primary/10 shadow-[0_0_15px_rgba(212,175,55,0.15)] cursor-pointer'
                        : 'border-white/10 bg-dark-800 hover:border-primary/50 cursor-pointer'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs text-dark-400 font-mono">{formatDate(txn.date)}</span>
                    <span className={`text-sm font-bold ${txn.amount > 0 ? 'text-emerald-400' : 'text-white'}`}>
                      {formatCurrency(txn.amount, 'USD')}
                    </span>
                  </div>
                  <p className="text-sm text-white font-medium">{txn.description}</p>
                  {txn.reconciled && (
                     <div className="mt-2 flex items-center gap-1 text-[10px] text-emerald-400 uppercase font-bold tracking-wider">
                       <CheckCircle size={12} /> Reconciled
                     </div>
                  )}
                </div>
              ))}
              {bankLines.length === 0 && !loadingBank && (
                <div className="text-center py-12 text-dark-500 text-xs">No pending transactions found.</div>
              )}
            </div>
            <div className="p-2 border-t border-white/5">
              <Pagination 
                currentPage={bankPage}
                totalPages={bankLinesRaw?.data?.total_pages}
                onPageChange={setBankPage}
              />
            </div>
          </div>

          {/* Right Side: GL Entries to Match */}
          <div className="card flex flex-col overflow-hidden border border-white/10">
            <div className="p-4 border-b border-white/10 bg-dark-800/50 flex justify-between items-center">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <FileText size={16} className="text-dark-400" /> System Journal Entries
              </h3>
            </div>
            
            {!selectedBankTxn ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-dark-800 flex items-center justify-center mb-4">
                  <CheckCircle size={24} className="text-dark-400" />
                </div>
                <h4 className="text-white font-medium">Select a bank transaction</h4>
                <p className="text-sm text-dark-400 mt-2 max-w-xs">
                  Click on an unreconciled bank statement line on the left to find matching system records.
                </p>
              </div>
            ) : (
              <div className="overflow-y-auto custom-scrollbar flex-1 p-2 flex flex-col relative w-full h-full">
                
                {/* Visual Connector Logic (Styling flair typical of Sage/Xero) */}
                <div className="mb-4 p-4 rounded-lg bg-primary/5 border border-primary/20 sticky top-0 backdrop-blur-md z-10">
                  <p className="text-xs text-primary font-bold uppercase tracking-wider mb-1">Target Amount to Match</p>
                  <p className="text-2xl text-white font-display">{formatCurrency(selectedBankTxn.amount, 'USD')}</p>
                </div>

                <div className="space-y-2 pb-4">
                  {glEntries.map(gl => {
                    const isExactMatch = parseFloat(gl.amount) === parseFloat(selectedBankTxn.amount)
                    
                    return (
                      <div key={gl.id} className={`p-4 rounded-lg border flex items-center justify-between ${
                        isExactMatch ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-white/10 bg-dark-800'
                      }`}>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono text-primary">{gl.reference_number}</span>
                            <span className="badge-secondary text-[9px] uppercase">{gl.entry_type}</span>
                          </div>
                          <p className="text-sm text-white">{formatDate(gl.date)}</p>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <span className={`font-bold ${gl.amount > 0 ? 'text-emerald-400' : 'text-white'}`}>
                            {formatCurrency(gl.amount, 'USD')}
                          </span>
                          <button 
                            className={`px-4 py-1.5 rounded text-xs font-bold transition-colors ${
                              isExactMatch 
                                ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-[0_0_10px_rgba(16,185,129,0.3)]' 
                                : 'bg-dark-700 text-white hover:bg-primary hover:text-dark-900'
                            }`}
                            onClick={() => handleReconcile(gl.id)}
                          >
                            Match
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  {glEntries.length === 0 && !loadingGL && (
                    <div className="text-center py-12 text-dark-500 text-xs">No matching system entries found.</div>
                  )}
                </div>
                <div className="mt-auto pt-4 border-t border-white/5">
                  <Pagination 
                    currentPage={glPage}
                    totalPages={glEntriesRaw?.data?.total_pages}
                    onPageChange={setGlPage}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab !== 'reconcile' && (
        <div className="card flex items-center justify-center py-24 flex-col text-center">
          <FileText size={48} className="text-dark-600 mb-4" />
          <h3 className="text-lg font-semibold text-white">Under Construction</h3>
          <p className="text-sm text-dark-400 max-w-sm mt-2">
            The {activeTab} view is currently being implemented.
          </p>
        </div>
      )}
    </div>
  )
}
