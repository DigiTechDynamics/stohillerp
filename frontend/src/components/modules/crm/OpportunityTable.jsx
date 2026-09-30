import { motion, AnimatePresence } from 'framer-motion'
import { DollarSign, TrendingUp, User, Edit2, Trash2, Mail, Clock } from 'lucide-react'
import { formatCurrency, formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'

export default function OpportunityTable({ opportunities, isLoading }) {
  const openPanel = useUIStore((s) => s.openSidePanel)

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 w-full bg-dark-800 rounded-xl animate-pulse border border-white/5" />
        ))}
      </div>
    )
  }

  return (
    <div className="card overflow-hidden border-white/5 bg-dark-800/20">
      <table className="data-table">
        <thead>
          <tr>
            <th className="text-[10px] uppercase tracking-widest opacity-50">Deal / Lead</th>
            <th className="text-[10px] uppercase tracking-widest opacity-50">Contact info</th>
            <th className="text-[10px] uppercase tracking-widest opacity-50">Stage</th>
            <th className="text-[10px] uppercase tracking-widest opacity-50">Expected Revenue</th>
            <th className="text-[10px] uppercase tracking-widest opacity-50">Next Activity</th>
            <th className="text-[10px] uppercase tracking-widest opacity-50">Priority</th>
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence mode="popLayout">
            {opportunities.map((opp) => (
              <motion.tr
                key={opp.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="hover:bg-primary/5 transition-colors cursor-pointer group border-b border-white/5 last:border-0"
                onClick={() => openPanel('crm-detail', { id: opp.id, type: opp.is_lead ? 'lead' : 'opportunity' })}
              >
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs border border-white/5 shadow-inner ${opp.is_lead ? 'bg-amber-500/10 text-amber-500' : 'bg-primary/10 text-primary'}`}>
                      {opp.is_lead ? <Mail size={14} /> : <TrendingUp size={14} />}
                    </div>
                    <div>
                      <p className="text-sm text-white font-bold group-hover:text-primary transition-colors">{opp.title}</p>
                      <p className="text-[10px] font-mono text-dark-500 uppercase tracking-tighter">{opp.reference}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 text-xs text-white font-medium">
                      <User size={12} className="text-dark-500" />
                      {opp.contact_display || '—'}
                    </div>
                    <span className="text-[10px] text-dark-500 font-medium ml-5">{opp.email_from || 'No contact email'}</span>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest border border-primary/20 bg-primary/10 text-primary`}>
                    {opp.stage_name}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-white font-mono tracking-tighter">
                      {opp.expected_revenue ? formatCurrency(parseFloat(opp.expected_revenue), opp.currency_code) : '—'}
                    </span>
                    <span className="text-[10px] text-dark-500 font-medium italic">at {opp.probability}% prob.</span>
                  </div>
                </td>
                <td className="px-4 py-4">
                   {opp.next_activity_date ? (
                     <div className="flex items-center gap-2 text-[10px] text-amber-400 font-bold uppercase tracking-wider bg-amber-400/5 px-2 py-1 rounded-lg border border-amber-400/10">
                       <Clock size={10} />
                       {formatDate(opp.next_activity_date)}
                     </div>
                   ) : (
                     <span className="text-[10px] text-dark-600 font-medium uppercase tracking-widest">No activity planned</span>
                   )}
                </td>
                <td className="px-4 py-4">
                   <div className="flex gap-0.5">
                     {[...Array(3)].map((_, i) => (
                       <DollarSign key={i} size={12} className={i < parseInt(opp.priority) ? 'text-amber-400 fill-amber-400' : 'text-dark-700'} />
                     ))}
                   </div>
                </td>
                <td className="px-4 py-4 text-right">
                  <div className="flex items-center justify-end gap-2 text-dark-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      className="p-1.5 hover:text-primary transition-colors hover:bg-white/5 rounded-lg"
                      onClick={(e) => { e.stopPropagation(); openPanel('opportunity-form', { opportunity: opp }) }}
                    >
                      <Edit2 size={14} />
                    </button>
                    <button className="p-1.5 hover:text-red-400 transition-colors hover:bg-white/5 rounded-lg"><Trash2 size={14} /></button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
          {opportunities.length === 0 && (
            <tr>
              <td colSpan={7} className="text-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mx-auto mb-4 border border-white/5">
                   <TrendingUp size={32} className="text-dark-600" />
                </div>
                <p className="text-white font-medium mb-1">No Leads or Opportunities Found</p>
                <p className="text-xs text-dark-500">Create your first deal to start tracking your pipeline.</p>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
