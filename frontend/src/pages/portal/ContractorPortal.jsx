// Contractor portal. The API only returns the signed-in contractor's jobs and quotes.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { apiErrorMessage, contractorPortalAPI } from '@/services/api'
import { formatCurrency, formatDate, getStatusColor } from '@/utils/format'
import { confirmDialog } from '@/components/common/Dialogs'

const STATUSES = [['acknowledged', 'Acknowledged'], ['in_progress', 'In progress'], ['pending_parts', 'Waiting for parts']]
const CLOSED = ['completed', 'closed', 'cancelled']

function Status({ value }) {
  return <span className={`badge text-[10px] uppercase ${getStatusColor(value)}`}>{value?.replace(/_/g, ' ')}</span>
}

function JobCard({ job, children }) {
  return (
    <div className="card p-4 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm text-white font-medium">{job.category} <span className="font-mono text-xs text-dark-500">{job.reference}</span></p>
          <p className="text-xs text-dark-400">{job.property}{job.unit ? `, unit ${job.unit}` : ''} · {job.address}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-bold text-dark-400">{job.priority}</span>
          <Status value={job.status} />
        </div>
      </div>
      <p className="text-sm text-dark-300 whitespace-pre-line">{job.description}</p>
      {job.notes && <p className="text-xs text-dark-500 whitespace-pre-line border-l-2 border-white/10 pl-2">{job.notes}</p>}
      {children}
    </div>
  )
}

function QuoteForm({ job, onDone }) {
  const [form, setForm] = useState({ amount: '', valid_until: '', description: '' })
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('job', job.reference)
      Object.entries(form).forEach(([k, v]) => v && fd.append(k, v))
      if (file) fd.append('document', file)
      await contractorPortalAPI.submitQuote(fd)
      toast.success('Quote submitted.')
      onDone()
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid sm:grid-cols-4 gap-2 items-end pt-2 border-t border-white/5">
      <input type="number" step="0.01" aria-label="Quote amount" placeholder="Amount" className="form-input text-sm" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
      <input type="date" aria-label="Valid until" className="form-input text-sm" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
      <input type="file" aria-label="Quote document" className="text-xs text-dark-400" onChange={(e) => setFile(e.target.files[0] || null)} />
      <button className="btn-primary text-xs" disabled={busy || !form.amount} onClick={submit}>Submit quote</button>
      <textarea aria-label="Scope of work" placeholder="Scope of work, exclusions..." rows={2} className="form-input text-sm sm:col-span-4" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
    </div>
  )
}

export function ContractorJobs() {
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery({ queryKey: ['contractor-jobs'], queryFn: () => contractorPortalAPI.jobs() })
  const [notes, setNotes] = useState({})
  const [quoting, setQuoting] = useState(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['contractor-jobs'] })
  const run = async (promise, msg) => {
    try {
      await promise
      toast.success(msg)
      refresh()
    } catch (e) {
      toast.error(apiErrorMessage(e))
    }
  }
  if (error) return <p className="text-rose-300">{apiErrorMessage(error)}</p>
  const jobs = data?.data || []
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-white">My jobs</h1>
      {isLoading && <p className="text-dark-400">Loading...</p>}
      {!isLoading && jobs.length === 0 && <p className="text-dark-400">No jobs assigned to you.</p>}
      {jobs.map((job) => (
        <JobCard key={job.reference} job={job}>
          {!CLOSED.includes(job.status) && (
            <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-white/5">
              <select aria-label="Job status" className="form-input text-xs w-auto" value={STATUSES.some(([v]) => v === job.status) ? job.status : ''}
                onChange={(e) => e.target.value && run(contractorPortalAPI.updateJob(job.reference, { status: e.target.value }), 'Status updated.')}>
                <option value="">Update status…</option>
                {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input aria-label="Progress note" placeholder="Progress note" className="form-input text-xs flex-1 min-w-[180px]" value={notes[job.reference] || ''}
                onChange={(e) => setNotes({ ...notes, [job.reference]: e.target.value })} />
              <button className="btn-secondary text-xs" disabled={!notes[job.reference]}
                onClick={() => run(contractorPortalAPI.updateJob(job.reference, { notes: notes[job.reference] }), 'Note added.').then(() => setNotes({ ...notes, [job.reference]: '' }))}>Add note</button>
              <button className="btn-secondary text-xs" onClick={() => setQuoting(quoting === job.reference ? null : job.reference)}>Quote</button>
              <button className="btn-primary text-xs" onClick={async () => (await confirmDialog({ title: 'Report this job as done?', message: 'The office will inspect the work and process your invoice.', confirmLabel: 'Report done' })) && run(contractorPortalAPI.reportDone(job.reference, notes[job.reference] || ''), 'Reported done. The office will inspect and process your invoice.')}>Report done</button>
            </div>
          )}
          {quoting === job.reference && <QuoteForm job={job} onDone={() => setQuoting(null)} />}
        </JobCard>
      ))}
    </div>
  )
}

export function ContractorOpenJobs() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['contractor-open-jobs'], queryFn: () => contractorPortalAPI.jobs({ open: 1 }) })
  const [quoting, setQuoting] = useState(null)
  const jobs = data?.data || []
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-white">Jobs open for quotes</h1>
      {isLoading && <p className="text-dark-400">Loading...</p>}
      {!isLoading && jobs.length === 0 && <p className="text-dark-400">No open jobs at the moment.</p>}
      {jobs.map((job) => (
        <JobCard key={job.reference} job={job}>
          {quoting === job.reference
            ? <QuoteForm job={job} onDone={() => { setQuoting(null); queryClient.invalidateQueries({ queryKey: ['contractor-quotes'] }) }} />
            : <button className="btn-secondary text-xs" onClick={() => setQuoting(job.reference)}>Quote for this job</button>}
        </JobCard>
      ))}
    </div>
  )
}

export function ContractorQuotes() {
  const { data, isLoading } = useQuery({ queryKey: ['contractor-quotes'], queryFn: () => contractorPortalAPI.quotes() })
  const quotes = data?.data || []
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-white">My quotes</h1>
      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>Job</th><th>Work</th><th className="text-right">Amount</th><th>Valid until</th><th>Submitted</th><th>Status</th></tr></thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id}>
                <td className="px-3 py-2 text-xs font-mono">{q.job}</td>
                <td className="px-3 py-2 text-sm">{q.category}</td>
                <td className="px-3 py-2 text-sm text-right">{formatCurrency(q.amount)}</td>
                <td className="px-3 py-2 text-xs">{formatDate(q.valid_until)}</td>
                <td className="px-3 py-2 text-xs">{formatDate(q.created_at)}</td>
                <td className="px-3 py-2"><Status value={q.status} /></td>
              </tr>
            ))}
            {!isLoading && quotes.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-dark-400 text-sm">No quotes yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
