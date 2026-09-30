// Stohill Properties - Financial Reports Page
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Download, Eye, Calendar, Building2, TrendingUp, PieChart, Landmark, ArrowLeft, Loader2, AlertCircle, ChevronRight
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
    property_id: '',
    account: '',
    fiscal_year_id: ''
  })

  const { data: propertiesData } = useQuery({
    queryKey: ['properties'],
    queryFn: () => propertiesAPI.list({ page_size: 200 })
  })
  const properties = propertiesData?.data?.results || []

  const { data: periodsData } = useQuery({
    queryKey: ['fiscal-periods'],
    queryFn: () => financeAPI.periods.list()
  })
  const periods = periodsData?.data?.results || periodsData?.data || []

  const { data: fiscalYearsData } = useQuery({
    queryKey: ['fiscal-years'],
    queryFn: () => financeAPI.fiscalYears.list()
  })
  const fiscalYears = fiscalYearsData?.data?.results || fiscalYearsData?.data || []

  const reportGroups = [
    {
      title: 'Standard Financials',
      reports: [
        { id: 'trial-balance', name: 'Trial Balance', description: 'Listing of all GL account balances', icon: Landmark },
        { id: 'balance-sheet', name: 'Balance Sheet', description: 'Snapshot of assets, liabilities and equity', icon: Building2 },
        { id: 'income-statement', name: 'Income Statement (P&L)', description: 'Revenue and expenses over time', icon: TrendingUp },
        { id: 'cash-flow', name: 'Cash Flow Statement', description: 'Operating, investing and financing cash flows', icon: Landmark },
      ]
    },
    {
      title: 'Management Reports',
      reports: [
        { id: 'ar-aging', name: 'Accounts Receivable Aging', description: 'Unpaid customer invoices by days past due', icon: FileText },
        { id: 'ap-aging', name: 'Accounts Payable Aging', description: 'Unpaid supplier invoices by days past due', icon: FileText },
        { id: 'general-ledger', name: 'General Ledger Detail', description: 'Account transactions with running balance', icon: Landmark },
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
        fiscalYears={fiscalYears}
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

function ReportViewer({ report, params, setParams, periods, fiscalYears, properties, onBack }) {
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
        property_id: params.property_id,
        account: params.account,
        fiscal_year: params.fiscal_year_id,
        period: report.id === 'budget-vs-actual' ? params.period_id : undefined
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
      if (report.id === 'cash-flow') return financeAPI.reports.cashFlow(params.from_date, params.to_date)
      if (report.id === 'balance-sheet') return financeAPI.reports.balanceSheet(params.as_at_date)
      if (report.id === 'ar-aging') return financeAPI.reports.arAging(params.as_at_date)
      if (report.id === 'ap-aging') return financeAPI.reports.apAging(params.as_at_date)
      if (report.id === 'general-ledger') return financeAPI.reports.generalLedger(params.account, params.from_date, params.to_date)
      if (report.id === 'budget-vs-actual') return financeAPI.reports.budgetVsActual(params.fiscal_year_id, params.period_id)
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

            {report.id === 'general-ledger' && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-400 uppercase">Account Code</label>
                <input
                  type="text"
                  className="form-input text-xs"
                  placeholder="e.g. 1010"
                  value={params.account}
                  onChange={e => setParams({...params, account: e.target.value.trim()})}
                />
              </div>
            )}

            {report.id === 'budget-vs-actual' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-400 uppercase">Fiscal Year</label>
                  <select
                    className="form-input text-xs"
                    value={params.fiscal_year_id}
                    onChange={e => setParams({...params, fiscal_year_id: e.target.value, period_id: ''})}
                  >
                    <option value="">Current fiscal year</option>
                    {fiscalYears.map(fy => (
                      <option key={fy.id} value={fy.id}>{fy.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-400 uppercase">Period (Optional)</label>
                  <select
                    className="form-input text-xs"
                    value={params.period_id}
                    onChange={e => setParams({...params, period_id: e.target.value})}
                  >
                    <option value="">Whole year</option>
                    {periods
                      .filter(p => !params.fiscal_year_id || String(p.fiscal_year) === String(params.fiscal_year_id))
                      .map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                  </select>
                </div>
              </>
            )}

            {['income-statement', 'general-ledger', 'cash-flow'].includes(report.id) && (
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

            {['balance-sheet', 'ar-aging', 'ap-aging'].includes(report.id) && (
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
              disabled={isLoading || (report.id === 'trial-balance' && !params.period_id) || (report.id === 'general-ledger' && !params.account)}
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
              {(report.id === 'ar-aging' || report.id === 'ap-aging') && <AgingResult data={results} />}
              {report.id === 'general-ledger' && <GeneralLedgerResult data={results} />}
              {report.id === 'budget-vs-actual' && <BudgetVsActualResult data={results} />}
              {report.id === 'cash-flow' && <CashFlowResult data={results} />}
              
              {!results && (
                 <div className="card p-12 text-center text-dark-500 italic">
                   No data found for the selected parameters.
                 </div>
              )}
            </motion.div>
          )}
          {report.id === 'budget-vs-actual' && (
            <BudgetEditor periodId={params.period_id} onSaved={() => isPreviewing && refetch()} />
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

function AgingResult({ data }) {
  if (!data) return null
  const buckets = data.buckets || []
  return (
    <div className="card overflow-hidden">
      <div className="bg-dark-900 border-b border-white/5 p-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-white uppercase tracking-widest">As at {data.as_at_date}</h3>
        <span className="text-xs text-dark-400">{data.rows?.length || 0} open accounts</span>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr className="bg-white/[0.02]">
              <th>Name</th>
              {buckets.map(b => <th key={b.key} className="text-right">{b.label}</th>)}
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.rows?.map(row => (
              <tr key={row.id} className="hover:bg-white/5">
                <td className="text-xs text-white">{row.name}</td>
                {buckets.map(b => (
                  <td key={b.key} className="text-right text-xs text-white font-mono">
                    {parseFloat(row[b.key]) ? formatCurrency(row[b.key]) : '—'}
                  </td>
                ))}
                <td className="text-right text-xs text-white font-mono font-bold">{formatCurrency(row.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-dark-900 border-t-2 border-primary/20">
              <td className="font-bold text-white">TOTAL</td>
              {buckets.map(b => (
                <td key={b.key} className="text-right font-bold text-primary font-mono">{formatCurrency(data.totals?.[b.key])}</td>
              ))}
              <td className="text-right font-bold text-primary font-mono">{formatCurrency(data.totals?.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function GeneralLedgerResult({ data }) {
  if (!data) return null
  return (
    <div className="card overflow-hidden">
      <div className="bg-dark-900 border-b border-white/5 p-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-white uppercase tracking-widest">
          {data.account?.code} {data.account?.name}
        </h3>
        <span className="text-xs text-dark-400">{data.from_date} to {data.to_date}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr className="bg-white/[0.02]">
              <th>Date</th>
              <th>Reference</th>
              <th>Description</th>
              <th className="text-right">Debit</th>
              <th className="text-right">Credit</th>
              <th className="text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-white/[0.02]">
              <td colSpan={5} className="text-xs text-dark-400 italic">Opening balance</td>
              <td className="text-right text-xs text-white font-mono">{formatCurrency(data.opening_balance)}</td>
            </tr>
            {data.lines?.map((line, i) => (
              <tr key={`${line.reference}-${i}`} className="hover:bg-white/5">
                <td className="text-xs text-dark-300 whitespace-nowrap">{line.date}</td>
                <td className="text-[11px] text-primary font-mono whitespace-nowrap">{line.reference}</td>
                <td className="text-xs text-white">{line.description}</td>
                <td className="text-right text-xs text-white font-mono">{parseFloat(line.debit) ? formatCurrency(line.debit) : '—'}</td>
                <td className="text-right text-xs text-white font-mono">{parseFloat(line.credit) ? formatCurrency(line.credit) : '—'}</td>
                <td className="text-right text-xs text-white font-mono">{formatCurrency(line.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-dark-900 border-t-2 border-primary/20">
              <td colSpan={3} className="font-bold text-white">Closing balance</td>
              <td className="text-right font-bold text-primary font-mono">{formatCurrency(data.total_debit)}</td>
              <td className="text-right font-bold text-primary font-mono">{formatCurrency(data.total_credit)}</td>
              <td className="text-right font-bold text-primary font-mono">{formatCurrency(data.closing_balance)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function BudgetVsActualResult({ data }) {
  if (!data) return null
  if (!data.rows?.length) {
    return (
      <div className="card p-12 text-center text-dark-500 italic">
        No budget lines or P&amp;L activity for {data.fiscal_year?.name}.
      </div>
    )
  }
  const overBudget = (row) => {
    const v = parseFloat(row.variance)
    return row.type === 'expense' ? v > 0 : v < 0
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4">
          <p className="text-[10px] text-dark-400 font-bold uppercase mb-1">Budgeted net profit</p>
          <p className="text-xl font-bold text-white font-mono">{formatCurrency(data.net_profit?.budget)}</p>
        </div>
        <div className="card p-4 border-primary/30">
          <p className="text-[10px] text-primary font-bold uppercase mb-1">Actual net profit</p>
          <p className="text-xl font-bold text-white font-mono">{formatCurrency(data.net_profit?.actual)}</p>
        </div>
      </div>
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr className="bg-white/[0.02]">
              <th>Account</th>
              <th className="text-right">Budget</th>
              <th className="text-right">Actual</th>
              <th className="text-right">Variance</th>
              <th className="text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(row => (
              <tr key={row.code} className="hover:bg-white/5">
                <td>
                  <span className="text-primary font-mono text-[11px] mr-3">{row.code}</span>
                  <span className="text-xs text-white">{row.name}</span>
                </td>
                <td className="text-right text-xs text-white font-mono">{formatCurrency(row.budget)}</td>
                <td className="text-right text-xs text-white font-mono">{formatCurrency(row.actual)}</td>
                <td className={`text-right text-xs font-mono ${overBudget(row) ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {formatCurrency(row.variance)}
                </td>
                <td className="text-right text-xs text-dark-400 font-mono">{row.variance_pct != null ? `${row.variance_pct}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
function CashFlowResult({ data }) {
  if (!data) return null
  const sections = [
    { key: 'operating', label: 'Operating activities', total: data.net_cash_from_operating, lead: { name: 'Net profit', amount: data.net_profit } },
    { key: 'investing', label: 'Investing activities', total: data.net_cash_from_investing },
    { key: 'financing', label: 'Financing activities', total: data.net_cash_from_financing },
  ]
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-[10px] text-dark-400 font-bold uppercase mb-1">Opening cash</p>
          <p className="text-xl font-bold text-white font-mono">{formatCurrency(data.opening_cash)}</p>
        </div>
        <div className="card p-4 border-primary/30">
          <p className="text-[10px] text-primary font-bold uppercase mb-1">Net change in cash</p>
          <p className="text-xl font-bold text-white font-mono">{formatCurrency(data.net_change_in_cash)}</p>
        </div>
        <div className="card p-4">
          <p className="text-[10px] text-dark-400 font-bold uppercase mb-1">Closing cash</p>
          <p className="text-xl font-bold text-white font-mono">{formatCurrency(data.closing_cash)}</p>
        </div>
      </div>
      {!data.reconciles && (
        <div className="card p-4 border-rose-500/30 text-sm text-rose-400">
          The cash flow does not reconcile to the bank accounts. Check for bank accounts not marked as Bank / Cash.
        </div>
      )}
      <div className="card overflow-hidden">
        <table className="data-table">
          <tbody>
            {sections.map(section => (
              <SectionRows key={section.key} section={section} rows={data[section.key] || []} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SectionRows({ section, rows }) {
  return (
    <>
      <tr className="bg-white/[0.03]">
        <td colSpan={2} className="text-[10px] font-bold text-primary uppercase tracking-widest">{section.label}</td>
      </tr>
      {section.lead && (
        <tr>
          <td className="text-xs text-white">{section.lead.name}</td>
          <td className="text-right text-xs text-white font-mono">{formatCurrency(section.lead.amount)}</td>
        </tr>
      )}
      {rows.map(row => (
        <tr key={row.code}>
          <td>
            <span className="text-primary font-mono text-[11px] mr-3">{row.code}</span>
            <span className="text-xs text-white">{row.name}</span>
          </td>
          <td className="text-right text-xs text-white font-mono">{formatCurrency(row.amount)}</td>
        </tr>
      ))}
      <tr className="border-t border-white/10">
        <td className="text-xs font-bold text-white">Net cash from {section.label.toLowerCase()}</td>
        <td className="text-right text-xs font-bold text-primary font-mono">{formatCurrency(section.total)}</td>
      </tr>
    </>
  )
}

// Budget entry for one period: revenue and expense accounts with their budget.
export function BudgetEditor({ periodId, onSaved }) {
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const { data: accountsData } = useQuery({
    queryKey: ['coa', 'pnl'],
    queryFn: () => financeAPI.accounts.list({ page_size: 200 }),
    enabled: Boolean(periodId),
  })
  const { data: budgetsData } = useQuery({
    queryKey: ['budgets', periodId],
    queryFn: () => financeAPI.budgets.list({ fiscal_period: periodId, page_size: 200 }),
    enabled: Boolean(periodId),
  })

  if (!periodId) {
    return (
      <div className="card p-4 mt-6 text-xs text-dark-400">
        Select a period to enter or edit its budget.
      </div>
    )
  }

  const accounts = (accountsData?.data?.results || accountsData?.data || [])
    .filter(a => ['revenue', 'expense'].includes(a.account_type) && a.allow_direct_posting)
  const budgets = budgetsData?.data?.results || budgetsData?.data || []
  const byAccount = Object.fromEntries(budgets.map(b => [String(b.account), b]))

  const save = async () => {
    setSaving(true)
    setMessage('')
    try {
      for (const [accountId, value] of Object.entries(drafts)) {
        const existing = byAccount[accountId]
        if (existing) {
          await financeAPI.budgets.update(existing.id, { budgeted_amount: value || '0' })
        } else if (value !== '' && Number(value) !== 0) {
          await financeAPI.budgets.create({ fiscal_period: periodId, account: accountId, budgeted_amount: value })
        }
      }
      setDrafts({})
      await queryClient.invalidateQueries({ queryKey: ['budgets', periodId] })
      setMessage('Budget saved.')
      onSaved?.()
    } catch (err) {
      setMessage('Could not save the budget. Check the amounts and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card mt-6 overflow-hidden">
      <div className="bg-dark-900 border-b border-white/5 p-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-white uppercase tracking-widest">Budget for period</h3>
        <div className="flex items-center gap-3">
          {message && <span className="text-xs text-dark-400">{message}</span>}
          <button className="btn-primary h-8 px-4 text-xs" onClick={save} disabled={saving || !Object.keys(drafts).length}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save budget'}
          </button>
        </div>
      </div>
      <table className="data-table">
        <thead>
          <tr className="bg-white/[0.02]">
            <th>Account</th>
            <th className="text-right w-40">Budget</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map(account => {
            const id = String(account.id)
            const value = drafts[id] ?? byAccount[id]?.budgeted_amount ?? ''
            return (
              <tr key={id}>
                <td>
                  <span className="text-primary font-mono text-[11px] mr-3">{account.code}</span>
                  <span className="text-xs text-white">{account.name}</span>
                </td>
                <td className="text-right">
                  <input
                    type="number"
                    step="0.01"
                    aria-label={`Budget for ${account.code}`}
                    className="form-input text-xs text-right w-36"
                    value={value}
                    onChange={e => setDrafts({ ...drafts, [id]: e.target.value })}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}