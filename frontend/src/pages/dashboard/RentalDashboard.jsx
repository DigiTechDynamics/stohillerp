import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { 
  Building2, Key, Users, Wrench, 
  AlertCircle, Calendar, Home, DollarSign 
} from 'lucide-react'
import { dashboardAPI } from '@/services/api'
import { formatCurrency, formatNumber } from '@/utils/format'
import { KpiCard, DashboardSkeleton } from '@/components/common/DashboardKpis'
import { useNavigate } from 'react-router-dom'

export default function RentalDashboard() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-rental'],
    queryFn: () => dashboardAPI.rental().then(res => res.data)
  })

  if (isLoading) return <DashboardSkeleton />

  const { kpis, recent_maintenance } = data

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Occupancy Rate"
          value={`${kpis.occupancy_rate}%`}
          subtitle="Portfolio Utilization"
          icon={<Building2 size={20} />}
          accent="text-primary"
          onClick={() => navigate('/properties')}
        />
        <KpiCard
          title="Active Leases"
          value={formatNumber(kpis.active_leases)}
          subtitle="Current Tenants"
          icon={<Key size={20} />}
          accent="text-emerald-400"
          onClick={() => navigate('/rentals/leases')}
        />
        <KpiCard
          title="MTD Collections"
          value={formatCurrency(kpis.mtd_collections)}
          subtitle="Collected this Month"
          icon={<DollarSign size={20} />}
          accent="text-blue-400"
          onClick={() => navigate('/rentals/invoices')}
        />
        <KpiCard
          title="Maintenance Load"
          value={formatNumber(kpis.pending_maintenance)}
          subtitle="Pending Requests"
          icon={<Wrench size={20} />}
          accent="text-amber-400"
          onClick={() => navigate('/rentals/maintenance')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-white">Active Maintenance</h3>
            <button onClick={() => navigate('/rentals/maintenance')} className="text-xs text-primary hover:underline">View All</button>
          </div>
          <div className="space-y-4">
            {recent_maintenance.length === 0 && (
              <div className="p-12 text-center text-dark-500 text-sm">No active maintenance requests</div>
            )}
            {recent_maintenance.map((req, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 group hover:border-primary/20 transition-all">
                <div className="flex items-center gap-4">
                  <div className={`w-2 h-12 rounded-full ${
                    req.priority === 'urgent' ? 'bg-red-500' : req.priority === 'high' ? 'bg-amber-500' : 'bg-blue-500'
                  }`} />
                  <div>
                    <p className="text-sm font-bold text-white mb-0.5">{req.title}</p>
                    <p className="text-xs text-dark-400">{req.property__name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    req.status === 'in_progress' ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-400'
                  }`}>
                    {req.status?.replace('_', ' ')}
                  </span>
                  <p className="text-[10px] text-dark-500 mt-1 capitalize">{req.priority} Priority</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6 bg-primary/5 border-primary/20">
            <h4 className="text-sm font-bold text-white mb-4 uppercase tracking-widest">Lease Tracking</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-dark-800 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500">
                    <AlertCircle size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Overdue Invoices</p>
                    <p className="text-[10px] text-dark-400">{kpis.overdue_invoices} tenants outstanding</p>
                  </div>
                </div>
                <button onClick={() => navigate('/rentals/invoices')} className="btn-primary py-1 px-3 text-[10px]">FIX</button>
              </div>

              <div className="flex items-center justify-between p-3 bg-dark-800 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                    <Calendar size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Expiring Leases</p>
                    <p className="text-[10px] text-dark-400">{kpis.expiring_soon} renewals pending</p>
                  </div>
                </div>
                <button onClick={() => navigate('/rentals/leases')} className="btn-ghost py-1 px-3 text-[10px]">OPEN</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
