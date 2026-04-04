import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, Hash, User, Clock, CheckCircle2, FileText, Send, Edit2, Trash2, Loader2 } from 'lucide-react'
import { financeAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import { useConfirmStore } from '@/stores/useConfirmStore'
import { toast } from 'react-hot-toast'

export default function APInvoiceDetailPanel({ invoice: initialInvoice }) {
  const queryClient = useQueryClient()
  const { closeSidePanel, openSidePanel } = useUIStore()
  const confirm = useConfirmStore((s) => s.confirm)

  const { data, isLoading } = useQuery({
    queryKey: ['ap-invoice', initialInvoice.id],
    queryFn: () => financeAPI.ap.invoices.detail(initialInvoice.id),
    initialData: { data: initialInvoice }
  })

  const invoice = data?.data || initialInvoice

  const postMutation = useMutation({
    mutationFn: () => financeAPI.ap.invoices.post(invoice.id),
    onSuccess: () => {
      toast.success('Invoice posted successfully!')
      queryClient.invalidateQueries({ queryKey: ['ap-invoices'] })
      closeSidePanel()
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to post invoice')
    }
  })
  
  const reviewMutation = useMutation({
    mutationFn: () => financeAPI.ap.invoices.review(invoice.id),
    onSuccess: () => {
      toast.success('Invoice reviewed and ready for posting!')
      queryClient.invalidateQueries({ queryKey: ['ap-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['ap-invoice', invoice.id] })
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to review invoice')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: () => financeAPI.ap.invoices.delete(invoice.id),
    onSuccess: () => {
      toast.success('Invoice deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['ap-invoices'] })
      closeSidePanel()
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to delete invoice')
    }
  })

  const handleEdit = () => {
    openSidePanel('new-ap-invoice', { invoice })
  }

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete Draft Invoice',
      message: 'Are you sure you want to delete this draft invoice? This action cannot be undone.',
      confirmLabel: 'Delete Draft',
      type: 'danger'
    })
    if (ok) {
      deleteMutation.mutate()
    }
  }

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
          <span className={`badge text-[10px] uppercase font-bold
            ${invoice.status === 'posted' ? 'bg-primary/10 text-primary' : 
              invoice.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' : 
              invoice.status === 'reviewed' ? 'bg-amber-500/10 text-amber-400' : 
              'bg-dark-700 text-dark-400'}`}>
            {invoice.status}
          </span>
        </div>

        <div>
           <h2 className="text-xl font-semibold text-white">Purchase Invoice</h2>
           <p className="text-dark-400 text-sm mt-1">{invoice.supplier_name}</p>
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
                    <p className="text-[10px] text-dark-500">{line.expense_account_code}</p>
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
      <div className="pt-6">
        {invoice.status === 'draft' && (
          <div className="flex gap-3 mb-4">
            <button 
              onClick={handleEdit}
              className="flex-1 btn-secondary py-2.5 flex items-center justify-center gap-2"
            >
              <Edit2 size={16} /> Edit Invoice
            </button>
            <button 
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="px-4 btn-secondary border-red-500/20 text-red-500 hover:bg-red-500/10 flex items-center justify-center"
            >
              {deleteMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            </button>
          </div>
        )}

        {invoice.status === 'draft' && (
          <button 
            onClick={() => reviewMutation.mutate()}
            disabled={reviewMutation.isPending}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2"
          >
            <CheckCircle2 size={16} /> {reviewMutation.isPending ? 'Reviewing...' : 'Mark as Reviewed'}
          </button>
        )}

        {invoice.status === 'reviewed' && (
          <button 
            onClick={() => postMutation.mutate()}
            disabled={postMutation.isPending}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
          >
            <Send size={16} /> {postMutation.isPending ? 'Posting...' : 'Post Invoice to GL'}
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
      </div>
    </div>
  )
}
