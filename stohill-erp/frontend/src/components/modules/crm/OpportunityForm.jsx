import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { Save, AlertCircle, TrendingUp, User, Home, Calendar } from 'lucide-react'
import { crmAPI, propertiesAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import CurrencySelect from '@/components/common/CurrencySelect'

export default function OpportunityForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel, sidePanelData } = useUIStore()
  const opportunity = sidePanelData?.opportunity
  const isEditing = !!opportunity?.id
  const [error, setError] = useState(null)

  const [formData, setFormData] = useState({
    title: opportunity?.title || '',
    contact: opportunity?.contact || '',
    property: opportunity?.property || '',
    stage: opportunity?.stage || '',
    expected_value: opportunity?.expected_value || '',
    currency: opportunity?.currency || '',
    expected_close_date: opportunity?.expected_close_date || '',
    priority: opportunity?.priority || 'medium',
    probability: opportunity?.probability || 50,
    description: opportunity?.description || '',
  })

  // Fetch Contacts
  const { data: contactsData } = useQuery({
    queryKey: ['crm-contacts'],
    queryFn: () => crmAPI.contacts.list(),
  })
  const contacts = contactsData?.data?.results || []

  // Fetch Properties
  const { data: propertiesData } = useQuery({
    queryKey: ['properties-simple'],
    queryFn: () => propertiesAPI.list({ page_size: 100 }),
  })
  const properties = propertiesData?.data?.results || []

  // Fetch Stages
  const { data: pipelinesData } = useQuery({
    queryKey: ['crm-pipelines'],
    queryFn: () => crmAPI.pipelines.list(),
  })
  const stages = pipelinesData?.data?.[0]?.stages || []

  const mutation = useMutation({
    mutationFn: (data) => 
      isEditing 
        ? crmAPI.opportunities.update(opportunity.id, data)
        : crmAPI.opportunities.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-opportunities'] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
      closeSidePanel()
    },
    onError: (err) => {
      const resp = err.response?.data
      setError(resp?.detail || resp?.message || 'Failed to save opportunity.')
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    mutation.mutate(formData)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  return (
    <div className="flex flex-col h-full bg-dark-900">
      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        <form id="opportunity-form" onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/20">
              <TrendingUp size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{isEditing ? 'Edit Opportunity' : 'New Opportunity'}</h3>
              <p className="text-xs text-dark-500">Track a potential deal or lead.</p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2">
              <AlertCircle size={14} className="flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Deal Title *</label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="e.g. 3-Bed Purchase - John Doe"
              required
              className="form-input w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Client / Contact *</label>
              <select 
                name="contact" 
                value={formData.contact} 
                onChange={handleChange} 
                required 
                className="form-input w-full"
              >
                <option value="">Select Contact</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Link Property</label>
              <select 
                name="property" 
                value={formData.property} 
                onChange={handleChange} 
                className="form-input w-full"
              >
                <option value="">No Property linked</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.reference_number})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Pipeline Stage *</label>
              <select 
                name="stage" 
                value={formData.stage} 
                onChange={handleChange} 
                required 
                className="form-input w-full"
              >
                <option value="">Select Stage</option>
                {stages.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Priority</label>
              <select name="priority" value={formData.priority} onChange={handleChange} className="form-input w-full">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="p-5 bg-dark-800/50 rounded-2xl border border-white/5 space-y-4">
            <h4 className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-2">Deal Economics</h4>
            
            <div className="grid grid-cols-1 gap-4">
              <CurrencySelect 
                value={formData.currency}
                onChange={(val) => setFormData(prev => ({ ...prev, currency: val }))}
                label="Opportunity Currency"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Expected Value</label>
                <input
                  type="number"
                  name="expected_value"
                  value={formData.expected_value}
                  onChange={handleChange}
                  className="form-input w-full"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Probability (%)</label>
                <input
                  type="number"
                  name="probability"
                  value={formData.probability}
                  onChange={handleChange}
                  min="0"
                  max="100"
                  className="form-input w-full"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Expected Close Date</label>
            <input
              type="date"
              name="expected_close_date"
              value={formData.expected_close_date}
              onChange={handleChange}
              className="form-input w-full"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Description / Next Steps</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={3}
              className="form-input w-full resize-none"
              placeholder="Notes on the deal progress..."
            />
          </div>
        </form>
      </div>

      <div className="p-6 border-t border-white/5 bg-dark-800/30 flex gap-3">
        <button
          type="submit"
          form="opportunity-form"
          disabled={mutation.isPending}
          className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
        >
          {mutation.isPending ? 'Saving...' : <><Save size={18} /> {isEditing ? 'Update Deal' : 'Create Opportunity'}</>}
        </button>
        <button type="button" onClick={closeSidePanel} className="btn-secondary px-8 py-3">
          Cancel
        </button>
      </div>
    </div>
  )
}
