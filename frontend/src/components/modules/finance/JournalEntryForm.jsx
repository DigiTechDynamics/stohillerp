import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  Plus, Trash2, Save, Send, AlertCircle, Info, Calculator 
} from 'lucide-react'
import { financeAPI } from '@/services/api'
import { formatCurrency } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import AccountCombobox from '@/components/common/AccountCombobox'
import CurrencySelect from '@/components/common/CurrencySelect'

export default function JournalEntryForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel, sidePanelData } = useUIStore()
  const [error, setError] = useState(null)

  const entry = sidePanelData?.entry

  // 1. Data Fetching
  const { data: journalsRes } = useQuery({
    queryKey: ['finance-journals'],
    queryFn: () => financeAPI.journals.list()
  })

  const journals = journalsRes?.data?.results || []

  // 2. Form State
  const [formData, setFormData] = useState({
    journal: entry?.journal || '',
    entry_date: entry?.entry_date || new Date().toISOString().split('T')[0],
    description: entry?.description || '',
    currency: entry?.currency || '',
    lines: entry?.lines?.map(l => ({
      ...l,
      offsetAccount: null,
      debit: l.side === 'debit' ? l.amount : 0,
      credit: l.side === 'credit' ? l.amount : 0
    })) || [
      { account: null, offsetAccount: null, description: '', debit: 0, credit: 0 },
      { account: null, offsetAccount: null, description: '', debit: 0, credit: 0 }
    ]
  })

  // 3. Line Management
  const addLine = () => {
    setFormData(prev => ({
      ...prev,
      lines: [...prev.lines, { account: null, offsetAccount: null, description: '', debit: 0, credit: 0 }]
    }))
  }

  const removeLine = (index) => {
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

  // 5. Mutations
  const createMutation = useMutation({
    mutationFn: (data) => financeAPI.entries.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
      closeSidePanel()
    },
    onError: (err) => setError(err.response?.data?.error?.message || 'Failed to save entry')
  })

  const postMutation = useMutation({
    mutationFn: (id) => financeAPI.entries.post(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
      closeSidePanel()
    },
    onError: (err) => setError(err.response?.data?.error?.message || 'Failed to post entry')
  })

  const handleSubmit = (shouldPost) => {
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

    if (preparedLines.length < 2) {
      setError('A journal entry requires at least two lines.')
      return
    }

    if (shouldPost && !isBalanced) {
      setError('Only balanced entries can be posted.')
      return
    }

    const payload = { ...formData, lines: preparedLines }

    createMutation.mutate(payload, {
      onSuccess: (res) => {
        if (shouldPost) {
          postMutation.mutate(res.data.id)
        }
      }
    })
  }

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs flex gap-2">
            <AlertCircle size={14} className="flex-shrink-0" />
            <p>{typeof error === 'object' ? JSON.stringify(error) : error}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Journal</label>
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
            <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Reference</label>
            <input 
              type="text" 
              className="form-input w-full bg-dark-800 text-dark-500" 
              placeholder="Auto-generated" 
              readOnly 
              value={entry?.reference || ''}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <CurrencySelect 
            value={formData.currency}
            onChange={(val) => setFormData(prev => ({ ...prev, currency: val }))}
            label="Transaction Currency"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Global Description</label>
          <input 
            type="text" 
            className="form-input w-full" 
            placeholder="Purpose of this adjustment..."
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
          />
        </div>

        <div className="pt-4 border-t border-white/5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-dark-400 uppercase tracking-widest flex items-center gap-2">
              <Plus size={12} /> Entry Lines
            </h3>
          </div>

          <div className="space-y-3">
            {formData.lines.map((line, idx) => (
              <div key={idx} className="bg-dark-800/30 border border-white/5 rounded-xl p-3 space-y-3 relative group">
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <label className="text-[9px] text-dark-500 uppercase ml-1">Main Account</label>
                    <AccountCombobox 
                      value={line.account}
                      onChange={(val) => updateLine(idx, 'account', val)}
                      placeholder="Account/Entity..."
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-[9px] text-dark-500 uppercase ml-1">Offset Account (Auto-Balance)</label>
                    <AccountCombobox 
                      value={line.offsetAccount}
                      onChange={(val) => updateLine(idx, 'offsetAccount', val)}
                      placeholder="Offset..."
                    />
                  </div>
                  <button 
                    onClick={() => removeLine(idx)}
                    className="p-1.5 text-dark-600 hover:text-red-500 transition-colors bg-white/5 rounded-lg opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-6">
                    <input 
                      type="text" 
                      placeholder="Line description (optional)"
                      className="form-input w-full text-xs py-1"
                      value={line.description}
                      onChange={(e) => updateLine(idx, 'description', e.target.value)}
                    />
                  </div>
                  <div className="col-span-3">
                    <input 
                      type="number" 
                      placeholder="Debit"
                      className="form-input w-full text-xs py-1 text-emerald-400 text-right"
                      value={line.debit || ''}
                      onChange={(e) => updateLine(idx, 'debit', e.target.value)}
                    />
                  </div>
                  <div className="col-span-3">
                    <input 
                      type="number" 
                      placeholder="Credit"
                      className="form-input w-full text-xs py-1 text-primary text-right"
                      value={line.credit || ''}
                      onChange={(e) => updateLine(idx, 'credit', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button 
            type="button"
            onClick={addLine}
            className="w-full mt-3 py-2 border border-dashed border-white/10 rounded-xl text-dark-500 text-xs hover:border-primary/50 hover:text-primary transition-all flex items-center justify-center gap-2"
          >
            <Plus size={14} /> Add Another Line
          </button>
        </div>

        <div className="mt-8 bg-dark-800 rounded-2xl p-4 border border-white/5 space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="text-dark-500">Total Debits</span>
            <span className="font-mono text-emerald-400 font-bold">{formatCurrency(totals.debit)}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-dark-500">Total Credits</span>
            <span className="font-mono text-primary font-bold">{formatCurrency(totals.credit)}</span>
          </div>
          <div className="pt-2 border-t border-white/5 flex justify-between items-center">
             <div className="flex items-center gap-2">
               <div className={`w-2 h-2 rounded-full ${isBalanced ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
               <span className={`text-[10px] font-bold uppercase tracking-widest ${isBalanced ? 'text-emerald-500' : 'text-red-500'}`}>
                 {isBalanced ? 'Entry Balanced' : `Trial Balance Out by ${formatCurrency(diff)}`}
               </span>
             </div>
             <Calculator size={14} className="text-dark-600" />
          </div>
        </div>

        <div className="pt-6 flex gap-3">
          <button 
            disabled={createMutation.isPending || postMutation.isPending}
            onClick={() => handleSubmit(false)}
            className="flex-1 btn-secondary py-3 flex items-center justify-center gap-2"
          >
            <Save size={18} /> Save as Draft
          </button>
          <button 
            disabled={!isBalanced || createMutation.isPending || postMutation.isPending}
            onClick={() => handleSubmit(true)}
            className="flex-[1.5] btn-primary py-3 flex items-center justify-center gap-2 group disabled:opacity-50"
          >
            <Send size={18} className="group-hover:translate-x-1 transition-transform" /> 
            {postMutation.isPending ? 'Posting...' : 'Save & Post Entry'}
          </button>
        </div>
        
        <p className="text-[10px] text-dark-500 text-center flex items-center justify-center gap-1.5">
          <Info size={10} /> Careful: Posted entries update account balances and are immutable.
        </p>
      </div>
    </div>
  )
}
