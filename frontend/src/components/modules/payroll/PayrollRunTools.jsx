import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Mail, Scale } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { apiErrorMessage, payrollAPI, saveBlobResponse } from '@/services/api'
import { formatCurrency } from '@/utils/format'

// Statutory remittances, bank payment file and payslip emails for a payroll run.
export default function PayrollRunTools({ run }) {
  const [busy, setBusy] = useState(false)
  const released = ['approved', 'paid'].includes(run.status)
  const { data } = useQuery({
    queryKey: ['payroll-statutory', run.id, run.status],
    queryFn: () => payrollAPI.runs.statutory(run.id),
    enabled: run.status !== 'draft',
  })
  const s = data?.data
  const cur = s?.currency || run.currency_code

  const bankFile = async () => {
    try {
      saveBlobResponse(await payrollAPI.runs.bankFile(run.id), `payroll_${run.period_end}_bank.csv`)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not produce the bank file.'))
    }
  }
  const email = async () => {
    setBusy(true)
    try {
      const { data: res } = await payrollAPI.runs.emailPayslips(run.id)
      toast.success(`Sent ${res.sent.length} payslip(s)` +
        (res.skipped_no_email.length ? `; ${res.skipped_no_email.length} employee(s) have no email.` : '.'))
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  if (!s && !released) return null
  return (
    <div className="mt-6 p-4 rounded-2xl bg-white/5 border border-white/5 space-y-4">
      {s && (
        <div>
          <p className="text-[10px] text-dark-500 font-black uppercase tracking-widest flex items-center gap-2 mb-3">
            <Scale size={12} /> Statutory remittances
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><p className="text-dark-500 text-xs">PAYE + AIDS levy (P2)</p><p className="text-white font-semibold">{formatCurrency(s.zimra_p2.total, cur)}</p></div>
            <div><p className="text-dark-500 text-xs">NSSA employee + employer (P4)</p><p className="text-white font-semibold">{formatCurrency(s.nssa_p4.total, cur)}</p></div>
            <div><p className="text-dark-500 text-xs">ZIMDEF</p><p className="text-white font-semibold">{formatCurrency(s.zimdef, cur)}</p></div>
            <div><p className="text-dark-500 text-xs">Gross pay</p><p className="text-white font-semibold">{formatCurrency(s.gross_pay, cur)}</p></div>
          </div>
        </div>
      )}
      {released && (
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary text-xs" onClick={bankFile}><Download size={14} /> Bank payment file</button>
          <button className="btn-secondary text-xs" disabled={busy} onClick={email}><Mail size={14} /> {busy ? 'Sending...' : 'Email payslips'}</button>
        </div>
      )}
    </div>
  )
}
