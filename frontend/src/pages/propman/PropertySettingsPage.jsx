// Property & rental settings: property types, utility tariffs, CPI, arrears stages,
// custom fields, portfolios and defaults.
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Building2, Zap, LineChart, Gavel, SlidersHorizontal, FolderTree, Percent, Save } from 'lucide-react'
import { propertiesAPI, propmanAPI, financeAPI, apiErrorMessage } from '@/services/api'
import { formatDate } from '@/utils/format'
import CrudTable from '@/components/common/CrudTable'
import SettingsPage from '@/components/common/SettingsPage'
import { label, money, useOptions, UTILITIES } from './common'

const TABS = [
  { id: 'types', label: 'Property types', icon: Building2 },
  { id: 'tariffs', label: 'Utility tariffs', icon: Zap },
  { id: 'cpi', label: 'CPI', icon: LineChart },
  { id: 'arrears', label: 'Arrears stages', icon: Gavel },
  { id: 'fields', label: 'Custom fields', icon: SlidersHorizontal },
  { id: 'portfolios', label: 'Portfolios', icon: FolderTree },
  { id: 'defaults', label: 'Defaults', icon: Percent },
]

// Default rates applied to new leases and properties (stored server-side).
function DefaultsPanel() {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['propman-defaults'], queryFn: async () => (await propmanAPI.defaults.get()).data })
  const [values, setValues] = useState({})
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (data) setValues(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.value])))
  }, [data])

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await propmanAPI.defaults.update(values)
      queryClient.invalidateQueries({ queryKey: ['propman-defaults'] })
      toast.success('Defaults saved.')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not save the defaults.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="card p-5 space-y-4 max-w-xl">
      <p className="text-sm text-dark-400">Starting values for new records. Each lease or property can still be changed individually.</p>
      {Object.entries(data || {}).map(([name, { label: text }]) => (
        <label key={name} className="block">
          <span className="form-label">{text}</span>
          <input type="number" step="0.01" min="0" max="100" required className="form-input w-40"
            value={values[name] ?? ''} onChange={(e) => setValues({ ...values, [name]: e.target.value })} />
        </label>
      ))}
      <button type="submit" className="btn-primary" disabled={saving || !data}><Save size={16} /> Save defaults</button>
    </form>
  )
}

// The types offered on the property form. A type in use cannot be deleted.
function PropertyTypes() {
  return (
    <CrudTable label="property type" queryKey={['property-types']} api={propertiesAPI.types}
      description="The types offered when adding a property. Types with properties cannot be deleted; rename them instead."
      columns={[
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Name' },
        { key: 'description', label: 'Description', render: (r) => r.description || '—' },
        { key: 'property_count', label: 'Properties', align: 'right' },
      ]}
      fields={[
        { key: 'name', label: 'Name', required: true },
        { key: 'code', label: 'Code', required: true, readOnlyOnEdit: true, placeholder: 'e.g. RES' },
        { key: 'description', label: 'Description', span: 2 },
      ]} />
  )
}

// Tariff steps are edited as text: one "up_to:rate" per line, the last line may be ":rate".
const stepsToText = (steps) => (steps || []).map((s) => `${s.up_to ?? ''}:${s.rate}`).join('\n')
const textToSteps = (text) => (text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
  const [upTo, rate] = l.split(':').map((x) => x.trim())
  return { up_to: upTo === '' ? null : upTo, rate }
})

export default function PropertySettingsPage() {
  const accounts = useOptions(['accounts', 'income'], () => financeAPI.accounts.list({ account_type: 'revenue', page_size: 500 }),
    (a) => [a.id, `${a.code} ${a.name}`])

  const render = {
    types: () => <PropertyTypes />,
    tariffs: () => (
      <CrudTable label="tariff" queryKey={['tariffs']} api={propmanAPI.tariffs}
        description="Price per unit consumed. For stepped (block) tariffs, give one step per line as limit:rate, e.g. 50:1.20 then :1.80 for everything above."
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'utility', label: 'Utility', render: (r) => label(r.utility) },
          { key: 'rate', label: 'Rate', render: (r) => (r.steps?.length ? `${r.steps.length} steps` : `${r.rate} / ${r.unit_label}`) },
          { key: 'fixed_monthly', label: 'Fixed / month', align: 'right', render: (r) => money(r.fixed_monthly) },
          { key: 'income_account_code', label: 'Income account', render: (r) => r.income_account_code || 'Default (recoveries)' },
          { key: 'is_active', label: 'Active', render: (r) => (r.is_active ? 'Yes' : 'No') },
        ]}
        fields={[
          { key: 'name', label: 'Name', required: true },
          { key: 'utility', label: 'Utility', type: 'select', options: UTILITIES, required: true },
          { key: 'unit_label', label: 'Unit', placeholder: 'kWh, kl...' },
          { key: 'rate', label: 'Flat rate per unit', type: 'number' },
          { key: 'steps', label: 'Steps (limit:rate per line)', type: 'textarea', span: 2, get: (r) => stepsToText(r.steps) },
          { key: 'fixed_monthly', label: 'Fixed charge / month', type: 'number' },
          { key: 'income_account', label: 'Income account', type: 'select', options: accounts },
          { key: 'vat_applicable', label: 'VAT applies', type: 'checkbox' },
          { key: 'is_active', label: 'Active', type: 'checkbox' },
        ]}
        toPayload={(p) => ({ ...p, steps: textToSteps(p.steps) })}
        defaults={{ utility: 'electricity', unit_label: 'kWh', rate: 0, fixed_monthly: 0, is_active: true }} />
    ),
    cpi: () => (
      <CrudTable label="CPI value" queryKey={['cpi']} api={propmanAPI.cpi}
        description="Monthly consumer price index. CPI-linked leases escalate on each anniversary by the index growth over the year, plus the lease's margin."
        columns={[
          { key: 'month', label: 'Month', render: (r) => formatDate(r.month) },
          { key: 'value', label: 'Index', align: 'right' },
          { key: 'source', label: 'Source' },
        ]}
        fields={[
          { key: 'month', label: 'Month (any day)', type: 'date', required: true },
          { key: 'value', label: 'Index value', type: 'number', required: true },
          { key: 'source', label: 'Source' },
        ]}
        defaults={{ source: 'manual' }} />
    ),
    arrears: () => (
      <CrudTable label="stage" queryKey={['arrears-stages']} api={propmanAPI.arrearsStages}
        description="Reached when the oldest unpaid invoice is this many days overdue. Placeholders: {tenant} {lease} {property} {amount} {currency} {days} {company}."
        columns={[
          { key: 'sequence', label: '#' },
          { key: 'name', label: 'Stage' },
          { key: 'days_overdue', label: 'Days overdue', align: 'right' },
          { key: 'action', label: 'Action', render: (r) => label(r.action) },
          { key: 'channels', label: 'Sends', render: (r) => [r.send_email && 'E-mail', r.send_sms && 'SMS'].filter(Boolean).join(', ') || '—' },
          { key: 'is_active', label: 'Active', render: (r) => (r.is_active ? 'Yes' : 'No') },
        ]}
        fields={[
          { key: 'sequence', label: 'Order', type: 'number', required: true },
          { key: 'name', label: 'Name', required: true },
          { key: 'days_overdue', label: 'Days overdue', type: 'number', required: true },
          { key: 'action', label: 'Action', type: 'select', required: true,
            options: [['reminder', 'Friendly reminder'], ['letter', 'Letter of demand'], ['final', 'Final demand'], ['legal', 'Hand over (legal)']] },
          { key: 'subject', label: 'Subject', required: true, span: 2 },
          { key: 'send_email', label: 'Send e-mail', type: 'checkbox' },
          { key: 'send_sms', label: 'Send SMS', type: 'checkbox' },
          { key: 'template', label: 'Message', type: 'textarea', required: true, span: 4 },
          { key: 'is_active', label: 'Active', type: 'checkbox' },
        ]}
        defaults={{ action: 'reminder', send_email: true, is_active: true }} />
    ),
    fields: () => (
      <CrudTable label="custom field" queryKey={['custom-fields']} api={propertiesAPI.customFields}
        description="Extra fields shown on properties, units, leases and contacts. The key is how the value is stored and exported."
        columns={[
          { key: 'entity', label: 'On', render: (r) => label(r.entity) },
          { key: 'label', label: 'Label' },
          { key: 'key', label: 'Key' },
          { key: 'field_type', label: 'Type', render: (r) => label(r.field_type) },
          { key: 'required', label: 'Required', render: (r) => (r.required ? 'Yes' : '') },
          { key: 'is_active', label: 'Active', render: (r) => (r.is_active ? 'Yes' : 'No') },
        ]}
        fields={[
          { key: 'entity', label: 'On', type: 'select', required: true, readOnlyOnEdit: true,
            options: [['property', 'Property'], ['unit', 'Unit'], ['lease', 'Lease'], ['contact', 'Contact']] },
          { key: 'label', label: 'Label', required: true },
          { key: 'key', label: 'Key', required: true, placeholder: 'e.g. erf_number', readOnlyOnEdit: true },
          { key: 'field_type', label: 'Type', type: 'select', required: true,
            options: [['text', 'Text'], ['number', 'Number'], ['date', 'Date'], ['boolean', 'Yes / No'], ['choice', 'Choice']] },
          { key: 'choices', label: 'Choices (one per line, for Choice)', type: 'textarea', span: 2, get: (r) => (r.choices || []).join('\n') },
          { key: 'sort_order', label: 'Order', type: 'number' },
          { key: 'required', label: 'Required', type: 'checkbox' },
          { key: 'is_active', label: 'Active', type: 'checkbox' },
        ]}
        toPayload={(p) => ({ ...p, choices: (p.choices || '').split('\n').map((c) => c.trim()).filter(Boolean) })}
        defaults={{ entity: 'property', field_type: 'text', sort_order: 0, is_active: true }} />
    ),
    portfolios: () => (
      <CrudTable label="portfolio" queryKey={['portfolios']} api={propertiesAPI.portfolios}
        description="Group properties (by fund, region, client...) for reports, statements and bulk messages. Assign a property on its workspace."
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'description', label: 'Description' },
          { key: 'property_count', label: 'Properties', align: 'right' },
        ]}
        fields={[
          { key: 'name', label: 'Name', required: true },
          { key: 'description', label: 'Description', span: 2 },
        ]} />
    ),
    defaults: () => <DefaultsPanel />,
  }
  return (
    <SettingsPage title="Property & rental settings" tabs={TABS.map((t) => ({ ...t, render: render[t.id] }))}
      description="Property types, utilities, escalations, arrears, the fields you track and the defaults for new leases." />
  )
}
