import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { 
  DollarSign, Briefcase, Calendar, Target, 
  TrendingUp, Award, Clock, Star 
} from 'lucide-react'
import { dashboardAPI } from '@/services/api'
import { formatCurrency, formatNumber } from '@/utils/format'
import { KpiCard, DashboardSkeleton } from '@/components/common/DashboardKpis'
import { useNavigate } from 'react-router-dom'

export default function AgentDashboard() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-agent'],
    queryFn: () => dashboardAPI.agent().then(res => res.data)
  })

  if (isLoading) return <DashboardSkeleton />

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="YTD Commission"
          value={formatCurrency(data.ytd_commission)}
          subtitle="Net Earnings (Jan - Dec)"
          icon={<DollarSign size={20} />}
          accent="text-emerald-400"
          onClick={() => navigate('/commissions')}
        />
        <KpiCard
          title="Deals Closed"
          value={formatNumber(data.ytd_deals)}
          subtitle="Registered Transactions"
          icon={<Briefcase size={20} />}
          accent="text-primary"
          onClick={() => navigate('/sales')}
        />
        <KpiCard
          title="Active Opportunities"
          value={formatNumber(data.active_opportunities)}
          subtitle="Pipeline Potential"
          icon={<Target size={20} />}
          accent="text-blue-400"
          onClick={() => navigate('/crm/pipeline')}
        />
        <KpiCard
          title="Pending Activities"
          value={formatNumber(data.pending_activities)}
          subtitle="Actions Required"
          icon={<Calendar size={20} />}
          accent="text-amber-400"
          onClick={() => navigate('/crm/calendar')}
        />
      </div>

      <div className="card p-8 bg-gradient-to-br from-primary/10 via-transparent to-transparent border-primary/20 relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-2xl font-bold text-white mb-2">Welcome back, {data.agent_name}!</h2>
          <p className="text-dark-400 max-w-lg mb-6">
            You're currently {data.ytd_deals < 5 ? 'building your momentum' : 'on track for a record year'}. 
            Check your pending activities to ensure no leads fall through the cracks.
          </p>
          <div className="flex gap-4">
            <button onClick={() => navigate('/crm/pipeline')} className="btn-primary">Go to Pipeline</button>
            <button onClick={() => navigate('/crm/contacts')} className="btn-ghost">View Contacts</button>
          </div>
        </div>
        <div className="absolute top-0 right-0 p-8 text-primary/10">
          <Award size={160} />
        </div>
      </div>
    </div>
  )
}
