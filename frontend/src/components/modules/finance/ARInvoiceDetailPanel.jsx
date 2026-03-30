import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, Hash, User, Clock, CheckCircle2, FileText, Send, Mail, Edit2 } from 'lucide-react'
import { financeAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import { toast } from 'react-hot-toast'

export default function ARInvoiceDetailPanel({ invoice: initialInvoice }) {
  const queryClient = useQueryClient()
  const { openSidePanel, closeSidePanel } = useUIStore()

  const { data, isLoading } = useQuery({
    queryKey: ['ar-invoice', initialInvoice.id],
    queryFn: () => financeAPI.ar.invoices.detail(initialInvoice.id),
    initialData: { data: initialInvoice }
  })

  const invoice = data?.data || initialInvoice

  const postMutation = useMutation({
    mutationFn: () => financeAPI.ar.invoices.post(invoice.id),
    onSuccess: () => {
      toast.success('Invoice posted successfully!')
      queryClient.invalidateQueries({ queryKey: ['ar-invoices'] })
      closeSidePanel()
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to post invoice')
    }
  })

  if (isLoading) return <div className="p-20 text-center text-dark-400">Loading details...</div>

  return (
    <div className="p-6 space-y-6">
      {/* Header Info */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-primary bg-primary/10 px-2.5 py-1 rounded-lg">
            <Hash size={12} />
            {invoice.invoice_number}
          </div>
          <div className="flex items-center gap-2">
            {invoice.status === 'draft' && (
              <button 
                onClick={() => openSidePanel('new-ar-invoice', { invoice: invoice })}
                className="p-1.5 hover:bg-white/10 rounded-lg text-dark-400 hover:text-primary transition-colors"
                title="Edit Invoice"
              >
                <Edit2 size={14} />
              </button>
            )}
            <span className={`badge text-[10px] uppercase font-bold
              ${invoice.status === 'posted' ? 'bg-primary/10 text-primary' : 
                invoice.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-dark-700 text-dark-400'}`}>
              {invoice.status}
            </span>
          </div>
        </div>

        <div>
           <h2 className="text-xl font-semibold text-white">Sales Invoice</h2>
           <p className="text-dark-400 text-sm mt-1">{invoice.customer_name}</p>
        </div>
      </div>

      {/* Totals Card */}
      <div className="bg-dark-800/50 border border-white/5 rounded-2xl p-5 grid grid-cols-2 gap-4">
        <div className="text-center border-r border-white/5">
          <p className="text-[10px] text-dark-500 uppercase tracking-widest mb-1">Total Amount</p>
          <p className="text-xl font-semibold text-white">{formatCurrency(parseFloat(invoice.total_amount))}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-dark-500 uppercase tracking-widest mb-1">Balance Due</p>
          <p className="text-xl font-semibold text-primary">{formatCurrency(parseFloat(invoice.balance_due))}</p>
        </div>
      </div>

      {/* Meta Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-dark-800/50 border border-white/5 rounded-xl p-3">
          <p className="text-[10px] text-dark-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
            <Calendar size={10} /> Invoice Date
          </p>
          <p className="text-sm text-white font-medium">{formatDate(invoice.invoice_date)}</p>
        </div>
        <div className="bg-dark-800/50 border border-white/5 rounded-xl p-3">
          <p className="text-[10px] text-dark-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
            <Calendar size={10} /> Due Date
          </p>
          <p className="text-sm text-white font-medium">{formatDate(invoice.due_date)}</p>
        </div>
      </div>

      {/* Lines Summary */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-bold text-dark-500 uppercase tracking-widest flex items-center gap-2">
          <FileText size={12} /> Invoice Lines
        </h3>
        <div className="card !bg-dark-900 border border-white/5 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/2 border-b border-white/5 text-dark-400 font-medium">
              <tr>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {invoice.lines?.map((line, idx) => (
                <tr key={idx} className="text-dark-300">
                  <td className="px-3 py-2.5">
                    <p className="text-white font-medium">{line.description}</p>
                    <p className="text-[10px] text-dark-500">{line.revenue_account_code}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {formatCurrency(parseFloat(line.line_total))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      <div className="pt-6 flex flex-col gap-3">
        {invoice.status === 'draft' && (
          <button 
            onClick={() => postMutation.mutate()}
            disabled={postMutation.isPending}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2"
          >
            <Send size={16} /> {postMutation.isPending ? 'Posting...' : 'Approve & Post Invoice'}
          </button>
        )}
        {invoice.status === 'posted' && (
           <div className="space-y-6">
             <div className="w-full bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
               <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Post Success</p>
               <p className="text-xs text-emerald-500/80 mt-1">This invoice is posted to the General Ledger.</p>
             </div>

             {invoice.journal_entry_details && (
               <div className="space-y-3">
                 <h3 className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">General Ledger Impact</h3>
                 <div className="card !bg-dark-900 border border-white/5 overflow-hidden">
                   <table className="w-full text-left text-[10px]">
                     <thead className="bg-white/2 border-b border-white/5 text-dark-400 font-medium">
                       <tr>
                         <th className="px-3 py-2">Account</th>
                         <th className="px-3 py-2 text-right">Debit</th>
                         <th className="px-3 py-2 text-right">Credit</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-white/5">
                       {invoice.journal_entry_details.lines?.map((line, idx) => (
                         <tr key={idx} className="text-dark-300">
                           <td className="px-3 py-2.5">
                             <p className="text-white font-medium">{line.account_name}</p>
                             <p className="text-dark-500">{line.account_code}</p>
                           </td>
                           <td className="px-3 py-2.5 text-right font-mono text-emerald-400">
                             {line.side === 'debit' ? formatCurrency(parseFloat(line.amount)) : '-'}
                           </td>
                           <td className="px-3 py-2.5 text-right font-mono text-amber-400">
                             {line.side === 'credit' ? formatCurrency(parseFloat(line.amount)) : '-'}
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
               </div>
             )}
           </div>
        )}

        <button className="w-full btn-secondary py-3 flex items-center justify-center gap-2 text-dark-300">
          <Mail size={16} /> Email to Customer
        </button>
      </div>
    </div>
  )
}
