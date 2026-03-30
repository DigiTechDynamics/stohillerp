import { useState, useEffect } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { Save, X, DollarSign, Briefcase, User, Building2, Calendar, Percent, Hash } from 'lucide-react'
import { salesAPI, propertiesAPI, crmAPI, hrAPI, authAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import { formatCurrency } from '@/utils/format'
import CurrencySelect from '@/components/common/CurrencySelect'

export default function SaleForm({ sale, onSaveSuccess }) {
  const queryClient = useQueryClient()
  const { closeSidePanel } = useUIStore()
  const [error, setError] = useState(null)

  const [formData, setFormData] = useState({
    sale_reference: sale?.sale_reference || '',
    property: sale?.property || '',
    buyer: sale?.buyer || '',
    seller: sale?.seller || '',
    currency: sale?.currency || '',
    listing_agent: sale?.listing_agent || '',
    selling_agent: sale?.selling_agent || '',
    sale_price: sale?.sale_price || '',
    deposit_amount: sale?.deposit_amount || '0.00',
    commission_rate: sale?.commission_rate || '7.00',
    bond_required: sale?.bond_required ?? true,
    bond_amount: sale?.bond_amount || '',
    offer_date: sale?.offer_date || new Date().toISOString().split('T')[0],
    status: sale?.status || 'offer_submitted',
    notes: sale?.notes || '',
  })

  // Data Fetching
  const { data: propertiesData } = useQuery({
    queryKey: ['properties-list'],
    queryFn: () => propertiesAPI.list(),
  })
  const properties = propertiesData?.data?.results || []

  const { data: contactsData } = useQuery({
    queryKey: ['crm-contacts'],
    queryFn: () => crmAPI.contacts.list(),
  })
  const contacts = contactsData?.data?.results || []

  const { data: agentsData } = useQuery({
    queryKey: ['hr-employees'],
    queryFn: () => hrAPI.employees.list({ status: 'active' }),
  })
  const agents = agentsData?.data?.results || []

  // Commission Calculation
  const commissionAmount = (parseFloat(formData.sale_price) || 0) * (parseFloat(formData.commission_rate) || 0) / 100

  const mutation = useMutation({
    mutationFn: (data) => {
      if (sale?.id) return salesAPI.update(sale.id, data)
      return salesAPI.create(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-transactions'] })
      if (onSaveSuccess) onSaveSuccess()
      closeSidePanel()
    },
    onError: (err) => {
      const resp = err.response?.data
      if (typeof resp === 'string') {
        setError(resp)
      } else if (resp?.success === false && resp?.error) {
        // Handle custom exception format: { success: false, error: { message: ... } }
        const errorData = resp.error.message
        if (typeof errorData === 'string') {
          setError(errorData)
        } else if (typeof errorData === 'object') {
          const firstError = Object.entries(errorData)
            .map(([key, value]) => `${key}: ${Array.isArray(value) ? value[0] : value}`)[0]
          setError(firstError || 'Validation error occurred.')
        } else {
          setError('An error occurred on the server.')
        }
      } else if (resp?.detail || resp?.message) {
        setError(resp.detail || resp.message)
      } else if (typeof resp === 'object') {
        const firstError = Object.entries(resp)
          .map(([key, value]) => `${key}: ${Array.isArray(value) ? value[0] : value}`)[0]
        setError(firstError || 'Failed to save sale transaction.')
      } else {
        setError('Failed to save sale transaction.')
      }
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    
    const payload = {
      ...formData,
      commission_amount: commissionAmount.toFixed(2),
      // Clean up empty strings for IDs
      property: formData.property || null,
      buyer: formData.buyer || null,
      seller: formData.seller || null,
      currency: formData.currency || null,
      listing_agent: formData.listing_agent || null,
      selling_agent: formData.selling_agent || null,
    }
    
    mutation.mutate(payload)
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }))
  }

  return (
    <div className="flex flex-col h-full bg-dark-900">
      {/* Header */}
      <div className="p-6 border-b border-white/5 flex items-center justify-between bg-dark-800/20">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/20">
            <Building2 size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              {sale ? 'Edit Transaction' : 'New Sale Transaction'}
            </h2>
            <p className="text-xs text-dark-500 mt-0.5">Record property sales and commission details.</p>
          </div>
        </div>
        <button onClick={closeSidePanel} className="p-2 hover:bg-white/5 rounded-full transition-colors">
          <X size={20} className="text-dark-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        <form id="sale-form" onSubmit={handleSubmit} className="space-y-8">
          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-3">
              <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">!</div>
              <p>{error}</p>
            </div>
          )}

          {/* Core Info */}
          <div className="space-y-4">
             <div className="flex items-center gap-2 text-primary">
                <Hash size={16} />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]">Transaction Identity</h3>
             </div>
             
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest ml-1">Sale Reference *</label>
                  <input 
                    type="text" 
                    name="sale_reference" 
                    value={formData.sale_reference} 
                    onChange={handleChange} 
                    required 
                    placeholder="e.g. SALE-2024-001"
                    className="form-input w-full" 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest ml-1">Status</label>
                  <select name="status" value={formData.status} onChange={handleChange} className="form-input w-full">
                    <option value="offer_submitted">Offer Submitted</option>
                    <option value="offer_accepted">Offer Accepted</option>
                    <option value="suspensive">Suspensive Conditions</option>
                    <option value="bond_approved">Bond Approved</option>
                    <option value="transfer">Transfer in Progress</option>
                    <option value="registered">Registered / Complete</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
             </div>

             <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest ml-1">Property *</label>
                <select name="property" value={formData.property} onChange={handleChange} required className="form-input w-full">
                  <option value="">Select Property</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.reference_number})</option>
                  ))}
                </select>
             </div>
          </div>

          {/* Client Info */}
          <div className="space-y-4 pt-4 border-t border-white/5">
             <div className="flex items-center gap-2 text-primary">
                <User size={16} />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]">Parties Involved</h3>
             </div>

             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest ml-1">Buyer *</label>
                  <select name="buyer" value={formData.buyer} onChange={handleChange} required className="form-input w-full">
                    <option value="">Select Buyer</option>
                    {contacts.map(c => (
                      <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest ml-1">Seller (Optional)</label>
                  <select name="seller" value={formData.seller} onChange={handleChange} className="form-input w-full">
                    <option value="">Select Seller</option>
                    {contacts.map(c => (
                      <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                    ))}
                  </select>
                </div>
             </div>
          </div>

          {/* Financials */}
          <div className="space-y-4 pt-4 border-t border-white/5">
             <div className="flex items-center gap-2 text-primary">
                <DollarSign size={16} />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]">Financial Details</h3>
             </div>

             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                   <CurrencySelect 
                     value={formData.currency}
                     onChange={(val) => setFormData(prev => ({ ...prev, currency: val }))}
                     label="Sale Currency *"
                   />
                </div>
                <div className="space-y-1.5 flex flex-col justify-end">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest ml-1">Sale Price *</label>
                  <input 
                    type="number" 
                    name="sale_price" 
                    value={formData.sale_price} 
                    onChange={handleChange} 
                    required 
                    placeholder="0.00"
                    className="form-input w-full" 
                  />
                </div>
             </div>

             <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-dark-800/40 border border-white/5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest flex items-center gap-1">
                    <Percent size={10} /> Commission Rate (%)
                  </label>
                  <input 
                    type="number" 
                    step="0.01"
                    name="commission_rate" 
                    value={formData.commission_rate} 
                    onChange={handleChange} 
                    className="form-input w-full bg-dark-900 border-white/5" 
                  />
                </div>
                <div className="flex flex-col justify-end">
                   <p className="text-[10px] font-bold text-dark-500 uppercase tracking-widest mb-2">Estimated Commission</p>
                   <p className="text-xl font-bold text-white">{formatCurrency(commissionAmount)}</p>
                </div>
             </div>
          </div>

          {/* Agents */}
          <div className="space-y-4 pt-4 border-t border-white/5">
             <div className="flex items-center gap-2 text-primary">
                <Briefcase size={16} />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]">Agent Assignment</h3>
             </div>

             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest ml-1">Listing Agent</label>
                  <select name="listing_agent" value={formData.listing_agent} onChange={handleChange} className="form-input w-full">
                    <option value="">Select Agent</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest ml-1">Selling Agent</label>
                  <select name="selling_agent" value={formData.selling_agent} onChange={handleChange} className="form-input w-full">
                    <option value="">Select Agent</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>
                    ))}
                  </select>
                </div>
             </div>
          </div>

          {/* Dates & Notes */}
          <div className="space-y-4 pt-4 border-t border-white/5">
             <div className="flex items-center gap-2 text-primary">
                <Calendar size={16} />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]">Dates & Observations</h3>
             </div>

             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest ml-1">Offer Date *</label>
                  <input 
                    type="date" 
                    name="offer_date" 
                    value={formData.offer_date} 
                    onChange={handleChange} 
                    required 
                    className="form-input w-full" 
                  />
                </div>
             </div>

             <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest ml-1">Notes</label>
                <textarea 
                  name="notes" 
                  value={formData.notes} 
                  onChange={handleChange} 
                  rows={3}
                  placeholder="Additional transaction details..."
                  className="form-input w-full resize-none" 
                />
             </div>
          </div>
        </form>
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-white/5 bg-dark-800/30 flex gap-3">
        <button
          type="submit"
          form="sale-form"
          disabled={mutation.isPending}
          className="flex-1 btn-primary py-3 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
        >
          {mutation.isPending ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <><Save size={18} /> {sale ? 'Update Transaction' : 'Create Transaction'}</>
          )}
        </button>
        <button 
          onClick={closeSidePanel} 
          className="btn-secondary px-8 py-3"
          disabled={mutation.isPending}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
