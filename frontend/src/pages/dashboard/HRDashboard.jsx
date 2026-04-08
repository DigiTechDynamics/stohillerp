import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { 
  Users, UserPlus, Calendar, CreditCard, 
  Award, Briefcase, Heart, Smile 
} from 'lucide-react'
import { dashboardAPI } from '@/services/api'
import { formatNumber } from '@/utils/format'
import { KpiCard, DashboardSkeleton } from '@/components/common/DashboardKpis'
import { useNavigate } from 'react-router-dom'

export default function HRDashboard() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-hr'],
    queryFn: () => dashboardAPI.hr().then(res => res.data)
  })

  if (isLoading) return <DashboardSkeleton />

  const { kpis, upcoming_birthdays } = data

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Headcount"
          value={formatNumber(kpis.total_headcount)}
          subtitle="Active Employees"
          icon={<Users size={20} />}
          accent="text-primary"
          onClick={() => navigate('/hr/employees')}
        />
        <KpiCard
          title="Pending Leave"
          value={formatNumber(kpis.pending_leave_requests)}
          subtitle="Requests Awaiting Approval"
          icon={<Calendar size={20} />}
          accent="text-amber-400"
          onClick={() => navigate('/hr/leave')}
        />
        <KpiCard
          title="Payroll Status"
          value={kpis.current_payroll_status}
          subtitle="Current Cycle"
          icon={<CreditCard size={20} />}
          accent="text-emerald-400"
          onClick={() => navigate('/payroll')}
        />
        <KpiCard
          title="Active Contracts"
          value={formatNumber(kpis.active_employees)}
          subtitle="In Force"
          icon={<Briefcase size={20} />}
          accent="text-blue-400"
          onClick={() => navigate('/hr/employees')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-white">Upcoming Events</h3>
            <button onClick={() => navigate('/hr/employees')} className="text-xs text-primary hover:underline">View Directory</button>
          </div>
          <div className="space-y-4">
            {upcoming_birthdays.length === 0 && (
              <div className="p-12 text-center text-dark-500 text-sm">No upcoming events this month</div>
            )}
            {upcoming_birthdays.map((emp, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 group hover:border-primary/20 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                    {emp.full_name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white mb-0.5">{emp.full_name}</p>
                    <p className="text-xs text-dark-400">Birthday: {new Date(emp.date_of_birth).toLocaleDateString([], { month: 'long', day: 'numeric' })}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-primary">
                  <Smile size={16} />
                  <span className="text-[10px] font-bold uppercase">Candidate for Wish</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6 bg-primary/5 border-primary/20">
            <h4 className="text-sm font-bold text-white mb-4 uppercase tracking-widest">HR Operations</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-dark-800 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    <UserPlus size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Onboarding</p>
                    <p className="text-[10px] text-dark-400">Manage new hires</p>
                  </div>
                </div>
                <button onClick={() => navigate('/hr/employees')} className="btn-primary py-1 px-3 text-[10px]">OPEN</button>
              </div>

              <div className="flex items-center justify-between p-3 bg-dark-800 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <Award size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Performace</p>
                    <p className="text-[10px] text-dark-400">Reviews & Appraisals</p>
                  </div>
                </div>
                <button onClick={() => navigate('/hr/employees')} className="btn-ghost py-1 px-3 text-[10px]">TRACK</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
