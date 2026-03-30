// Stohill Properties - Fiscal Periods Management
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Calendar, Lock, Unlock, CheckCircle2, AlertCircle, 
  Plus, ChevronRight, Settings2, ShieldCheck, RefreshCw,
  CalendarDays, Trash2
} from 'lucide-react'
import { financeAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import { formatDate } from '@/utils/format'

export default function FiscalPeriodsPage() {
  const queryClient = useQueryClient()
  const [selectedYearId, setSelectedYearId] = useState(null)
  
  // ── Queries ────────────────────────────────────────────────────────
  const { data: yearsRes, isLoading: yearsLoading } = useQuery({
    queryKey: ['fiscal-years'],
    queryFn: () => financeAPI.fiscalYears.list(),
  })
  const years = yearsRes?.data?.results || []

  // Auto-select first year if none selected
  useEffect(() => {
    if (!selectedYearId && years.length > 0) {
      setSelectedYearId(years[0].id)
    }
  }, [years, selectedYearId])

  const { data: periodsRes, isLoading: periodsLoading } = useQuery({
    queryKey: ['fiscal-periods', selectedYearId],
    queryFn: () => financeAPI.periods.list({ fiscal_year: selectedYearId, ordering: 'start_date' }),
    enabled: !!selectedYearId,
  })
  const periods = periodsRes?.data?.results || []

  const selectedYear = years.find(y => y.id === selectedYearId)

  // ── Mutations ──────────────────────────────────────────────────────

  const generatePeriodsMutation = useMutation({
    mutationFn: (id) => financeAPI.fiscalYears.generatePeriods(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fiscal-periods', selectedYearId] }),
  })

  const closeYearMutation = useMutation({
    mutationFn: (id) => financeAPI.fiscalYears.close(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] })
      queryClient.invalidateQueries({ queryKey: ['fiscal-periods', selectedYearId] })
    },
  })
  
  const reopenYearMutation = useMutation({
    mutationFn: (id) => financeAPI.fiscalYears.reopen(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] })
      queryClient.invalidateQueries({ queryKey: ['fiscal-periods', selectedYearId] })
    },
  })

  // New mutations for period actions
  const lockPeriodMutation = useMutation({
    mutationFn: (id) => financeAPI.periods.lock(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fiscal-periods', selectedYearId] }),
  })

  const unlockPeriodMutation = useMutation({
    mutationFn: (id) => financeAPI.periods.unlock(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fiscal-periods', selectedYearId] }),
  })

  const closePeriodMutation = useMutation({
    mutationFn: (id) => financeAPI.periods.close(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fiscal-periods', selectedYearId] }),
  })

  const reopenPeriodMutation = useMutation({
    mutationFn: (id) => financeAPI.periods.reopen(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fiscal-periods', selectedYearId] }),
  })

  // The original updatePeriodMutation is no longer needed with separate mutations
  // const updatePeriodMutation = useMutation({
  //   mutationFn: ({ id, action }) => {
  //     if (action === 'lock') return financeAPI.periods.lock(id)
  //     if (action === 'unlock') return financeAPI.periods.unlock(id)
  //     if (action === 'close') return financeAPI.periods.close(id)
  //   },
  //   onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fiscal-periods', selectedYearId] }),
  // })

  // ── Handlers ───────────────────────────────────────────────────────
  const openPanel = useUIStore(s => s.openSidePanel)

  const handleAddNewYear = () => {
    openPanel('fiscal-year-form')
  }

  const handleEditYear = (year, e) => {
    e.stopPropagation()
    openPanel('fiscal-year-form', { fiscalYear: year })
  }

  const handleGeneratePeriods = () => {
    if (!selectedYearId) return
    if (periods.length > 0 && !window.confirm('Periods already exist. Re-generating will not delete existing but may cause duplicates. Proceed?')) return
    generatePeriodsMutation.mutate(selectedYearId)
  }

  const handleCloseYear = () => {
    if (!selectedYearId || !selectedYear) return
    if (!window.confirm(`Are you sure you want to close the fiscal year ${selectedYear.year}? This will also close all its periods.`)) return
    closeYearMutation.mutate(selectedYearId)
  }

  const handleReopenYear = () => {
    if (!selectedYearId || !selectedYear) return
    if (!window.confirm(`Are you sure you want to reopen the fiscal year ${selectedYear.year}?`)) return
    reopenYearMutation.mutate(selectedYearId)
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-white">Financial Calendar</h1>
          <p className="text-dark-400 text-sm mt-1">Manage fiscal years, periods and status locks</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={handleAddNewYear}>
          <Plus size={16} /> New Fiscal Year
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Years Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-xs font-bold text-dark-500 uppercase tracking-widest px-1">Fiscal Years</h2>
          <div className="space-y-2">
            {years.map((y) => (
              <button
                key={y.id}
                onClick={() => setSelectedYearId(y.id)}
                className={`w-full group text-left p-4 rounded-xl border transition-all ${
                  selectedYearId === y.id
                    ? 'bg-primary/10 border-primary text-white'
                    : 'bg-white/2 border-white/5 text-dark-300 hover:border-white/10 shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{y.name || y.year}</span>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={(e) => handleEditYear(y, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-all text-dark-400 hover:text-white"
                    >
                      <Settings2 size={12} />
                    </button>
                    {y.is_closed ? (
                      <CheckCircle2 size={14} className="text-emerald-400" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-dark-500 mt-1 uppercase">
                  {formatDate(y.start_date)} — {formatDate(y.end_date)}
                </p>
              </button>
            ))}
            {years.length === 0 && !yearsLoading && (
              <div className="p-8 text-center card bg-white/2 border-dashed border-white/5">
                <Calendar size={24} className="mx-auto mb-2 text-dark-600" />
                <p className="text-xs text-dark-500">No fiscal years defined</p>
              </div>
            )}
          </div>
        </div>

        {/* Periods Content */}
        <div className="lg:col-span-3 space-y-4">
          {selectedYear ? (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              {/* Year Actions */}
              <div className="card p-4 border-primary/20 bg-primary/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                    <CalendarDays size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Year {selectedYear.year}</h3>
                    <p className="text-xs text-dark-400">
                      Status: <span className={selectedYear.is_closed ? 'text-red-400' : 'text-emerald-400 font-medium'}>
                        {selectedYear.is_closed ? 'Closed' : 'Open'}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {periods.length === 0 && (
                    <button 
                      className="btn-ghost text-primary text-xs flex items-center gap-2"
                      onClick={handleGeneratePeriods}
                      disabled={generatePeriodsMutation.isPending}
                    >
                      <RefreshCw size={14} className={generatePeriodsMutation.isPending ? 'animate-spin' : ''} />
                      Generate 12 Periods
                    </button>
                  )}
                  {!selectedYear.is_closed ? (
                    <button 
                      className="btn-secondary text-xs flex items-center gap-2 border-red-500/20 hover:bg-red-500/10 hover:text-red-400"
                      onClick={handleCloseYear}
                      disabled={closeYearMutation.isPending}
                    >
                      <Trash2 size={14} />
                      Close Year
                    </button>
                  ) : (
                    <button 
                      className="btn-secondary text-xs flex items-center gap-2 border-emerald-500/20 hover:bg-emerald-500/10 hover:text-emerald-400"
                      onClick={handleReopenYear}
                      disabled={reopenYearMutation.isPending}
                    >
                      <RefreshCw size={14} className={reopenYearMutation.isPending ? 'animate-spin' : ''} />
                      Reopen Year
                    </button>
                  )}
                </div>
              </div>

              {/* Periods Table */}
              <div className="card overflow-hidden">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Period Name</th>
                      <th>Dates</th>
                      <th>Status</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence mode="popLayout">
                      {periods.map((p) => (
                        <motion.tr
                          key={p.id}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="group hover:bg-white/2 transition-colors"
                        >
                          <td className="px-4 py-3 font-medium text-white text-sm">{p.name}</td>
                          <td className="px-4 py-3 text-xs text-dark-400">
                            {formatDate(p.start_date)} — {formatDate(p.end_date)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {p.status === 'open' && (
                                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                                  <div className="w-1 h-1 rounded-full bg-emerald-400" />
                                  Open
                                </span>
                              )}
                              {p.status === 'locked' && (
                                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
                                  <Lock size={10} />
                                  Locked
                                </span>
                              )}
                              {p.status === 'closed' && (
                                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">
                                  <CheckCircle2 size={10} />
                                  Closed
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {p.status === 'open' && (
                                <>
                                  <button 
                                    className="p-1.5 hover:bg-amber-500/10 hover:text-amber-400 rounded-lg transition-colors"
                                    onClick={() => lockPeriodMutation.mutate(p.id)}
                                    title="Lock Period"
                                  >
                                    <Lock size={14} />
                                  </button>
                                  <button 
                                    className="p-1.5 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-colors"
                                    onClick={() => closePeriodMutation.mutate(p.id)}
                                    title="Close Period"
                                  >
                                    <CheckCircle2 size={14} />
                                  </button>
                                </>
                              )}
                              {(p.status === 'locked' || p.status === 'closed') && (
                                <button 
                                  className="p-1.5 hover:bg-emerald-500/10 hover:text-emerald-400 rounded-lg transition-colors"
                                  onClick={() => (p.status === 'locked' ? unlockPeriodMutation : reopenPeriodMutation).mutate(p.id)}
                                  title={p.status === 'locked' ? "Unlock" : "Reopen Period"}
                                >
                                  {p.status === 'locked' ? <Unlock size={14} /> : <RefreshCw size={14} />}
                                </button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                    {periods.length === 0 && !periodsLoading && (
                      <tr>
                        <td colSpan={4} className="text-center py-20">
                          <AlertCircle size={40} className="mx-auto mb-3 text-dark-600" />
                          <p className="text-dark-400">No periods found for this year.</p>
                          <button className="text-primary text-sm mt-2 hover:underline" onClick={handleGeneratePeriods}>
                            Click here to generate them automatically
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          ) : (
            <div className="h-[400px] flex flex-col items-center justify-center text-dark-500 border border-dashed border-white/5 rounded-2xl">
              <Settings2 size={48} className="mb-4 text-dark-600" />
              <p>Select a fiscal year from the left to manage periods</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
