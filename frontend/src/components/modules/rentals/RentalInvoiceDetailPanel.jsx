// Stohill Properties - Rental invoice: the charges, payments and the tax invoice
// PDF, which can be previewed, downloaded or printed.
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Printer, Loader2, DollarSign, FileText } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { rentalsAPI, saveBlobResponse, apiErrorMessage } from '@/services/api'
import { formatCurrency, formatDate, getStatusColor } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'

function Row({ label, value, strong }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <span className="text-xs text-dark-400">{label}</span>
      <span className={`text-sm text-right ${strong ? 'text-white font-semibold' : 'text-dark-300'}`}>{value}</span>
    </div>
  )
}

export default function RentalInvoiceDetailPanel({ invoice: initial }) {
  const openPanel = useUIStore((s) => s.openSidePanel)
  const frameRef = useRef(null)
  const [pdf, setPdf] = useState(null)          // { url, response } | { error }
  const [busy, setBusy] = useState(null)

  const { data } = useQuery({
    queryKey: ['rental-invoice', initial.id],
    queryFn: async () => (await rentalsAPI.invoices.detail(initial.id)).data,
    initialData: initial,
    staleTime: 0,
  })
  const invoice = data || initial
  const currency = invoice.currency_code
  const { data: paymentsRes } = useQuery({
    queryKey: ['rental-payments', invoice.id],
    queryFn: () => rentalsAPI.payments.list({ invoice: invoice.id }),
  })
  const payments = paymentsRes?.data?.results || paymentsRes?.data || []

  // Load the PDF once for the preview; download and print reuse it.
  useEffect(() => {
    let url = null
    let cancelled = false
    rentalsAPI.invoices.pdf(invoice.id)
      .then((response) => {
        if (cancelled) return
        url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
        setPdf({ url, response })
      })
      .catch(async (err) => {
        if (cancelled) return
        // Blob error bodies: read the JSON message out of them.
        let message = 'The invoice PDF is not available.'
        try {
          const body = JSON.parse(await err.response.data.text())
          message = body?.error?.message?.detail || body?.error?.message || body?.error || message
        } catch { /* keep the default */ }
        setPdf({ error: typeof message === 'string' ? message : 'The invoice PDF is not available.' })
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [invoice.id])

  const download = () => {
    if (pdf?.response) saveBlobResponse(pdf.response, `Invoice_${invoice.invoice_number}.pdf`)
  }
  const print = () => {
    const frame = frameRef.current
    if (!frame?.contentWindow) return
    setBusy('print')
    try {
      frame.contentWindow.focus()
      frame.contentWindow.print()
    } catch (err) {
      // Some browsers block printing a PDF viewer frame: open it instead.
      window.open(pdf.url, '_blank')
      toast(apiErrorMessage(err, 'Opened the invoice in a new tab: print it from there.'))
    } finally {
      setBusy(null)
    }
  }

  const charges = invoice.charges || []

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-mono text-primary">{invoice.invoice_number}</p>
          <h2 className="text-lg font-semibold text-white mt-1">{invoice.tenant_name}</h2>
          <p className="text-sm text-dark-400">{invoice.property_name} · Lease {invoice.lease_number}</p>
        </div>
        <span className={`badge text-[10px] uppercase font-bold ${getStatusColor(invoice.status)}`}>{invoice.status}</span>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button type="button" className="btn-primary" onClick={download} disabled={!pdf?.response}>
          <Download size={16} /> Download PDF
        </button>
        <button type="button" className="btn-secondary" onClick={print} disabled={!pdf?.url || busy === 'print'}>
          <Printer size={16} /> Print
        </button>
        {parseFloat(invoice.balance_due) > 0 && (
          <button type="button" className="btn-secondary" onClick={() => openPanel('rental-payment-form', { invoice })}>
            <DollarSign size={16} /> Record payment
          </button>
        )}
      </div>

      <div className="card p-4 divide-y divide-white/5">
        <Row label="Period" value={`${formatDate(invoice.period_start)} – ${formatDate(invoice.period_end)}`} />
        <Row label="Due" value={formatDate(invoice.due_date)} />
        <Row label="Rent" value={formatCurrency(parseFloat(invoice.rental_amount), currency)} />
        {charges.map((c, i) => (
          <Row key={i} label={c.description} value={formatCurrency(parseFloat(c.amount) + parseFloat(c.vat || 0), currency)} />
        ))}
        {parseFloat(invoice.vat_amount) > 0 && <Row label="VAT on rent" value={formatCurrency(parseFloat(invoice.vat_amount), currency)} />}
        {parseFloat(invoice.late_payment_fee) > 0 && <Row label="Late payment fee" value={formatCurrency(parseFloat(invoice.late_payment_fee), currency)} />}
        {parseFloat(invoice.credited_amount) > 0 && <Row label="Credited" value={`-${formatCurrency(parseFloat(invoice.credited_amount), currency)}`} />}
        <Row label="Total" value={formatCurrency(parseFloat(invoice.total_amount), currency)} strong />
        <Row label="Paid" value={formatCurrency(parseFloat(invoice.amount_paid), currency)} />
        <Row label="Balance due" value={formatCurrency(parseFloat(invoice.balance_due), currency)} strong />
      </div>

      {payments.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-dark-500 uppercase tracking-widest">Payments</h3>
          <ul className="card divide-y divide-white/5">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between px-4 py-2 text-sm">
                <span className="text-dark-300">{formatDate(p.payment_date)} · {p.reference}</span>
                <span className="text-white font-medium">{formatCurrency(parseFloat(p.amount), currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-white/10 overflow-hidden bg-dark-800/50">
        {!pdf ? (
          <div className="h-64 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-primary" /></div>
        ) : pdf.error ? (
          <div className="h-40 flex flex-col items-center justify-center gap-2 text-sm text-dark-400 px-6 text-center">
            <FileText size={28} className="text-dark-600" /> {pdf.error}
          </div>
        ) : (
          <iframe ref={frameRef} src={pdf.url} title={`Invoice ${invoice.invoice_number}`} className="w-full h-[32rem] bg-white" />
        )}
      </div>
    </div>
  )
}
