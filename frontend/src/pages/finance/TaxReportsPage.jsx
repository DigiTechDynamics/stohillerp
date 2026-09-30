import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, Percent, Edit3, Trash2, FileText, Download, AlertCircle, Loader2, ArrowRight, ShieldCheck, Calculator
} from 'lucide-react'
import { apiErrorMessage, financeAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import { toast } from 'react-hot-toast'
import { formatCurrency } from '@/utils/format'

export default function TaxReportsPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('codes')
  const [search, setSearch] = useState('')
  const [vatDates, setVatDates] = useState({
    from: new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  })
  const [isPreviewing, setIsPreviewing] = useState(false)
  const openPanel = useUIStore((s) => s.openSidePanel)

  const { data: taxData, isLoading: loadingCodes } = useQuery({
    queryKey: ['tax-codes', { search }],
    queryFn: () => financeAPI.tax.codes.list({ search }),
    enabled: activeTab === 'codes'
  })

  // Real VAT return calculation logic
  const { data: returnData, isLoading: loadingReturn, error: returnError } = useQuery({
    queryKey: ['vat-return', vatDates],
    queryFn: () => financeAPI.reports.vatReturn(vatDates.from, vatDates.to),
    enabled: activeTab === 'returns' && isPreviewing
  })

  const taxCodes = taxData?.data?.results || taxData?.data || []
  const vatReturn = returnData?.data

  const deleteMutation = useMutation({
    mutationFn: (id) => financeAPI.tax.codes.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-codes'] })
      toast.success('Tax code deleted successfully')
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to delete tax code. It may be in use by transactions.')
    }
  })

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-white">Tax & VAT Module</h1>
          <p className="text-dark-400 text-sm mt-1">Configure tax rates and generate statutory returns</p>
        </div>
        <div className="flex gap-3">
           <button 
             className="btn-primary flex items-center gap-2" 
             onClick={() => openPanel('tax-code-form')}
           >
             <Plus size={16} /> New Tax Code
           </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 gap-6">
        {[
          { id: 'codes', label: 'Tax Codes', icon: Percent },
          { id: 'returns', label: 'VAT Returns', icon: FileText }
        ].map(tab => (
          <button
            key={tab.id}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === tab.id 
                ? 'border-primary text-primary' 
                : 'border-transparent text-dark-400 hover:text-white'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'codes' && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="card p-5 bg-gradient-to-br from-indigo-500/10 to-transparent">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Percent size={24} />
                </div>
                <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Active Codes</span>
              </div>
              <p className="text-2xl font-semibold text-white">{taxCodes.filter(t => t.is_active).length}</p>
              <p className="text-xs text-dark-400 mt-1">Ready for transaction use</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
            <input
              type="text"
              placeholder="Search tax codes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 w-64 h-9 text-xs"
            />
          </div>

          {/* List */}
          <div className="card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th className="text-right">Rate</th>
                  <th>Status</th>
                  <th>GL Accounts</th>
                  <th className="w-20"></th>
                </tr>
              </thead>
              <tbody>
                {taxCodes.map((tax) => (
                  <tr key={tax.id} className="hover:bg-white/2 transition-colors group">
                    <td className="px-4 py-3 font-mono text-xs text-primary font-bold uppercase">{tax.code}</td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-white font-medium">{tax.name}</div>
                      <div className="text-[10px] text-dark-500 truncate max-w-xs">{tax.description || 'No description'}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-white font-bold text-right">{tax.rate}%</td>
                    <td className="px-4 py-3">
                      <span className={`badge text-[10px] uppercase font-bold
137:                         ${tax.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-dark-700 text-dark-400'}`}>
138:                         {tax.is_active ? 'Active' : 'Inactive'}
139:                       </span>
                    </td>
                    <td className="px-4 py-3">
                       <div className="flex flex-col gap-1 text-[9px] font-mono">
                          <span className="text-emerald-500">OUT: {tax.collected_account_code || '—'}</span>
                          <span className="text-primary">IN: {tax.paid_account_code || '—'}</span>
                       </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => openPanel('tax-code-form', { taxCode: tax })}
                          className="p-1.5 text-dark-400 hover:text-white transition-colors"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button 
                          onClick={() => {
                            if(window.confirm('Delete this tax code?')) {
                              deleteMutation.mutate(tax.id)
                            }
                          }}
                          className="p-1.5 text-dark-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {taxCodes.length === 0 && !loadingCodes && (
                  <tr>
                    <td colSpan={6} className="text-center py-20">
                      <div className="flex flex-col items-center">
                        <AlertCircle size={48} className="text-dark-600 mb-4" />
                        <p className="text-dark-400">No tax codes configured.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'returns' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Controls */}
          <div className="lg:col-span-1">
            <div className="card p-5 space-y-6">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest border-b border-white/5 pb-3">Return Period</h3>
              
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-400 uppercase">From Date</label>
                  <input 
                    type="date"
                    className="form-input text-xs"
                    value={vatDates.from}
                    onChange={e => setVatDates({...vatDates, from: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-400 uppercase">To Date</label>
                  <input 
                    type="date"
                    className="form-input text-xs"
                    value={vatDates.to}
                    onChange={e => setVatDates({...vatDates, to: e.target.value})}
                  />
                </div>
                
                <button 
                  className="btn-primary w-full h-11 shadow-gold-sm"
                  onClick={() => setIsPreviewing(true)}
                  disabled={loadingReturn}
                >
                  {loadingReturn ? <Loader2 className="animate-spin" size={18} /> : <Calculator size={18} />}
                  Calculate Return
                </button>
              </div>

              <div className="bg-primary/5 p-4 rounded-xl border border-primary/10">
                <p className="text-[10px] text-dark-400 leading-relaxed uppercase font-medium">
                  This report aggregates all Output Tax (Sales) and Input Tax (Purchases) for the selected period.
                </p>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="lg:col-span-3 min-h-[500px]">
            {!isPreviewing ? (
              <div className="h-full card flex flex-col items-center justify-center p-12 text-center opacity-50 border-dashed">
                <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mb-6 border border-white/5">
                  <FileText size={32} className="text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-white">VAT Return Generation</h3>
                <p className="text-sm text-dark-400 max-w-sm mt-3 leading-relaxed">
                  Select a period to calculate your VAT liability. The system will aggregate all tax-relevant transactions from the ledger.
                </p>
              </div>
            ) : loadingReturn ? (
              <div className="h-full card flex flex-col items-center justify-center p-12">
                <Loader2 size={48} className="text-primary animate-spin mb-4" />
                <p className="text-white font-medium">Calculating Tax Liabilities...</p>
                <p className="text-xs text-dark-500 mt-2">Scanning journal entries and tax transactions</p>
              </div>
            ) : returnError ? (
              <div className="h-full card flex flex-col items-center justify-center p-12 text-center" role="alert">
                <p className="text-white font-medium">The VAT return could not be calculated.</p>
                <p className="text-xs text-dark-400 mt-2">{apiErrorMessage(returnError, 'Check the dates and try again.')}</p>
              </div>
            ) : vatReturn ? (
              <div className="space-y-6">
                {/* VAT Summary Dashboard */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="card p-5 border-emerald-500/20 bg-emerald-500/5">
                    <p className="text-[10px] font-bold text-emerald-400 uppercase mb-2">Total Output Tax</p>
                    <p className="text-2xl font-bold text-white font-mono">{formatCurrency(vatReturn.output_tax)}</p>
                    <p className="text-[10px] text-dark-500 mt-2">(Tax collected on sales)</p>
                  </div>
                  <div className="card p-5 border-primary/20 bg-primary/5">
                    <p className="text-[10px] font-bold text-primary uppercase mb-2">Total Input Tax</p>
                    <p className="text-2xl font-bold text-white font-mono">{formatCurrency(vatReturn.input_tax)}</p>
                    <p className="text-[10px] text-dark-500 mt-2">(Tax paid on purchases)</p>
                  </div>
                  <div className="card p-5 border-amber-500/50 bg-amber-500/10 shadow-amber-500/5">
                    <p className="text-[10px] font-bold text-amber-500 uppercase mb-2">Net VAT {parseFloat(vatReturn.vat_liability) >= 0 ? 'Payable' : 'Refundable'}</p>
                    <p className="text-2xl font-bold text-white font-mono">{formatCurrency(vatReturn.vat_liability)}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                       <ShieldCheck size={12} className="text-amber-500" />
                       <span className="text-[10px] text-dark-400 font-medium">Ledger Verified</span>
                    </div>
                  </div>
                </div>

                {/* Details Tree */}
                <div className="card overflow-hidden">
                  <div className="p-4 bg-dark-900 border-b border-white/5 flex items-center justify-between">
                    <h4 className="text-sm font-bold text-white uppercase tracking-widest">Transaction Breakdown</h4>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={async () => {
                          try {
                            const res = await financeAPI.reports.export('vat-return', 'csv', { from_date: vatDates.from, to_date: vatDates.to })
                            const url = window.URL.createObjectURL(new Blob([res.data]))
                            const link = document.createElement('a')
                            link.href = url
                            link.setAttribute('download', `VAT_Return_${vatDates.from}_to_${vatDates.to}.csv`)
                            document.body.appendChild(link)
                            link.click()
                            link.remove()
                          } catch(err) { toast.error("Failed to download CSV") }
                        }}
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <Download size={12} /> Detailed CSV
                      </button>
                      <button 
                        onClick={async () => {
                          try {
                            const res = await financeAPI.reports.export('vat-return', 'pdf', { from_date: vatDates.from, to_date: vatDates.to })
                            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
                            window.open(url, '_blank')
                          } catch(err) { toast.error("Failed to generate PDF preview") }
                        }}
                        className="text-xs text-indigo-400 hover:underline flex items-center gap-1"
                      >
                        <FileText size={12} /> PDF Report
                      </button>
                    </div>
                  </div>
                  <div className="p-6 space-y-8">
                    {/* Output Section */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-emerald-400">
                        <ArrowRight size={14} />
                        <span className="text-xs font-bold uppercase tracking-wider">Output Tax (Sales & Revenue)</span>
                      </div>
                      <div className="grid grid-cols-2 gap-8 pl-6">
                        <div>
                          <p className="text-[10px] text-dark-500 uppercase font-bold mb-1">Total Sales (Gross)</p>
                          <p className="text-sm text-white font-mono">{formatCurrency(vatReturn.total_sales_gross)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-dark-500 uppercase font-bold mb-1">Total Sales (Net)</p>
                          <p className="text-sm text-white font-mono">{formatCurrency(vatReturn.total_sales_net)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Input Section */}
                    <div className="space-y-4 border-t border-white/5 pt-6">
                      <div className="flex items-center gap-2 text-primary">
                        <ArrowRight size={14} />
                        <span className="text-xs font-bold uppercase tracking-wider">Input Tax (Expenses & Assets)</span>
                      </div>
                      <div className="grid grid-cols-2 gap-8 pl-6">
                        <div>
                          <p className="text-[10px] text-dark-500 uppercase font-bold mb-1">Total Purchases (Gross)</p>
                          <p className="text-sm text-white font-mono">{formatCurrency(vatReturn.total_purchases_gross)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-dark-500 uppercase font-bold mb-1">Total Purchases (Net)</p>
                          <p className="text-sm text-white font-mono">{formatCurrency(vatReturn.total_purchases_net)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
