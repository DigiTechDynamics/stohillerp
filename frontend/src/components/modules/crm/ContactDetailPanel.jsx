// Stohill Properties - Contact Detail Panel
// Full contact record with enrichment fields, linked opportunities, activities, notes, and KYC documents
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  User, Mail, Phone, Globe, Linkedin, Building2, TrendingUp, Activity as ActivityIcon, MessageSquare, Edit2, BarChart2, AlertCircle, Loader2, ChevronRight, MapPin, DollarSign, Flame, Snowflake, Thermometer, FileText, ShieldCheck, Download, Trash2, Plus, Upload, CheckCircle2
} from 'lucide-react'
import { apiErrorMessage, crmAPI, downloadPrivateFile } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import { toast } from 'react-hot-toast'
import Chatter from '@/components/common/Chatter'
import { confirmDialog } from '@/components/common/Dialogs'

const LEAD_SCORE_LABEL = (score) => {
  if (score >= 70) return { label: 'Hot', color: 'text-red-400 bg-red-500/10 border-red-500/20', Icon: Flame }
  if (score >= 40) return { label: 'Warm', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', Icon: Thermometer }
  return { label: 'Cold', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', Icon: Snowflake }
}

function InfoRow({ icon: Icon, label, value, href }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3">
      <Icon size={13} className="text-dark-500 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[9px] font-bold text-dark-600 uppercase tracking-widest">{label}</p>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline truncate block">
            {value}
          </a>
        ) : (
          <p className="text-xs text-dark-200 break-words">{value}</p>
        )}
      </div>
    </div>
  )
}

function OpportunityRow({ opp, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-3 rounded-xl bg-dark-800/60 border border-white/5 hover:border-primary/30 hover:bg-primary/5 transition-all group text-left"
    >
      <div className="min-w-0">
        <p className="text-xs font-bold text-white group-hover:text-primary transition-colors truncate">{opp.title}</p>
        <p className="text-[10px] text-dark-500">{opp.stage_name}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <span className="text-xs font-mono font-bold text-white">
          {formatCurrency(parseFloat(opp.expected_revenue || 0), opp.currency_code)}
        </span>
        <ChevronRight size={12} className="text-dark-600 group-hover:text-primary" />
      </div>
    </button>
  )
}

function DocumentList({ contactId }) {
  const queryClient = useQueryClient()
  const [isUploading, setIsUploading] = useState(false)
  const [uploadForm, setUploadForm] = useState({ name: '', type: 'id' })

  const { data: docsRes, isLoading } = useQuery({
    queryKey: ['crm-contact-documents', contactId],
    queryFn: () => crmAPI.contacts.documents.list(contactId)
  })

  const uploadMutation = useMutation({
    mutationFn: (formData) => crmAPI.contacts.documents.create(contactId, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-contact-documents', contactId] })
      toast.success('Document uploaded')
      setIsUploading(false)
      setUploadForm({ name: '', type: 'id' })
    },
    onError: () => toast.error('Failed to upload document')
  })

  const verifyMutation = useMutation({
    mutationFn: (docId) => crmAPI.contacts.documents.verify(contactId, docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-contact-documents', contactId] })
      toast.success('Document verified')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (docId) => crmAPI.contacts.documents.delete(contactId, docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-contact-documents', contactId] })
      toast.success('Document deleted')
    }
  })

  if (isLoading) return <div className="p-4 space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-dark-800 animate-pulse rounded-xl" />)}</div>

  const docs = docsRes?.data || []

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">KYC & Compliance Vault</p>
        {!isUploading && (
          <button
            onClick={() => setIsUploading(true)}
            className="flex items-center gap-1.5 text-[10px] font-bold text-primary uppercase tracking-widest hover:text-white transition-colors"
          >
            <Plus size={12} /> Upload New
          </button>
        )}
      </div>

      {isUploading && (
        <div className="bg-dark-800/60 border border-primary/20 rounded-2xl p-4 space-y-3 mb-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] font-bold text-white uppercase tracking-widest">New Document</h4>
            <button onClick={() => setIsUploading(false)} className="text-dark-500 hover:text-white">✕</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="e.g. ID Copy"
              className="form-input text-xs"
              value={uploadForm.name}
              onChange={e => setUploadForm(p => ({ ...p, name: e.target.value }))}
            />
            <select
              className="form-input text-xs"
              value={uploadForm.type}
              onChange={e => setUploadForm(p => ({ ...p, type: e.target.value }))}
            >
              <option value="id">ID / Passport</option>
              <option value="residence">Proof of Residence</option>
              <option value="tax">Tax Clearance</option>
              <option value="contract">Signed Contract</option>
              <option value="other">Other</option>
            </select>
          </div>
          <input
            type="file"
            className="text-[10px] text-dark-400 file:bg-dark-700 file:border-white/10 file:text-white file:px-3 file:py-1 file:rounded-lg file:mr-4 file:cursor-pointer"
            onChange={e => setUploadForm(p => ({ ...p, file: e.target.files[0] }))}
          />
          <button
            onClick={() => {
              const fd = new FormData()
              fd.append('name', uploadForm.name)
              fd.append('document_type', uploadForm.type)
              fd.append('file', uploadForm.file)
              uploadMutation.mutate(fd)
            }}
            disabled={!uploadForm.file || !uploadForm.name || uploadMutation.isPending}
            className="w-full btn-primary py-2 text-[10px] uppercase font-bold tracking-widest flex items-center justify-center gap-2"
          >
            {uploadMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <><Upload size={12} /> Start Upload</>}
          </button>
        </div>
      )}

      <div className="space-y-3">
        {docs.length === 0 && !isUploading && (
          <div className="text-center py-12 border border-dashed border-white/5 rounded-2xl bg-dark-800/20">
            <ShieldCheck size={32} className="mx-auto text-dark-700 mb-3" />
            <p className="text-dark-600 text-xs">No documents uploaded yet.</p>
          </div>
        )}
        {docs.map(doc => (
          <div key={doc.id} className="flex items-center gap-4 p-4 rounded-2xl bg-dark-800/40 border border-white/5 hover:border-white/10 transition-all group">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${doc.is_verified ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-primary/10 border-primary/20 text-primary'}`}>
              <FileText size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold text-white truncate">{doc.name}</p>
                {doc.is_verified && <CheckCircle2 size={11} className="text-emerald-400" />}
              </div>
              <p className="text-[10px] text-dark-500 uppercase tracking-widest">{doc.document_type} • {formatDate(doc.created_at)}</p>
            </div>
            <div className="flex items-center gap-1.5">
              {!doc.is_verified && (
                <button
                  onClick={() => verifyMutation.mutate(doc.id)}
                  className="p-2 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                  title="Verify Document"
                >
                  <ShieldCheck size={14} />
                </button>
              )}
              <button
                onClick={() => downloadPrivateFile(doc.download_url, doc.name).catch(() => toast.error('Download failed.'))}
                disabled={!doc.download_url}
                className="p-2 text-dark-400 hover:text-primary hover:bg-white/5 rounded-lg transition-colors"
                title="Download"
              >
                <Download size={14} />
              </button>
              <button
                onClick={async () => { if (await confirmDialog({ title: 'Delete this document?', message: doc.name, confirmLabel: 'Delete', tone: 'danger' })) deleteMutation.mutate(doc.id) }}
                className="p-2 text-dark-400 hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ContactDetailPanel({ contactId, contact: contactProp }) {
  const [activeTab, setActiveTab] = useState('info') // info | opportunities | activities | notes | documents
  const openPanel = useUIStore(s => s.openSidePanel)
  const closePanel = useUIStore(s => s.closeSidePanel)
  const queryClient = useQueryClient()

  const { data: contactRes, isLoading } = useQuery({
    queryKey: ['crm-contact', contactId],
    queryFn: () => crmAPI.contacts.detail(contactId),
    enabled: !!contactId,
    initialData: contactProp ? { data: contactProp } : undefined,
  })

  const { data: oppsRes } = useQuery({
    queryKey: ['crm-contact-opps', contactId],
    queryFn: () => crmAPI.opportunities.list({ contact: contactId, page_size: 50 }),
    enabled: !!contactId && activeTab === 'opportunities'
  })

  const { data: activitiesRes } = useQuery({
    queryKey: ['crm-contact-activities', contactId],
    queryFn: () => crmAPI.activities.list({ contact: contactId, page_size: 50 }),
    enabled: !!contactId && activeTab === 'activities'
  })

  const recomputeMutation = useMutation({
    mutationFn: () => crmAPI.contacts.recomputeScore(contactId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['crm-contact', contactId] })
      toast.success(`Lead score updated: ${res.data.lead_score}`)
    }
  })

  const inviteMutation = useMutation({
    mutationFn: ({ id, kind }) => crmAPI.contacts.inviteToPortal(id, kind),
    onSuccess: (res) => toast.success(`Portal invitation emailed to ${res.data.email}.`),
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not send the invitation.')),
  })

  const contact = contactRes?.data
  const opportunities = oppsRes?.data?.results || []
  const activities = activitiesRes?.data?.results || []

  if (isLoading) {
    return (
      <div className="p-8 space-y-6 animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-dark-700" />
          <div className="space-y-2">
            <div className="h-5 w-40 bg-dark-700 rounded" />
            <div className="h-3 w-24 bg-dark-800 rounded" />
          </div>
        </div>
        <div className="h-32 bg-dark-800 rounded-2xl" />
      </div>
    )
  }

  if (!contact) return (
    <div className="p-12 text-center">
      <AlertCircle size={48} className="mx-auto text-dark-600 mb-4" />
      <p className="text-white font-medium">Contact not found</p>
      <button onClick={closePanel} className="btn-secondary mt-4 px-6">Close</button>
    </div>
  )

  const scoreData = LEAD_SCORE_LABEL(contact.lead_score || 0)
  const ScoreIcon = scoreData.Icon

  return (
    <div className="flex flex-col h-full bg-dark-900 overflow-hidden">
      {/* Hero Header */}
      <div className="bg-dark-800/80 border-b border-white/5 p-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-xl font-bold text-primary border border-primary/20 shadow-inner flex-shrink-0">
            {contact.first_name?.[0]}{contact.last_name?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white tracking-tight">
              {contact.first_name} {contact.last_name}
            </h2>
            <p className="text-sm text-dark-400">{contact.company || 'Individual'}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {/* Contact type badge */}
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-bold uppercase tracking-widest">
                {contact.contact_type}
              </span>
              {/* Status badge */}
              <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest border ${
                contact.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                contact.status === 'blacklisted' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                'bg-dark-700 text-dark-400 border-white/5'
              }`}>
                {contact.status}
              </span>
              {/* Lead score */}
              <button
                onClick={() => recomputeMutation.mutate()}
                className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest border flex items-center gap-1 transition-all hover:opacity-80 ${scoreData.color}`}
                title="Click to recompute score"
              >
                <ScoreIcon size={9} />
                {scoreData.label} • {contact.lead_score}
              </button>
              {['landlord', 'investor', 'seller'].includes(contact.contact_type) && (
                <button
                  onClick={() => inviteMutation.mutate({ id: contact.id, kind: 'owner' })}
                  disabled={inviteMutation.isPending || !contact.email}
                  className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest border border-primary/30 text-primary hover:bg-primary/10 transition-all disabled:opacity-40"
                  title={contact.email ? 'Email the owner a link to set up their owner-portal login (statements, properties, quote approvals)' : 'Add an email address first'}
                >
                  {inviteMutation.isPending ? 'Sending...' : 'Invite to owner portal'}
                </button>
              )}
              {contact.contact_type === 'tenant' && (
                <button
                  onClick={() => inviteMutation.mutate({ id: contact.id, kind: 'tenant' })}
                  disabled={inviteMutation.isPending || !contact.email}
                  className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest border border-primary/30 text-primary hover:bg-primary/10 transition-all disabled:opacity-40"
                  title={contact.email ? 'Email the tenant a link to set up their portal login (re-sends if already invited)' : 'Add an email address first'}
                >
                  {inviteMutation.isPending ? 'Sending...' : 'Invite to portal'}
                </button>
              )}
            </div>
          </div>
          <button
            onClick={() => openPanel('contact-form', { contact })}
            className="p-2 rounded-lg bg-white/5 text-dark-400 hover:text-primary hover:bg-primary/10 transition-all flex-shrink-0"
          >
            <Edit2 size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-white/5 bg-dark-800/30 px-2">
        {[
          { id: 'info', label: 'Info', icon: User },
          { id: 'opportunities', label: 'Deals', icon: TrendingUp },
          { id: 'documents', label: 'KYC Vault', icon: ShieldCheck },
          { id: 'activities', label: 'Activities', icon: ActivityIcon },
          { id: 'notes', label: 'Notes', icon: MessageSquare },
        ].map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-3 border-b-2 text-[10px] font-bold uppercase tracking-widest transition-all ${
                activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-dark-500 hover:text-dark-300'
              }`}
            >
              <Icon size={12} /> {tab.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">

        {/* Info Tab */}
        {activeTab === 'info' && (
          <div className="p-5 space-y-6">
            {/* Contact Details */}
            <section className="bg-dark-800/40 rounded-2xl border border-white/5 p-5 space-y-4">
              <p className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Contact Information</p>
              <InfoRow icon={Mail} label="Email" value={contact.email} href={contact.email ? `mailto:${contact.email}` : null} />
              <InfoRow icon={Phone} label="Mobile" value={contact.phone_mobile} href={contact.phone_mobile ? `tel:${contact.phone_mobile}` : null} />
              <InfoRow icon={Phone} label="Work" value={contact.phone_work} />
              <InfoRow icon={MapPin} label="City" value={[contact.city, contact.province].filter(Boolean).join(', ')} />
              {contact.sales_team_name && <InfoRow icon={ShieldCheck} label="Sales Team" value={contact.sales_team_name} />}
            </section>

            {/* Enrichment */}
            <section className="bg-dark-800/40 rounded-2xl border border-white/5 p-5 space-y-4">
              <p className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Enrichment</p>
              <InfoRow icon={Building2} label="Company" value={contact.company} />
              <InfoRow icon={Globe} label="Website" value={contact.website} href={contact.website} />
              <InfoRow icon={Linkedin} label="LinkedIn" value={contact.linkedin_url ? 'View Profile' : null} href={contact.linkedin_url} />
              <InfoRow icon={BarChart2} label="Industry" value={contact.industry} />
              <InfoRow icon={Globe} label="Source" value={contact.source} />
            </section>

            {/* Financial Profile */}
            {(contact.budget_min || contact.budget_max || contact.annual_income) && (
              <section className="bg-dark-800/40 rounded-2xl border border-white/5 p-5 space-y-4">
                <p className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Financial Profile</p>
                {contact.budget_min && <InfoRow icon={DollarSign} label="Budget Min" value={formatCurrency(contact.budget_min)} />}
                {contact.budget_max && <InfoRow icon={DollarSign} label="Budget Max" value={formatCurrency(contact.budget_max)} />}
                {contact.annual_income && <InfoRow icon={DollarSign} label="Annual Income" value={formatCurrency(contact.annual_income)} />}
                {contact.affordability && <InfoRow icon={DollarSign} label="Affordability" value={formatCurrency(contact.affordability)} />}
              </section>
            )}

            {/* Preferences */}
            {contact.preferred_areas?.length > 0 && (
              <section className="bg-dark-800/40 rounded-2xl border border-white/5 p-5 space-y-3">
                <p className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Preferred Areas</p>
                <div className="flex flex-wrap gap-2">
                  {contact.preferred_areas.map((area, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-bold border border-primary/20">
                      {area}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Notes */}
            {contact.notes && (
              <section className="bg-amber-500/5 rounded-2xl border border-amber-500/10 p-4">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2">Internal Notes</p>
                <p className="text-xs text-dark-300 leading-relaxed italic">{contact.notes}</p>
              </section>
            )}
          </div>
        )}

        {/* Opportunities Tab */}
        {activeTab === 'opportunities' && (
          <div className="p-5 space-y-3">
            {opportunities.length === 0 ? (
              <div className="text-center py-12">
                <TrendingUp size={32} className="mx-auto text-dark-700 mb-3" />
                <p className="text-dark-600 text-sm">No deals linked to this contact yet.</p>
                <button
                  onClick={() => openPanel('opportunity-form', { opportunity: { contact: contactId } })}
                  className="btn-primary mt-4 px-6 text-xs"
                >
                  Create Deal
                </button>
              </div>
            ) : (
              opportunities.map(opp => (
                <OpportunityRow
                  key={opp.id}
                  opp={opp}
                  onClick={() => openPanel('crm-detail', { id: opp.id })}
                />
              ))
            )}
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <DocumentList contactId={contactId} />
        )}

        {/* Activities Tab */}
        {activeTab === 'activities' && (
          <div className="p-5 space-y-3">
            {activities.length === 0 ? (
              <div className="text-center py-12">
                <ActivityIcon size={32} className="mx-auto text-dark-700 mb-3" />
                <p className="text-dark-600 text-sm">No activities recorded.</p>
                <button
                  onClick={() => openPanel('activity-form', { contactId })}
                  className="btn-primary mt-4 px-6 text-xs"
                >
                  Log Activity
                </button>
              </div>
            ) : (
              activities.map(act => (
                <div key={act.id} className="flex items-start gap-3 p-3 rounded-xl bg-dark-800/40 border border-white/5">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] flex-shrink-0 ${
                    act.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                    act.status === 'overdue' ? 'bg-red-500/10 text-red-400' :
                    'bg-primary/10 text-primary'
                  }`}>
                    <ActivityIcon size={12} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{act.subject}</p>
                    <p className="text-[10px] text-dark-500">{act.activity_type} • {act.due_date ? formatDate(act.due_date) : 'No date'}</p>
                  </div>
                  <span className={`flex-shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    act.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                    act.status === 'overdue' ? 'bg-red-500/10 text-red-400' :
                    'bg-primary/10 text-primary'
                  }`}>
                    {act.status}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Notes Tab – Chatter */}
        {activeTab === 'notes' && (
          <Chatter contactId={contactId} contactData={contact} />
        )}
      </div>
    </div>
  )
}
