// Audit trail: every change made through the system, who made it and when.
import { Fragment, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ChevronDown, ChevronRight } from 'lucide-react'
import { adminAPI } from '@/services/api'
import Pagination from '@/components/common/Pagination'

const ACTIONS = [
  ['', 'All actions'], ['create', 'Create'], ['update', 'Update'], ['delete', 'Delete'], ['post', 'Post'],
  ['approve', 'Approve'], ['reject', 'Reject'], ['export', 'Export'], ['login', 'Sign in'], ['logout', 'Sign out'],
]
const ACTION_BADGE = {
  create: 'badge-green', update: 'badge-blue', delete: 'badge-red', post: 'badge-gold', approve: 'badge-green',
  reject: 'badge-red', login: 'badge-gray', logout: 'badge-gray', export: 'badge-purple',
}

const when = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function Changes({ changes }) {
  const entries = Object.entries(changes || {})
  if (!entries.length) return <p className="text-xs text-dark-500">No details recorded.</p>
  return (
    <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-1 text-xs">
      {entries.map(([key, value]) => (
        <Fragment key={key}>
          <dt className="text-dark-400 font-mono">{key}</dt>
          <dd className="text-dark-300 font-mono break-all">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

export default function AuditLogView() {
  const [filters, setFilters] = useState({ search: '', action: '', model_name: '', from_date: '', to_date: '' })
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(null)
  const set = (key, value) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1) }

  const params = Object.fromEntries(Object.entries({ ...filters, page }).filter(([, v]) => v !== ''))
  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', params],
    queryFn: async () => (await adminAPI.auditLogs.list(params)).data,
    placeholderData: (previous) => previous,
  })
  const { data: models = [] } = useQuery({
    queryKey: ['audit-log-models'],
    queryFn: async () => (await adminAPI.auditLogs.models()).data,
  })
  const rows = data?.results || []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
          <input className="form-input pl-9" placeholder="Search record, user or reference..." aria-label="Search the audit log"
            value={filters.search} onChange={(e) => set('search', e.target.value)} />
        </div>
        <select className="form-input w-auto" aria-label="Action" value={filters.action} onChange={(e) => set('action', e.target.value)}>
          {ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="form-input w-auto" aria-label="Record type" value={filters.model_name} onChange={(e) => set('model_name', e.target.value)}>
          <option value="">All record types</option>
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <label className="text-xs text-dark-400">From
          <input type="date" className="form-input w-auto ml-2" value={filters.from_date} onChange={(e) => set('from_date', e.target.value)} />
        </label>
        <label className="text-xs text-dark-400">To
          <input type="date" className="form-input w-auto ml-2" value={filters.to_date} onChange={(e) => set('to_date', e.target.value)} />
        </label>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-8" />
              <th>When</th>
              <th>User</th>
              <th>Action</th>
              <th>Record</th>
              <th>IP address</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr className="cursor-pointer" onClick={() => setOpen(open === row.id ? null : row.id)}>
                  <td className="text-dark-500">{open === row.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                  <td className="whitespace-nowrap text-xs">{when(row.timestamp)}</td>
                  <td className="text-sm text-white">{row.user_name || row.user_email || 'System'}</td>
                  <td><span className={`${ACTION_BADGE[row.action] || 'badge-gray'} text-[10px] uppercase`}>{row.action}</span>
                    {row.changes?.action && <span className="ml-2 text-[11px] text-dark-400 font-mono">{row.changes.action}</span>}
                  </td>
                  <td className="text-sm">
                    <span className="text-white">{row.model_name}</span>
                    {row.object_repr && <span className="text-dark-400"> · {row.object_repr}</span>}
                  </td>
                  <td className="text-xs font-mono">{row.ip_address || '—'}</td>
                </tr>
                {open === row.id && (
                  <tr>
                    <td />
                    <td colSpan={5} className="bg-white/[0.02]">
                      <Changes changes={row.changes} />
                      {row.user_agent && <p className="text-[11px] text-dark-500 mt-2 break-all">{row.user_agent}</p>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!rows.length && !isLoading && (
              <tr><td colSpan={6} className="text-center py-12 text-dark-400">No audit entries match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination currentPage={page} totalPages={data?.total_pages} totalCount={data?.count} onPageChange={setPage} />
    </div>
  )
}
