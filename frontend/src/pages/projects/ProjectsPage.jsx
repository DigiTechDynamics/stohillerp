// Development projects: cost accumulation in WIP and capitalisation.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { HardHat, Plus, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { apiErrorMessage, financeAPI, projectsAPI, propertiesAPI } from '@/services/api'
import { formatCurrency, formatDate, getStatusColor } from '@/utils/format'
import RecordActions from '@/components/common/RecordActions'

const today = () => new Date().toISOString().split('T')[0]
const rows = (res) => res?.data?.results || res?.data || []
const TARGETS = { inventory: 'Property inventory (for sale)', fixed_asset: 'Fixed asset (held / investment)' }

function ProjectForm({ project, onDone }) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(project
    ? { code: project.code, name: project.name, property: project.property || '', status: project.status,
        start_date: project.start_date || '', end_date: project.end_date || '', budget: project.budget,
        capitalise_to: project.capitalise_to, notes: project.notes || '' }
    : { code: '', name: '', property: '', status: 'active', start_date: today(), end_date: '', budget: '', capitalise_to: 'inventory', notes: '' })
  const { data: propsRes } = useQuery({ queryKey: ['properties-picker'], queryFn: () => propertiesAPI.list({ page_size: 200 }) })
  const save = async () => {
    setBusy(true)
    try {
      const payload = { ...form, property: form.property || null, start_date: form.start_date || null,
        end_date: form.end_date || null, budget: form.budget || '0' }
      if (project) delete payload.code      // the code is also the cost centre's code
      const { data } = project ? await projectsAPI.update(project.id, payload) : await projectsAPI.create(payload)
      toast.success(project ? `Project ${data.code} updated.` : `Project ${data.code} created with cost centre ${data.cost_center_code}.`)
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      onDone(data)
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="card p-5 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-white font-semibold">{project ? `Edit ${project.code}` : 'New development project'}</h2>
        <button className="btn-ghost p-1" aria-label="Close" onClick={() => onDone(null)}><X size={16} /></button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <input className="form-input" placeholder="Code (e.g. PRJ-001)" aria-label="Project code" disabled={!!project} value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
        <input className="form-input lg:col-span-2" placeholder="Name" aria-label="Project name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <input type="number" step="0.01" className="form-input" placeholder="Budget" aria-label="Budget" value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })} />
        {project && (
          <select className="form-input" aria-label="Status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            <option value="planning">Planning</option><option value="active">In progress</option><option value="cancelled">Cancelled</option>
          </select>
        )}
        <select className="form-input" aria-label="Property" value={form.property} onChange={e => setForm({ ...form, property: e.target.value })}>
          <option value="">Property (optional)...</option>
          {rows(propsRes).map(p => <option key={p.id} value={p.id}>{p.reference_number} - {p.name}</option>)}
        </select>
        <select className="form-input" aria-label="Capitalise to" value={form.capitalise_to} onChange={e => setForm({ ...form, capitalise_to: e.target.value })}>
          {Object.entries(TARGETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="text-xs text-dark-400">Start<input type="date" className="form-input" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></label>
        <label className="text-xs text-dark-400">Planned end<input type="date" className="form-input" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></label>
      </div>
      <p className="text-xs text-dark-500">Costs posted to the project's cost centre build up in Development Work in Progress (1540) until capitalised.</p>
      <div className="flex justify-end">
        <button className="btn-primary" disabled={busy || !form.code || !form.name} onClick={save}>Create project</button>
      </div>
    </div>
  )
}

function ProjectDetail({ project, onClose, onEdit }) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [cap, setCap] = useState(null)
  const { data } = useQuery({ queryKey: ['project-cost', project.id], queryFn: () => projectsAPI.costReport(project.id) })
  const { data: catsRes } = useQuery({ queryKey: ['asset-categories'], queryFn: () => financeAPI.fixedAssets.categories.list(), enabled: cap?.target === 'fixed_asset' })
  const r = data?.data
  const pct = r?.percent_of_budget ? Math.min(parseFloat(r.percent_of_budget), 100) : 0

  const capitalise = async () => {
    setBusy(true)
    try {
      const { data: res } = await projectsAPI.capitalise(project.id, {
        date: cap.date, amount: cap.amount || undefined, target: cap.target,
        asset_category: cap.asset_category || undefined, useful_life_months: cap.useful_life_months || undefined,
      })
      toast.success(`Capitalised ${formatCurrency(res.amount)} (${res.journal_entry})` + (res.fixed_asset ? `, asset ${res.fixed_asset}.` : '.'))
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project-cost', project.id] })
      setCap(null)
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card p-5 space-y-5">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-mono text-primary text-sm">{project.code} · cost centre {project.cost_center_code}</p>
          <h2 className="text-xl text-white font-semibold">{project.name}</h2>
          <p className="text-xs text-dark-400">{project.property_name || 'No property'} · capitalises to {TARGETS[project.capitalise_to]}</p>
        </div>
        <span className="flex items-center gap-1">
          <RecordActions record={project} label="project" onEdit={onEdit}
            deleteFn={projectsAPI.delete} invalidate={['projects']} onDeleted={onClose} />
          <button className="btn-ghost p-1" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </span>
      </div>
      {r && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[['Budget', r.budget], ['Cost to date', r.cost_to_date], ['Open commitments (POs)', r.open_commitments],
              ['In WIP', r.wip_balance], ['Capitalised', r.capitalised]].map(([label, value]) => (
              <div key={label} className="p-3 rounded-xl bg-white/5 border border-white/5">
                <p className="text-[10px] text-dark-500 uppercase tracking-widest">{label}</p>
                <p className="text-white font-semibold">{formatCurrency(value)}</p>
              </div>
            ))}
          </div>
          {parseFloat(r.budget) > 0 && (
            <div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div className={`h-full ${parseFloat(r.remaining_budget) < 0 ? 'bg-rose-500' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-dark-400 mt-1">{r.percent_of_budget}% of budget spent · {formatCurrency(r.remaining_budget)} remaining</p>
            </div>
          )}
          {r.by_account.length > 0 && (
            <table className="data-table">
              <thead><tr><th>Account</th><th className="text-right">Cost</th></tr></thead>
              <tbody>
                {r.by_account.map(a => (
                  <tr key={a.code}><td className="px-3 py-2 text-xs"><span className="font-mono text-dark-400">{a.code}</span> {a.name}</td><td className="px-3 py-2 text-xs text-right">{formatCurrency(a.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {['active', 'planning'].includes(project.status) && parseFloat(project.wip_balance) > 0 && !cap && (
        <button className="btn-primary" onClick={() => setCap({ date: today(), amount: '', target: project.capitalise_to, asset_category: '', useful_life_months: '' })}>
          Capitalise WIP
        </button>
      )}
      {cap && (
        <div className="bg-dark-800/50 border border-white/5 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-bold text-dark-400 uppercase tracking-widest">Capitalise work in progress</h3>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
            <input type="date" className="form-input text-xs" aria-label="Capitalisation date" value={cap.date} onChange={e => setCap({ ...cap, date: e.target.value })} />
            <input type="number" step="0.01" className="form-input text-xs" placeholder={`All (${project.wip_balance})`} aria-label="Amount to capitalise" value={cap.amount} onChange={e => setCap({ ...cap, amount: e.target.value })} />
            <select className="form-input text-xs" aria-label="Capitalise to" value={cap.target} onChange={e => setCap({ ...cap, target: e.target.value })}>
              {Object.entries(TARGETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {cap.target === 'fixed_asset' && (
              <>
                <select className="form-input text-xs" aria-label="Asset category" value={cap.asset_category} onChange={e => setCap({ ...cap, asset_category: e.target.value })}>
                  <option value="">Asset category...</option>
                  {rows(catsRes).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input type="number" className="form-input text-xs" placeholder="Useful life (months)" aria-label="Useful life in months" value={cap.useful_life_months} onChange={e => setCap({ ...cap, useful_life_months: e.target.value })} />
              </>
            )}
          </div>
          <p className="text-xs text-dark-500">
            {cap.target === 'inventory'
              ? 'Moves the cost into property inventory and adds it to the property\'s cost price.'
              : 'Creates a fixed asset (with a statutory depreciation book) from the WIP cost.'}
            {' '}Capitalising the full balance completes the project.
          </p>
          <div className="flex gap-2">
            <button className="btn-primary text-xs" disabled={busy || (cap.target === 'fixed_asset' && !cap.asset_category)} onClick={capitalise}>Post capitalisation</button>
            <button className="btn-ghost text-xs" onClick={() => setCap(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ProjectsPage() {
  const [creating, setCreating] = useState(null)   // null, 'new', or the project being edited
  const [selected, setSelected] = useState(null)
  const [status, setStatus] = useState('')
  const { data, isLoading } = useQuery({ queryKey: ['projects', status], queryFn: () => projectsAPI.list({ status: status || undefined, page_size: 200 }) })
  const projects = rows(data)
  const current = selected && projects.find(p => p.id === selected)

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-white">Development Projects</h1>
          <p className="text-dark-400 text-sm mt-1">Budget, cost to date and capitalisation of development work in progress</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => { setCreating('new'); setSelected(null) }}>
          <Plus size={16} /> New Project
        </button>
      </div>
      {creating && (
        <ProjectForm key={creating === 'new' ? 'new' : creating.id} project={creating === 'new' ? null : creating}
          onDone={(p) => { setCreating(null); if (p) setSelected(p.id) }} />
      )}
      {current && !creating && (
        <ProjectDetail key={current.id} project={current} onClose={() => setSelected(null)} onEdit={() => setCreating(current)} />
      )}
      <select className="form-input w-auto" aria-label="Status filter" value={status} onChange={e => setStatus(e.target.value)}>
        <option value="">All statuses</option>
        <option value="planning">Planning</option><option value="active">In progress</option>
        <option value="completed">Completed</option><option value="cancelled">Cancelled</option>
      </select>
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Code</th><th>Name</th><th>Property</th><th>Started</th><th>Status</th><th className="text-right">Budget</th><th className="text-right">In WIP</th><th className="w-24"></th></tr></thead>
          <tbody>
            {projects.map(p => (
              <tr key={p.id} className={`cursor-pointer hover:bg-white/2 ${selected === p.id ? 'bg-primary/5' : ''}`} onClick={() => { setSelected(p.id); setCreating(null) }}>
                <td className="px-4 py-3 font-mono text-xs text-primary">{p.code}</td>
                <td className="px-4 py-3 text-sm text-white">{p.name}</td>
                <td className="px-4 py-3 text-xs text-dark-400">{p.property_name || '—'}</td>
                <td className="px-4 py-3 text-xs text-dark-400">{p.start_date ? formatDate(p.start_date) : '—'}</td>
                <td className="px-4 py-3"><span className={`badge text-[10px] uppercase font-bold ${getStatusColor(p.status)}`}>{p.status}</span></td>
                <td className="px-4 py-3 text-sm text-right">{formatCurrency(p.budget)}</td>
                <td className="px-4 py-3 text-sm text-right text-white">{formatCurrency(p.wip_balance)}</td>
                <td className="px-4 py-3 text-right">
                  <RecordActions record={p} label="project" onEdit={() => { setSelected(null); setCreating(p) }}
                    deleteFn={projectsAPI.delete} invalidate={['projects']}
                    onDeleted={() => setSelected(s => (s === p.id ? null : s))} />
                </td>
              </tr>
            ))}
            {!isLoading && projects.length === 0 && (
              <tr><td colSpan={8} className="text-center py-16">
                <HardHat size={40} className="mx-auto mb-3 text-dark-600" />
                <p className="text-dark-400">No development projects.</p>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
