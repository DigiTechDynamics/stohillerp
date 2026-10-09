import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, Clock, CheckCircle2, XCircle, Plus, AlertCircle, User } from 'lucide-react'
import { hrAPI, apiErrorMessage } from '@/services/api'
import { formatDate } from '@/utils/format'
import RecordActions from '@/components/common/RecordActions'

// Leave is counted in working days (Mon-Fri), as on the server: the start date and the days
// applied for decide the end date (half days end on the day they finish).
const isWorkingDay = (d) => d.getDay() !== 0 && d.getDay() !== 6
const parseDay = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d) }
const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export function leaveEndDate(start, days) {
  const n = Math.ceil(parseFloat(days))
  if (!start || !(n > 0)) return ''
  const day = parseDay(start)
  let left = n
  for (;;) {
    if (isWorkingDay(day) && --left === 0) return toIso(day)
    day.setDate(day.getDate() + 1)
  }
}
function leaveProblem({ start_date: start, days_requested: days }) {
  if (!start || days === '') return null
  const n = parseFloat(days)
  if (!(n > 0)) return 'Days applied must be more than 0.'
  if (n * 2 !== Math.round(n * 2)) return 'Leave is taken in whole or half days.'
  if (!isWorkingDay(parseDay(start))) return 'Leave must start on a working day (Monday to Friday).'
  return null
}
const nextWorkingDay = (iso) => { const d = parseDay(iso); do d.setDate(d.getDate() + 1); while (!isWorkingDay(d)); return toIso(d) }

export default function LeaveManagementPanel() {
  const queryClient = useQueryClient()
  const [isRequesting, setIsRequesting] = useState(false)
  const [error, setError] = useState(null)
  
  const { data: leaveData, isLoading } = useQuery({
    queryKey: ['hr-leaves'],
    queryFn: () => hrAPI.leave.list(),
  })
  const leaves = leaveData?.data?.results || leaveData?.data || []

  const { data: empsData } = useQuery({
    queryKey: ['hr-employees-lite'],
    queryFn: () => hrAPI.employees.list({ page_size: 1000 }),
  })
  const employees = empsData?.data?.results || empsData?.data || []

  const [formData, setFormData] = useState({
    employee: '',
    leave_type: 'annual',
    start_date: '',
    end_date: '',
    days_requested: '',
    reason: '',
  })

  const createMutation = useMutation({
    mutationFn: (data) => hrAPI.leave.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-leaves'] })
      setIsRequesting(false)
      setFormData({ employee: '', leave_type: 'annual', start_date: '', end_date: '', days_requested: '', reason: '' })
    },
    onError: (err) => setError(apiErrorMessage(err, 'Failed to submit request'))
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => hrAPI.leave.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-leaves'] })
      queryClient.invalidateQueries({ queryKey: ['hr-employees'] })
      queryClient.invalidateQueries({ queryKey: ['hr-employees-lite'] })
    },
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => {
      const next = { ...prev, [name]: value }
      // The end date follows from the start date and the days applied.
      if (name === 'start_date' || name === 'days_requested') next.end_date = leaveEndDate(next.start_date, next.days_requested)
      return next
    })
  }
  const problem = leaveProblem(formData)

  const handleStatusChange = (id, status) => {
    statusMutation.mutate({ id, status })
  }

  return (
    <div className="flex flex-col h-full bg-dark-900">
      <div className="p-6 border-b border-white/5 bg-dark-800/50 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Calendar size={20} className="text-primary" /> Leave Management
        </h2>
        {!isRequesting && (
          <button onClick={() => setIsRequesting(true)} className="btn-primary flex items-center gap-2 py-2">
            <Plus size={16} /> Request Leave
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        {isRequesting ? (
          <div className="animate-in fade-in slide-in-from-top-4 duration-300 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-widest">New Leave Request</h3>
              <button onClick={() => setIsRequesting(false)} className="text-xs text-dark-500 hover:text-white">Cancel</button>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2">
                <AlertCircle size={14} className="flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setError(null); if (!problem) createMutation.mutate(formData) }}>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Employee</label>
                <select name="employee" value={formData.employee} onChange={handleChange} required className="form-input w-full">
                  <option value="">Select Employee</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Leave Type</label>
                <select name="leave_type" value={formData.leave_type} onChange={handleChange} required className="form-input w-full">
                  <option value="annual">Annual Leave</option>
                  <option value="sick">Sick Leave</option>
                  <option value="family">Family Responsibility</option>
                  <option value="maternity">Maternity Leave</option>
                  <option value="study">Study Leave</option>
                  <option value="unpaid">Unpaid Leave</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">From</label>
                  <input type="date" name="start_date" aria-label="From" value={formData.start_date} onChange={handleChange} required className="form-input w-full" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Days Applied</label>
                  <input type="number" step="0.5" min="0.5" name="days_requested" aria-label="Days applied" value={formData.days_requested} onChange={handleChange} required className="form-input w-full" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">To (last day of leave)</label>
                <p aria-label="To" className="form-input w-full text-dark-200">
                  {formData.end_date && !problem ? formatDate(formData.end_date) : '—'}
                </p>
                <p className={`text-[11px] ${problem ? 'text-red-400' : 'text-dark-400'}`}>
                  {problem || (formData.end_date
                    ? `Working days only (Mon–Fri). Back at work on ${formatDate(nextWorkingDay(formData.end_date))}.`
                    : 'Filled in from the start date and days applied (working days, Mon–Fri).')}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Reason</label>
                <textarea name="reason" value={formData.reason} onChange={handleChange} rows={3} className="form-input w-full resize-none" />
              </div>

              <button type="submit" disabled={createMutation.isPending || !!problem} className="w-full btn-primary py-3">
                {createMutation.isPending ? 'Submitting...' : 'Submit Request'}
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-4">
            {leaves.length === 0 && !isLoading && (
              <div className="text-center py-20">
                <Clock size={40} className="mx-auto mb-3 text-dark-600" />
                <p className="text-dark-400">No leave requests found.</p>
              </div>
            )}

            {leaves.map((leave) => (
              <div key={leave.id} className="card p-4 space-y-4 hover:border-white/10 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-dark-800 flex items-center justify-center border border-white/5">
                      <User size={18} className="text-primary" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">{leave.employee_name}</h4>
                      <p className="text-xs text-dark-400">{leave.leave_type_display} • {leave.days_requested} Days</p>
                    </div>
                  </div>
                  <span className={`badge text-[10px] uppercase font-bold
                    ${leave.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' : 
                      leave.status === 'rejected' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
                    {leave.status_display || leave.status}
                  </span>
                  <RecordActions record={leave} label="leave request" deleteFn={hrAPI.leave.delete}
                    invalidate={['hr-leaves', 'hr-employees']} />
                </div>

                <div className="flex items-center gap-6 text-[11px] text-dark-500">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={12} /> {formatDate(leave.start_date)} — {formatDate(leave.end_date)}
                  </div>
                </div>

                {leave.reason && (
                  <p className="text-xs text-dark-400 bg-dark-900/50 p-3 rounded-lg border border-white/5">
                    {leave.reason}
                  </p>
                )}

                {leave.status === 'pending' && (
                  <div className="flex gap-2 pt-1 border-t border-white/5 pt-3 mt-1">
                    <button 
                      disabled={statusMutation.isPending}
                      onClick={() => handleStatusChange(leave.id, 'approved')}
                      className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-[11px] font-bold transition-colors"
                    >
                      <CheckCircle2 size={14} /> Approve
                    </button>
                    <button 
                      disabled={statusMutation.isPending}
                      onClick={() => handleStatusChange(leave.id, 'rejected')}
                      className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-[11px] font-bold transition-colors"
                    >
                      <XCircle size={14} /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
