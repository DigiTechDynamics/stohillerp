// Stohill Properties - CRM Reporting & Analytics Page
// Pipeline summary, Win/Loss funnel, Revenue Forecast, Activity Summary
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Trophy, BarChart2, Calendar, DollarSign, Percent, AlertCircle, Activity, Users, Target
} from 'lucide-react'
import { crmAPI } from '@/services/api'
import { formatCurrency } from '@/utils/format'

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card
// ─────────────────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color = 'primary' }) {
  const colors = {
    primary: 'bg-primary/10 text-primary border-primary/20',
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-dark-800/40 border border-white/5 rounded-2xl p-5 flex items-start gap-4"
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center border flex-shrink-0 ${colors[color]}`}>
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">{label}</p>
        <p className="text-2xl font-bold text-white tracking-tighter font-mono">{value}</p>
        {sub && <p className="text-[10px] text-dark-500 mt-0.5">{sub}</p>}
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline Funnel (SVG bars)
// ─────────────────────────────────────────────────────────────────────────────
function PipelineFunnel({ stages }) {
  if (!stages?.length) return null
  const max = Math.max(...stages.map(s => s.count), 1)

  return (
    <div className="space-y-3">
      {stages.map((stage, i) => (
        <motion.div
          key={stage.stage_id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.04 }}
          className="flex items-center gap-3"
        >
          {/* Stage label */}
          <div className="w-32 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
              <span className="text-[10px] font-bold text-dark-400 truncate">{stage.stage_name}</span>
            </div>
          </div>
          {/* Bar */}
          <div className="flex-1 h-8 bg-dark-700/50 rounded-lg overflow-hidden relative">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(stage.count / max) * 100}%` }}
              transition={{ duration: 0.6, delay: i * 0.04, ease: 'easeOut' }}
              className="h-full rounded-lg opacity-80"
              style={{ backgroundColor: stage.color }}
            />
            <div className="absolute inset-0 flex items-center justify-between px-3">
              <span className="text-[10px] font-bold text-white">{stage.count} deals</span>
              <span className="text-[10px] font-mono text-white/80">
                {formatCurrency(stage.total_revenue, 'USD')}
              </span>
            </div>
          </div>
          {/* Probability */}
          <div className="w-12 text-right flex-shrink-0">
            <span className="text-[10px] font-bold text-dark-500">{stage.probability}%</span>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Forecast Table
// ─────────────────────────────────────────────────────────────────────────────
function ForecastTable({ data }) {
  if (!data?.agents?.length) {
    return (
      <div className="text-center py-12 text-dark-600">
        <Target size={32} className="mx-auto mb-3" />
        <p className="text-sm">No forecast data available yet.</p>
        <p className="text-[10px] mt-1">Assign agents and set expected close dates to see the forecast.</p>
      </div>
    )
  }

  const { agents, months } = data
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/5">
            <th className="text-left py-3 px-4 text-[10px] font-bold text-dark-500 uppercase tracking-widest w-36">Agent</th>
            {months.map(m => (
              <th key={m} className="text-right py-3 px-4 text-[10px] font-bold text-dark-500 uppercase tracking-widest">{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {agents.map(agent => (
            <tr key={agent.agent_id} className="border-b border-white/5 hover:bg-white/[0.02] transition-all">
              <td className="py-3 px-4 font-semibold text-white">{agent.agent_name}</td>
              {months.map(m => {
                const d = agent.months[m]
                return (
                  <td key={m} className="py-3 px-4 text-right">
                    {d?.weighted > 0 ? (
                      <div>
                        <p className="font-mono font-bold text-white">{formatCurrency(d.weighted, 'USD')}</p>
                        <p className="text-[9px] text-dark-600">{d.count} deal{d.count !== 1 ? 's' : ''}</p>
                      </div>
                    ) : (
                      <span className="text-dark-700">—</span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity Summary
// ─────────────────────────────────────────────────────────────────────────────
function ActivitySummary({ data }) {
  const activityTypes = [
    { type: 'call', label: 'Calls', color: 'text-blue-400' },
    { type: 'email', label: 'Emails', color: 'text-primary' },
    { type: 'meeting', label: 'Meetings', color: 'text-purple-400' },
    { type: 'viewing', label: 'Viewings', color: 'text-emerald-400' },
    { type: 'task', label: 'Tasks', color: 'text-amber-400' },
    { type: 'whatsapp', label: 'WhatsApp', color: 'text-green-400' },
  ]

  return (
    <div className="grid grid-cols-2 gap-4">
      {[
        { label: 'Overdue', value: data?.overdue || 0, color: 'red', icon: AlertCircle },
        { label: 'Due Today', value: data?.due_today || 0, color: 'amber', icon: Calendar },
        { label: 'Due This Week', value: data?.due_this_week || 0, color: 'blue', icon: Calendar },
        { label: 'Completed Total', value: data?.completed_total || 0, color: 'green', icon: Trophy },
      ].map(item => (
        <div key={item.label} className={`p-4 rounded-xl border ${
          item.color === 'red' ? 'bg-red-500/5 border-red-500/15' :
          item.color === 'amber' ? 'bg-amber-500/5 border-amber-500/15' :
          item.color === 'green' ? 'bg-emerald-500/5 border-emerald-500/15' :
          'bg-blue-500/5 border-blue-500/15'
        }`}>
          <item.icon size={16} className={
            item.color === 'red' ? 'text-red-400 mb-2' :
            item.color === 'amber' ? 'text-amber-400 mb-2' :
            item.color === 'green' ? 'text-emerald-400 mb-2' :
            'text-blue-400 mb-2'
          } />
          <p className="text-2xl font-bold font-mono text-white">{item.value}</p>
          <p className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">{item.label}</p>
        </div>
      ))}

      {/* Type breakdown */}
      {data?.by_type?.length > 0 && (
        <div className="col-span-2 bg-dark-800/40 rounded-xl border border-white/5 p-4">
          <p className="text-[10px] font-bold text-dark-500 uppercase tracking-widest mb-4">By Activity Type</p>
          <div className="flex flex-wrap gap-3">
            {data.by_type.map(item => {
              const typeInfo = activityTypes.find(t => t.type === item.activity_type) || { label: item.activity_type, color: 'text-dark-400' }
              return (
                <div key={item.activity_type} className="flex items-center gap-2">
                  <span className={`text-[11px] font-bold ${typeInfo.color}`}>{item.count}</span>
                  <span className="text-[10px] text-dark-500">{typeInfo.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Win/Loss Funnel
// ─────────────────────────────────────────────────────────────────────────────
function WinLossSummary({ data }) {
  const total = (data?.won || 0) + (data?.lost || 0)
  const winPct = total > 0 ? Math.round((data.won / total) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/15">
          <p className="text-2xl font-bold font-mono text-emerald-400">{data?.won || 0}</p>
          <p className="text-[10px] font-bold text-dark-500 uppercase tracking-widest mt-1">Won</p>
        </div>
        <div className="text-center p-4 bg-primary/5 rounded-xl border border-primary/15">
          <p className="text-2xl font-bold font-mono text-primary">{winPct}%</p>
          <p className="text-[10px] font-bold text-dark-500 uppercase tracking-widest mt-1">Win Rate</p>
        </div>
        <div className="text-center p-4 bg-red-500/5 rounded-xl border border-red-500/15">
          <p className="text-2xl font-bold font-mono text-red-400">{data?.lost || 0}</p>
          <p className="text-[10px] font-bold text-dark-500 uppercase tracking-widest mt-1">Lost</p>
        </div>
      </div>

      {/* Win rate bar */}
      <div>
        <div className="flex items-center justify-between text-[10px] font-bold text-dark-500 mb-2">
          <span>WIN RATE</span><span>{winPct}%</span>
        </div>
        <div className="h-3 bg-dark-700 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${winPct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full"
          />
        </div>
      </div>

      {/* Lost reasons */}
      {data?.lost_reasons?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-dark-500 uppercase tracking-widest mb-3">Top Loss Reasons</p>
          <div className="space-y-2">
            {data.lost_reasons.slice(0, 5).map((r, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-xs text-dark-300">{r.lost_reason__name || 'Unspecified'}</span>
                <span className="text-xs font-bold font-mono text-red-400">{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function CrmReportingPage() {
  const [pipelineId, setPipelineId] = useState('')

  const { data: pipelinesRes } = useQuery({
    queryKey: ['crm-pipelines'],
    queryFn: () => crmAPI.pipelines.list()
  })
  const pipelines = Array.isArray(pipelinesRes?.data) ? pipelinesRes.data : (pipelinesRes?.data?.results || [])

  const { data: overviewRes, isLoading: overviewLoading } = useQuery({
    queryKey: ['crm-report-overview', pipelineId],
    queryFn: () => crmAPI.reports.overview(pipelineId)
  })
  const { data: pipelineRes, isLoading: pipelineLoading } = useQuery({
    queryKey: ['crm-report-pipeline', pipelineId],
    queryFn: () => crmAPI.reports.pipeline(pipelineId)
  })
  const { data: forecastRes, isLoading: forecastLoading } = useQuery({
    queryKey: ['crm-report-forecast'],
    queryFn: () => crmAPI.reports.forecast()
  })
  const { data: winLossRes, isLoading: winLossLoading } = useQuery({
    queryKey: ['crm-report-winloss', pipelineId],
    queryFn: () => crmAPI.reports.winLoss(pipelineId)
  })
  const { data: activitiesRes, isLoading: activitiesLoading } = useQuery({
    queryKey: ['crm-report-activities'],
    queryFn: () => crmAPI.reports.activities()
  })

  const overview = overviewRes?.data
  const pipelineStages = pipelineRes?.data
  const forecast = forecastRes?.data
  const winLoss = winLossRes?.data
  const activityData = activitiesRes?.data

  const isLoading = overviewLoading || pipelineLoading

  return (
    <div className="p-4 lg:p-6 space-y-6 overflow-y-auto h-full custom-scrollbar">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <BarChart2 size={22} className="text-primary" />
            CRM Analytics
          </h2>
          <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mt-0.5">
            Pipeline performance & revenue intelligence
          </p>
        </div>
        {/* Pipeline selector */}
        {pipelines.length > 1 && (
          <select
            value={pipelineId}
            onChange={e => setPipelineId(e.target.value)}
            className="form-input text-xs h-9 w-44"
          >
            <option value="">All Pipelines</option>
            {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {/* KPI Row */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-dark-800/40 rounded-2xl animate-pulse border border-white/5" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total Pipeline"
            value={formatCurrency(overview?.total_pipeline || 0, 'USD')}
            sub={`${overview?.open_opportunities || 0} open deals`}
            icon={DollarSign}
            color="primary"
          />
          <KpiCard
            label="Weighted Forecast"
            value={formatCurrency(overview?.weighted_forecast || 0, 'USD')}
            sub="Probability-adjusted"
            icon={Target}
            color="blue"
          />
          <KpiCard
            label="Win Rate"
            value={`${overview?.win_rate || 0}%`}
            sub={`${overview?.won_total || 0} won / ${overview?.lost_total || 0} lost`}
            icon={Percent}
            color="green"
          />
          <KpiCard
            label="Avg Deal Size"
            value={formatCurrency(overview?.avg_deal_size || 0, 'USD')}
            sub="Won deals"
            icon={Trophy}
            color="amber"
          />
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Pipeline Funnel */}
        <div className="bg-dark-800/40 rounded-2xl border border-white/5 p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-bold text-white">Pipeline by Stage</h3>
              <p className="text-[10px] text-dark-500 uppercase tracking-widest">Deal count & value per stage</p>
            </div>
          </div>
          {pipelineLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-dark-700 rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <PipelineFunnel stages={pipelineStages} />
          )}
        </div>

        {/* Win / Loss Summary */}
        <div className="bg-dark-800/40 rounded-2xl border border-white/5 p-5">
          <div className="mb-5">
            <h3 className="text-sm font-bold text-white">Win / Loss Analysis</h3>
            <p className="text-[10px] text-dark-500 uppercase tracking-widest">Close rate & top loss reasons</p>
          </div>
          {winLossLoading ? (
            <div className="h-32 bg-dark-700 rounded-xl animate-pulse" />
          ) : (
            <WinLossSummary data={winLoss} />
          )}
        </div>

        {/* Activity Summary */}
        <div className="bg-dark-800/40 rounded-2xl border border-white/5 p-5">
          <div className="mb-5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity size={16} className="text-primary" />
              Activity Dashboard
            </h3>
            <p className="text-[10px] text-dark-500 uppercase tracking-widest">Scheduled & completed actions</p>
          </div>
          {activitiesLoading ? (
            <div className="h-32 bg-dark-700 rounded-xl animate-pulse" />
          ) : (
            <ActivitySummary data={activityData} />
          )}
        </div>

        {/* Forecast spanning full width on xl */}
        <div className="bg-dark-800/40 rounded-2xl border border-white/5 p-5 xl:col-span-2">
          <div className="mb-5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Users size={16} className="text-primary" />
              Revenue Forecast by Agent
            </h3>
            <p className="text-[10px] text-dark-500 uppercase tracking-widest">Weighted by deal probability • Next 6 months</p>
          </div>
          {forecastLoading ? (
            <div className="h-32 bg-dark-700 rounded-xl animate-pulse" />
          ) : (
            <ForecastTable data={forecast} />
          )}
        </div>
      </div>
    </div>
  )
}
