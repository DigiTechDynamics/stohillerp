import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, Hash, User, Clock, CheckCircle2, Building2, Send } from 'lucide-react'
import { apiErrorMessage, financeAPI } from '@/services/api'
import ApprovalBox from '@/components/common/ApprovalBox'
import { CashDocumentActions } from './DocumentActions'
import { formatCurrency, formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import { toast } from 'react-hot-toast'

export default function SupplierPaymentDetailPanel({ payment: initialPayment }) {
  const queryClient = useQueryClient()
  const { closeSidePanel } = useUIStore()

  const { data, isLoading } = useQuery({
    queryKey: ['supplier-payment', initialPayment.id],
    queryFn: () => financeAPI.ap.payments.detail(initialPayment.id),
    initialData: { data: initialPayment },
    initialDataUpdatedAt: 0,   // list rows are a starting point: always fetch the full record
  })

  const payment = data?.data || initialPayment

  const postMutation = useMutation({
    mutationFn: () => financeAPI.ap.payments.post(payment.id),
    onSuccess: () => {
      toast.success('Payment posted successfully!')
      queryClient.invalidateQueries({ queryKey: ['supplier-payments'] })
      queryClient.invalidateQueries({ queryKey: ['ap-suppliers'] })
      closeSidePanel()
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, 'Failed to post payment'))
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
            {payment.payment_reference}
          </div>
          <span className={`badge text-[10px] uppercase font-bold
            ${payment.status === 'posted' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-dark-700 text-dark-400'}`}>
            {payment.status}
          </span>
        </div>

        <div>
           <h2 className="text-xl font-semibold text-white">Supplier Payment</h2>
           <p className="text-dark-400 text-sm mt-1">{payment.supplier_name}</p>
        </div>
      </div>

      {/* Amount Card */}
      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 text-center">
        <p className="text-[10px] text-dark-500 uppercase tracking-widest mb-1">Payment Amount</p>
        <p className="text-3xl font-display text-white">{formatCurrency(parseFloat(payment.amount))}</p>
      </div>

      {/* Meta Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-dark-800/50 border border-white/5 rounded-xl p-3">
          <p className="text-[10px] text-dark-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
            <Calendar size={10} /> Payment Date
          </p>
          <p className="text-sm text-white font-medium">{formatDate(payment.payment_date)}</p>
        </div>
        <div className="bg-dark-800/50 border border-white/5 rounded-xl p-3">
          <p className="text-[10px] text-dark-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
            <Building2 size={10} /> Bank Account
          </p>
          <p className="text-sm text-white font-medium truncate">{payment.bank_account_name || 'Bank Account'}</p>
        </div>
      </div>

      {/* Audit Info */}
      <div className="bg-dark-800/30 rounded-xl p-4 border border-white/5 space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-[10px] text-dark-400">
            <Clock size={12} />
            Created {formatDate(payment.created_at)}
          </div>
          <div className="flex items-center gap-1.5">
             <User size={10} className="text-dark-500" />
             <span className="text-[10px] text-dark-300">{payment.created_by_name || 'System'}</span>
          </div>
        </div>
        {payment.status === 'posted' && (
          <div className="flex justify-between items-center pt-2 border-t border-white/5">
            <div className="flex items-center gap-2 text-[10px] text-emerald-400">
              <CheckCircle2 size={12} />
              Posted
            </div>
          </div>
        )}
      </div>

      {payment.status === 'draft' && (
        <ApprovalBox api={financeAPI.ap.payments} id={payment.id} queryKey="supplier-payment" />
      )}

      {/* Actions */}
      <div className="pt-6 flex gap-3">
        {payment.status === 'draft' && (
          <button 
            onClick={() => postMutation.mutate()}
            disabled={postMutation.isPending}
            className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
          >
            {postMutation.isPending ? 'Posting...' : (
              <>
                <Send size={16} /> Settle & Post
              </>
            )}
          </button>
        )}
        {payment.status === 'posted' && (
           <div className="space-y-6">
             <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
               <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Transaction Recorded</p>
               <p className="text-xs text-emerald-500/80 mt-1">This payment has been settled and posted to GL.</p>
             </div>

             {payment.journal_entry_details && (
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
                       {payment.journal_entry_details.lines?.map((line, idx) => (
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
             <CashDocumentActions side="ap" document={payment} />
           </div>
        )}
      </div>
    </div>
  )
}
