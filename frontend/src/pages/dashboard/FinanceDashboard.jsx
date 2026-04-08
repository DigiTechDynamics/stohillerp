import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { 
  DollarSign, Landmark, CreditCard, PieChart, 
  ArrowUpRight, ArrowDownRight, Briefcase, FileText 
} from 'lucide-react'
import { dashboardAPI } from '@/services/api'
import { formatCurrency } from '@/utils/format'
import { KpiCard, DashboardSkeleton } from '@/components/common/DashboardKpis'
import { useNavigate } from 'react-router-dom'

export default function FinanceDashboard() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-finance'],
    queryFn: () => dashboardAPI.finance().then(res => res.data)
  })

  if (isLoading) return <DashboardSkeleton />

  const { kpis, recent_entries, bank_reconciliations } = data

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Cash Position"
          value={formatCurrency(kpis.cash_position)}
          subtitle="Consolidated Bank Balance"
          icon={<Landmark size={20} />}
          accent="text-emerald-400"
          onClick={() => navigate('/finance/bank')}
        />
        <KpiCard
          title="Accounts Receivable"
          value={formatCurrency(kpis.ar_balance)}
          subtitle="Outstanding Invoices"
          icon={<ArrowUpRight size={20} />}
          accent="text-blue-400"
          onClick={() => navigate('/finance/ar')}
        />
        <KpiCard
          title="Accounts Payable"
          value={formatCurrency(kpis.ap_balance)}
          subtitle="Pending Supplier Bills"
          icon={<ArrowDownRight size={20} />}
          accent="text-rose-400"
          onClick={() => navigate('/finance/ap')}
        />
        <KpiCard
          title="MTD Revenue"
          value={formatCurrency(kpis.mtd_revenue)}
          subtitle="Current Month to Date"
          icon={<DollarSign size={20} />}
          accent="text-amber-400"
          onClick={() => navigate('/finance/reports')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-white">Recent Journal Entries</h3>
            <button onClick={() => navigate('/finance/entries')} className="text-xs text-primary hover:underline">View All</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/5 text-dark-500 uppercase text-[10px] font-bold tracking-widest">
                  <th className="pb-3">Reference</th>
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recent_entries.map((entry) => (
                  <tr key={entry.entry_number} className="group hover:bg-white/5 transition-colors">
                    <td className="py-3 font-mono text-xs text-primary">{entry.entry_number}</td>
                    <td className="py-3 text-dark-300">{entry.entry_date}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        entry.status === 'posted' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="py-3 text-dark-400 truncate max-w-[200px]">{entry.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6 bg-primary/5 border-primary/20">
            <h4 className="text-sm font-bold text-white mb-4 uppercase tracking-widest">Action Required</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-dark-800 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <Landmark size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Bank Reconciliation</p>
                    <p className="text-[10px] text-dark-400">{bank_reconciliations} statements pending</p>
                  </div>
                </div>
                <button onClick={() => navigate('/finance/bank')} className="btn-primary py-1 px-3 text-[10px]">FIX</button>
              </div>

              <div className="flex items-center justify-between p-3 bg-dark-800 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                    <FileText size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Fixed Assets</p>
                    <p className="text-[10px] text-dark-400">{kpis.asset_count} total assets tracked</p>
                  </div>
                </div>
                <button onClick={() => navigate('/finance/assets')} className="btn-ghost py-1 px-3 text-[10px]">VIEW</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
