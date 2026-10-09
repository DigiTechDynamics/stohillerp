// Stohill Properties - Lease Form (Create/Edit)
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, AlertCircle, Key } from 'lucide-react'
import { rentalsAPI, propertiesAPI, crmAPI, hrAPI, propmanAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import CurrencySelect from '@/components/common/CurrencySelect'
import VatOnRent from './VatOnRent'

export default function LeaseForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel, sidePanelData } = useUIStore()
  const [error, setError] = useState(null)

  const lease = sidePanelData?.lease
  const isEditing = !!lease?.id

  const [formData, setFormData] = useState({
    property: lease?.property || '',
    unit: lease?.unit || '',
    tenant: lease?.tenant || '',
    lease_type: lease?.lease_type || 'fixed_term',
    status: lease?.status || 'draft',
    start_date: lease?.start_date || '',
    end_date: lease?.end_date || '',
    monthly_rental: lease?.monthly_rental || '',
    rental_escalation_rate: lease?.rental_escalation_rate ?? '',
    deposit_amount: lease?.deposit_amount || '0.00',
    deposit_paid: lease?.deposit_paid || false,
    vat_applicable: lease?.vat_applicable || false,
    invoice_day: lease?.invoice_day || 1,
    payment_due_days: lease?.payment_due_days || 3,
    notice_period_days: lease?.notice_period_days || 30,
    currency: lease?.currency || '',
    managing_agent: lease?.managing_agent || '',
    notes: lease?.notes || '',
  })

  // New leases start from the configured default escalation rate.
  const { data: defaults } = useQuery({
    queryKey: ['propman-defaults'],
    queryFn: async () => (await propmanAPI.defaults.get()).data,
    enabled: !isEditing,
    staleTime: 5 * 60 * 1000,
  })
  useEffect(() => {
    const rate = defaults?.rent_escalation_rate?.value
    if (rate !== undefined) {
      setFormData((prev) => (prev.rental_escalation_rate === '' ? { ...prev, rental_escalation_rate: rate } : prev))
    }
  }, [defaults])

  // Fetch dropdown data
  const { data: propsRes } = useQuery({
    queryKey: ['properties-list'],
    queryFn: () => propertiesAPI.list({ page_size: 500 }),
  })
  const properties = propsRes?.data?.results || []

  const { data: contactsRes } = useQuery({
    queryKey: ['crm-contacts-list'],
    queryFn: () => crmAPI.contacts.list({ page_size: 500 }),
  })
  const contacts = contactsRes?.data?.results || []

  const { data: agentsRes } = useQuery({
    queryKey: ['hr-employees-lite'],
    queryFn: () => hrAPI.employees.list({ page_size: 500 }),
  })
  const agents = agentsRes?.data?.results || []

  const mutation = useMutation({
    mutationFn: (data) =>
      isEditing
        ? rentalsAPI.leases.update(lease.id, data)
        : rentalsAPI.leases.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-leases'] })
      queryClient.invalidateQueries({ queryKey: ['rental-stats'] })
      queryClient.invalidateQueries({ queryKey: ['lease'] })
      // The property and unit now show as reserved / occupied.
      for (const key of ['properties', 'property', 'properties-list', 'property-stats']) queryClient.invalidateQueries({ queryKey: [key] })
      closeSidePanel()
    },
    onError: (err) => {
      const resp = err.response?.data
      setError(resp?.error?.message || resp || 'Failed to save lease')
    },
  })

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    const payload = { ...formData }
    // Blank: the server applies the configured default rate.
    if (payload.rental_escalation_rate === '') delete payload.rental_escalation_rate
    // Clean empty optional fields
    if (!payload.unit) delete payload.unit
    if (!payload.managing_agent) delete payload.managing_agent
    mutation.mutate(payload)
  }

  return (
    <div className="flex flex-col h-full bg-dark-900">
      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        <form id="lease-form" onSubmit={handleSubmit} className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/20">
              <Key size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                {isEditing ? 'Edit Lease' : 'New Lease Agreement'}
              </h3>
              <p className="text-xs text-dark-500">
                Define property, tenant, and financial terms.
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2">
              <AlertCircle size={14} className="flex-shrink-0" />
              <p>{typeof error === 'object' ? JSON.stringify(error) : error}</p>
            </div>
          )}

          {/* Property & Tenant */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest border-b border-white/5 pb-2">
              Property & Tenant
            </h4>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Property *</label>
              <select name="property" value={formData.property} onChange={handleChange} required className="form-input w-full">
                <option value="">Select Property</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.reference_number} — {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Tenant *</label>
              <select name="tenant" value={formData.tenant} onChange={handleChange} required className="form-input w-full">
                <option value="">Select Tenant</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Managing Agent</label>
              <select name="managing_agent" value={formData.managing_agent} onChange={handleChange} className="form-input w-full">
                <option value="">Select Agent</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.first_name} {a.last_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Lease Terms */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest border-b border-white/5 pb-2">
              Lease Terms
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Lease Type</label>
                <select name="lease_type" value={formData.lease_type} onChange={handleChange} className="form-input w-full">
                  <option value="fixed_term">Fixed Term</option>
                  <option value="month_to_month">Month-to-Month</option>
                  <option value="commercial">Commercial</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Status</label>
                <select name="status" value={formData.status} onChange={handleChange} className="form-input w-full">
                  <option value="draft">Draft</option>
                  <option value="pending_signature">Pending Signature</option>
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="terminated">Terminated</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Start Date *</label>
                <input type="date" name="start_date" value={formData.start_date} onChange={handleChange} required className="form-input w-full" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">End Date</label>
                <input type="date" name="end_date" value={formData.end_date} onChange={handleChange} className="form-input w-full" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Notice Period (days)</label>
              <input type="number" name="notice_period_days" value={formData.notice_period_days} onChange={handleChange} className="form-input w-full" />
            </div>
          </div>

          {/* Financial Terms */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest border-b border-white/5 pb-2">
              Financial Terms
            </h4>

            <CurrencySelect 
              value={formData.currency}
              onChange={(val) => setFormData(prev => ({ ...prev, currency: val }))}
              label="Lease Currency"
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Monthly Rental *</label>
                <input type="number" step="0.01" name="monthly_rental" value={formData.monthly_rental} onChange={handleChange} required placeholder="0.00" className="form-input w-full" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Escalation Rate %</label>
                <input type="number" step="0.01" name="rental_escalation_rate" value={formData.rental_escalation_rate} onChange={handleChange} className="form-input w-full" />
              </div>
            </div>

            <VatOnRent rent={formData.monthly_rental} checked={formData.vat_applicable}
              onChange={(v) => setFormData((prev) => ({ ...prev, vat_applicable: v }))} />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Deposit Amount</label>
                <input type="number" step="0.01" name="deposit_amount" value={formData.deposit_amount} onChange={handleChange} className="form-input w-full" />
              </div>
              <div className="space-y-1.5 flex items-end gap-4 pb-2">
                <label className="flex items-center gap-2 text-xs text-dark-300 cursor-pointer">
                  <input type="checkbox" name="deposit_paid" checked={formData.deposit_paid} onChange={handleChange} className="form-checkbox" />
                  Deposit Paid
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Invoice Day</label>
                <input type="number" min="1" max="28" name="invoice_day" value={formData.invoice_day} onChange={handleChange} className="form-input w-full" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Payment Due (days)</label>
                <input type="number" name="payment_due_days" value={formData.payment_due_days} onChange={handleChange} className="form-input w-full" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Notes</label>
            <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3} className="form-input w-full" placeholder="Additional terms or notes..." />
          </div>
        </form>
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-white/5 bg-dark-800/30 flex gap-3">
        <button
          type="submit"
          form="lease-form"
          disabled={mutation.isPending}
          className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
        >
          {mutation.isPending ? 'Saving...' : (
            <><Save size={18} /> {isEditing ? 'Update Lease' : 'Create Lease'}</>
          )}
        </button>
        <button type="button" onClick={closeSidePanel} className="btn-secondary px-8 py-3">
          Cancel
        </button>
      </div>
    </div>
  )
}
