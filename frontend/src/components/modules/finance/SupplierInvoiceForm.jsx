import { useState, useEffect } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { Plus, Trash2, Save, AlertCircle, ShoppingCart, Calculator } from 'lucide-react'
import { financeAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import { formatCurrency } from '@/utils/format'
import CurrencySelect from '@/components/common/CurrencySelect'

export default function SupplierInvoiceForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel, sidePanelData } = useUIStore()
  const [error, setError] = useState(null)
  
  const [formData, setFormData] = useState({
    supplier: sidePanelData?.invoice?.supplier || sidePanelData?.supplier?.id || '',
    document_type: sidePanelData?.invoice?.document_type || 'invoice',
    invoice_date: sidePanelData?.invoice?.invoice_date || new Date().toISOString().split('T')[0],
    due_date: sidePanelData?.invoice?.due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    invoice_number: sidePanelData?.invoice?.invoice_number || '',
    reference: sidePanelData?.invoice?.reference || '',
    currency: sidePanelData?.invoice?.currency || '',
    notes: sidePanelData?.invoice?.notes || '',
    lines: sidePanelData?.invoice?.lines?.map(l => ({
      ...l,
      expense_account: l.expense_account || '',
      tax_code: l.tax_code || '',
    })) || [
      { description: '', expense_account: '', quantity: 1, unit_price: '0.00', tax_code: '', tax_amount: '0.00', line_total: '0.00' }
    ]
  })

  useEffect(() => {
    if (sidePanelData?.invoice) {
      setFormData({
        document_type: sidePanelData.invoice.document_type || 'invoice',
        supplier: sidePanelData.invoice.supplier || '',
        invoice_date: sidePanelData.invoice.invoice_date || '',
        due_date: sidePanelData.invoice.due_date || '',
        invoice_number: sidePanelData.invoice.invoice_number || '',
        reference: sidePanelData.invoice.reference || '',
        currency: sidePanelData.invoice.currency || '',
        notes: sidePanelData.invoice.notes || '',
        lines: sidePanelData.invoice.lines?.map(l => ({
          ...l,
          expense_account: l.expense_account || '',
          tax_code: l.tax_code || '',
        })) || []
      })
    }
  }, [sidePanelData?.invoice])

  // Fetch Suppliers
  const { data: suppliersData } = useQuery({
    queryKey: ['ap-suppliers'],
    queryFn: () => financeAPI.ap.suppliers.list({ is_active: true }),
  })
  const suppliers = suppliersData?.data?.results || suppliersData?.data || []

  // Fetch Expense Accounts
  const { data: accountsData } = useQuery({
    queryKey: ['finance-accounts', { type: 'expense' }],
    queryFn: () => financeAPI.accounts.list({ account_type: 'expense' }),
  })
  const expenseAccounts = accountsData?.data?.results || accountsData?.data || []

  // Fetch Tax Codes
  const { data: taxCodesData } = useQuery({
    queryKey: ['tax-codes'],
    queryFn: () => financeAPI.tax.codes.list(),
  })
  const taxCodes = taxCodesData?.data?.results || taxCodesData?.data || []

  const calculateTotals = (lines) => {
    let subtotal = 0
    let taxTotal = 0
    const updatedLines = lines.map(line => {
      const qty = parseFloat(line.quantity) || 0
      const price = parseFloat(line.unit_price) || 0
      const taxRate = taxCodes.find(t => t.id === line.tax_code)?.rate || 0
      
      const lineSubtotal = qty * price
      const lineTax = lineSubtotal * (taxRate / 100)
      const lineTotal = lineSubtotal + lineTax
      
      subtotal += lineSubtotal
      taxTotal += lineTax
      
      return { ...line, tax_amount: lineTax.toFixed(2), line_total: lineTotal.toFixed(2) }
    })
    return { updatedLines, subtotal, taxTotal }
  }

  const handleLineChange = (index, field, value) => {
    const newLines = [...formData.lines]
    newLines[index][field] = value
    const { updatedLines } = calculateTotals(newLines)
    setFormData(prev => ({ ...prev, lines: updatedLines }))
  }

  const addLine = () => {
    setFormData(prev => ({
      ...prev,
      lines: [...prev.lines, { description: '', expense_account: '', quantity: 1, unit_price: '0.00', tax_code: '', tax_amount: '0.00', line_total: '0.00' }]
    }))
  }

  const removeLine = (index) => {
    if (formData.lines.length === 1) return
    const newLines = formData.lines.filter((_, i) => i !== index)
    const { updatedLines } = calculateTotals(newLines)
    setFormData(prev => ({ ...prev, lines: updatedLines }))
  }

  const mutation = useMutation({
    mutationFn: async (payload) => {
      if (sidePanelData?.invoice?.id) {
        return (await financeAPI.ap.invoices.update(sidePanelData.invoice.id, payload)).data
      }
      return (await financeAPI.ap.invoices.create(payload)).data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ap-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['finance-entries'] })
      closeSidePanel()
    },
    onError: (err) => {
      const resp = err.response?.data
      if (typeof resp === 'string') setError(resp)
      else if (resp?.detail || resp?.message) setError(resp.detail || resp.message)
      else if (typeof resp === 'object') {
        const firstError = Object.entries(resp).map(([key, value]) => `${key}: ${Array.isArray(value) ? value[0] : value}`)[0]
        setError(firstError || 'Failed to create supplier invoice.')
      } else {
        setError('Failed to create supplier invoice.')
      }
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    
    // Clean up lines: replace empty strings with null for nullable ForeignKeys
    const cleanedLines = formData.lines.map(line => ({
      ...line,
      tax_code: line.tax_code === '' ? null : line.tax_code,
      expense_account: line.expense_account === '' ? null : line.expense_account
    }))

    const payload = {
      ...formData,
      lines: cleanedLines,
      total_amount: grandTotal
    }
    
    mutation.mutate(payload)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const grandTotal = formData.lines.reduce((sum, line) => sum + parseFloat(line.line_total || 0), 0)

  return (
    <div className="flex flex-col h-full bg-dark-900">
      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        <form id="ap-invoice-form" onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/20">
              <ShoppingCart size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                {sidePanelData?.invoice ? 'Edit Purchase Invoice' : 'Record Purchase Invoice'}
              </h3>
              <p className="text-xs text-dark-500">
                {sidePanelData?.invoice ? 'Update the details of this bill.' : 'Record a bill received from a supplier.'}
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2">
              <AlertCircle size={14} className="flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Supplier *</label>
              <select name="supplier" value={formData.supplier} onChange={handleChange} required className="form-input w-full">
                <option value="">Select Supplier</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Invoice Number *</label>
              <input type="text" name="invoice_number" value={formData.invoice_number} onChange={handleChange} required placeholder="Supplier's Ref #" className="form-input w-full" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <CurrencySelect 
              value={formData.currency}
              onChange={(val) => setFormData(prev => ({ ...prev, currency: val }))}
              label="Invoice Currency"
              defaultToBase
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Document Type</label>
            <select name="document_type" value={formData.document_type} onChange={handleChange} className="form-input w-full"
              disabled={!!formData.id || !!(sidePanelData?.invoice?.id)}>
              <option value="invoice">Invoice</option>
              <option value="credit_note">Credit note (reverses revenue/expense; apply it to invoices after posting)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Invoice Date *</label>
              <input type="date" name="invoice_date" value={formData.invoice_date} onChange={handleChange} required className="form-input w-full" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Due Date *</label>
              <input type="date" name="due_date" value={formData.due_date} onChange={handleChange} required className="form-input w-full" />
            </div>
          </div>

          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest">Expense Allocation</h4>
              <button type="button" onClick={addLine} className="text-[10px] font-bold text-primary hover:text-white transition-colors flex items-center gap-1">
                <Plus size={12} /> ADD ITEM
              </button>
            </div>

            <div className="space-y-4">
              {formData.lines.map((line, index) => (
                <div key={index} className="p-4 rounded-xl bg-dark-800/50 border border-white/5 space-y-3 relative group">
                  <button 
                    type="button" 
                    onClick={() => removeLine(index)}
                    className="absolute -right-2 -top-2 w-6 h-6 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500 hover:text-white"
                  >
                    <Trash2 size={12} />
                  </button>
                  
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-8 space-y-1.5">
                      <label className="text-[8px] font-bold text-dark-500 uppercase">Line Description</label>
                      <input 
                        type="text" 
                        value={line.description} 
                        onChange={(e) => handleLineChange(index, 'description', e.target.value)}
                        placeholder="What was purchased..."
                        required
                        className="form-input w-full py-1.5 text-xs" 
                      />
                    </div>
                    <div className="col-span-4 space-y-1.5">
                      <label className="text-[8px] font-bold text-dark-500 uppercase tracking-widest">Expense Account</label>
                      <select 
                        value={line.expense_account} 
                        onChange={(e) => handleLineChange(index, 'expense_account', e.target.value)}
                        required
                        className="form-input w-full py-1.5 text-xs px-2"
                      >
                        <option value="">Select Account</option>
                        {expenseAccounts.map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[8px] font-bold text-dark-500 uppercase">Qty</label>
                      <input 
                        type="number" 
                        value={line.quantity} 
                        onChange={(e) => handleLineChange(index, 'quantity', e.target.value)}
                        className="form-input w-full py-1.5 text-xs" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[8px] font-bold text-dark-500 uppercase">Unit Cost</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={line.unit_price} 
                        onChange={(e) => handleLineChange(index, 'unit_price', e.target.value)}
                        className="form-input w-full py-1.5 text-xs" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[8px] font-bold text-dark-500 uppercase">Input Tax</label>
                      <select 
                        value={line.tax_code} 
                        onChange={(e) => handleLineChange(index, 'tax_code', e.target.value)}
                        className="form-input w-full py-1.5 text-xs px-2"
                      >
                        <option value="">0%</option>
                        {taxCodes.map(t => (
                          <option key={t.id} value={t.id}>{t.code} ({t.rate}%)</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[8px] font-bold text-dark-500 uppercase">Total</label>
                      <div className="h-8 flex items-center px-3 bg-dark-700/50 rounded-lg text-xs text-white font-semibold">
                        {formatCurrency(line.line_total)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4">
            <div className="p-4 rounded-xl bg-gradient-to-r from-primary/10 to-transparent border border-primary/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator size={16} className="text-primary" />
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Total Payable</span>
              </div>
              <span className="text-xl font-bold text-white">
                {formatCurrency(grandTotal)}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Internal Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={2}
              className="form-input w-full resize-none"
              placeholder="Internal tracking notes..."
            />
          </div>
        </form>
      </div>

      <div className="p-6 border-t border-white/5 bg-dark-800/30 flex gap-3">
        <button
          type="submit"
          form="ap-invoice-form"
          disabled={mutation.isPending}
          className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
        >
          {mutation.isPending ? 'Saving...' : <><Save size={18} /> {sidePanelData?.invoice ? 'Update Invoice' : 'Record Purchase Invoice'}</>}
        </button>
        <button type="button" onClick={closeSidePanel} className="btn-secondary px-8 py-3">
          Cancel
        </button>
      </div>
    </div>
  )
}
