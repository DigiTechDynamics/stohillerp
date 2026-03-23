import { useState, useEffect } from 'react'
import {
  Landmark, Plus, Search, Filter, MoreVertical,
  Play, CheckCircle, RefreshCcw, DollarSign,
  User, Calendar, ArrowRight, Banknote,
  Settings, FileText, ExternalLink
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '@/stores/authStore'
import { payrollAPI } from '@/services/api'
import PayrollRunForm from '@/components/modules/payroll/PayrollRunForm'
import PayslipModal from '@/components/modules/payroll/PayslipModal'
import DeductionSettingsView from '@/components/modules/payroll/DeductionSettingsView'
import Pagination from '@/components/common/Pagination'
import { formatCurrency } from '@/utils/format'

export default function PayrollPage() {
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedRun, setSelectedRun] = useState(null)
  const [items, setItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const openSidePanel = useUIStore((s) => s.openSidePanel)

  const [activeTab, setActiveTab] = useState('runs') // 'runs', 'items', 'settings'
  const [selectedItemForPayslip, setSelectedItemForPayslip] = useState(null)

  const [pagination, setPagination] = useState({
    count: 0,
    page: 1,
    pageSize: 20
  })

  const fetchRuns = async (page = 1) => {
    setLoading(true)
    try {
      const { data } = await payrollAPI.runs.list({ page })
      setRuns(data.results || [])
      setPagination({
        count: data.count,
        page,
        pageSize: 20
      })
    } catch (err) {
      console.error('Failed to fetch payroll runs:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchItems = async (runId) => {
    setItemsLoading(true)
    try {
      const { data } = await payrollAPI.items.list({ payroll_run: runId })
      setItems(data.results || [])
    } catch (err) {
      console.error('Failed to fetch payroll items:', err)
    } finally {
      setItemsLoading(false)
    }
  }

  useEffect(() => {
    fetchRuns()
  }, [])

  useEffect(() => {
    if (selectedRun) {
      fetchItems(selectedRun.id)
    } else {
      setItems([])
    }
  }, [selectedRun])

  const handleProcess = async (runId) => {
    if (!confirm('This will purge existing items and recalculate all payments. Continue?')) return
    try {
      await payrollAPI.runs.process(runId)
      fetchRuns(pagination.page)
      if (selectedRun?.id === runId) {
        const { data } = await payrollAPI.runs.detail(runId)
        setSelectedRun(data)
      }
    } catch (err) {
      alert('Processing failed. Please check backend logs.')
    }
  }

  const handlePay = async (runId) => {
    if (!confirm('Mark all items in this run as PAID and update commission records?')) return
    try {
      await payrollAPI.runs.payAll(runId)
      fetchRuns(pagination.page)
      if (selectedRun?.id === runId) {
        const { data } = await payrollAPI.runs.detail(runId)
        setSelectedRun(data)
      }
    } catch (err) {
      alert('Payment execution failed.')
    }
  }

  return (
    <div className="p-6 lg:p-10 max-w-[1600px] mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-display text-white">Payroll Management</h1>
          <p className="text-dark-400 mt-2">Manage employee salaries and agent commissions</p>
        </div>
        <div className="flex gap-3">
           <button 
             className="btn-secondary" 
             onClick={() => setActiveTab('settings')}
           >
             <Settings className="w-4 h-4" /> Settings
           </button>
           <button
            onClick={() => openSidePanel('payroll-run-form', { onSuccess: () => fetchRuns() })}
            className="btn-primary"
          >
            <Plus size={20} />
            <span>New Payroll Run</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 gap-8">
        {[
          { id: 'runs', label: 'Payroll Runs' },
          { id: 'items', label: 'Payment Items' },
          { id: 'settings', label: 'Statutory Configuration' }
        ].map(tab => (
          <button
            key={tab.id}
            className={`pb-4 text-sm font-bold uppercase tracking-widest border-b-2 transition-all ${
              activeTab === tab.id 
                ? 'border-primary text-primary' 
                : 'border-transparent text-dark-400 hover:text-white'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {activeTab === 'runs' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500">
            {/* Runs List */}
            <div className="lg:col-span-4 space-y-4">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-[10px] font-bold text-dark-400 uppercase tracking-widest flex items-center gap-2">
                  <Calendar size={12} className="text-primary" />
                  Select Period
                </h3>
              </div>

              <div className="space-y-3">
                {loading ? (
                  [1, 2, 3].map(i => <div key={i} className="h-24 bg-dark-900/50 rounded-2xl animate-pulse border border-white/5" />)
                ) : runs.length === 0 ? (
                  <div className="p-10 rounded-3xl border border-white/5 bg-dark-900/50 text-center">
                    <Landmark className="mx-auto text-dark-500 mb-4" size={32} />
                    <p className="text-dark-400 text-sm">No payroll runs found</p>
                  </div>
                ) : (
                  runs.map(run => (
                    <motion.div
                      key={run.id}
                      onClick={() => setSelectedRun(run)}
                      whileHover={{ scale: 1.01 }}
                      className={`
                        p-5 rounded-2xl border cursor-pointer transition-all
                        ${selectedRun?.id === run.id
                          ? 'bg-primary/10 border-primary/30 shadow-gold-sm'
                          : 'bg-dark-900 border-white/5 hover:border-white/10'
                        }
                      `}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-white mb-1">{run.name}</h4>
                          <p className="text-[10px] text-dark-500 uppercase tracking-tight">
                            {run.period_start} — {run.period_end}
                          </p>
                        </div>
                        <span className={`
                          px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter
                          ${run.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' :
                            run.status === 'approved' ? 'bg-blue-500/20 text-blue-400' :
                            run.status === 'processing' ? 'bg-orange-500/20 text-orange-400' :
                            'bg-dark-700 text-dark-400'}
                        `}>
                          {run.status}
                        </span>
                      </div>
                      <div className="mt-4 flex items-baseline justify-between">
                         <span className="text-lg font-display text-white">{formatCurrency(run.total_net, run.currency_code)}</span>
                         <span className="text-[10px] text-dark-500 font-bold uppercase">Net Total</span>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>

              <Pagination
                count={pagination.count}
                page={pagination.page}
                onChange={(p) => fetchRuns(p)}
              />
            </div>

            {/* Run Details */}
            <div className="lg:col-span-8">
              {selectedRun ? (
                <div className="space-y-6">
                  {/* Summary Card */}
                  <div className="kpi-card group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                      <Banknote size={120} />
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h2 className="text-2xl font-display text-white">{selectedRun.name}</h2>
                          <button
                            onClick={() => openSidePanel('payroll-run-form', { ...selectedRun, onSuccess: () => fetchRuns(pagination.page) })}
                            className="btn-ghost p-1.5"
                          >
                             <MoreVertical size={16} />
                          </button>
                        </div>
                        <p className="text-dark-400 text-sm">{selectedRun.period_start} to {selectedRun.period_end}</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {selectedRun.status === 'draft' && (
                          <button
                            onClick={() => handleProcess(selectedRun.id)}
                            className="btn-primary"
                          >
                            <Play size={16} /> Process
                          </button>
                        )}
                        {selectedRun.status === 'processing' && (
                          <button
                             onClick={() => payrollAPI.runs.update(selectedRun.id, { status: 'approved' }).then(() => fetchRuns(pagination.page))}
                             className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-blue-600 transition-all"
                          >
                             <CheckCircle size={16} /> Approve
                          </button>
                        )}
                        {selectedRun.status === 'approved' && (
                          <button
                             onClick={() => handlePay(selectedRun.id)}
                             className="bg-emerald-500 text-dark-900 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-600 transition-all"
                          >
                             <DollarSign size={16} /> Pay All
                          </button>
                        )}
                         <button
                          onClick={() => handleProcess(selectedRun.id)}
                          className="btn-secondary"
                        >
                          <RefreshCcw size={16} /> Recalculate
                        </button>
                      </div>
                    </div>

                    <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
                      <div className="p-5 rounded-2xl bg-white/5 border border-white/5">
                        <p className="stat-label">Gross Amount</p>
                        <p className="stat-value">{formatCurrency(selectedRun.total_gross, selectedRun.currency_code)}</p>
                      </div>
                      <div className="p-5 rounded-2xl bg-white/5 border border-white/5">
                        <p className="stat-label">Total Deductions</p>
                        <p className="stat-value text-red-400">{formatCurrency(selectedRun.total_deductions, selectedRun.currency_code)}</p>
                      </div>
                      <div className="p-5 rounded-2xl bg-white/5 border border-white/5 ring-1 ring-primary/20">
                        <p className="stat-label text-primary">Net Pay Total</p>
                        <p className="stat-value text-primary">{formatCurrency(selectedRun.total_net, selectedRun.currency_code)}</p>
                      </div>
                    </div>

                    {selectedRun.invoice_number && (
                      <div className="mt-6 p-4 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                            <FileText size={20} />
                          </div>
                          <div>
                            <p className="text-[10px] text-dark-500 font-black uppercase tracking-widest">Linked AP Invoice</p>
                            <p className="font-bold text-white">{selectedRun.invoice_number}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className={`
                            px-2 py-1 rounded text-[10px] font-black uppercase tracking-tighter
                            ${selectedRun.invoice_status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' :
                              selectedRun.invoice_status === 'posted' ? 'bg-blue-500/20 text-blue-400' :
                              'bg-orange-500/20 text-orange-400'}
                          `}>
                            {selectedRun.invoice_status || 'Draft'}
                          </span>
                          <Link 
                            to="/finance/ap" 
                            className="btn-ghost text-primary text-xs flex items-center gap-2 hover:bg-primary/10"
                          >
                            Go to AP <ExternalLink size={14} />
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <button 
                    className="btn-ghost text-primary hover:bg-primary/10 w-full justify-center py-4 rounded-2xl border border-dashed border-primary/20"
                    onClick={() => setActiveTab('items')}
                  >
                    View Detailed Employee List <ArrowRight size={16} className="ml-2" />
                  </button>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center p-20 rounded-3xl border-2 border-dashed border-white/5 text-center bg-dark-900/30">
                  <div className="w-20 h-20 rounded-full bg-dark-800 flex items-center justify-center mb-6 text-dark-600">
                    <ArrowRight size={32} />
                  </div>
                  <h3 className="text-xl font-display text-white">Select a Payroll Period</h3>
                  <p className="text-dark-400 mt-2 max-w-xs mx-auto">Click on a period from the list on the left to manage payments.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'items' && (
          <div className="card animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden">
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-dark-800/50">
               <div>
                  <h3 className="font-bold text-white">Payment Items</h3>
                  <p className="text-[10px] text-dark-400 uppercase tracking-widest font-bold mt-1">
                    {selectedRun ? `${selectedRun.name} — ${items.length} records` : 'Select a run to view items'}
                  </p>
               </div>
               <div className="flex gap-4">
                  <input 
                    type="text" 
                    placeholder="Search employee..." 
                    className="form-input w-64 h-9 text-xs"
                  />
               </div>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-1/4">Employee</th>
                    <th className="text-right">Gross</th>
                    <th className="text-right text-red-400/80">PAYE</th>
                    <th className="text-right text-red-400/80">Levy</th>
                    <th className="text-right text-red-400/80">NSSA</th>
                    <th className="text-right text-primary">Net Pay</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsLoading ? (
                    [1, 2, 3].map(i => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan="7" className="h-16 bg-white/[0.02]" />
                      </tr>
                    ))
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="p-20 text-center">
                         <User className="mx-auto text-dark-600 mb-4" size={32} />
                         <p className="text-dark-500 italic">No employees found for this run.</p>
                      </td>
                    </tr>
                  ) : (
                    items.map(item => (
                      <tr key={item.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-dark-700 flex items-center justify-center text-primary font-bold text-xs border border-white/5">
                              {item.employee_name?.split(' ').map(n => n[0]).join('')}
                            </div>
                            <div>
                              <p className="font-semibold text-white">{item.employee_name}</p>
                              <p className="text-[10px] text-dark-500 uppercase font-bold">{item.employee_job_title}</p>
                            </div>
                          </div>
                        </td>
                        <td className="text-right font-mono text-dark-200">
                          {formatCurrency(item.gross_amount, selectedRun?.currency_code)}
                        </td>
                        <td className="text-right font-mono text-red-400/70">
                          {formatCurrency(item.tax_amount, selectedRun?.currency_code)}
                        </td>
                        <td className="text-right font-mono text-red-400/70">
                          {formatCurrency(item.aids_levy, selectedRun?.currency_code)}
                        </td>
                        <td className="text-right font-mono text-red-400/70">
                          {formatCurrency(item.nssa_deduction, selectedRun?.currency_code)}
                        </td>
                        <td className="text-right font-bold text-primary font-mono bg-primary/5">
                          {formatCurrency(item.net_amount, selectedRun?.currency_code)}
                        </td>
                        <td className="text-right">
                          <button 
                            className="btn-ghost h-8 text-[11px] font-bold border border-white/5 hover:border-primary/30 text-primary"
                            onClick={() => setSelectedItemForPayslip(item.id)}
                          >
                            <FileText size={14} /> Payslip
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <DeductionSettingsView selectedRun={selectedRun} />
        )}
      </div>

      <PayslipModal
        isOpen={!!selectedItemForPayslip}
        onClose={() => setSelectedItemForPayslip(null)}
        itemId={selectedItemForPayslip}
      />
    </div>
  )
}
