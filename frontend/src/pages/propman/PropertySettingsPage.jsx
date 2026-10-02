// Property-management settings: utility tariffs, CPI, arrears stages,
// custom fields and portfolios.
import { useState } from 'react'
import { Zap, LineChart, Gavel, SlidersHorizontal, FolderTree } from 'lucide-react'
import { propertiesAPI, propmanAPI, financeAPI } from '@/services/api'
import { formatDate } from '@/utils/format'
import CrudTable from '@/components/common/CrudTable'
import { Tabs, label, money, useOptions, UTILITIES } from './common'

const TABS = [
  { id: 'tariffs', label: 'Utility tariffs', icon: Zap },
  { id: 'cpi', label: 'CPI', icon: LineChart },
  { id: 'arrears', label: 'Arrears stages', icon: Gavel },
  { id: 'fields', label: 'Custom fields', icon: SlidersHorizontal },
  { id: 'portfolios', label: 'Portfolios', icon: FolderTree },
]

// Tariff steps are edited as text: one "up_to:rate" per line, the last line may be ":rate".
const stepsToText = (steps) => (steps || []).map((s) => `${s.up_to ?? ''}:${s.rate}`).join('\n')
const textToSteps = (text) => (text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
  const [upTo, rate] = l.split(':').map((x) => x.trim())
  return { up_to: upTo === '' ? null : upTo, rate }
})

export default function PropertySettingsPage() {
  const [tab, setTab] = useState('tariffs')
  const accounts = useOptions(['accounts', 'income'], () => financeAPI.accounts.list({ account_type: 'revenue', page_size: 500 }),
    (a) => [a.id, `${a.code} ${a.name}`])

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div>
        <h1 className="font-display text-2xl text-white">Property settings</h1>
        <p className="text-dark-400 text-sm mt-1">Set-up for utilities, escalations, arrears and the fields you track.</p>
      </div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'tariffs' && (
        <CrudTable label="tariff" queryKey={['tariffs']} api={propmanAPI.tariffs}
          description="Price per unit consumed. For stepped (block) tariffs, give one step per line as limit:rate, e.g. 50:1.20 then :1.80 for everything above."
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'utility', label: 'Utility', render: (r) => label(r.utility) },
            { key: 'rate', label: 'Rate', render: (r) => (r.steps?.length ? `${r.steps.length} steps` : `${r.rate} / ${r.unit_label}`) },
            { key: 'fixed_monthly', label: 'Fixed / month', align: 'right', render: (r) => money(r.fixed_monthly) },
            { key: 'income_account_code', label: 'Income account', render: (r) => r.income_account_code || '4920' },
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
      )}

      {tab === 'cpi' && (
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
      )}

      {tab === 'arrears' && (
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
      )}

      {tab === 'fields' && (
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
      )}

      {tab === 'portfolios' && (
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
      )}
    </div>
  )
}
