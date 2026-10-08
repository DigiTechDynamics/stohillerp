// HR: attendance records and leave allocations (entitlements), set up per employee.
import { useQuery } from '@tanstack/react-query'
import CrudTable from '@/components/common/CrudTable'
import { hrAPI } from '@/services/api'

export const LEAVE_TYPES = [
  ['annual', 'Annual Leave'], ['sick', 'Sick Leave'], ['family', 'Family Responsibility'],
  ['maternity', 'Maternity Leave'], ['study', 'Study Leave'], ['unpaid', 'Unpaid Leave'],
]

function useEmployeeOptions() {
  const { data } = useQuery({
    queryKey: ['employees', 'options'],
    queryFn: () => hrAPI.employees.list({ page_size: 200 }),
  })
  return (data?.data?.results || data?.data || []).map((e) => [e.id, e.full_name || `${e.first_name} ${e.last_name}`])
}

const dateTime = (value) => (value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—')
// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time.
const toLocalInput = (value) => {
  if (!value) return ''
  const d = new Date(value)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function AttendanceTab() {
  const employees = useEmployeeOptions()
  return (
    <CrudTable label="attendance record" queryKey={['hr-attendance']} api={hrAPI.attendance}
      description="Check-in and check-out times. Hours worked are worked out when the check-out is recorded."
      columns={[
        { key: 'employee_name', label: 'Employee' },
        { key: 'check_in', label: 'Checked in', render: (r) => dateTime(r.check_in) },
        { key: 'check_out', label: 'Checked out', render: (r) => (r.check_out ? dateTime(r.check_out) : <span className="badge-gold">On site</span>) },
        { key: 'worked_hours', label: 'Hours', align: 'right', render: (r) => r.worked_hours ?? '—' },
      ]}
      fields={[
        { key: 'employee', label: 'Employee', type: 'select', options: employees, required: true },
        { key: 'check_in', label: 'Check in', type: 'datetime', required: true, get: (r) => toLocalInput(r.check_in) },
        { key: 'check_out', label: 'Check out', type: 'datetime', get: (r) => toLocalInput(r.check_out) },
      ]}
      toPayload={(p) => ({
        ...p,
        check_in: p.check_in ? new Date(p.check_in).toISOString() : p.check_in,
        check_out: p.check_out ? new Date(p.check_out).toISOString() : null,
      })}
      defaults={{ check_in: toLocalInput(new Date()) }} />
  )
}

export function LeaveAllocationsTab() {
  const employees = useEmployeeOptions()
  return (
    <CrudTable label="leave allocation" queryKey={['hr-leave-allocations']} api={hrAPI.allocations}
      description="Days each employee is entitled to per leave type. Taken and remaining days count approved requests in the period."
      columns={[
        { key: 'employee_name', label: 'Employee' },
        { key: 'leave_type_display', label: 'Leave type' },
        { key: 'days_allocated', label: 'Allocated', align: 'right' },
        { key: 'days_taken', label: 'Taken', align: 'right' },
        { key: 'days_remaining', label: 'Remaining', align: 'right' },
        { key: 'valid_from', label: 'Valid', render: (r) => (r.valid_from || r.valid_to ? `${r.valid_from || '…'} – ${r.valid_to || '…'}` : 'Open') },
      ]}
      fields={[
        { key: 'employee', label: 'Employee', type: 'select', options: employees, required: true },
        { key: 'leave_type', label: 'Leave type', type: 'select', options: LEAVE_TYPES, required: true },
        { key: 'days_allocated', label: 'Days allocated', type: 'number', required: true },
        { key: 'valid_from', label: 'Valid from', type: 'date' },
        { key: 'valid_to', label: 'Valid to', type: 'date' },
        { key: 'description', label: 'Description' },
      ]}
      defaults={{ leave_type: 'annual' }} />
  )
}
