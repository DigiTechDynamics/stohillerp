import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Calendar, Hash, CheckCircle2, FileText, Send, Edit2, Trash2, Loader2, Scale } from 'lucide-react'
import { apiErrorMessage, financeAPI } from '@/services/api'
import ApprovalBox from '@/components/common/ApprovalBox'
import DocumentActions from './DocumentActions'
import { formatCurrency, formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import { toast } from 'react-hot-toast'
import { confirmDialog } from '@/components/common/Dialogs'

export default function APInvoiceDetailPanel({ invoice: initialInvoice }) {
  const queryClient = useQueryClient()
  const { closeSidePanel, openSidePanel } = useUIStore()

  const { data, isLoading } = useQuery({
    queryKey: ['ap-invoice', initialInvoice.id],
    queryFn: () => financeAPI.ap.invoices.detail(initialInvoice.id),
    initialData: { data: initialInvoice },
    initialDataUpdatedAt: 0,   // list rows are a starting point: always fetch the full record
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
      toast.error(apiErrorMessage(err, 'Failed to post invoice'))
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
      toast.error(apiErrorMessage(err, 'Failed to review invoice'))
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
      toast.error(apiErrorMessage(err, 'Failed to delete invoice'))
    }
  })

  const handleEdit = () => {
    openSidePanel('new-ap-invoice', { invoice })
  }

  const handleDelete = async () => {
    if (await confirmDialog({ title: 'Delete this draft invoice?', message: 'This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' })) {
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
           <h2 className="text-xl font-semibold text-white">{invoice.document_type === 'credit_note' ? 'Supplier Credit Note' : 'Purchase Invoice'}</h2>
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

      {['draft', 'reviewed'].includes(invoice.status) && (
        <>
          <MatchBox invoice={invoice} />
          <ApprovalBox api={financeAPI.ap.invoices} id={invoice.id} queryKey="ap-invoice" />
        </>
      )}

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
        {!['draft', 'reviewed'].includes(invoice.status) && (
          <div className="mt-6"><DocumentActions side="ap" invoice={invoice} /></div>
        )}
      </div>
    </div>
  )
}

// 3-way match (PO price / goods received / invoice) for PO-linked invoices.
function MatchBox({ invoice }) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const { data } = useQuery({
    queryKey: ['ap-invoice-match', invoice.id],
    queryFn: () => financeAPI.ap.invoices.matchStatus(invoice.id),
  })
  const match = data?.data
  const override = useMutation({
    mutationFn: () => financeAPI.ap.invoices.overrideMatch(invoice.id, reason),
    onSuccess: () => {
      toast.success('Match overridden.')
      queryClient.invalidateQueries({ queryKey: ['ap-invoice-match', invoice.id] })
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  if (!match || match.status === 'not_applicable') return null
  const colour = match.status === 'matched' ? 'text-emerald-400' : match.status === 'overridden' ? 'text-amber-300' : 'text-rose-400'
  return (
    <div className="space-y-2 bg-dark-800/50 border border-white/5 rounded-xl p-4">
      <h3 className="text-[10px] font-bold text-dark-500 uppercase tracking-widest flex items-center gap-2">
        <Scale size={12} /> 3-way match: <span className={colour}>{match.status}</span>
      </h3>
      {match.exceptions.map((e, i) => <p key={i} className="text-xs text-rose-300">{e}</p>)}
      {match.status === 'overridden' && (
        <p className="text-xs text-dark-400">Overridden by {match.override.by}: {match.override.reason}</p>
      )}
      {match.status === 'exceptions' && (
        <div className="flex gap-2">
          <input className="form-input text-xs flex-1" placeholder="Reason to accept the differences"
            aria-label="Override reason" value={reason} onChange={e => setReason(e.target.value)} />
          <button className="btn-secondary text-xs px-3" disabled={!reason || override.isPending}
            onClick={() => override.mutate()}>Override</button>
        </div>
      )}
    </div>
  )
}
