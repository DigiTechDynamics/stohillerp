// Stohil Properties - Tenant Form
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, AlertCircle, UserPlus, FileText } from 'lucide-react'
import { crmAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import CurrencySelect from '@/components/common/CurrencySelect'

export default function TenantForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel, sidePanelData } = useUIStore()
  const contact = sidePanelData?.contact
  const isEdit = !!contact
  const [error, setError] = useState(null)

  const [formData, setFormData] = useState({
    first_name: contact?.first_name || '',
    last_name: contact?.last_name || '',
    company: contact?.company || contact?.organisation || '',
    email: contact?.email || '',
    phone_mobile: contact?.phone_mobile || contact?.phone || '',
    id_number: contact?.id_number || '',
    contact_type: contact?.contact_type || 'tenant',
    source: contact?.source || 'Website',
    notes: contact?.notes || '',
    currency: contact?.currency || '',
    annual_income: contact?.annual_income || '',
    affordability: contact?.affordability || '',
    budget_min: contact?.budget_min || '',
    budget_max: contact?.budget_max || '',
    guarantor_name: contact?.guarantor_name || '',
    guarantor_email: contact?.guarantor_email || '',
    guarantor_phone: contact?.guarantor_phone || '',
    guarantor_relationship: contact?.guarantor_relationship || '',
  })

  const mutation = useMutation({
    mutationFn: (data) => isEdit ? crmAPI.contacts.update(contact.id, data) : crmAPI.contacts.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] })
      queryClient.invalidateQueries({ queryKey: ['rental-tenants'] })
      closeSidePanel()
    },
    onError: (err) => {
      const resp = err.response?.data
      setError(resp?.error?.message || resp || `Failed to ${isEdit ? 'update' : 'create'} tenant`)
    },
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    mutation.mutate(formData)
  }

  return (
    <div className="flex flex-col h-full bg-dark-900">
      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        <form id="tenant-form" onSubmit={handleSubmit} className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/20">
              <UserPlus size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{isEdit ? 'Edit Contact' : 'New Tenant'}</h3>
              <p className="text-xs text-dark-500">{isEdit ? 'Update contact information' : 'Add a new tenant profile to the system.'}</p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2">
              <AlertCircle size={14} className="flex-shrink-0" />
              <p>{typeof error === 'object' ? JSON.stringify(error) : error}</p>
            </div>
          )}

          {/* Core Info */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">First Name *</label>
                <input type="text" name="first_name" value={formData.first_name} onChange={handleChange} required className="form-input w-full" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Last Name *</label>
                <input type="text" name="last_name" value={formData.last_name} onChange={handleChange} required className="form-input w-full" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Company / Entity Name</label>
              <input type="text" name="company" value={formData.company} onChange={handleChange} placeholder="Optional (for commercial leases)" className="form-input w-full" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">ID / Reg Number</label>
                <input type="text" name="id_number" value={formData.id_number} onChange={handleChange} className="form-input w-full" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Lead Source</label>
                <select name="source" value={formData.source} onChange={handleChange} className="form-input w-full">
                  <option value="Website">Company Website</option>
                  <option value="Property24">Property24</option>
                  <option value="Referral">Referral</option>
                  <option value="Walk-in">Walk-in</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          </div>

          {/* Contact Details */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest border-b border-white/5 pb-2">
              Contact Details
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Email Address</label>
                <input type="email" name="email" value={formData.email} onChange={handleChange} className="form-input w-full" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Mobile Number *</label>
                <input type="tel" name="phone_mobile" value={formData.phone_mobile} onChange={handleChange} required className="form-input w-full" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Notes</label>
            <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3} className="form-input w-full" placeholder="Internal notes..." />
          </div>

          <div className="space-y-4 pt-4 border-t border-white/5">
            <h4 className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest pb-2">
              Financial Information & Budget
            </h4>
            
            <div className="grid grid-cols-1 gap-4">
              <CurrencySelect 
                value={formData.currency}
                onChange={(val) => setFormData(prev => ({ ...prev, currency: val }))}
                label="Preferred Currency"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Annual Income</label>
                <input type="number" name="annual_income" value={formData.annual_income} onChange={handleChange} className="form-input w-full" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Affordability</label>
                <input type="number" name="affordability" value={formData.affordability} onChange={handleChange} className="form-input w-full" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Min Budget</label>
                <input type="number" name="budget_min" value={formData.budget_min} onChange={handleChange} className="form-input w-full" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Max Budget</label>
                <input type="number" name="budget_max" value={formData.budget_max} onChange={handleChange} className="form-input w-full" />
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-white/5">
              <h4 className="text-[10px] font-bold text-amber-500 uppercase tracking-widest pb-2">
                Guarantor Information
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Guarantor Name</label>
                  <input type="text" name="guarantor_name" value={formData.guarantor_name} onChange={handleChange} className="form-input w-full" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Relationship</label>
                  <input type="text" name="guarantor_relationship" value={formData.guarantor_relationship} onChange={handleChange} className="form-input w-full" placeholder="e.g. Parent, Employer" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Guarantor Email</label>
                  <input type="email" name="guarantor_email" value={formData.guarantor_email} onChange={handleChange} className="form-input w-full" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Guarantor Phone</label>
                  <input type="tel" name="guarantor_phone" value={formData.guarantor_phone} onChange={handleChange} className="form-input w-full" />
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-white/5 bg-dark-800/30 flex gap-3">
        <button
          type="submit"
          form="tenant-form"
          disabled={mutation.isPending}
          className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
        >
          {mutation.isPending ? 'Saving...' : <><Save size={18} /> {isEdit ? 'Update Record' : 'Create Tenant'}</>}
        </button>
        <button type="button" onClick={closeSidePanel} className="btn-secondary px-8 py-3">
          Cancel
        </button>
      </div>
    </div>
  )
}
