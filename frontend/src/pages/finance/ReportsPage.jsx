// Stohill Properties - Financial Reports Page
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { 
  FileText, Download, Eye, Calendar, Building2, 
  TrendingUp, PieChart, Landmark, ArrowLeft,
  Printer, Share2, Loader2, AlertCircle, ChevronRight
} from 'lucide-react'
import { financeAPI, propertiesAPI } from '@/services/api'
import { formatCurrency } from '@/utils/format'

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState(null)
  const [params, setParams] = useState({
    period_id: '',
    from_date: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    to_date: new Date().toISOString().split('T')[0],
    as_at_date: new Date().toISOString().split('T')[0],
    property_id: ''
  })

  const { data: propertiesData } = useQuery({
    queryKey: ['properties'],
    queryFn: () => propertiesAPI.properties.list({ page_size: 1000 })
  })
  const properties = propertiesData?.data?.results || []

  const { data: periodsData } = useQuery({
    queryKey: ['fiscal-periods'],
    queryFn: () => financeAPI.periods.list()
  })
  const periods = periodsData?.data?.results || periodsData?.data || []

  const reportGroups = [
    {
      title: 'Standard Financials',
      reports: [
        { id: 'trial-balance', name: 'Trial Balance', description: 'Listing of all GL account balances', icon: Landmark },
        { id: 'balance-sheet', name: 'Balance Sheet', description: 'Snapshot of assets, liabilities and equity', icon: Building2 },
        { id: 'income-statement', name: 'Income Statement (P&L)', description: 'Revenue and expenses over time', icon: TrendingUp },
      ]
    },
    {
      title: 'Management Reports',
      reports: [
        { id: 'accounts-receivable', name: 'Accounts Receivable Aging', description: 'Unpaid customer invoices over time', icon: FileText },
        { id: 'budget-vs-actual', name: 'Budget vs Actual', description: 'Comparison of planned vs actual spending', icon: PieChart },
      ]
    }
  ]

  if (selectedReport) {
    return (
      <ReportViewer 
        report={selectedReport} 
        params={params} 
        setParams={setParams}
        periods={periods}
        properties={properties}
        onBack={() => setSelectedReport(null)} 
      />
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-white">Financial Reports</h1>
          <p className="text-dark-400 text-sm mt-1">Generate and export official financial statements</p>
        </div>
      </div>

      <div className="space-y-8">
        {reportGroups.map((group) => (
          <section key={group.title} className="space-y-4">
            <h2 className="text-sm font-bold text-dark-500 uppercase tracking-widest px-1">{group.title}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.reports.map((report) => (
                <div 
                  key={report.id} 
                  onClick={() => setSelectedReport(report)}
                  className="card p-5 group hover:border-primary/50 transition-all cursor-pointer relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight size={16} className="text-primary" />
                  </div>
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-dark-900 transition-colors">
                      <report.icon size={20} />
                    </div>
                  </div>
                  <h3 className="font-semibold text-white mb-1">{report.name}</h3>
                  <p className="text-xs text-dark-400 leading-relaxed">{report.description}</p>

                  <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2">
                    <Calendar size={12} className="text-dark-600" />
                    <span className="text-[10px] text-dark-500 uppercase font-bold tracking-tighter">Ready to Generate</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function ReportViewer({ report, params, setParams, periods, properties, onBack }) {
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async (format) => {
    try {
      setIsExporting(true)
      const reportParams = {
        period_id: params.period_id,
        from_date: params.from_date,
        to_date: params.to_date,
        as_at_date: params.as_at_date,
        property_id: params.property_id
      }
      const response = await financeAPI.reports.export(report.id, format, reportParams)
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${report.id}.${format === 'excel' ? 'csv' : 'csv'}`) // Default to csv for now as backend returns csv
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      console.error('Export failed:', err)
      alert('Failed to export report. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const { data: reportData, isLoading, error, refetch } = useQuery({
    queryKey: ['report', report.id, params],
    queryFn: () => {
      if (report.id === 'trial-balance') return financeAPI.reports.trialBalance(params.period_id, params.property_id)
      if (report.id === 'income-statement') return financeAPI.reports.incomeStatement(params.from_date, params.to_date, params.property_id)
      if (report.id === 'balance-sheet') return financeAPI.reports.balanceSheet(params.as_at_date)
      return Promise.reject('Report not implemented')
    },
    enabled: isPreviewing
  })

  const results = reportData?.data

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 -ml-2 text-dark-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="font-display text-2xl text-white">{report.name}</h1>
          <p className="text-dark-400 text-sm">Configure parameters and run report</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Parameters Column */}
        <div className="lg:col-span-1 space-y-6">
          <div className="card p-5 space-y-5">
            <h2 className="text-xs font-bold text-white uppercase tracking-widest border-b border-white/5 pb-3">Parameters</h2>
            
            {report.id === 'trial-balance' && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-400 uppercase">Fiscal Period</label>
                <select 
                  className="form-input text-xs"
                  value={params.period_id}
                  onChange={e => setParams({...params, period_id: e.target.value})}
                >
                  <option value="">Select period...</option>
                  {periods.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.status})</option>
                  ))}
                </select>
              </div>
            )}

            {(report.id === 'income-statement' || report.id === 'accounts-receivable') && (
              <>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-400 uppercase">From Date</label>
                  <input 
                    type="date"
                    className="form-input text-xs"
                    value={params.from_date}
                    onChange={e => setParams({...params, from_date: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-400 uppercase">To Date</label>
                  <input 
                    type="date"
                    className="form-input text-xs"
                    value={params.to_date}
                    onChange={e => setParams({...params, to_date: e.target.value})}
                  />
                </div>
              </>
            )}

            {(report.id === 'income-statement' || report.id === 'trial-balance') && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-400 uppercase">Property / Cost Center (Optional)</label>
                <select 
                  className="form-input text-xs"
                  value={params.property_id}
                  onChange={e => setParams({...params, property_id: e.target.value})}
                >
                  <option value="">All Properties (Consolidated)</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.reference_number})</option>
                  ))}
                </select>
              </div>
            )}

            {report.id === 'balance-sheet' && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-400 uppercase">As At Date</label>
                <input 
                  type="date"
                  className="form-input text-xs"
                  value={params.as_at_date}
                  onChange={e => setParams({...params, as_at_date: e.target.value})}
                />
              </div>
            )}

            <button 
              className="btn-primary w-full h-10 mt-4"
              onClick={() => setIsPreviewing(true)}
              disabled={isLoading || (report.id === 'trial-balance' && !params.period_id)}
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
              Preview Report
            </button>
          </div>

          <div className="card p-5 bg-primary/5 border-primary/20">
            <h3 className="text-xs font-bold text-primary uppercase mb-2">Export Options</h3>
            <div className="grid grid-cols-2 gap-2">
              <button 
                className="btn-secondary h-9 text-[10px] gap-1.5 flex-1"
                onClick={() => handleExport('csv')}
                disabled={isExporting}
              >
                <Download size={14} /> PDF
              </button>
              <button 
                className="btn-secondary h-9 text-[10px] gap-1.5 flex-1"
                onClick={() => handleExport('csv')}
                disabled={isExporting}
              >
                <Download size={14} /> Excel
              </button>
            </div>
          </div>
        </div>

        {/* Results Column */}
        <div className="lg:col-span-3 min-h-[400px]">
          {!isPreviewing ? (
            <div className="h-full card flex flex-col items-center justify-center p-12 text-center opacity-50 border-dashed">
              <div className="w-16 h-16 rounded-full bg-dark-800 flex items-center justify-center mb-4">
                <report.icon size={32} className="text-dark-500" />
              </div>
              <h3 className="text-lg font-medium text-white">No Report Generated</h3>
              <p className="text-sm text-dark-400 max-w-xs mt-2">
                Configure the parameters on the left and click "Preview Report" to see the data.
              </p>
            </div>
          ) : isLoading ? (
            <div className="h-full card flex flex-col items-center justify-center p-12">
              <Loader2 size={48} className="text-primary animate-spin mb-4" />
              <p className="text-white font-medium">Processing Ledger Data...</p>
              <p className="text-xs text-dark-500 mt-2">Aggregating transactions and calculating balances</p>
            </div>
          ) : error ? (
            <div className="h-full card flex flex-col items-center justify-center p-12 text-center border-rose-500/20">
              <AlertCircle size={48} className="text-rose-500 mb-4" />
              <h3 className="text-white font-medium">Generation Error</h3>
              <p className="text-sm text-dark-400 mt-2">{error.message || 'Failed to generate report'}</p>
              <button onClick={() => refetch()} className="btn-secondary mt-6">Try Again</button>
            </div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {report.id === 'trial-balance' && <TrialBalanceResult data={results} />}
              {report.id === 'income-statement' && <IncomeStatementResult data={results} />}
              {report.id === 'balance-sheet' && <BalanceSheetResult data={results} />}
              
              {!results && (
                 <div className="card p-12 text-center text-dark-500 italic">
                   No data found for the selected parameters.
                 </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

function TrialBalanceResult({ data }) {
  if (!data) return null
  return (
    <div className="card overflow-hidden">
      <div className="bg-dark-900 border-b border-white/5 p-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-white uppercase tracking-widest">Report Output: {data.period}</h3>
        <div className={`text-[10px] font-bold px-2 py-1 rounded ${data.is_balanced ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
          {data.is_balanced ? 'BALANCED' : 'OUT OF BALANCE'}
        </div>
      </div>
      <table className="data-table">
        <thead>
          <tr className="bg-white/[0.02]">
            <th>Account</th>
            <th className="text-right">Debit</th>
            <th className="text-right">Credit</th>
          </tr>
        </thead>
        <tbody>
          {data.accounts?.map(acc => (
            <tr key={acc.code} className="hover:bg-white/5">
              <td>
                <span className="text-primary font-mono text-[11px] mr-3">{acc.code}</span>
                <span className="text-xs text-white">{acc.name}</span>
              </td>
              <td className="text-right text-xs text-white font-mono">{parseFloat(acc.total_debit) > 0 ? formatCurrency(acc.total_debit) : '—'}</td>
              <td className="text-right text-xs text-white font-mono">{parseFloat(acc.total_credit) > 0 ? formatCurrency(acc.total_credit) : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-dark-900 border-t-2 border-primary/20">
            <td className="font-bold text-white">TOTALS</td>
            <td className="text-right font-bold text-primary font-mono">{formatCurrency(data.total_debit)}</td>
            <td className="text-right font-bold text-primary font-mono">{formatCurrency(data.total_credit)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function IncomeStatementResult({ data }) {
  if (!data) return null
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4 bg-gradient-to-br from-emerald-500/10 to-transparent">
          <p className="text-[10px] text-emerald-400 font-bold uppercase mb-1">Total Revenue</p>
          <p className="text-xl font-bold text-white font-mono">{formatCurrency(data.total_revenue)}</p>
        </div>
        <div className="card p-4 bg-gradient-to-br from-rose-500/10 to-transparent">
          <p className="text-[10px] text-rose-400 font-bold uppercase mb-1">Total Expenses</p>
          <p className="text-xl font-bold text-white font-mono">{formatCurrency(data.total_expenses)}</p>
        </div>
        <div className="card p-4 bg-gradient-to-br from-primary/10 to-transparent border-primary/30">
          <p className="text-[10px] text-primary font-bold uppercase mb-1">Net {parseFloat(data.net_profit) >= 0 ? 'Profit' : 'Loss'}</p>
          <p className="text-xl font-bold text-white font-mono">{formatCurrency(data.net_profit)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card overflow-hidden">
          <div className="p-3 bg-emerald-500/10 border-b border-white/5 font-bold text-[10px] text-emerald-400 uppercase tracking-widest">Revenue Items</div>
          <table className="data-table">
            <tbody>
              {data.revenue?.map(item => (
                <tr key={item.code}>
                  <td className="text-xs text-white">{item.name}</td>
                  <td className="text-right text-xs text-white font-mono">{formatCurrency(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card overflow-hidden">
          <div className="p-3 bg-rose-500/10 border-b border-white/5 font-bold text-[10px] text-rose-400 uppercase tracking-widest">Expense Items</div>
          <table className="data-table">
            <tbody>
              {data.expenses?.map(item => (
                <tr key={item.code}>
                  <td className="text-xs text-white">{item.name}</td>
                  <td className="text-right text-xs text-white font-mono">{formatCurrency(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function BalanceSheetResult({ data }) {
  if (!data) return null
  return (
    <div className="space-y-6">
       <div className="flex items-center justify-between card p-4 border-primary/30">
         <div className="flex items-center gap-3">
           <div className={`w-3 h-3 rounded-full ${data.balanced ? 'bg-emerald-500' : 'bg-rose-500 shadow-rose-500'}`} />
           <span className="text-sm font-bold text-white uppercase tracking-widest">Balance Check</span>
         </div>
         <span className="text-xs text-dark-400">Total Assets should equal Total Liabilities + Equity</span>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         <div className="space-y-4">
           <div className="card overflow-hidden">
             <div className="p-3 bg-primary/10 border-b border-white/5 font-bold text-[10px] text-primary uppercase tracking-widest">Assets</div>
             <table className="data-table">
               <tbody>
                  {data.assets?.map(item => (
                    <tr key={item.code}>
                      <td className="text-xs text-white">{item.name}</td>
                      <td className="text-right text-xs text-white font-mono">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
               </tbody>
               <tfoot>
                 <tr className="bg-dark-900">
                    <td className="font-bold text-white text-xs">TOTAL ASSETS</td>
                    <td className="text-right font-bold text-primary font-mono">{formatCurrency(data.total_assets)}</td>
                 </tr>
               </tfoot>
             </table>
           </div>
         </div>

         <div className="space-y-4">
           <div className="card overflow-hidden">
             <div className="p-3 bg-indigo-500/10 border-b border-white/5 font-bold text-[10px] text-indigo-400 uppercase tracking-widest">Liabilities</div>
             <table className="data-table">
               <tbody>
                  {data.liabilities?.map(item => (
                    <tr key={item.code}>
                      <td className="text-xs text-white">{item.name}</td>
                      <td className="text-right text-xs text-white font-mono">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
               </tbody>
               <tfoot>
                 <tr className="bg-dark-900">
                    <td className="font-bold text-white text-xs">TOTAL LIABILITIES</td>
                    <td className="text-right font-bold text-indigo-400 font-mono">{formatCurrency(data.total_liabilities)}</td>
                 </tr>
               </tfoot>
             </table>
           </div>

           <div className="card overflow-hidden">
             <div className="p-3 bg-amber-500/10 border-b border-white/5 font-bold text-[10px] text-amber-500 uppercase tracking-widest">Equity</div>
             <table className="data-table">
               <tbody>
                  {data.equity?.map(item => (
                    <tr key={item.code}>
                      <td className="text-xs text-white">{item.name}</td>
                      <td className="text-right text-xs text-white font-mono">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
               </tbody>
               <tfoot>
                 <tr className="bg-dark-900">
                    <td className="font-bold text-white text-xs">TOTAL EQUITY</td>
                    <td className="text-right font-bold text-amber-500 font-mono">{formatCurrency(data.total_equity)}</td>
                 </tr>
               </tfoot>
             </table>
           </div>
         </div>
       </div>
    </div>
  )
}
