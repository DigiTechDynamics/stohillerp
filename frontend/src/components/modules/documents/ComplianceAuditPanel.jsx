import { useQuery } from '@tanstack/react-query'
import { Shield, CheckCircle2, AlertCircle, Clock, Search, Filter, Info, X } from 'lucide-react'
import { documentsAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import { motion } from 'framer-motion'

export default function ComplianceAuditPanel() {
  const { closeSidePanel } = useUIStore()
  
  const { data, isLoading } = useQuery({
    queryKey: ['compliance-audit'],
    queryFn: () => documentsAPI.compliance.list(),
  })

  const auditItems = data?.data?.results || [
    { id: 1, title: 'Property Tax Clearances', status: 'compliant', score: 100, last_check: '2024-03-20' },
    { id: 2, title: 'KYC Verification (Tenants)', status: 'warning', score: 82, last_check: '2024-03-21' },
    { id: 3, title: 'Lease Agreement Signatures', status: 'critical', score: 45, last_check: '2024-03-22' },
    { id: 4, title: 'Insurance Certificates', status: 'compliant', score: 98, last_check: '2024-03-15' },
  ]

  const getStatusColor = (status) => {
    switch (status) {
      case 'compliant': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
      case 'warning': return 'text-amber-500 bg-amber-500/10 border-amber-500/20'
      case 'critical': return 'text-rose-500 bg-rose-500/10 border-rose-500/20'
      default: return 'text-dark-400 bg-dark-700'
    }
  }

  return (
    <div className="flex flex-col h-full bg-dark-900">
      <div className="p-6 border-b border-white/5 bg-gradient-to-br from-primary/5 to-transparent flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Shield size={20} className="text-primary" /> Compliance Audit
          </h2>
          <p className="text-[10px] text-dark-500 uppercase tracking-widest mt-1">System-wide documentation health</p>
        </div>
        <button onClick={closeSidePanel} className="p-2 text-dark-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="p-6 flex-1 overflow-y-auto space-y-8 custom-scrollbar">
        {/* Scoreboard */}
        <div className="grid grid-cols-1 gap-4">
           <div className="card p-5 bg-dark-800/30 border-white/5 overflow-hidden relative">
              <div className="absolute top-0 right-0 p-3 opacity-5">
                <Shield size={80} />
              </div>
              <div className="relative z-10">
                <p className="text-[10px] text-dark-500 font-bold uppercase tracking-[0.2em] mb-4">Overall Score</p>
                <div className="flex items-end gap-3">
                   <span className="text-4xl font-bold font-display text-white">81%</span>
                   <span className="text-xs text-amber-500 font-bold mb-1.5 flex items-center gap-1">
                      <Clock size={12} /> Requires Review
                   </span>
                </div>
                <div className="mt-4 w-full h-1.5 bg-dark-900 rounded-full overflow-hidden border border-white/5">
                   <motion.div 
                     initial={{ width: 0 }}
                     animate={{ width: '81%' }}
                     className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 shadow-gold"
                   />
                </div>
              </div>
           </div>
        </div>

        {/* Audit Sections */}
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-dark-500 uppercase tracking-[0.2em]">Compliance Checks</h3>
            <button className="text-[10px] text-primary hover:text-white font-bold uppercase transition-colors">Run Full Scan</button>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {auditItems.map((item) => (
              <div key={item.id} className="card p-4 hover:border-white/10 transition-all group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${getStatusColor(item.status)}`}>
                       {item.status === 'compliant' ? <CheckCircle2 size={18} /> : 
                        item.status === 'warning' ? <Info size={18} /> : <AlertCircle size={18} />}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">{item.title}</h4>
                      <p className="text-[10px] text-dark-500 mt-0.5 uppercase tracking-wider">Last Sync: {item.last_check}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-white mb-1">{item.score}%</p>
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest ${getStatusColor(item.status)}`}>
                       {item.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recommendations */}
        <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10 space-y-3">
           <div className="flex items-center gap-2 text-blue-400">
              <Info size={16} />
              <h4 className="text-[10px] font-bold uppercase tracking-widest">Active Recommendation</h4>
           </div>
           <p className="text-xs text-blue-100/70 leading-relaxed italic">
             "32 units in the CBD Portfolio are missing updated 'Safety Certificates'. Batch upload is recommended to maintain 100% compliance score."
           </p>
           <button className="text-[10px] text-blue-400 font-bold uppercase hover:text-white transition-colors">Go to CBD Portfolio</button>
        </div>
      </div>

      <div className="p-6 border-t border-white/5 bg-dark-800/30">
        <button onClick={closeSidePanel} className="w-full btn-secondary py-3 flex items-center justify-center gap-2">
          Close Audit Console
        </button>
      </div>
    </div>
  )
}
