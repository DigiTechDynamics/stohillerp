// Shared bits for the property-management screens.
import { useQuery } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { apiErrorMessage, propertiesAPI } from '@/services/api'
import { formatCurrency } from '@/utils/format'

export const rowsOf = (res) => res?.data?.results || res?.data || []

// [[value, label]] options for a select, loaded from a list endpoint.
export function useOptions(key, fetcher, toOption, enabled = true) {
  const { data } = useQuery({ queryKey: key, queryFn: fetcher, enabled, staleTime: 60_000 })
  return rowsOf(data).map(toOption)
}

export const money = (value, currency) => (value === null || value === undefined || value === ''
  ? '—' : formatCurrency(parseFloat(value), currency))

export const label = (value) => (value ? String(value).replace(/_/g, ' ') : '—')

export function saveBlob(res, fallbackName) {
  const disposition = res.headers?.['content-disposition'] || ''
  const name = /filename="?([^"]+)"?/.exec(disposition)?.[1] || fallbackName
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

// Run an API call with a success toast and error message; returns the response or null.
export async function act(promise, success) {
  try {
    const res = await promise
    if (success) toast.success(typeof success === 'function' ? success(res) : success)
    return res
  } catch (error) {
    toast.error(apiErrorMessage(error))
    return null
  }
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex items-center gap-1 border-b border-white/5 overflow-x-auto">
      {tabs.map((tab) => (
        <button key={tab.id} onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 pb-3 px-4 border-b-2 transition-colors text-xs font-bold uppercase tracking-wider whitespace-nowrap ${
            active === tab.id ? 'border-primary text-primary' : 'border-transparent text-dark-500 hover:text-dark-300'}`}>
          {tab.icon && <tab.icon size={14} />}
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function Badge({ value }) {
  const tone = {
    active: 'badge-green', paid: 'badge-green', clear: 'badge-green', approved: 'badge-green',
    accepted: 'badge-green', completed: 'badge-green', settled: 'badge-green', sent: 'badge-green',
    exercised: 'badge-green', held: 'badge-green', processed: 'badge-green', converted: 'badge-green',
    unpaid: 'badge-red', adverse: 'badge-red', declined: 'badge-red', rejected: 'badge-red',
    legal: 'badge-red', failed: 'badge-red', written_off: 'badge-red', called: 'badge-red',
  }[value] || 'badge-gold'
  return <span className={`badge text-[10px] uppercase font-bold ${tone}`}>{label(value)}</span>
}

export const UTILITIES = [['electricity', 'Electricity'], ['water', 'Water'], ['gas', 'Gas'], ['sewer', 'Sewerage']]

// Custom fields (defined in Property settings) as extra CrudTable fields, and back again.
const CF_TYPES = { text: 'text', number: 'number', date: 'date', boolean: 'checkbox', choice: 'select' }
export function customFieldInputs(defs) {
  return defs.filter((d) => d.is_active).map((d) => ({
    key: `cf__${d.key}`, label: d.label, type: CF_TYPES[d.field_type] || 'text', required: d.required,
    options: (d.choices || []).map((c) => [c, c]), get: (row) => row.custom_fields?.[d.key],
  }))
}
export function packCustomFields(payload) {
  const out = { custom_fields: {} }
  for (const [k, v] of Object.entries(payload)) {
    if (!k.startsWith('cf__')) out[k] = v
    else if (v !== '' && v !== null && v !== undefined) out.custom_fields[k.slice(4)] = v
  }
  return out
}
export function useCustomFieldDefs(entity) {
  const { data } = useQuery({
    queryKey: ['custom-fields', entity],
    queryFn: () => propertiesAPI.customFields.list({ entity, is_active: true }),
    staleTime: 60_000,
  })
  return rowsOf(data)
}