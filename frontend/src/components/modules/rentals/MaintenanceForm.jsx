// Stohil Properties - Maintenance Request Form
import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, AlertCircle, Wrench } from 'lucide-react'
import { rentalsAPI, propertiesAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import CurrencySelect from '@/components/common/CurrencySelect'

export default function MaintenanceForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel } = useUIStore()
  const [error, setError] = useState(null)

  const [showCustomCategory, setShowCustomCategory] = useState(false)
  const [formData, setFormData] = useState({
    property: '',
    lease: '',
    category: '',
    custom_category: '',
    priority: 'medium',
    status: 'logged',
    description: '',
    reported_by: '',
    estimated_cost: '',
    currency: '',
  })

  // Fetch all properties
  const { data: propsRes } = useQuery({
    queryKey: ['properties-list'],
    queryFn: () => propertiesAPI.list({ page_size: 500 }),
  })
  const properties = propsRes?.data?.results || []

  // Fetch active leases (to optionally link the ticket to a lease/tenant)
  const { data: leasesRes } = useQuery({
    queryKey: ['rental-leases-active'],
    queryFn: () => rentalsAPI.leases.list({ status: 'active', page_size: 500 }),
  })
  const leases = leasesRes?.data?.results || []

  // Filter leases to only show those for the selected property
  const filteredLeases = formData.property
    ? leases.filter(l => String(l.property) === String(formData.property))
    : []

  const mutation = useMutation({
    mutationFn: (data) => rentalsAPI.maintenance.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-maintenance'] })
      queryClient.invalidateQueries({ queryKey: ['rental-stats'] })
      closeSidePanel()
    },
    onError: (err) => {
      const resp = err.response?.data
      setError(resp?.error?.message || resp || 'Failed to log ticket')
    },
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => {
      const next = { ...prev, [name]: value }
      
      if (name === 'category') {
        if (value === 'Other') {
          setShowCustomCategory(true)
        } else {
          setShowCustomCategory(false)
          next.custom_category = ''
        }
      }

      // If property changes, clear lease selection as it might not belong to this property anymore
      if (name === 'property') {
        next.lease = ''
      }
      return next
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    
    // Construct payload
    const finalCategory = showCustomCategory ? formData.custom_category : formData.category
    if (showCustomCategory && !finalCategory) {
      setError('Please specify the custom category.')
      return
    }

    const payload = { 
      ...formData, 
      category: finalCategory,
      reference: `MREQ-${Date.now().toString().slice(-6)}` 
    }
    
    // Cleanup
    delete payload.custom_category
    if (!payload.lease) delete payload.lease
    if (!payload.estimated_cost) delete payload.estimated_cost
    if (!payload.reported_by) delete payload.reported_by

    mutation.mutate(payload)
  }

  return (
    <div className="flex flex-col h-full bg-dark-900">
      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        <form id="maintenance-form" onSubmit={handleSubmit} className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-400 border border-amber-500/20">
              <Wrench size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Log Maintenance</h3>
              <p className="text-xs text-dark-500">Create a new maintenance or repair ticket.</p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2">
              <AlertCircle size={14} className="flex-shrink-0" />
              <p>{typeof error === 'object' ? JSON.stringify(error) : error}</p>
            </div>
          )}

          {/* Location / Linking */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest border-b border-white/5 pb-2">
              Location
            </h4>
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Property *</label>
              <select name="property" value={formData.property} onChange={handleChange} required className="form-input w-full">
                <option value="">Select Property...</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.reference_number} - {p.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest flex items-center justify-between">
                <span>Lease Association</span>
                <span className="text-dark-600 font-normal lowercase tracking-normal">Optional</span>
              </label>
              <select name="lease" value={formData.lease} onChange={handleChange} disabled={!formData.property} className="form-input w-full disabled:opacity-50">
                <option value="">None (Vacant Property Maintenance)</option>
                {filteredLeases.map(l => (
                  <option key={l.id} value={l.id}>{l.lease_number} - {l.tenant_name}</option>
                ))}
              </select>
              {!formData.property && <p className="text-[10px] text-dark-600">Select a property first to see active leases.</p>}
            </div>
          </div>

          {/* Ticket Details */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest border-b border-white/5 pb-2">
              Ticket Details
            </h4>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Category *</label>
              <select name="category" value={formData.category} onChange={handleChange} required className="form-input w-full">
                <option value="">Select...</option>
                <option value="Plumbing">Plumbing</option>
                <option value="Electrical">Electrical</option>
                <option value="HVAC">HVAC / Air Conditioning</option>
                <option value="Carpentry">Carpentry / Woodwork</option>
                <option value="Painting">Painting</option>
                <option value="Appliance">Appliance Repair</option>
                <option value="Structural">Structural (Roof, Walls)</option>
                <option value="General">General / Handyman</option>
                <option value="Other">Other / New Category...</option>
              </select>
            </div>

            {showCustomCategory && (
              <div className="space-y-1.5 animate-in slide-in-from-top duration-200">
                <label className="text-[10px] font-bold text-primary uppercase tracking-widest">Specify Category *</label>
                <input 
                  type="text" 
                  name="custom_category" 
                  value={formData.custom_category} 
                  onChange={handleChange} 
                  required 
                  placeholder="e.g. Pest Control, Garden, etc." 
                  className="form-input w-full border-primary/30 focus:border-primary" 
                />
              </div>
            )}

            <div className="grid grid-cols-1 gap-4">
              <CurrencySelect 
                value={formData.currency}
                onChange={(val) => setFormData(prev => ({ ...prev, currency: val }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Priority</label>
                <select name="priority" value={formData.priority} onChange={handleChange} className="form-input w-full">
                  <option value="low">Low - Routine</option>
                  <option value="medium">Medium - Standard</option>
                  <option value="high">High - Urgent</option>
                  <option value="emergency">Emergency - Immediate Action</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Est. Cost</label>
                <input type="number" step="0.01" name="estimated_cost" value={formData.estimated_cost} onChange={handleChange} placeholder="0.00" className="form-input w-full" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Issue Description *</label>
              <textarea name="description" value={formData.description} onChange={handleChange} required rows={4} placeholder="Describe the problem in detail..." className="form-input w-full"></textarea>
            </div>
          </div>
        </form>
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-white/5 bg-dark-800/30 flex gap-3">
        <button
          type="submit"
          form="maintenance-form"
          disabled={mutation.isPending}
          className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
        >
          {mutation.isPending ? 'Logging...' : <><Save size={18} /> Log Ticket</>}
        </button>
        <button type="button" onClick={closeSidePanel} className="btn-secondary px-8 py-3">
          Cancel
        </button>
      </div>
    </div>
  )
}
