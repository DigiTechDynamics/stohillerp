import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { apiErrorMessage } from '@/services/api'
import RecordActions from '@/components/common/RecordActions'

// A list with an add/edit form and edit/delete per row, driven by config.
//
//   api       { list(params), create(data), update(id, data), delete(id) }
//   params    list filter, also merged into new records (e.g. { property: id })
//   columns   [{ key, label, render?(row), align? }]
//   fields    [{ key, label, type?: text|number|date|datetime|select|multiselect|checkbox|textarea|custom, options?: [[value, label]],
//               required?, placeholder?, span?, readOnlyOnEdit?, nullable?, get?(row), blank?, render?({ value, onChange }) }]
//             a custom field draws its own input with render(); `blank` is its empty value
//             a blank number is left out (server default) unless the field is nullable
//   rowActions(row)  extra buttons per row
const rows = (res) => res?.data?.results || res?.data || []

function Field({ field, value, onChange }) {
  const common = { 'aria-label': field.label, className: 'form-input w-full text-sm', placeholder: field.placeholder || '' }
  switch (field.type) {
    case 'custom':
      return field.render({ value, onChange })
    case 'select':
      return (
        <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          {!field.required && <option value="">—</option>}
          {field.required && value in { '': 1, null: 1, undefined: 1 } && <option value="">Choose…</option>}
          {(field.options || []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      )
    case 'multiselect':
      return (
        <select {...common} multiple size={Math.min(6, Math.max(3, (field.options || []).length))} value={value || []}
          onChange={(e) => onChange([...e.target.selectedOptions].map((o) => o.value))}>
          {(field.options || []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      )
    case 'checkbox':
      return (
        <label className="flex items-center gap-2 text-sm text-dark-300 h-full">
          <input type="checkbox" aria-label={field.label} checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          {field.label}
        </label>
      )
    case 'textarea':
      return <textarea {...common} rows={2} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    default:
      return (
        <input {...common} type={field.type === 'datetime' ? 'datetime-local' : field.type || 'text'}
          step={field.type === 'number' ? 'any' : undefined} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      )
  }
}

export default function CrudTable({
  title, queryKey, api, params = {}, columns, fields, rowActions, emptyText = 'Nothing here yet.',
  label = 'record', canAdd = true, canEdit = true, canDelete = true, defaults = {}, toPayload, onSaved, description, compact = false,
}) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: [...queryKey, params], queryFn: () => api.list({ page_size: 200, ...params }) })
  const [form, setForm] = useState(null)        // null | { id?, ...values }
  const [busy, setBusy] = useState(false)
  const items = rows(data)

  const refresh = () => queryClient.invalidateQueries({ queryKey })
  const blank = (f) => ('blank' in f ? f.blank : f.type === 'checkbox' ? false : f.type === 'multiselect' ? [] : '')
  const startAdd = () => setForm({ ...Object.fromEntries(fields.map((f) => [f.key, blank(f)])), ...defaults })
  const startEdit = (row) => setForm({ id: row.id, ...Object.fromEntries(fields.map((f) => [f.key, (f.get ? f.get(row) : row[f.key]) ?? blank(f)])) })

  const save = async () => {
    const missing = fields.filter((f) => f.required && (form[f.key] === '' || form[f.key] === null || form[f.key] === undefined))
    if (missing.length) {
      toast.error(`Please fill in: ${missing.map((f) => f.label).join(', ')}.`)
      return
    }
    const { id, ...values } = form
    let payload = { ...params, ...values }
    for (const f of fields) {
      if (payload[f.key] !== '' || f.type === 'text' || f.type === 'textarea' || f.type === undefined) continue
      // A blank number is left out so the server keeps its default (e.g. rate 0), since most
      // number columns can't hold "no value"; mark a field `nullable` to clear it instead.
      if (f.type === 'number' && !f.nullable) delete payload[f.key]
      else payload[f.key] = null
    }
    if (toPayload) payload = toPayload(payload, !!id)
    setBusy(true)
    try {
      const res = id ? await api.update(id, payload) : await api.create(payload)
      toast.success(`${label.charAt(0).toUpperCase()}${label.slice(1)} ${id ? 'updated' : 'added'}.`)
      setForm(null)
      refresh()
      onSaved?.(res.data)
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {(title || canAdd) && (
        <div className="flex items-center justify-between gap-2">
          <div>
            {title && <h3 className="text-sm font-semibold text-white">{title}</h3>}
            {description && <p className="text-xs text-dark-400">{description}</p>}
          </div>
          {canAdd && !form && <button className="btn-primary text-xs" onClick={startAdd}><Plus size={14} /> Add {label}</button>}
        </div>
      )}
      {form && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm text-white font-medium">{form.id ? `Edit ${label}` : `New ${label}`}</h4>
            <button className="btn-ghost p-1" aria-label="Close form" onClick={() => setForm(null)}><X size={16} /></button>
          </div>
          <div className={`grid grid-cols-2 ${compact ? '' : 'lg:grid-cols-4'} gap-3`}>
            {fields.map((f) => (
              <div key={f.key} className={f.span === 2 ? 'col-span-2' : f.span === 4 ? (compact ? 'col-span-2' : 'col-span-2 lg:col-span-4') : ''}>
                {f.type !== 'checkbox' && <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">{f.label}{f.required ? ' *' : ''}</label>}
                {form.id && f.readOnlyOnEdit
                  ? <p className="text-sm text-dark-300 py-2">{String(form[f.key] ?? '—')}</p>
                  : <Field field={f} value={form[f.key]} onChange={(v) => setForm({ ...form, [f.key]: v })} />}
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn-primary" disabled={busy} onClick={save}>{busy ? <Loader2 size={14} className="animate-spin" /> : 'Save'}</button>
          </div>
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c) => <th key={c.key} className={c.align === 'right' ? 'text-right' : ''}>{c.label}</th>)}
              <th className="w-32"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-2.5 text-sm ${c.align === 'right' ? 'text-right' : ''}`}>
                    {c.render ? c.render(row) : (row[c.key] ?? '—')}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  {rowActions?.(row)}
                  <RecordActions record={row} label={label} onEdit={canEdit && api.update ? startEdit : undefined}
                    deleteFn={canDelete ? api.delete : undefined} invalidate={[queryKey[0]]} />
                </td>
              </tr>
            ))}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="text-center py-8 text-dark-400 text-sm">{emptyText}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
