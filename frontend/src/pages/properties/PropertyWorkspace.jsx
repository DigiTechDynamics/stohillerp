// Property workspace: everything managed per property, in tabs.
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, LayoutGrid, Image as ImageIcon, TrendingUp, ClipboardCheck, Users, Gauge, Calculator,
  CalendarClock, Info, Upload, Star, FileDown, ListChecks, CheckCircle2, GitCompare, Loader2,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { propertiesAPI, propmanAPI, crmAPI, rentalsAPI, financeAPI } from '@/services/api'
import { formatDate } from '@/utils/format'
import CrudTable from '@/components/common/CrudTable'
import RecordActions from '@/components/common/RecordActions'
import {
  Tabs, Badge, money, label, useOptions, act, saveBlob, UTILITIES, customFieldInputs, packCustomFields,
  useCustomFieldDefs, rowsOf,
} from '@/pages/propman/common'
import { confirmDialog, promptDialog } from '@/components/common/Dialogs'

const TABS = [
  { id: 'overview', label: 'Overview', icon: Info },
  { id: 'units', label: 'Units', icon: LayoutGrid },
  { id: 'photos', label: 'Photos', icon: ImageIcon },
  { id: 'valuations', label: 'Valuations', icon: TrendingUp },
  { id: 'inspections', label: 'Inspections', icon: ClipboardCheck },
  { id: 'owners', label: 'Owners', icon: Users },
  { id: 'utilities', label: 'Meters', icon: Gauge },
  { id: 'recoveries', label: 'Recoveries', icon: Calculator },
  { id: 'plans', label: 'Planned maintenance', icon: CalendarClock },
]

const UNIT_TYPES = [['residential', 'Residential'], ['office', 'Office'], ['retail', 'Retail / Shop'],
  ['industrial', 'Industrial / Warehouse'], ['parking', 'Parking'], ['storage', 'Storage'], ['other', 'Other']]
const UNIT_STATUS = [['available', 'Available'], ['occupied', 'Occupied'], ['maintenance', 'Under Maintenance'],
  ['reserved', 'Reserved']]
const INSPECTION_TYPES = [['ingoing', 'Ingoing'], ['outgoing', 'Outgoing'], ['routine', 'Routine'], ['maintenance', 'Maintenance']]
const CONDITIONS = [['good', 'Good'], ['fair', 'Fair'], ['poor', 'Poor'], ['damaged', 'Damaged'], ['missing', 'Missing'],
  ['na', 'N/A']]

export default function PropertyWorkspace() {
  const { id } = useParams()
  const [tab, setTab] = useState('overview')
  const { data, isLoading } = useQuery({ queryKey: ['property', id], queryFn: () => propertiesAPI.detail(id) })
  const property = data?.data

  if (isLoading) return <div className="p-6 text-dark-400"><Loader2 className="animate-spin" /></div>
  if (!property) return <div className="p-6 text-dark-400">Property not found.</div>
  const currency = property.currency_code

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/properties" className="btn-ghost p-2" aria-label="Back to properties"><ArrowLeft size={16} /></Link>
          <div>
            <p className="text-xs text-primary font-mono">{property.reference_number}</p>
            <h1 className="font-display text-2xl text-white">{property.name}</h1>
            <p className="text-dark-400 text-sm">{property.full_address}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge value={property.status} />
          {property.portfolio_name && <span className="badge badge-blue text-[10px]">{property.portfolio_name}</span>}
        </div>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && <Overview property={property} />}
      {tab === 'units' && <Units property={property} />}
      {tab === 'photos' && <Photos property={property} />}
      {tab === 'valuations' && <Valuations property={property} currency={currency} />}
      {tab === 'inspections' && <Inspections property={property} currency={currency} />}
      {tab === 'owners' && <Owners property={property} />}
      {tab === 'utilities' && <Meters property={property} />}
      {tab === 'recoveries' && <Recoveries property={property} currency={currency} />}
      {tab === 'plans' && <Plans property={property} currency={currency} />}
    </div>
  )
}

// ── Overview: management settings and custom fields ─────────────────────────

function Overview({ property }) {
  const queryClient = useQueryClient()
  const defs = useCustomFieldDefs('property')
  const portfolios = useOptions(['portfolios'], () => propertiesAPI.portfolios.list(), (p) => [p.id, p.name])
  const [form, setForm] = useState(() => ({
    portfolio: property.portfolio || '', management_fee_rate: property.management_fee_rate,
    letting_fee_percent: property.letting_fee_percent, procurement_fee_percent: property.procurement_fee_percent,
    custom_fields: { ...(property.custom_fields || {}) },
  }))
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    const res = await act(propertiesAPI.update(property.id, { ...form, portfolio: form.portfolio || null }), 'Property updated.')
    setBusy(false)
    if (res) queryClient.invalidateQueries({ queryKey: ['property', property.id] })
  }
  const setCf = (key, value) => setForm({ ...form, custom_fields: { ...form.custom_fields, [key]: value } })

  const facts = [
    ['Type', property.property_type?.name], ['Ownership', label(property.ownership_type)],
    ['Units', property.units?.length || 0], ['Floor area', property.floor_size ? `${property.floor_size} m²` : '—'],
    ['Current valuation', money(property.current_valuation, property.currency_code)],
    ['Monthly rates', money(property.rates_monthly, property.currency_code)],
  ]

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-white mb-2">Summary</h3>
        {facts.map(([k, v]) => (
          <div key={k} className="flex justify-between text-sm"><span className="text-dark-400">{k}</span><span className="text-white">{v}</span></div>
        ))}
      </div>
      <div className="card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white">Management settings</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Portfolio</label>
            <select aria-label="Portfolio" className="form-input w-full text-sm" value={form.portfolio || ''}
              onChange={(e) => setForm({ ...form, portfolio: e.target.value })}>
              <option value="">—</option>
              {portfolios.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          {[['management_fee_rate', 'Management fee %'], ['letting_fee_percent', 'Letting fee % (first month)'],
            ['procurement_fee_percent', 'Procurement fee % (maintenance)']].map(([k, l]) => (
            <div key={k}>
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">{l}</label>
              <input aria-label={l} type="number" step="any" className="form-input w-full text-sm" value={form[k] ?? ''}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </div>
          ))}
        </div>
        {defs.length > 0 && <h3 className="text-sm font-semibold text-white pt-2">Custom fields</h3>}
        <div className="grid grid-cols-2 gap-3">
          {defs.map((d) => (
            <div key={d.key}>
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">{d.label}{d.required ? ' *' : ''}</label>
              {d.field_type === 'choice' ? (
                <select aria-label={d.label} className="form-input w-full text-sm" value={form.custom_fields[d.key] ?? ''}
                  onChange={(e) => setCf(d.key, e.target.value)}>
                  <option value="">—</option>
                  {(d.choices || []).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : d.field_type === 'boolean' ? (
                <input aria-label={d.label} type="checkbox" className="block mt-2" checked={!!form.custom_fields[d.key]}
                  onChange={(e) => setCf(d.key, e.target.checked)} />
              ) : (
                <input aria-label={d.label} className="form-input w-full text-sm"
                  type={d.field_type === 'number' ? 'number' : d.field_type === 'date' ? 'date' : 'text'}
                  value={form.custom_fields[d.key] ?? ''} onChange={(e) => setCf(d.key, e.target.value)} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <button className="btn-primary" disabled={busy} onClick={save}>{busy ? <Loader2 size={14} className="animate-spin" /> : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Units ───────────────────────────────────────────────────────────────────

function Units({ property }) {
  const defs = useCustomFieldDefs('unit')
  return (
    <CrudTable label="unit" queryKey={['units']} api={propertiesAPI.units} params={{ property: property.id }}
      toPayload={packCustomFields} emptyText="No units yet. Add units to let them separately."
      columns={[
        { key: 'unit_number', label: 'Unit' },
        { key: 'unit_type', label: 'Type', render: (r) => label(r.unit_type) },
        { key: 'floor', label: 'Floor' },
        { key: 'floor_size', label: 'GLA m²', align: 'right' },
        { key: 'monthly_rental', label: 'Market rent', align: 'right', render: (r) => money(r.monthly_rental, property.currency_code) },
        { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
        { key: 'current_lease', label: 'Tenant', render: (r) => r.current_lease ? `${r.current_lease.tenant} (${r.current_lease.lease_number})` : '—' },
      ]}
      fields={[
        { key: 'unit_number', label: 'Unit number', required: true },
        { key: 'unit_type', label: 'Type', type: 'select', options: UNIT_TYPES, required: true },
        { key: 'floor', label: 'Floor' },
        { key: 'floor_size', label: 'Floor area (GLA) m²', type: 'number' },
        { key: 'bedrooms', label: 'Bedrooms', type: 'number' },
        { key: 'bathrooms', label: 'Bathrooms', type: 'number' },
        { key: 'monthly_rental', label: 'Market rent', type: 'number' },
        { key: 'status', label: 'Status', type: 'select', options: UNIT_STATUS, required: true },
        { key: 'notes', label: 'Notes', type: 'textarea', span: 4 },
        ...customFieldInputs(defs),
      ]}
      defaults={{ unit_type: 'residential', status: 'available' }} />
  )
}

// ── Photos ──────────────────────────────────────────────────────────────────

function Photos({ property }) {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['property-images', property.id], queryFn: () => propertiesAPI.images.list({ property: property.id }) })
  const images = rowsOf(data)
  const [caption, setCaption] = useState('')
  const [category, setCategory] = useState('exterior')
  const [busy, setBusy] = useState(false)
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['property-images'] })
    queryClient.invalidateQueries({ queryKey: ['properties'] })
  }

  const upload = async (files) => {
    if (!files?.length) return
    setBusy(true)
    for (const file of files) {
      const fd = new FormData()
      fd.append('property', property.id)
      fd.append('image', file)
      fd.append('caption', caption)
      fd.append('category', category)
      await act(propertiesAPI.images.upload(fd))
    }
    setBusy(false)
    setCaption('')
    toast.success('Upload finished.')
    refresh()
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Caption</label>
          <input aria-label="Caption" className="form-input w-full text-sm" value={caption} onChange={(e) => setCaption(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Category</label>
          <select aria-label="Category" className="form-input text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
            {[['exterior', 'Exterior'], ['interior', 'Interior'], ['floor_plan', 'Floor plan'], ['aerial', 'Aerial'], ['other', 'Other']]
              .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <label className="btn-primary cursor-pointer">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload photos
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
        </label>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {images.map((img) => (
          <div key={img.id} className="card overflow-hidden group">
            <img src={img.image} alt={img.caption || property.name} className="w-full h-40 object-cover" />
            <div className="p-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-white truncate">{img.caption || label(img.category)}</p>
                {img.is_primary && <p className="text-[10px] text-primary">Cover photo</p>}
              </div>
              <span className="flex items-center">
                {!img.is_primary && (
                  <button className="p-1.5 text-dark-400 hover:text-primary" title="Make cover photo" aria-label="Make cover photo"
                    onClick={async () => { if (await act(propertiesAPI.images.update(img.id, { is_primary: true }), 'Cover photo set.')) refresh() }}>
                    <Star size={14} />
                  </button>
                )}
                <RecordActions record={img} label="photo" deleteFn={propertiesAPI.images.delete} invalidate={['property-images', 'properties']} />
              </span>
            </div>
          </div>
        ))}
        {images.length === 0 && <p className="text-dark-400 text-sm col-span-full">No photos yet.</p>}
      </div>
    </div>
  )
}

// ── Valuations ──────────────────────────────────────────────────────────────

function Valuations({ property, currency }) {
  const queryClient = useQueryClient()
  return (
    <CrudTable label="valuation" queryKey={['valuations']} api={propertiesAPI.valuations} params={{ property: property.id }}
      description="The latest valuation becomes the property's current valuation."
      onSaved={() => queryClient.invalidateQueries({ queryKey: ['property', property.id] })}
      columns={[
        { key: 'valuation_date', label: 'Date', render: (r) => formatDate(r.valuation_date) },
        { key: 'valuation_amount', label: 'Value', align: 'right', render: (r) => money(r.valuation_amount, currency) },
        { key: 'method', label: 'Method' },
        { key: 'valuator_name', label: 'Valuer', render: (r) => [r.valuator_name, r.valuator_company].filter(Boolean).join(', ') || '—' },
        { key: 'report_reference', label: 'Report ref' },
      ]}
      fields={[
        { key: 'valuation_date', label: 'Date', type: 'date', required: true },
        { key: 'valuation_amount', label: 'Value', type: 'number', required: true },
        { key: 'method', label: 'Method', placeholder: 'Comparable sales, income...' },
        { key: 'valuator_name', label: 'Valuer' },
        { key: 'valuator_company', label: 'Company' },
        { key: 'report_reference', label: 'Report reference' },
        { key: 'notes', label: 'Notes', type: 'textarea', span: 2 },
      ]} />
  )
}

// ── Inspections ─────────────────────────────────────────────────────────────

function Inspections({ property, currency }) {
  const [open, setOpen] = useState(null)
  const units = useOptions(['units', { property: property.id }], () => propertiesAPI.units.list({ property: property.id }),
    (u) => [u.id, u.unit_number])
  const leases = useOptions(['leases-of', property.id], () => rentalsAPI.leases.list({ property: property.id, page_size: 200 }),
    (l) => [l.id, `${l.lease_number} - ${l.tenant_name || ''}`])

  if (open) return <InspectionDetail id={open} currency={currency} onBack={() => setOpen(null)} />
  return (
    <CrudTable label="inspection" queryKey={['inspections']} api={propertiesAPI.inspections} params={{ property: property.id }}
      columns={[
        { key: 'scheduled_date', label: 'Scheduled', render: (r) => formatDate(r.scheduled_date) },
        { key: 'inspection_type', label: 'Type', render: (r) => label(r.inspection_type) },
        { key: 'unit_number', label: 'Unit' },
        { key: 'lease_number', label: 'Lease' },
        { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
        { key: 'condition_rating', label: 'Rating', render: (r) => r.condition_rating ? `${r.condition_rating}/10` : '—' },
        { key: 'damage_total', label: 'Damages', align: 'right', render: (r) => money(r.damage_total, currency) },
      ]}
      rowActions={(r) => (
        <button className="btn-ghost text-xs px-2 py-1" onClick={() => setOpen(r.id)}><ListChecks size={14} /> Checklist</button>
      )}
      fields={[
        { key: 'inspection_type', label: 'Type', type: 'select', options: INSPECTION_TYPES, required: true },
        { key: 'scheduled_date', label: 'Scheduled', type: 'datetime', required: true },
        { key: 'unit', label: 'Unit', type: 'select', options: units },
        { key: 'lease', label: 'Lease', type: 'select', options: leases },
        { key: 'findings', label: 'Findings', type: 'textarea', span: 2 },
        { key: 'action_required', label: 'Action required', type: 'textarea', span: 2 },
      ]}
      toPayload={(p) => ({ ...p, scheduled_date: p.scheduled_date ? new Date(p.scheduled_date).toISOString() : p.scheduled_date })}
      defaults={{ inspection_type: 'routine' }} />
  )
}

function InspectionDetail({ id, currency, onBack }) {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['inspection', id], queryFn: () => propertiesAPI.inspections.detail(id) })
  const inspection = data?.data
  const [compare, setCompare] = useState(null)
  const [newItem, setNewItem] = useState({ area: '', item: '' })
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['inspection', id] })
    queryClient.invalidateQueries({ queryKey: ['inspections'] })
  }
  if (!inspection) return <Loader2 className="animate-spin text-dark-400" />
  const done = inspection.status === 'completed'

  const updateItem = async (item, patch) => {
    if (await act(propertiesAPI.inspectionItems.update(item.id, patch))) refresh()
  }
  const uploadPhoto = async (item, file) => {
    const fd = new FormData()
    fd.append('photo', file)
    if (await act(propertiesAPI.inspectionItems.uploadPhoto(item.id, fd), 'Photo added.')) refresh()
  }
  const complete = async () => {
    const rating = await promptDialog({
      title: 'Complete inspection', label: 'Overall condition rating (1-10)', inputType: 'number',
      defaultValue: String(inspection.condition_rating || ''), required: true, confirmLabel: 'Complete',
    })
    if (!rating) return
    if (await act(propertiesAPI.inspections.complete(id, { condition_rating: rating }), 'Inspection completed.')) refresh()
  }
  const addItem = async () => {
    if (!newItem.area || !newItem.item) return toast.error('Give the area and the item.')
    if (await act(propertiesAPI.inspectionItems.create({ inspection: id, ...newItem, sort_order: inspection.items.length + 1 }))) {
      setNewItem({ area: newItem.area, item: '' })
      refresh()
    }
  }

  const areas = [...new Set(inspection.items.map((i) => i.area))]
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <button className="btn-ghost p-2" aria-label="Back" onClick={onBack}><ArrowLeft size={16} /></button>
          <div>
            <h3 className="text-white font-semibold">{label(inspection.inspection_type)} inspection{inspection.unit_number ? ` · Unit ${inspection.unit_number}` : ''}</h3>
            <p className="text-xs text-dark-400">{formatDate(inspection.scheduled_date)} · <Badge value={inspection.status} /> · Damages {money(inspection.damage_total, currency)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!inspection.items.length && !done && (
            <button className="btn-secondary text-xs" onClick={async () => { if (await act(propertiesAPI.inspections.checklist(id), 'Checklist created.')) refresh() }}>
              <ListChecks size={14} /> Create standard checklist
            </button>
          )}
          {inspection.inspection_type === 'outgoing' && (
            <button className="btn-secondary text-xs" onClick={async () => { const r = await act(propertiesAPI.inspections.compare(id)); if (r) setCompare(r.data) }}>
              <GitCompare size={14} /> Compare with ingoing
            </button>
          )}
          <button className="btn-secondary text-xs" onClick={async () => { const r = await act(propertiesAPI.inspections.report(id)); if (r) saveBlob(r, 'Inspection.pdf') }}>
            <FileDown size={14} /> PDF report
          </button>
          {!done && <button className="btn-primary text-xs" onClick={complete}><CheckCircle2 size={14} /> Complete</button>}
        </div>
      </div>

      {compare && (
        <div className="card p-4 overflow-x-auto">
          <div className="flex justify-between mb-2">
            <h4 className="text-sm text-white">Ingoing vs now {compare.baseline_date ? `(ingoing ${formatDate(compare.baseline_date)})` : '(no completed ingoing inspection found)'}</h4>
            <button className="btn-ghost text-xs" onClick={() => setCompare(null)}>Close</button>
          </div>
          <table className="data-table">
            <thead><tr><th>Area</th><th>Item</th><th>Before</th><th>Now</th><th className="text-right">Repair cost</th></tr></thead>
            <tbody>
              {compare.items.map((r, i) => (
                <tr key={i} className={r.condition_before && r.condition_before !== r.condition_now ? 'bg-amber-500/5' : ''}>
                  <td className="px-4 py-2 text-sm">{r.area}</td><td className="px-4 py-2 text-sm">{r.item}</td>
                  <td className="px-4 py-2 text-sm">{label(r.condition_before)}</td><td className="px-4 py-2 text-sm">{label(r.condition_now)}</td>
                  <td className="px-4 py-2 text-sm text-right">{money(r.repair_cost, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {areas.map((area) => (
        <div key={area} className="card overflow-x-auto">
          <h4 className="text-xs font-bold uppercase tracking-wider text-dark-400 px-4 pt-3">{area}</h4>
          <table className="data-table">
            <thead><tr><th>Item</th><th>Condition</th><th>Notes</th><th className="text-right">Repair cost</th><th>Photo</th><th className="w-10"></th></tr></thead>
            <tbody>
              {inspection.items.filter((i) => i.area === area).map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2 text-sm text-white">{item.item}</td>
                  <td className="px-4 py-2">
                    <select aria-label={`Condition of ${item.item}`} disabled={done} className="form-input text-xs py-1" value={item.condition}
                      onChange={(e) => updateItem(item, { condition: e.target.value })}>
                      {CONDITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input aria-label={`Notes for ${item.item}`} disabled={done} className="form-input text-xs py-1 w-full" defaultValue={item.notes}
                      onBlur={(e) => e.target.value !== item.notes && updateItem(item, { notes: e.target.value })} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input aria-label={`Repair cost for ${item.item}`} disabled={done} type="number" step="any" className="form-input text-xs py-1 w-28 text-right"
                      defaultValue={item.repair_cost} onBlur={(e) => e.target.value !== String(item.repair_cost) && updateItem(item, { repair_cost: e.target.value || 0 })} />
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {item.photo && <a href={item.photo} target="_blank" rel="noreferrer" className="text-primary mr-2">View</a>}
                    {!done && (
                      <label className="cursor-pointer text-dark-400 hover:text-primary">
                        <Upload size={13} className="inline" />
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && uploadPhoto(item, e.target.files[0])} />
                      </label>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!done && <RecordActions record={item} label="item" deleteFn={propertiesAPI.inspectionItems.delete} onDeleted={refresh} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {!done && (
        <div className="card p-3 flex flex-wrap gap-2 items-end">
          <input aria-label="Area" placeholder="Area (e.g. Kitchen)" className="form-input text-sm w-48" value={newItem.area}
            onChange={(e) => setNewItem({ ...newItem, area: e.target.value })} />
          <input aria-label="Item" placeholder="Item (e.g. Oven)" className="form-input text-sm w-48" value={newItem.item}
            onChange={(e) => setNewItem({ ...newItem, item: e.target.value })} />
          <button className="btn-secondary text-xs" onClick={addItem}>Add item</button>
        </div>
      )}
    </div>
  )
}

// ── Owners (shares) ─────────────────────────────────────────────────────────

function Owners({ property }) {
  const owners = useOptions(['contacts-all'], () => crmAPI.contacts.list({ page_size: 500 }), (c) => [c.id, `${c.first_name} ${c.last_name}`.trim()])
  const { data } = useQuery({ queryKey: ['ownerships', { property: property.id }], queryFn: () => propertiesAPI.ownerships.list({ property: property.id }) })
  const total = rowsOf(data).reduce((s, o) => s + parseFloat(o.share_percent || 0), 0)
  return (
    <CrudTable label="owner share" queryKey={['ownerships']} api={propertiesAPI.ownerships} params={{ property: property.id }}
      description={`For co-owned managed properties. Rent, costs and payouts are split by share. Allocated: ${total.toFixed(2)}%.`}
      emptyText={property.owner ? 'No shares set: the property owner on the property record receives 100%.' : 'No owners recorded.'}
      columns={[
        { key: 'owner_name', label: 'Owner' },
        { key: 'share_percent', label: 'Share %', align: 'right' },
      ]}
      fields={[
        { key: 'owner', label: 'Owner', type: 'select', options: owners, required: true },
        { key: 'share_percent', label: 'Share %', type: 'number', required: true },
      ]} />
  )
}

// ── Meters and readings ─────────────────────────────────────────────────────

function Meters({ property }) {
  const [meter, setMeter] = useState(null)
  const [recon, setRecon] = useState(null)
  const units = useOptions(['units', { property: property.id }], () => propertiesAPI.units.list({ property: property.id }), (u) => [u.id, u.unit_number])
  const tariffs = useOptions(['tariffs'], () => propmanAPI.tariffs.list({ is_active: true }), (t) => [t.id, t.name])
  const bulks = useOptions(['meters', 'bulk', property.id], () => propmanAPI.meters.list({ property: property.id }),
    (m) => [m.id, `${m.serial_number}${m.unit ? '' : ' (bulk)'}`])

  return (
    <div className="space-y-6">
      <CrudTable label="meter" queryKey={['meters']} api={propmanAPI.meters} params={{ property: property.id }}
        description="Unit meters are recharged to the tenant on the next rent invoice. Leave the unit empty for a bulk (supply) meter."
        columns={[
          { key: 'serial_number', label: 'Serial' },
          { key: 'utility', label: 'Utility', render: (r) => label(r.utility) },
          { key: 'unit_number', label: 'Unit', render: (r) => r.unit_number || 'Bulk' },
          { key: 'tariff_name', label: 'Tariff' },
          { key: 'last_reading', label: 'Last reading', render: (r) => r.last_reading ? `${r.last_reading.reading} on ${formatDate(r.last_reading.date)}` : '—' },
        ]}
        rowActions={(r) => (
          <>
            <button className="btn-ghost text-xs px-2 py-1" onClick={() => { setMeter(r); setRecon(null) }}>Readings</button>
            {!r.unit && (
              <button className="btn-ghost text-xs px-2 py-1" onClick={async () => {
                const res = await act(propmanAPI.meters.reconciliation(r.id))
                if (res) { setRecon(res.data); setMeter(null) }
              }}>Reconcile</button>
            )}
          </>
        )}
        fields={[
          { key: 'utility', label: 'Utility', type: 'select', options: UTILITIES, required: true },
          { key: 'serial_number', label: 'Serial number', required: true },
          { key: 'unit', label: 'Unit (empty = bulk)', type: 'select', options: units },
          { key: 'tariff', label: 'Tariff', type: 'select', options: tariffs },
          { key: 'bulk_meter', label: 'Falls under bulk meter', type: 'select', options: bulks },
          { key: 'multiplier', label: 'Multiplier', type: 'number' },
          { key: 'installed_on', label: 'Installed', type: 'date' },
          { key: 'is_active', label: 'Active', type: 'checkbox' },
        ]}
        defaults={{ utility: 'electricity', multiplier: 1, is_active: true }} />

      {meter && (
        <CrudTable title={`Readings: ${meter.serial_number}`} label="reading" queryKey={['readings']} api={propmanAPI.readings}
          params={{ meter: meter.id }} canEdit={false}
          description="Consumption is worked out from the previous reading. Unbilled readings go on the next rent invoice."
          columns={[
            { key: 'reading_date', label: 'Date', render: (r) => formatDate(r.reading_date) },
            { key: 'reading', label: 'Reading', align: 'right' },
            { key: 'consumption', label: 'Consumption', align: 'right' },
            { key: 'is_estimate', label: 'Estimate', render: (r) => (r.is_estimate ? 'Yes' : '') },
            { key: 'billed_invoice_number', label: 'Billed on', render: (r) => r.billed_invoice_number || 'Not yet' },
          ]}
          fields={[
            { key: 'reading_date', label: 'Date', type: 'date', required: true },
            { key: 'reading', label: 'Reading', type: 'number', required: true },
            { key: 'is_estimate', label: 'Estimated', type: 'checkbox' },
            { key: 'notes', label: 'Notes' },
          ]} />
      )}

      {recon && (
        <div className="card p-4 space-y-2">
          <div className="flex justify-between">
            <h3 className="text-sm text-white font-semibold">Bulk meter {recon.bulk_meter}: {recon.from} to {recon.to}</h3>
            <button className="btn-ghost text-xs" onClick={() => setRecon(null)}>Close</button>
          </div>
          <p className="text-sm text-dark-300">
            Bulk {recon.bulk_consumption} · sub-meters {recon.sub_meter_total} · difference {recon.difference}
            {recon.loss_percent !== null && ` (${recon.loss_percent}% common area / loss)`}
          </p>
          <table className="data-table">
            <thead><tr><th>Sub-meter</th><th>Unit</th><th className="text-right">Consumption</th></tr></thead>
            <tbody>{recon.sub_meters.map((s) => (
              <tr key={s.meter}><td className="px-4 py-2 text-sm">{s.meter}</td><td className="px-4 py-2 text-sm">{s.unit || '—'}</td>
                <td className="px-4 py-2 text-sm text-right">{s.consumption}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Recoveries ──────────────────────────────────────────────────────────────

function Recoveries({ property, currency }) {
  const [schedule, setSchedule] = useState(null)
  const accounts = useOptions(['accounts', 'income'], () => financeAPI.accounts.list({ account_type: 'revenue', page_size: 500 }),
    (a) => [a.id, `${a.code} ${a.name}`])
  return (
    <div className="space-y-6">
      <CrudTable label="recovery schedule" queryKey={['recovery-schedules']} api={propmanAPI.recoverySchedules}
        params={{ property: property.id }}
        description="Operating costs, rates, insurance and the like, billed monthly on account and reconciled to actual cost."
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'category', label: 'Category', render: (r) => label(r.category) },
          { key: 'basis', label: 'Basis', render: (r) => label(r.basis) },
          { key: 'effective_budget', label: 'Annual budget', align: 'right', render: (r) => money(r.effective_budget, currency) },
          { key: 'shares', label: 'Leases', align: 'right', render: (r) => r.shares.length },
        ]}
        rowActions={(r) => <button className="btn-ghost text-xs px-2 py-1" onClick={() => setSchedule(r)}>Leases & reconcile</button>}
        fields={[
          { key: 'name', label: 'Name', required: true },
          { key: 'category', label: 'Category', type: 'select', required: true, options: [['operating', 'Operating costs'],
            ['rates', 'Rates and taxes'], ['insurance', 'Insurance'], ['security', 'Security'], ['cleaning', 'Cleaning'], ['other', 'Other']] },
          { key: 'basis', label: 'Apportion by', type: 'select', required: true,
            options: [['area', 'Floor area (GLA)'], ['percent', 'Fixed % per lease'], ['equal', 'Equally']] },
          { key: 'year_start', label: 'Year starts', type: 'date', required: true },
          { key: 'annual_budget', label: 'Annual budget', type: 'number' },
          { key: 'use_property_rates', label: "Use the property's rates x 12", type: 'checkbox' },
          { key: 'recoverable_percent', label: 'Recoverable %', type: 'number' },
          { key: 'income_account', label: 'Income account (default 4920)', type: 'select', options: accounts },
          { key: 'vat_applicable', label: 'VAT applies', type: 'checkbox' },
          { key: 'is_active', label: 'Active', type: 'checkbox' },
        ]}
        defaults={{ category: 'operating', basis: 'area', recoverable_percent: 100, is_active: true }} />
      {schedule && <RecoveryDetail schedule={schedule} property={property} currency={currency} onClose={() => setSchedule(null)} />}
    </div>
  )
}

function RecoveryDetail({ schedule, property, currency, onClose }) {
  const queryClient = useQueryClient()
  const leases = useOptions(['leases-of', property.id], () => rentalsAPI.leases.list({ property: property.id, page_size: 200 }),
    (l) => [l.id, `${l.lease_number} - ${l.tenant_name || ''}`])
  const today = new Date().toISOString().slice(0, 10)
  const [period, setPeriod] = useState({ from_date: schedule.year_start, to_date: today })
  const [preview, setPreview] = useState(null)
  const { data: history } = useQuery({ queryKey: ['recovery-recs', schedule.id], queryFn: () => propmanAPI.recoveryReconciliations.list({ schedule: schedule.id }) })

  const run = async (post) => {
    if (post && !(await confirmDialog({ title: 'Post the reconciliation?', message: 'Under-recoveries are invoiced and over-recoveries credited to each tenant.', confirmLabel: 'Post', tone: 'warning' }))) return
    const res = post
      ? await act(propmanAPI.recoverySchedules.reconcile(schedule.id, { ...period, post: true }), 'Reconciliation posted.')
      : await act(propmanAPI.recoverySchedules.preview(schedule.id, period))
    if (res) {
      setPreview(res.data)
      if (post) queryClient.invalidateQueries({ queryKey: ['recovery-recs', schedule.id] })
    }
  }

  return (
    <div className="space-y-4 border-t border-white/5 pt-4">
      <div className="flex justify-between">
        <h3 className="text-white font-semibold">{schedule.name}</h3>
        <button className="btn-ghost text-xs" onClick={onClose}>Close</button>
      </div>
      <CrudTable label="participating lease" queryKey={['recovery-shares']} api={propmanAPI.recoveryShares}
        params={{ schedule: schedule.id }}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['recovery-schedules'] })}
        columns={[
          { key: 'lease_label', label: 'Lease' },
          { key: 'area', label: 'GLA m²', align: 'right' },
          { key: 'percent', label: 'Fixed %', align: 'right' },
        ]}
        fields={[
          { key: 'lease', label: 'Lease', type: 'select', options: leases, required: true },
          { key: 'percent', label: 'Share % (percentage basis only)', type: 'number' },
        ]} />
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          {[['from_date', 'From'], ['to_date', 'To']].map(([k, l]) => (
            <div key={k}>
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">{l}</label>
              <input aria-label={l} type="date" className="form-input text-sm" value={period[k]} onChange={(e) => setPeriod({ ...period, [k]: e.target.value })} />
            </div>
          ))}
          <button className="btn-secondary text-xs" onClick={() => run(false)}>Preview</button>
          <button className="btn-primary text-xs" onClick={() => run(true)}>Post reconciliation</button>
        </div>
        {preview && (
          <>
            <p className="text-sm text-dark-300">Actual cost {money(preview.actual_cost, currency)} · recoverable {money(preview.recoverable_cost, currency)} · billed on account {money(preview.billed_on_account, currency)}</p>
            <table className="data-table">
              <thead><tr><th>Lease</th><th>Tenant</th><th className="text-right">Share %</th><th className="text-right">Due</th><th className="text-right">Billed</th><th className="text-right">Difference</th></tr></thead>
              <tbody>{(preview.lines || []).map((l) => (
                <tr key={l.lease}>
                  <td className="px-4 py-2 text-sm">{l.lease_number}</td><td className="px-4 py-2 text-sm">{l.tenant}</td>
                  <td className="px-4 py-2 text-sm text-right">{l.share}</td><td className="px-4 py-2 text-sm text-right">{money(l.due, currency)}</td>
                  <td className="px-4 py-2 text-sm text-right">{money(l.billed, currency)}</td>
                  <td className={`px-4 py-2 text-sm text-right ${parseFloat(l.difference) > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{money(l.difference, currency)}</td>
                </tr>
              ))}</tbody>
            </table>
          </>
        )}
        {rowsOf(history).length > 0 && (
          <div>
            <h4 className="text-xs uppercase text-dark-400 font-bold mb-1">Posted reconciliations</h4>
            {rowsOf(history).map((h) => (
              <p key={h.id} className="text-xs text-dark-300">{formatDate(h.period_start)} – {formatDate(h.period_end)}: recoverable {money(h.recoverable_cost, currency)}, billed {money(h.billed_on_account, currency)}{h.posted ? ' (posted)' : ''}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Planned maintenance ─────────────────────────────────────────────────────

function Plans({ property, currency }) {
  const units = useOptions(['units', { property: property.id }], () => propertiesAPI.units.list({ property: property.id }), (u) => [u.id, u.unit_number])
  const suppliers = useOptions(['suppliers-all'], () => financeAPI.ap.suppliers.list({ page_size: 500 }), (s) => [s.id, s.name])
  const [busy, setBusy] = useState(false)
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button className="btn-secondary text-xs" disabled={busy} onClick={async () => {
          setBusy(true)
          const res = await act(propmanAPI.plans.run(), (r) => r.data.result || 'Done.')
          setBusy(false)
          return res
        }}>Raise due jobs now</button>
      </div>
      <CrudTable label="maintenance plan" queryKey={['maintenance-plans']} api={propmanAPI.plans} params={{ property: property.id }}
        description="Preventive jobs (lift service, generator, gutters...) are raised automatically before they fall due."
        columns={[
          { key: 'title', label: 'Job' },
          { key: 'frequency_months', label: 'Every', render: (r) => `${r.frequency_months} month(s)` },
          { key: 'next_due', label: 'Next due', render: (r) => formatDate(r.next_due) },
          { key: 'contractor_name', label: 'Contractor' },
          { key: 'estimated_cost', label: 'Estimate', align: 'right', render: (r) => money(r.estimated_cost, currency) },
          { key: 'is_active', label: 'Active', render: (r) => (r.is_active ? 'Yes' : 'No') },
        ]}
        fields={[
          { key: 'title', label: 'Job', required: true },
          { key: 'category', label: 'Category', required: true },
          { key: 'unit', label: 'Unit', type: 'select', options: units },
          { key: 'frequency_months', label: 'Every (months)', type: 'number', required: true },
          { key: 'next_due', label: 'Next due', type: 'date', required: true },
          { key: 'lead_days', label: 'Raise days before', type: 'number' },
          { key: 'contractor', label: 'Contractor', type: 'select', options: suppliers },
          { key: 'estimated_cost', label: 'Estimated cost', type: 'number' },
          { key: 'priority', label: 'Priority', type: 'select', options: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['emergency', 'Emergency']] },
          { key: 'is_active', label: 'Active', type: 'checkbox' },
          { key: 'description', label: 'Description', type: 'textarea', span: 4 },
        ]}
        defaults={{ category: 'General', frequency_months: 12, lead_days: 14, priority: 'medium', is_active: true }} />
    </div>
  )
}

