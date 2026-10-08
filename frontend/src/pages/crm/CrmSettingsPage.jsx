// CRM settings: the pipelines and stages deals move through, and the lists the
// CRM forms pick from (lost reasons, tags, email templates, sales teams).
import { useState } from 'react'
import { GitBranch, ListOrdered, XCircle, Tag, Mail, Users } from 'lucide-react'
import { crmAPI } from '@/services/api'
import CrudTable from '@/components/common/CrudTable'
import SettingsPage from '@/components/common/SettingsPage'
import SalesTeams from '@/components/modules/crm/SalesTeams'
import { useOptions } from '@/pages/propman/common'

const PIPELINE_TYPES = [['sale', 'Sales'], ['rental', 'Rental'], ['general', 'General']]
const STAGE_TYPES = [
  ['initial', 'Initial contact / lead'], ['qualified', 'Qualified'], ['viewing', 'Viewing scheduled'],
  ['offer', 'Offer submitted'], ['negotiation', 'In negotiation'], ['accepted', 'Offer accepted'],
  ['due_diligence', 'Due diligence'], ['documentation', 'Documentation'], ['closing', 'Closing'],
  ['won', 'Won / closed'], ['lost', 'Lost'],
]
const yes = (v) => (v ? 'Yes' : '')
const typeLabel = (list, value) => list.find(([v]) => v === value)?.[1] ?? value
const Swatch = ({ color }) => (
  <span className="inline-flex items-center gap-2">
    <span className="w-3 h-3 rounded-full border border-white/10" style={{ background: color }} />{color}
  </span>
)

function Pipelines() {
  return (
    <CrudTable label="pipeline" queryKey={['crm-pipelines']} api={crmAPI.pipelines}
      description="Each pipeline is a board of stages that deals move through. The default pipeline opens first on the CRM board."
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'pipeline_type', label: 'Used for', render: (r) => typeLabel(PIPELINE_TYPES, r.pipeline_type) },
        { key: 'stages', label: 'Stages', align: 'right', render: (r) => r.stages?.length || 0 },
        { key: 'is_default', label: 'Default', render: (r) => yes(r.is_default) },
      ]}
      fields={[
        { key: 'name', label: 'Name', required: true },
        { key: 'pipeline_type', label: 'Used for', type: 'select', options: PIPELINE_TYPES, required: true },
        { key: 'is_default', label: 'Default pipeline', type: 'checkbox' },
        { key: 'description', label: 'Description', type: 'textarea', span: 4 },
      ]}
      defaults={{ pipeline_type: 'sale' }} />
  )
}

function Stages() {
  const pipelines = useOptions(['crm-pipelines', 'options'], () => crmAPI.pipelines.list(), (p) => [p.id, p.name])
  const [chosen, setChosen] = useState('')
  const pipeline = chosen || pipelines[0]?.[0] || ''
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-xs text-dark-400">
        Pipeline
        <select className="form-input text-xs w-auto" value={pipeline} onChange={(e) => setChosen(e.target.value)} aria-label="Pipeline">
          {pipelines.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      {pipelines.length === 0 ? (
        <p className="text-sm text-dark-400">Add a pipeline first, then give it stages.</p>
      ) : (
        <CrudTable key={pipeline} label="stage" queryKey={['crm-pipelines']} api={crmAPI.pipelines.stages} params={{ pipeline }}
          description="Stages in board order (lowest first). Probability feeds the weighted forecast; mark the closing stages as terminal, and the winning one as won."
          columns={[
            { key: 'position', label: '#' },
            { key: 'name', label: 'Stage' },
            { key: 'stage_type', label: 'Type', render: (r) => typeLabel(STAGE_TYPES, r.stage_type) },
            { key: 'probability', label: 'Probability', align: 'right', render: (r) => `${r.probability}%` },
            { key: 'sla_days', label: 'SLA (days)', align: 'right', render: (r) => r.sla_days || '—' },
            { key: 'color', label: 'Colour', render: (r) => <Swatch color={r.color} /> },
            { key: 'is_won', label: 'Outcome', render: (r) => (r.is_terminal ? (r.is_won ? 'Won' : 'Lost') : '') },
          ]}
          fields={[
            { key: 'name', label: 'Name', required: true },
            { key: 'stage_type', label: 'Type', type: 'select', options: STAGE_TYPES, required: true },
            { key: 'position', label: 'Order', type: 'number', required: true },
            { key: 'probability', label: 'Probability %', type: 'number' },
            { key: 'sla_days', label: 'SLA days (0 = none)', type: 'number' },
            { key: 'color', label: 'Colour', placeholder: '#E5A645' },
            { key: 'is_terminal', label: 'Closing stage', type: 'checkbox' },
            { key: 'is_won', label: 'Won', type: 'checkbox' },
          ]}
          defaults={{ stage_type: 'initial', probability: 0, sla_days: 0, color: '#E5A645' }} />
      )}
    </div>
  )
}

// Retired reasons stay listed here (the lost-deal picker only offers active ones).
const lostReasonsApi = { ...crmAPI.lostReasons, list: (params) => crmAPI.lostReasons.list({ ...params, all: 1 }) }

const TABS = [
  { id: 'pipelines', label: 'Pipelines', icon: GitBranch, render: () => <Pipelines /> },
  { id: 'stages', label: 'Stages', icon: ListOrdered, render: () => <Stages /> },
  {
    id: 'lost-reasons', label: 'Lost reasons', icon: XCircle, render: () => (
      <CrudTable label="lost reason" queryKey={['crm-lost-reasons']} api={lostReasonsApi}
        description="Offered when a deal is marked lost. Deactivate a reason to stop offering it; past deals keep it."
        columns={[
          { key: 'name', label: 'Reason' },
          { key: 'is_active', label: 'Active', render: (r) => (r.is_active ? 'Yes' : 'No') },
        ]}
        fields={[
          { key: 'name', label: 'Reason', required: true, span: 2 },
          { key: 'is_active', label: 'Active', type: 'checkbox' },
        ]}
        defaults={{ is_active: true }} />
    ),
  },
  {
    id: 'tags', label: 'Tags', icon: Tag, render: () => (
      <CrudTable label="tag" queryKey={['crm-tags']} api={crmAPI.tags}
        description="Labels for leads and deals, e.g. Investor or First-time buyer."
        columns={[
          { key: 'name', label: 'Tag' },
          { key: 'color', label: 'Colour', render: (r) => <Swatch color={r.color} /> },
        ]}
        fields={[
          { key: 'name', label: 'Tag', required: true },
          { key: 'color', label: 'Colour', placeholder: '#E5A645' },
        ]}
        defaults={{ color: '#E5A645' }} />
    ),
  },
  {
    id: 'email-templates', label: 'Email templates', icon: Mail, render: () => (
      <CrudTable label="email template" queryKey={['crm-email-templates']} api={crmAPI.emailTemplates}
        description="Ready-made emails to pick from when logging an email activity."
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'subject', label: 'Subject', render: (r) => r.subject || '—' },
        ]}
        fields={[
          { key: 'name', label: 'Name', required: true },
          { key: 'subject', label: 'Subject', span: 2 },
          { key: 'body', label: 'Message', type: 'textarea', required: true, span: 4 },
        ]} />
    ),
  },
  { id: 'teams', label: 'Sales teams', icon: Users, render: () => <SalesTeams /> },
]

export default function CrmSettingsPage() {
  return (
    <SettingsPage title="CRM settings" backTo="/crm" backLabel="CRM"
      description="Pipelines, stages and the lists the CRM forms pick from." tabs={TABS} />
  )
}
