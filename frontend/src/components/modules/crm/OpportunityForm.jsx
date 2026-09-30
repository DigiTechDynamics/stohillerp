import { useState, useEffect, useMemo } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { Save, AlertCircle, TrendingUp, User, Home, Mail, Clock, Tag as TagIcon, Loader2, UserCheck, DollarSign, ShieldCheck } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { crmAPI, propertiesAPI, hrAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import CurrencySelect from '@/components/common/CurrencySelect'

export default function OpportunityForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel, sidePanelData } = useUIStore()
  const opportunity = sidePanelData?.opportunity
  const isEditing = !!opportunity?.id
  const [error, setError] = useState(null)

  const isLead = sidePanelData?.is_lead || opportunity?.is_lead
  const [duplicateWarning, setDuplicateWarning] = useState(null)
  
  const [formData, setFormData] = useState({
    title: opportunity?.title || '',
    contact: opportunity?.contact || '',
    contact_name: opportunity?.contact_name || '',
    email_from: opportunity?.email_from || '',
    phone: opportunity?.phone || '',
    property: opportunity?.property || '',
    stage: opportunity?.stage || '',
    expected_revenue: opportunity?.expected_revenue || opportunity?.expected_value || '',
    currency: opportunity?.currency || '',
    expected_closing: opportunity?.expected_closing || '',
    priority: opportunity?.priority || '1',
    probability: opportunity?.probability || 50,
    description: opportunity?.description || '',
    tags: opportunity?.tags?.map(t => t.id) || [],
    assigned_agent: opportunity?.assigned_agent || '',
    sales_team: opportunity?.sales_team || '',
    pipeline: opportunity?.pipeline || '',
    is_lead: isLead
  })

  // Fetch Tags
  const { data: tagsData } = useQuery({
    queryKey: ['crm-tags'],
    queryFn: () => crmAPI.tags.list()
  })
  const allTags = (Array.isArray(tagsData?.data) ? tagsData.data : (tagsData?.data?.results || [])) || []

  // Fetch Teams
  const { data: teamsRes } = useQuery({
    queryKey: ['sales-teams'],
    queryFn: () => crmAPI.salesTeams.list()
  })
  const teams = teamsRes?.data || []

  // Fetch Contacts
  const { data: contactsData } = useQuery({
    queryKey: ['crm-contacts'],
    queryFn: () => crmAPI.contacts.list({ page_size: 100 }),
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
  const pipelines = Array.isArray(pipelinesData?.data) ? pipelinesData.data : (pipelinesData?.data?.results || [])
  const pipeline = pipelines?.find(p => p.id === formData.pipeline) || pipelines?.[0]
  const stages = useMemo(
    () => pipeline?.stages?.filter(s => isLead ? s.stage_type === 'initial' : s.stage_type !== 'initial') || pipeline?.stages || [],
    [pipeline, isLead])

  // Auto-select first stage and pipeline for new records
  useEffect(() => {
    if (!isEditing && pipeline?.id && stages.length > 0 && !formData.stage) {
      setFormData(prev => ({ ...prev, stage: stages[0].id, pipeline: pipeline.id }))
    }
  }, [pipeline, stages, isEditing, formData.stage])

  // Fetch Agents
  const { data: agentsData } = useQuery({
    queryKey: ['hr-employees-simple'],
    queryFn: () => hrAPI.employees.list({ page_size: 200 }),
  })
  const agents = agentsData?.data?.results || []

  const mutation = useMutation({
    mutationFn: (data) => 
      isEditing 
        ? crmAPI.opportunities.update(opportunity.id, data)
        : crmAPI.opportunities.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-opportunities'] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
      closeSidePanel()
      toast.success(isEditing ? 'Saved successfully' : 'Created successfully')
    },
    onError: (err) => {
      const resp = err.response?.data
      setError(resp?.detail || resp?.message || 'Failed to save record.')
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    const payload = { ...formData }
    if (!payload.sales_team) delete payload.sales_team
    mutation.mutate(payload)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    // Auto-update probability when stage changes
    if (name === 'stage') {
      const selectedStage = stages.find(s => String(s.id) === String(value))
      if (selectedStage?.probability > 0) {
        setFormData(prev => ({ ...prev, [name]: value, probability: selectedStage.probability }))
        return
      }
    }
    // Duplicate check on email
    if (name === 'email_from' && value.includes('@')) {
      crmAPI.opportunities.duplicateCheck({ email: value }).then(res => {
        if (res.data.has_duplicates) {
          setDuplicateWarning(`Warning: ${res.data.duplicates[0]?.title} already exists for this email.`)
        } else {
          setDuplicateWarning(null)
        }
      }).catch(() => {})
    }
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const toggleTag = (tagId) => {
    setFormData(prev => {
      const tags = prev.tags.includes(tagId)
        ? prev.tags.filter(id => id !== tagId)
        : [...prev.tags, tagId]
      return { ...prev, tags }
    })
  }

  return (
    <div className="flex flex-col h-full bg-dark-900 overflow-hidden font-sans">
      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide custom-scrollbar">
        <form id="opportunity-form" onSubmit={handleSubmit} className="space-y-6 pb-4">
          <div className="flex items-center gap-3 mb-6 bg-dark-800/20 p-4 rounded-2xl border border-white/5 shadow-inner">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border shadow-inner ${isLead ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-primary/10 text-primary border-primary/20'}`}>
              {isLead ? <Mail size={24} /> : <TrendingUp size={24} />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">{isEditing ? `Edit ${isLead ? 'Lead' : 'Opportunity'}` : `New ${isLead ? 'Lead' : 'Opportunity'}`}</h3>
              <p className="text-[10px] text-dark-500 font-bold uppercase tracking-widest">{isLead ? 'Capture unqualified prospect' : 'Track sales deal pipeline'}</p>
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2">
              <AlertCircle size={14} className="flex-shrink-0" />
              <p className="font-medium">{error}</p>
            </div>
          )}

          <div className="space-y-4 bg-dark-800/40 p-5 rounded-2xl border border-white/5">
             <div className="space-y-1.5 peer">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Title / Short Description *</label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  placeholder={isLead ? "e.g. Website Inquiry - High Value" : "e.g. 5x Units Purchase - Stohill Properties"}
                  required
                  className="form-input w-full bg-dark-800/50 border-white/5 focus:border-primary/50"
                />
             </div>
             
             <div className="flex items-center gap-2">
                {[...Array(3)].map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setFormData(p => ({ ...p, priority: (i + 1).toString() }))}
                    className="p-1 hover:scale-110 transition-transform"
                  >
                    <TrendingUp 
                      size={18} 
                      className={i < parseInt(formData.priority) ? 'text-amber-400 fill-amber-400' : 'text-dark-700'} 
                    />
                  </button>
                ))}
                <span className="text-[9px] font-bold text-dark-600 uppercase tracking-widest ml-2">Priority</span>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4 bg-dark-800/40 p-5 rounded-2xl border border-white/5">
              <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-2 mb-2">
                <User size={12} /> Prospect Info
              </h4>
              
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Linked Contact</label>
                  <select 
                    name="contact" 
                    value={formData.contact} 
                    onChange={handleChange} 
                    className="form-input w-full h-11"
                  >
                    <option value="">Create from lead info / Select Contact</option>
                    {contacts.map(c => (
                      <option key={c.id} value={c.id}>{c.first_name} {c.last_name} ({c.company || 'Individual'})</option>
                    ))}
                  </select>
                </div>

                {!formData.contact && (
                  <div className="space-y-3 pt-2 border-t border-white/5">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Contact Name</label>
                      <input type="text" name="contact_name" value={formData.contact_name} onChange={handleChange} className="form-input w-full text-xs" placeholder="Full Name" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Email From</label>
                      <input type="email" name="email_from" value={formData.email_from} onChange={handleChange} className="form-input w-full text-xs" placeholder="email@address.com" />
                      {duplicateWarning && (
                        <div className="flex items-center gap-2 text-[10px] text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-lg p-2">
                          <AlertCircle size={11} />
                          <span>{duplicateWarning}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4 bg-dark-800/40 p-5 rounded-2xl border border-white/5 h-fit">
               <h4 className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2 mb-2">
                 <Home size={12} /> Linked Object
               </h4>
               <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Interested Property</label>
                  <select 
                    name="property" 
                    value={formData.property} 
                    onChange={handleChange} 
                    className="form-input w-full h-11"
                  >
                    <option value="">No Property linked</option>
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.reference_number})</option>
                    ))}
                  </select>
               </div>
            </div>
          </div>

          <div className="p-5 bg-dark-800/40 rounded-2xl border border-white/5 space-y-4">
             <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-2 mb-2">
               <TagIcon size={12} /> Tags
             </h4>
             <div className="flex flex-wrap gap-2">
                {allTags.map(tag => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border
                      ${formData.tags.includes(tag.id) ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-dark-700/50 border-white/5 text-dark-400 hover:text-dark-300'}`}
                    style={formData.tags.includes(tag.id) ? {} : { borderLeftColor: tag.color, borderLeftWidth: '3px' }}
                  >
                    {tag.name}
                  </button>
                ))}
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-4 bg-dark-800/40 p-5 rounded-2xl border border-white/5">
                <h4 className="text-[10px] font-bold text-amber-500 uppercase tracking-widest flex items-center gap-2 mb-2">
                  <Clock size={12} /> Pipeline Status
                </h4>
                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Pipeline</label>
                    <select name="pipeline" value={formData.pipeline} onChange={handleChange} className="form-input w-full h-11">
                      {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Stage</label>
                    <select 
                      name="stage" 
                      value={formData.stage} 
                      onChange={handleChange} 
                      required 
                      className="form-input w-full h-11"
                    >
                      <option value="">Select Stage</option>
                      {stages.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4 bg-dark-800/40 p-5 rounded-2xl border border-white/5">
                <h4 className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2 mb-2">
                  <TrendingUp size={12} /> Closing
                </h4>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Expected Date</label>
                      <input type="date" name="expected_closing" value={formData.expected_closing} onChange={handleChange} className="form-input w-full h-11 text-xs" />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Probability (%)</label>
                      <input type="number" name="probability" value={formData.probability} onChange={handleChange} min="0" max="100" className="form-input w-full h-11 text-xs" />
                   </div>
                </div>
              </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Assigned Agent */}
            <div className="p-5 bg-dark-800/40 rounded-2xl border border-white/5 space-y-3">
              <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                <UserCheck size={12} /> Assigned Agent
              </h4>
              <select
                name="assigned_agent"
                value={formData.assigned_agent}
                onChange={handleChange}
                className="form-input w-full h-11"
              >
                <option value="">Unassigned</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>
                ))}
              </select>
            </div>

            {/* Sales Team */}
            <div className="p-5 bg-dark-800/40 rounded-2xl border border-white/5 space-y-3">
              <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                <ShieldCheck size={12} /> Sales Team / Territory
              </h4>
              <select
                name="sales_team"
                value={formData.sales_team}
                onChange={handleChange}
                className="form-input w-full h-11"
              >
                <option value="">No Team Assigned</option>
                {teams.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-5 bg-dark-800/40 rounded-2xl border border-white/5 space-y-4">
            <h4 className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-2 flex items-center gap-2">
              <DollarSign size={12} /> Deal Economics
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div>
                  <CurrencySelect 
                    value={formData.currency}
                    onChange={(val) => setFormData(prev => ({ ...prev, currency: val }))}
                    label="Currency"
                  />
               </div>
               <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Expected Revenue</label>
                  <div className="relative">
                     <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-dark-600 font-bold">$</span>
                     <input
                       type="number"
                       name="expected_revenue"
                       value={formData.expected_revenue}
                       onChange={handleChange}
                       className="form-input w-full pl-8 h-11 text-white font-mono font-bold font-lg"
                       placeholder="0.00"
                     />
                  </div>
               </div>
            </div>
          </div>

          <div className="space-y-1.5 bg-dark-800/40 p-5 rounded-2xl border border-white/5">
            <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest flex items-center gap-2">
              <AlertCircle size={12} /> Internal Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              className="form-input w-full resize-none bg-dark-800/50 border-white/5 text-sm"
              placeholder="Record any detailed requirements or background logic here..."
            />
          </div>
        </form>
      </div>

      <div className="p-6 border-t border-white/10 bg-dark-900 flex gap-3 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.5)] z-10">
        <button
          type="submit"
          form="opportunity-form"
          disabled={mutation.isPending}
          className="flex-1 btn-primary py-4 flex items-center justify-center gap-3 text-sm font-bold uppercase tracking-widest shadow-lg shadow-primary/20"
        >
          {mutation.isPending ? <Loader2 className="animate-spin" size={20} /> : <><Save size={20} /> {isEditing ? `Update ${isLead ? 'Lead' : 'Deal'}` : `Create ${isLead ? 'Lead' : 'Deal'}`}</>}
        </button>
        <button type="button" onClick={closeSidePanel} className="btn-secondary px-8 py-4 text-xs font-bold uppercase tracking-widest hover:bg-white/5">
          Dismiss
        </button>
      </div>
    </div>
  )
}
