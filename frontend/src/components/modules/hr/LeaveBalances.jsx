// Leave balances under Zimbabwe's Labour Act, worked out on the server: applying for leave
// holds the days (pending) and approving deducts them (taken).
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { hrAPI } from '@/services/api'
import StaffTypeBadge from './StaffTypeBadge'

export const BALANCES_KEY = 'hr-leave-balances'
const MAIN_TYPES = ['annual', 'sick', 'special', 'maternity']

export const days = (value) => (value === null || value === undefined ? '—' : `${+Number(value).toFixed(2)}`)

export function useLeaveBalance(employeeId, on) {
  return useQuery({
    queryKey: [BALANCES_KEY, employeeId, on || 'today'],
    queryFn: () => hrAPI.employees.leaveBalances(employeeId, on ? { on } : {}),
    enabled: !!employeeId,
    select: (res) => res.data,
  })
}

export function LeaveBalanceTable({ employeeId }) {
  const { data: rows = [], isLoading } = useLeaveBalance(employeeId)
  if (isLoading) return <p className="text-xs text-dark-400">Loading balances…</p>
  const shown = rows.filter((r) => r.entitled !== null || Number(r.taken) || Number(r.pending))
  return (
    <div className="space-y-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-dark-500 text-[10px] uppercase tracking-wider">
            <th className="text-left font-semibold py-1">Leave</th>
            <th className="text-right font-semibold">Due</th>
            <th className="text-right font-semibold">Taken</th>
            <th className="text-right font-semibold">Pending</th>
            <th className="text-right font-semibold">Available</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.leave_type} className="border-t border-white/5" title={`${r.rule} ${r.period}`}>
              <td className="py-1.5">
                <p className="text-white">{r.label}</p>
                <p className="text-[10px] text-dark-500">{r.period}</p>
              </td>
              <td className="text-right text-dark-300">{days(r.entitled)}</td>
              <td className="text-right text-dark-300">{days(r.taken)}</td>
              <td className={`text-right ${Number(r.pending) ? 'text-amber-400' : 'text-dark-500'}`}>{Number(r.pending) ? days(r.pending) : '—'}</td>
              <td className={`text-right font-semibold ${r.available === null ? 'text-dark-400' : Number(r.available) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {r.available === null ? 'No limit' : days(r.available)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-dark-500 leading-relaxed">
        Labour Act [Chapter 28:01]: annual leave builds up at 1 day per 17 days worked (up to 90), 90 sick days a
        service year, 12 special leave days a year, 98 maternity days after a year&apos;s service. Applied days are held
        as pending and deducted once approved. Extra days can be added under Leave allocations.
      </p>
    </div>
  )
}

export function LeaveBalancesTab() {
  const [search, setSearch] = useState('')
  const [staffType, setStaffType] = useState('')
  const { data: staff = [], isLoading } = useQuery({
    queryKey: [BALANCES_KEY, 'all', { search, staffType }],
    queryFn: () => hrAPI.employees.allLeaveBalances({ search, ...(staffType ? { staff_type: staffType } : {}) }),
    select: (res) => res.data,
  })
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 max-w-lg">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff..." className="form-input pl-9 w-full" />
        </div>
        <select aria-label="Staff type" value={staffType} onChange={(e) => setStaffType(e.target.value)} className="form-input w-auto min-w-[150px]">
          <option value="">All staff</option>
          <option value="employee">Company employees</option>
          <option value="agent">Agents</option>
        </select>
      </div>
      <p className="text-xs text-dark-400">
        Days available today under the Labour Act, after approved leave (taken) and requests awaiting approval (pending).
      </p>
      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Type</th>
              {MAIN_TYPES.map((t) => <th key={t} className="text-right">{t === 'special' ? 'Special' : t[0].toUpperCase() + t.slice(1)}</th>)}
            </tr>
          </thead>
          <tbody>
            {staff.map((e) => {
              const byType = Object.fromEntries(e.balances.map((b) => [b.leave_type, b]))
              return (
                <tr key={e.employee}>
                  <td className="px-4 py-3">
                    <p className="text-sm text-white font-medium">{e.employee_name}</p>
                    <p className="text-xs text-dark-400 font-mono">{e.employee_number} {e.department_name && `· ${e.department_name}`}</p>
                  </td>
                  <td className="px-4 py-3"><StaffTypeBadge employee={{ staff_type: e.staff_type }} /></td>
                  {MAIN_TYPES.map((t) => {
                    const b = byType[t]
                    return (
                      <td key={t} className="px-4 py-3 text-right" title={b ? `${b.period}: ${days(b.entitled)} due, ${days(b.taken)} taken, ${days(b.pending)} pending` : ''}>
                        <p className={`text-sm font-semibold ${Number(b?.available) > 0 ? 'text-white' : 'text-dark-500'}`}>{days(b?.available)}</p>
                        {Number(b?.pending) > 0 && <p className="text-[10px] text-amber-400">{days(b.pending)} pending</p>}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {staff.length === 0 && !isLoading && (
              <tr><td colSpan={6} className="text-center py-12 text-dark-400">No staff found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
