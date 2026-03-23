import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  Plus, Trash2, Save, Send, AlertCircle, Info, Calculator, 
  ChevronLeft, ArrowRightLeft, Search, CheckCircle2 
} from 'lucide-react'
import { financeAPI } from '@/services/api'
import { formatCurrency } from '@/utils/format'
import { motion, AnimatePresence } from 'framer-motion'
import AccountCombobox from '@/components/common/AccountCombobox'

export default function CreateJournalEntryPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [error, setError] = useState(null)
  
  const isEditing = !!id

  // 1. Data Fetching
  const { data: journalsRes } = useQuery({
    queryKey: ['finance-journals'],
    queryFn: () => financeAPI.journals.list(),
  })
  const { data: accountsRes } = useQuery({
    queryKey: ['finance-accounts-compact'],
    queryFn: () => financeAPI.accounts.list({ page_size: 1000 }),
  })
  const { data: currenciesRes } = useQuery({
    queryKey: ['currencies'],
    queryFn: () => financeAPI.currencies.list(),
  })
  
  const { data: entryRes, isLoading: isLoadingEntry } = useQuery({
    queryKey: ['journal-entry', id],
    queryFn: () => financeAPI.entries.detail(id),
    enabled: isEditing
  })

  const journals = journalsRes?.data?.results || []
  const accounts = accountsRes?.data?.results || []
  const currencies = currenciesRes?.data?.results || []
  const baseCurrency = currencies.find(c => c.is_base)

  // 2. Form State
  const [formData, setFormData] = useState({
    journal: '',
    entry_date: new Date().toISOString().split('T')[0],
    description: '',
    currency: '',
    exchange_rate: 1,
    lines: [
      { account: null, offsetAccount: null, description: '', debit: 0, credit: 0 },
      { account: null, offsetAccount: null, description: '', debit: 0, credit: 0 }
    ]
  })

  useEffect(() => {
    if (entryRes?.data) {
      const entry = entryRes.data
      setFormData({
        journal: entry.journal,
        entry_date: entry.entry_date,
        description: entry.description,
        currency: entry.currency,
        exchange_rate: entry.exchange_rate,
        lines: entry.lines?.map(l => ({
          account: l.account,
          offsetAccount: null,
          description: l.description,
          debit: l.side === 'debit' ? l.amount_currency : 0,
          credit: l.side === 'credit' ? l.amount_currency : 0
        })) || [
          { account: null, offsetAccount: null, description: '', debit: 0, credit: 0 },
          { account: null, offsetAccount: null, description: '', debit: 0, credit: 0 }
        ]
      })
    }
  }, [entryRes])

  // 3. Line Management
  const addLine = () => {
    setFormData(prev => ({
      ...prev,
      lines: [...prev.lines, { account: null, offsetAccount: null, description: '', debit: 0, credit: 0 }]
    }))
  }

  const removeLine = (index) => {
    if (formData.lines.length <= 2) return
    setFormData(prev => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== index)
    }))
  }

  const updateLine = (index, field, value) => {
    const updatedLines = [...formData.lines]
    updatedLines[index] = { ...updatedLines[index], [field]: value }
    
    // Clear opposite side when one is entered
    if (field === 'debit' && parseFloat(value) > 0) updatedLines[index].credit = 0
    if (field === 'credit' && parseFloat(value) > 0) updatedLines[index].debit = 0
    
    setFormData({ ...formData, lines: updatedLines })
  }

  // 4. Calculations
  const totals = useMemo(() => {
    return formData.lines.reduce((acc, line) => {
      const d = parseFloat(line.debit) || 0
      const c = parseFloat(line.credit) || 0
      
      // Add current line
      acc.debit += d
      acc.credit += c
      
      // If there's an offset account, it implicitly balances this line
      if (line.offsetAccount) {
        acc.debit += c
        acc.credit += d
      }
      
      return acc
    }, { debit: 0, credit: 0 })
  }, [formData.lines])

  const diff = Math.abs(totals.debit - totals.credit)
  const isBalanced = diff < 0.01 && totals.debit > 0

  const parseError = (err) => {
    const data = err.response?.data
    if (data?.error?.message) return data.error.message
    if (typeof data === 'object') {
      // Handle DRF validation error objects
      const errors = []
      for (const [key, value] of Object.entries(data)) {
        errors.push(`${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
      }
      return errors.join(' | ')
    }
    return 'An unexpected error occurred'
  }

  const createMutation = useMutation({
    mutationFn: (data) => isEditing ? financeAPI.entries.update(id, data) : financeAPI.entries.create(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
    },
    onError: (err) => setError(parseError(err) || 'Failed to save entry')
  })

  const postMutation = useMutation({
    mutationFn: (entryId) => financeAPI.entries.post(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
      navigate('/finance/entries')
    },
    onError: (err) => setError(parseError(err) || 'Failed to post entry')
  })

  const handleSubmit = async (shouldPost) => {
    setError(null)
    
    // Prepare lines for API
    const preparedLines = []
    formData.lines.forEach(l => {
      const mainAccount = l.account
      if (!mainAccount || (!parseFloat(l.debit) && !parseFloat(l.credit))) return

      const side = parseFloat(l.debit) > 0 ? 'debit' : 'credit'
      const amount = parseFloat(l.debit) > 0 ? parseFloat(l.debit) : parseFloat(l.credit)
      const desc = l.description || formData.description

      const buildLine = (entity) => {
        const line = {
          side,
          amount_currency: amount,
          description: desc
        }
        if (entity.type === 'account') line.account = entity.id
        else if (entity.type === 'customer') line.contact_ref = entity.entity_id
        else if (entity.type === 'supplier') line.supplier_ref = entity.entity_id
        else if (entity.type === 'employee') line.employee_ref = entity.entity_id
        return line
      }

      // Main Line
      preparedLines.push(buildLine(mainAccount))

      // Offset Line (if provided)
      if (l.offsetAccount) {
        const offsetLine = buildLine(l.offsetAccount)
        offsetLine.side = side === 'debit' ? 'credit' : 'debit'
        preparedLines.push(offsetLine)
      }
    })

    if (!formData.journal) {
      setError('Please select a Journal.')
      return
    }


    if (!formData.entry_date) {
      setError('Please select a Posting Date.')
      return
    }

    if (!formData.description) {
      setError('Please provide a Global Description.')
      return
    }

    if (preparedLines.length < 2) {
      setError('A journal entry requires at least two lines with accounts and amounts.')
      return
    }

    if (!formData.currency) {
      setError('Please select a Currency.')
      return
    }

    if (shouldPost && !isBalanced) {
      setError('Only balanced entries can be posted.')
      return
    }

    const payload = { ...formData, lines: preparedLines }

    try {
      const res = await createMutation.mutateAsync(payload)
      if (shouldPost) {
        await postMutation.mutateAsync(res.data.id || id)
      } else {
        navigate('/finance/entries')
      }
    } catch (err) {
      // Error handled by mutation onError
    }
  }

  if (isLoadingEntry) return <div className="p-20 text-center text-dark-400">Loading entry...</div>

  return (
    <div className="p-4 lg:p-8 max-w-[1600px] mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/finance/entries')}
            className="p-2 hover:bg-white/5 rounded-full transition-colors text-dark-400"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-display text-white tracking-tight">
              {isEditing ? 'Edit Journal Entry' : 'Capture New Journal Entry'}
            </h1>
            <p className="text-dark-400 text-base mt-1.5 font-medium">Create a manual record of financial transactions with full sub-ledger support</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            disabled={createMutation.isPending || postMutation.isPending}
            onClick={() => handleSubmit(false)}
            className="btn-secondary px-6 py-2.5 flex items-center gap-2"
          >
            <Save size={18} /> Save as Draft
          </button>
          <button 
            disabled={!isBalanced || createMutation.isPending || postMutation.isPending}
            onClick={() => handleSubmit(true)}
            className="btn-primary px-6 py-2.5 flex items-center gap-2 group"
          >
            <Send size={18} className="group-hover:translate-x-0.5 transition-transform" /> 
            {postMutation.isPending ? 'Posting...' : 'Post Entry'}
          </button>
        </div>
      </div>

      {error && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-sm flex gap-3"
        >
          <AlertCircle size={18} className="flex-shrink-0" />
          <p>{typeof error === 'object' ? JSON.stringify(error) : error}</p>
        </motion.div>
      )}

      {/* Main Entry Info */}
      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 xl:col-span-9 space-y-8">
          <div className="card p-6 space-y-5">
             <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Journal Type</label>
                <select 
                  className="form-input w-full"
                  value={formData.journal}
                  onChange={(e) => setFormData({...formData, journal: e.target.value})}
                >
                  <option value="">Select Journal...</option>
                  {journals.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                </select>
             </div>

             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Posting Date</label>
                  <input 
                    type="date" 
                    className="form-input w-full" 
                    value={formData.entry_date}
                    onChange={(e) => setFormData({...formData, entry_date: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Currency</label>
                  <div className="flex gap-2">
                    <select 
                      className="form-input flex-1"
                      value={formData.currency}
                      onChange={(e) => {
                        const curr = currencies.find(c => c.id === e.target.value)
                        setFormData({
                          ...formData, 
                          currency: e.target.value,
                          exchange_rate: curr?.is_base ? 1 : formData.exchange_rate
                        })
                      }}
                    >
                      <option value="">Select Currency...</option>
                      {currencies.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
                    </select>
                    {formData.currency && !currencies.find(c => c.id === formData.currency)?.is_base && (
                      <div className="w-32 space-y-1.5">
                        <input 
                          type="number" 
                          step="0.00000001"
                          className="form-input w-full"
                          placeholder="Rate"
                          value={formData.exchange_rate}
                          onChange={(e) => setFormData({...formData, exchange_rate: parseFloat(e.target.value) || 0})}
                        />
                      </div>
                    )}
                  </div>
                </div>
             </div>

             <div className="space-y-1.5">
               <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Global Description</label>
               <input 
                 type="text" 
                 className="form-input w-full" 
                 placeholder="Entry purpose..."
                 value={formData.description}
                 onChange={(e) => setFormData({...formData, description: e.target.value})}
               />
             </div>
          </div>

          {/* Line Items - Spreadsheet Style */}
          <div className="card overflow-hidden">
             <div className="p-4 border-b border-white/5 bg-white/2 flex items-center justify-between">
               <h2 className="text-xs font-bold text-dark-400 uppercase tracking-widest flex items-center gap-2">
                 <ArrowRightLeft size={14} /> Transaction Lines
               </h2>
               <div className="flex items-center gap-2">
                  <span className="text-[10px] text-dark-500 uppercase">Lines: {formData.lines.length}</span>
               </div>
             </div>
             
             <table className="w-full text-left border-collapse">
               <thead>
                 <tr className="text-[10px] text-dark-500 uppercase font-bold border-b border-white/5">
                   <th className="px-5 py-4 w-[25%]">Main Account</th>
                   <th className="px-5 py-4 w-[25%]">Offset Account</th>
                   <th className="px-5 py-4">Line Narration</th>
                   <th className="px-5 py-4 w-32 text-right">Debit</th>
                   <th className="px-5 py-4 w-32 text-right">Credit</th>
                   <th className="px-5 py-4 w-12"></th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-white/2">
                 {formData.lines.map((line, idx) => (
                   <tr key={idx} className="group hover:bg-white/1 transition-colors">
                      <td className="p-3">
                         <AccountCombobox 
                           value={line.account}
                           onChange={(val) => updateLine(idx, 'account', val)}
                           placeholder="Main account/entity..."
                         />
                      </td>
                      <td className="p-3">
                         <AccountCombobox 
                           value={line.offsetAccount}
                           onChange={(val) => updateLine(idx, 'offsetAccount', val)}
                           placeholder="Optional offset..."
                         />
                      </td>
                     <td className="p-3">
                        <input 
                          type="text" 
                          className="form-input w-full text-base py-2 border-transparent hover:border-white/10 focus:border-primary/50 bg-transparent"
                          placeholder="Line details..."
                          value={line.description}
                          onChange={(e) => updateLine(idx, 'description', e.target.value)}
                        />
                     </td>
                     <td className="p-3">
                        <input 
                          type="number" 
                          className="form-input w-full text-lg py-2 text-right font-mono text-emerald-400 border-transparent hover:border-white/10 focus:border-primary/50 bg-transparent"
                          placeholder="0.00"
                          value={line.debit || ''}
                          onChange={(e) => updateLine(idx, 'debit', e.target.value)}
                        />
                     </td>
                     <td className="p-3">
                        <input 
                          type="number" 
                          className="form-input w-full text-lg py-2 text-right font-mono text-primary border-transparent hover:border-white/10 focus:border-primary/50 bg-transparent"
                          placeholder="0.00"
                          value={line.credit || ''}
                          onChange={(e) => updateLine(idx, 'credit', e.target.value)}
                        />
                     </td>
                     <td className="p-2 text-center">
                        <button 
                          onClick={() => removeLine(idx)}
                          className="p-1.5 text-dark-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-0"
                          disabled={formData.lines.length <= 2}
                        >
                          <Trash2 size={14} />
                        </button>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
             
             <button 
               onClick={addLine}
               className="w-full py-4 text-xs text-dark-500 hover:text-primary hover:bg-white/2 transition-all flex items-center justify-center gap-2 border-t border-white/5"
             >
               <Plus size={14} /> Add Transaction Line (Tab)
             </button>
          </div>
        </div>

        <div className="col-span-12 xl:col-span-3 space-y-6">
          {/* Summary Card */}
          <div className="card p-6 space-y-4">
             <h2 className="text-sm font-bold text-dark-400 uppercase tracking-widest flex items-center gap-2 mb-2">
               <Calculator size={16} /> Entry Summary
             </h2>
             
             <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-dark-500">Total Debits</span>
                  <span className="font-mono text-emerald-400 font-bold">{formatCurrency(totals.debit)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-dark-500">Total Credits</span>
                  <span className="font-mono text-primary font-bold">{formatCurrency(totals.credit)}</span>
                </div>
                
                <div className="pt-4 border-t border-white/5">
                  <div className={`p-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all duration-500 ${isBalanced ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                    {isBalanced ? (
                      <CheckCircle2 size={32} className="text-emerald-500" />
                    ) : (
                      <AlertCircle size={32} className="text-red-500" />
                    )}
                    <span className={`text-[10px] font-bold uppercase tracking-widest text-center ${isBalanced ? 'text-emerald-500' : 'text-red-500'}`}>
                      {isBalanced ? 'Entry is Balanced' : `Trial Balance Out by ${formatCurrency(diff)}`}
                    </span>
                  </div>
                </div>
             </div>
          </div>

          <div className="bg-dark-800/50 rounded-2xl p-5 border border-white/5">
            <h3 className="text-[10px] font-bold text-dark-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Info size={12} /> Accounting Rules
            </h3>
            <ul className="space-y-3 text-xs text-dark-400 leading-relaxed">
              <li className="flex gap-2">
                <span className="text-primary">•</span>
                Total debits must equal total credits before posting.
              </li>
              <li className="flex gap-2">
                <span className="text-primary">•</span>
                Posted entries create immutable ledger records.
              </li>
              <li className="flex gap-2">
                <span className="text-primary">•</span>
                The fiscal period is automatically determined by the posting date.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
