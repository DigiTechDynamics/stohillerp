import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Save, Send, ChevronLeft } from 'lucide-react'
import { financeAPI } from '@/services/api'
import { useCurrencies } from '@/hooks/useCurrencies'
import { formatCurrency } from '@/utils/format'
import { motion } from 'framer-motion'
import AccountCombobox from '@/components/common/AccountCombobox'

export default function JournalBatchGrid() {
  const navigate = useNavigate()
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [error, setError] = useState(null)
  
  const isEditing = !!id

  const { data: journalsRes } = useQuery({ queryKey: ['finance-journals'], queryFn: () => financeAPI.journals.list() })
  const { currencies, baseCurrency } = useCurrencies()
  
  const { data: batchRes, isLoading: isLoadingBatch } = useQuery({
    queryKey: ['journal-batch', id],
    queryFn: () => financeAPI.batches.detail(id),
    enabled: isEditing
  })

  // We should also fetch entries for this batch if editing
  const { data: entriesRes } = useQuery({
    queryKey: ['journal-entries-batch', id],
    queryFn: () => financeAPI.entries.list({ batch: id, page_size: 1000 }),
    enabled: isEditing
  })

  const journals = journalsRes?.data?.results || []

  const [batchData, setBatchData] = useState({
    journal: '',
    description: '',
  })

  const initialLine = { id: null, date: new Date().toISOString().split('T')[0], reference: '', account: null, offsetAccount: null, description: '', currency: '', debit: 0, credit: 0 }
  const [lines, setLines] = useState([{ ...initialLine }])

  useEffect(() => {
    if (batchRes?.data) {
      setBatchData({
        journal: batchRes.data.journal,
        description: batchRes.data.description,
      })
    }
  }, [batchRes])

  useEffect(() => {
     if (entriesRes?.data?.results?.length > 0) {
        const loadedLines = entriesRes.data.results.map(entry => {
           // Assume typical cashbook entry: line 0 is main, line 1 is offset (if any)
           const mainLine = entry.lines[0] || {}
           const offsetLine = entry.lines.find(l => l.side !== mainLine.side) || {}
           
           return {
               id: entry.id,
               date: entry.entry_date,
               reference: entry.reference,
               account: mainLine.account,
               offsetAccount: offsetLine.account || null,
               description: entry.description,
               currency: entry.currency,
               debit: mainLine.side === 'debit' ? mainLine.amount_currency : 0,
               credit: mainLine.side === 'credit' ? mainLine.amount_currency : 0,
           }
        })
        if (loadedLines.length > 0) {
            setLines(loadedLines)
        }
     }
  }, [entriesRes])

  const addLine = () => setLines([...lines, { ...initialLine, date: lines[lines.length-1]?.date || initialLine.date, currency: lines[lines.length-1]?.currency || '' }])
  const removeLine = (index) => {
    if (lines.length <= 1) return
    setLines(lines.filter((_, i) => i !== index))
  }
  const updateLine = (index, field, value) => {
    const newLines = [...lines]
    newLines[index] = { ...newLines[index], [field]: value }
    if (field === 'debit' && parseFloat(value) > 0) newLines[index].credit = 0
    if (field === 'credit' && parseFloat(value) > 0) newLines[index].debit = 0
    setLines(newLines)
  }

  const totals = useMemo(() => {
    return lines.reduce((acc, line) => {
      acc.debit += parseFloat(line.debit) || 0
      acc.credit += parseFloat(line.credit) || 0
      return acc
    }, { debit: 0, credit: 0 })
  }, [lines])

  const createBatchMut = useMutation({ mutationFn: (data) => financeAPI.batches.create(data) })
  const updateBatchMut = useMutation({ mutationFn: (params) => financeAPI.batches.update(params.id, params.data) })
  const createEntryMut = useMutation({ mutationFn: (data) => financeAPI.entries.create(data) })
  const updateEntryMut = useMutation({ mutationFn: (params) => financeAPI.entries.update(params.id, params.data) })
  const submitMut = useMutation({ mutationFn: (id) => financeAPI.batches.submit(id) })

  const handleSave = async (submitForApproval = false) => {
    setError(null)
    if (!batchData.journal) return setError('Please select a Journal.')
    if (!batchData.description) return setError('Please provide a Batch Description.')

    const validLines = lines.filter(l => l.account && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
    if (validLines.length === 0) return setError('At least one valid line entry is required.')

    try {
      // 1. Save or Update Batch
      let batchId = id
      if (!isEditing) {
          const res = await createBatchMut.mutateAsync(batchData)
          batchId = res.data.id
      } else {
          await updateBatchMut.mutateAsync({ id: batchId, data: batchData })
      }

      // 2. Process Entries (Each Row is an Entry)
      const promises = validLines.map(async (row) => {
          const side = parseFloat(row.debit) > 0 ? 'debit' : 'credit'
          const amount = parseFloat(row.debit) > 0 ? parseFloat(row.debit) : parseFloat(row.credit)
          
          const payloadLines = [{ side, amount_currency: amount, account: row.account, description: row.description }]
          
          if (row.offsetAccount) {
              payloadLines.push({ 
                  side: side === 'debit' ? 'credit' : 'debit', 
                  amount_currency: amount, 
                  account: row.offsetAccount, 
                  description: row.description 
              })
          }

          const entryPayload = {
              batch: batchId,
              journal: batchData.journal,
              entry_date: row.date,
              description: row.description || batchData.description,
              currency: row.currency || baseCurrency?.id,
              lines: payloadLines
          }

          if (row.id) {
              return updateEntryMut.mutateAsync({ id: row.id, data: entryPayload })
          } else {
              return createEntryMut.mutateAsync(entryPayload)
          }
      })

      await Promise.all(promises)

      // 3. Submit if requested
      if (submitForApproval) {
          await submitMut.mutateAsync(batchId)
      }

      queryClient.invalidateQueries({ queryKey: ['journal-batches'] })
      navigate('/finance/entries')

    } catch (err) {
       setError(err.response?.data?.error || err.message || 'Error saving batch.')
    }
  }

  // Handle Tab key for quick insertion
  const handleKeyDown = (e, idx) => {
      if (e.key === 'Tab' && idx === lines.length - 1 && document.activeElement.name === 'credit') {
          e.preventDefault()
          addLine()
      }
  }

  if (isLoadingBatch) return <div className="p-20 text-center text-dark-400">Loading batch...</div>

  return (
    <div className="p-4 lg:p-6 mx-auto space-y-6 flex flex-col h-[calc(100vh-80px)]">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/finance/entries')} className="p-2 hover:bg-white/5 rounded-full transition-colors text-dark-400">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-display text-white tracking-tight">
              {isEditing ? 'Edit Batch' : 'Batch Data Entry Grid'}
            </h1>
            <p className="text-dark-400 text-sm mt-1">High-speed keyboard-friendly data entry</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button onClick={() => handleSave(false)} className="btn-secondary px-6 py-2.5 flex items-center gap-2">
            <Save size={16} /> Save Draft
          </button>
          <button onClick={() => handleSave(true)} className="btn-primary px-6 py-2.5 flex items-center gap-2 group">
            <Send size={16} className="group-hover:translate-x-0.5 transition-transform" /> Submit to Checker
          </button>
        </div>
      </div>

      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm shrink-0">
          {error}
        </motion.div>
      )}

      {/* Batch Header */}
      <div className="card p-5 grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0 border border-primary/10">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-500 uppercase">Journal Type <span className="text-red-500">*</span></label>
            <select className="form-input w-full" value={batchData.journal} onChange={(e) => setBatchData({...batchData, journal: e.target.value})}>
              <option value="">Select...</option>
              {journals.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5 lg:col-span-2">
             <label className="text-[10px] font-bold text-dark-500 uppercase">Batch Description <span className="text-red-500">*</span></label>
             <input type="text" className="form-input w-full" placeholder="e.g. November Expense Accruals" value={batchData.description} onChange={(e) => setBatchData({...batchData, description: e.target.value})} />
          </div>
          <div className="flex flex-col justify-end items-end p-2 border border-white/5 rounded-lg bg-dark-800">
              <span className="text-[10px] font-bold text-dark-500 uppercase">Total Debits</span>
              <span className="text-xl font-mono text-emerald-400">{formatCurrency(totals.debit)}</span>
          </div>
      </div>

      {/* Grid Container */}
      <div className="card flex-1 overflow-hidden flex flex-col scrollbar-hide">
         <div className="overflow-x-auto flex-1 h-full scrollbar-hide">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead className="bg-dark-800/80 sticky top-0 z-10 backdrop-blur-md">
                <tr className="text-[10px] text-dark-500 uppercase font-bold border-b border-white/5">
                  <th className="px-3 py-3 w-32">Date</th>
                  <th className="px-3 py-3 w-40">Main Account</th>
                  <th className="px-3 py-3 w-40">Contra Account</th>
                  <th className="px-3 py-3">Line Description</th>
                  <th className="px-3 py-3 w-28">Currency</th>
                  <th className="px-3 py-3 w-32 text-right">Debit</th>
                  <th className="px-3 py-3 w-32 text-right">Credit</th>
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-transparent overflow-y-auto">
                {lines.map((line, idx) => (
                  <tr key={idx} className="group hover:bg-white/2 transition-colors">
                    <td className="p-1">
                       <input type="date" className="form-input w-full text-sm border-transparent hover:border-white/10 focus:border-primary bg-transparent text-white" 
                              value={line.date} onChange={(e) => updateLine(idx, 'date', e.target.value)} />
                    </td>
                    <td className="p-1 relative">
                       <div className="w-full rounded border border-transparent hover:border-white/10 focus-within:border-primary">
                           <AccountCombobox value={line.account} onChange={(val) => updateLine(idx, 'account', val)} placeholder="Account..." />
                       </div>
                    </td>
                    <td className="p-1 relative">
                       <div className="w-full rounded border border-transparent hover:border-white/10 focus-within:border-primary">
                           <AccountCombobox value={line.offsetAccount} onChange={(val) => updateLine(idx, 'offsetAccount', val)} placeholder="Contra..." />
                       </div>
                    </td>
                    <td className="p-1">
                       <input type="text" className="form-input w-full text-sm border-transparent hover:border-white/10 focus:border-primary bg-transparent" placeholder="Narration..." 
                              value={line.description} onChange={(e) => updateLine(idx, 'description', e.target.value)} />
                    </td>
                    <td className="p-1">
                        <select className="form-input w-full text-sm border-transparent hover:border-white/10 focus:border-primary bg-transparent" 
                                value={line.currency} onChange={(e) => updateLine(idx, 'currency', e.target.value)}>
                            <option value="">Base</option>
                            {currencies.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
                        </select>
                    </td>
                    <td className="p-1">
                        <input type="number" step="0.01" className="form-input w-full text-right font-mono text-emerald-400 font-semibold border-transparent hover:border-white/10 focus:border-primary bg-transparent" 
                               placeholder="0.00" value={line.debit || ''} onChange={(e) => updateLine(idx, 'debit', e.target.value)} />
                    </td>
                    <td className="p-1">
                        <input type="number" step="0.01" name="credit" className="form-input w-full text-right font-mono text-primary font-semibold border-transparent hover:border-white/10 focus:border-primary bg-transparent" 
                               placeholder="0.00" value={line.credit || ''} onChange={(e) => updateLine(idx, 'credit', e.target.value)} onKeyDown={(e) => handleKeyDown(e, idx)} />
                    </td>
                    <td className="p-1 text-center">
                        <button onClick={() => removeLine(idx)} className="p-1.5 text-dark-600 hover:text-red-500 transition-colors disabled:opacity-0" title="Remove row">
                          <Trash2 size={14} />
                        </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
         </div>
         <button onClick={addLine} className="w-full py-2.5 text-xs font-bold text-dark-500 hover:text-primary hover:bg-white/2 transition-all flex items-center justify-center gap-2 border-t border-white/5 uppercase tracking-widest bg-dark-800">
            <Plus size={14} /> Add Row (or press Tab on last cell)
         </button>
      </div>
    </div>
  )
}
