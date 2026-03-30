import React from 'react'
import { 
  Building2, User, DollarSign, Calendar, 
  Percent, Briefcase, FileText, MapPin, 
  CheckCircle2, Clock, XCircle, Info, RefreshCw, Edit2, ExternalLink, FileCheck
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { salesAPI } from '@/services/api'
import { toast } from 'react-hot-toast'

export default function SaleDetailPanel({ sale }) {
  const { openSidePanel } = useUIStore()
  const queryClient = useQueryClient()

  if (!sale) return null

  const confirmMutation = useMutation({
    mutationFn: () => salesAPI.confirmDeal(sale.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-transactions'] })
      toast.success('Deal confirmed successfully')
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to confirm deal')
    }
  })

  const postMutation = useMutation({
    mutationFn: () => salesAPI.postToFinance(sale.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-transactions'] })
      toast.success('Posted to Finance successfully')
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to post to finance')
    }
  })

  const getStatusInfo = (status) => {
    switch (status) {
      case 'registered':
        return { color: 'text-emerald-500 bg-emerald-500/10', icon: <CheckCircle2 size={14} />, label: 'Registered' }
      case 'cancelled':
        return { color: 'text-rose-500 bg-rose-500/10', icon: <XCircle size={14} />, label: 'Cancelled' }
      case 'offer_accepted':
        return { color: 'text-blue-500 bg-blue-500/10', icon: <CheckCircle2 size={14} />, label: 'Offer Accepted' }
      case 'offer_submitted':
        return { color: 'text-amber-500 bg-amber-500/10', icon: <Clock size={14} />, label: 'Offer Submitted' }
      default:
        return { color: 'text-dark-400 bg-dark-700', icon: <Info size={14} />, label: status?.replace(/_/g, ' ') }
    }
  }

  const statusInfo = getStatusInfo(sale.status)

  return (
    <div className="flex flex-col h-full bg-dark-900 text-white">
      {/* Header */}
      <div className="p-6 border-b border-white/5 bg-gradient-to-br from-primary/5 to-transparent">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/10">
            {sale.sale_reference}
          </span>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusInfo.color}`}>
            {statusInfo.icon}
            {statusInfo.label}
          </div>
        </div>
        <h2 className="text-2xl font-bold text-white leading-tight">Sale Agreement</h2>
        <div className="flex items-center gap-2 text-dark-400 text-sm mt-2">
          <Building2 size={14} className="text-primary" />
          <span>{sale.property_ref || 'Property Reference'}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {/* Key Figures */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-dark-800/50 border border-white/5 rounded-2xl p-4">
            <p className="text-[10px] text-dark-500 uppercase font-bold tracking-wider mb-1">Sale Price</p>
            <p className="text-xl font-bold text-white">{formatCurrency(sale.sale_price, sale.currency_code)}</p>
          </div>
          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4">
            <p className="text-[10px] text-emerald-500/80 uppercase font-bold tracking-wider mb-1">Commission Earned</p>
            <p className="text-xl font-bold text-white">{formatCurrency(sale.commission_amount, sale.currency_code)}</p>
            <p className="text-[10px] text-emerald-500/60 mt-1 flex items-center gap-1">
              <Percent size={10} /> {sale.commission_rate}% rate
            </p>
          </div>
        </div>

        {/* Parties */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-dark-500 mb-2">
            <User size={16} />
            <span className="text-sm font-bold uppercase tracking-widest">Parties to the Sale</span>
          </div>
          <div className="grid grid-cols-1 gap-3">
             <div className="bg-dark-800/30 border border-white/5 rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <User size={20} />
                </div>
                <div>
                   <p className="text-[10px] text-dark-500 uppercase font-bold">Buyer</p>
                   <p className="text-white font-medium">{sale.buyer_name || 'Individual Buyer'}</p>
                </div>
             </div>
             {sale.seller_name && (
               <div className="bg-dark-800/30 border border-white/5 rounded-xl p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-dark-700 flex items-center justify-center text-dark-400">
                    <User size={20} />
                  </div>
                  <div>
                     <p className="text-[10px] text-dark-500 uppercase font-bold">Seller</p>
                     <p className="text-white font-medium">{sale.seller_name}</p>
                  </div>
               </div>
             )}
          </div>
        </section>

        {/* Breakdown */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-dark-500 mb-2">
            <FileText size={16} />
            <span className="text-sm font-bold uppercase tracking-widest">Financial Breakdown</span>
          </div>
          <div className="bg-dark-800/30 rounded-2xl border border-white/5 overflow-hidden">
            <div className="p-4 border-b border-white/5 flex justify-between items-center">
              <span className="text-xs text-dark-400 font-medium">Deposit Paid</span>
              <span className="text-xs text-white font-mono">{formatCurrency(sale.deposit_amount, sale.currency_code)}</span>
            </div>
            {sale.bond_required && (
              <div className="p-4 border-b border-white/5 flex justify-between items-center">
                <span className="text-xs text-dark-400 font-medium">Bond Requirement</span>
                <span className="text-xs text-blue-400 font-mono">{formatCurrency(sale.bond_amount, sale.currency_code)}</span>
              </div>
            )}
            <div className="p-4 flex justify-between items-center bg-white/2">
              <span className="text-xs text-primary font-bold uppercase">Balance to Secure</span>
              <span className="text-sm text-white font-bold">{formatCurrency((parseFloat(sale.sale_price) || 0) - (parseFloat(sale.deposit_amount) || 0), sale.currency_code)}</span>
            </div>
          </div>
        </section>

        {/* Agents */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-dark-500 mb-2">
            <Briefcase size={16} />
            <span className="text-sm font-bold uppercase tracking-widest">Sales Agents</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-1">
                <p className="text-[10px] text-dark-500 uppercase font-bold">Listing Agent</p>
                <p className="text-xs text-white truncate">{sale.listing_agent_name || 'N/A'}</p>
             </div>
             <div className="space-y-1 text-right">
                <p className="text-[10px] text-dark-500 uppercase font-bold">Selling Agent</p>
                <p className="text-xs text-white truncate">{sale.selling_agent_name || 'N/A'}</p>
             </div>
          </div>
        </section>

        {/* Financial Integration Automation */}
        {(sale.is_posted_to_finance || sale.related_invoice_id) && (
          <section className="space-y-4 pt-4 border-t border-white/5">
            <div className="flex items-center gap-2 text-dark-500 mb-2">
              <RefreshCw size={16} className="text-primary" />
              <span className="text-sm font-bold uppercase tracking-widest text-primary">System Automation</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {sale.related_invoice_id && (
                <button 
                  onClick={() => openSidePanel('ar-invoice-detail', { invoice: { id: sale.related_invoice_id } })}
                  className="w-full bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-xl p-3 flex items-center justify-between group transition-all"
                >
                  <div className="flex items-center gap-3">
                    <FileCheck size={18} className="text-primary" />
                    <div className="text-left">
                      <p className="text-[10px] text-primary/70 uppercase font-bold">Sales Invoice</p>
                      <p className="text-xs text-white">Generated Revenue Invoice</p>
                    </div>
                  </div>
                  <ExternalLink size={14} className="text-dark-500 group-hover:text-primary transition-colors" />
                </button>
              )}
              
              {sale.journal_entry && (
                <button 
                  onClick={() => openSidePanel('journal-entry-detail', { entry: { id: sale.journal_entry } })}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl p-3 flex items-center justify-between group transition-all"
                >
                  <div className="flex items-center gap-3">
                    <FileText size={18} className="text-dark-400" />
                    <div className="text-left">
                      <p className="text-[10px] text-dark-500 uppercase font-bold">General Ledger</p>
                      <p className="text-xs text-white">{sale.journal_entry_ref || 'Journal Entry'}</p>
                    </div>
                  </div>
                  <ExternalLink size={14} className="text-dark-500 group-hover:text-white transition-colors" />
                </button>
              )}

              {sale.related_commission_id && (
                <button 
                  onClick={() => openSidePanel('commission-detail', { commission: { id: sale.related_commission_id } })}
                  className="w-full bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-center justify-between group transition-all"
                >
                  <div className="flex items-center gap-3">
                    <Percent size={18} className="text-emerald-500" />
                    <div className="text-left">
                      <p className="text-[10px] text-emerald-500/70 uppercase font-bold">Commission Record</p>
                      <p className="text-xs text-white">Agent Payout Calculation</p>
                    </div>
                  </div>
                  <ExternalLink size={14} className="text-dark-500 group-hover:text-emerald-500 transition-colors" />
                </button>
              )}
            </div>
          </section>
        )}

        {/* Dates */}
        <section className="grid grid-cols-2 gap-6 pt-4 border-t border-white/5">
           <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-dark-500">
                 <Calendar size={12} />
                 <span className="text-[10px] font-bold uppercase">Offer Date</span>
              </div>
              <p className="text-xs text-white">{formatDate(sale.offer_date)}</p>
           </div>
           {sale.transfer_date && (
             <div className="space-y-1 text-right">
                <div className="flex items-center gap-1.5 text-dark-500 justify-end">
                   <CheckCircle2 size={12} />
                   <span className="text-[10px] font-bold uppercase">Transfer Date</span>
                </div>
                <p className="text-xs text-emerald-400 font-medium">{formatDate(sale.transfer_date)}</p>
             </div>
           )}
        </section>

        {/* Notes */}
        {sale.notes && (
          <section className="space-y-2">
            <p className="text-[10px] text-dark-500 uppercase font-bold tracking-widest">Internal Notes</p>
            <div className="p-4 rounded-xl bg-dark-800/50 border border-white/5">
              <p className="text-xs text-dark-300 leading-relaxed italic">"{sale.notes}"</p>
            </div>
          </section>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-6 border-t border-white/5 bg-dark-800/30">
        <div className="flex flex-col gap-3">
          {sale.status !== 'registered' && (
            <button 
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending}
              className="w-full btn-primary py-3 flex items-center justify-center gap-2"
            >
              {confirmMutation.isPending ? <RefreshCw size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
              Confirm Completion
            </button>
          )}

          <div className="flex gap-3">
            <button 
              className="flex-1 btn-secondary py-3 flex items-center justify-center gap-2"
              onClick={() => openSidePanel('sale-form', { sale })}
            >
              <Edit2 size={18} /> Edit Record
            </button>
            
            {sale.status === 'registered' && !sale.is_posted_to_finance && (
              <button 
                onClick={() => postMutation.mutate()}
                disabled={postMutation.isPending}
                className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
              >
                {postMutation.isPending ? <RefreshCw size={18} className="animate-spin" /> : <DollarSign size={18} />}
                Post to Finance
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
