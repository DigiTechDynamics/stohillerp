import { useState, useEffect } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { Save, AlertCircle, Calendar, MessageSquare, Phone, Mail, User, Clock, CheckCircle } from 'lucide-react'
import { crmAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'

export default function ActivityForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel, sidePanelData } = useUIStore()
  const initialContact = sidePanelData?.contact
  const initialOpportunity = sidePanelData?.opportunity
  
  const [error, setError] = useState(null)
  const [formData, setFormData] = useState({
    subject: '',
    activity_type: 'call',
    status: 'completed',
    description: '',
    due_date: new Date().toISOString().split('T')[0],
    contact: initialContact?.id || '',
    opportunity: initialOpportunity?.id || '',
  })

  // Fetch Contacts for selection if not provided
  const { data: contactsData } = useQuery({
    queryKey: ['crm-contacts'],
    queryFn: () => crmAPI.contacts.list(),
    enabled: !initialContact?.id
  })
  const contacts = contactsData?.data?.results || []

  const mutation = useMutation({
    mutationFn: (data) => crmAPI.activities.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-activities'] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
      closeSidePanel()
    },
    onError: (err) => {
      const resp = err.response?.data
      setError(resp?.detail || resp?.message || 'Failed to save activity.')
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
        <form id="activity-form" onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/20">
              <Clock size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Log Activity</h3>
              <p className="text-xs text-dark-500">Record an interaction with a client or prospect.</p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2">
              <AlertCircle size={14} className="flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Subject *</label>
            <input
              type="text"
              name="subject"
              value={formData.subject}
              onChange={handleChange}
              placeholder="e.g. Follow-up call regarding offer"
              required
              className="form-input w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Type</label>
              <select name="activity_type" value={formData.activity_type} onChange={handleChange} className="form-input w-full">
                <option value="call">Phone Call</option>
                <option value="email">Email</option>
                <option value="meeting">Meeting</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="note">Internal Note</option>
                <option value="task">Task / To-do</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Status</label>
              <select name="status" value={formData.status} onChange={handleChange} className="form-input w-full">
                <option value="completed">Completed</option>
                <option value="planned">Planned / Scheduled</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Date</label>
              <input
                type="date"
                name="due_date"
                value={formData.due_date}
                onChange={handleChange}
                className="form-input w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Link Contact</label>
              {initialContact ? (
                <div className="form-input w-full bg-white/5 flex items-center gap-2 text-dark-300">
                  <User size={14} /> {initialContact.first_name} {initialContact.last_name}
                </div>
              ) : (
                <select name="contact" value={formData.contact} onChange={handleChange} className="form-input w-full">
                  <option value="">No Contact Linked</option>
                  {contacts.map(c => (
                    <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Notes / Details</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              className="form-input w-full resize-none"
              placeholder="What was discussed or concluded?..."
            />
          </div>
        </form>
      </div>

      <div className="p-6 border-t border-white/5 bg-dark-800/30 flex gap-3">
        <button
          type="submit"
          form="activity-form"
          disabled={mutation.isPending}
          className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
        >
          {mutation.isPending ? 'Logging...' : <><CheckCircle size={18} /> Log Activity</>}
        </button>
        <button type="button" onClick={closeSidePanel} className="btn-secondary px-8 py-3">
          Cancel
        </button>
      </div>
    </div>
  )
}
