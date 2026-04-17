// Stohill Properties - Executive Command Center Dashboard
// The centerpiece KPIs, charts, pipeline overview, top agents

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Building2, TrendingUp, Home, Award, Users, DollarSign,
  ArrowUpRight, ArrowDownRight, AlertTriangle, BarChart3,
  RefreshCw, Calendar, ShoppingBag, Package, Maximize2
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'
import { dashboardAPI } from '@/services/api'
import { formatCurrency, formatNumber } from '@/utils/format'
import { useAuthStore, useUIStore } from '@/stores/authStore'
import { useNavigate } from 'react-router-dom'
import { KpiSkeleton, ChartSkeleton } from '@/components/common/Skeleton'

// ─── Animated KPI Card ────────────────────────────────────────────────────────

function KpiCard({ title, value, subtitle, icon, trend, trendLabel, accent = 'text-primary', delay = 0, onClick }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      className={`kpi-card group ${onClick ? 'cursor-pointer hover:border-primary/30' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center ${accent}`}>
          {icon}
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={(e) => {
              e.stopPropagation()
              useUIStore.getState().setFocusedElement({
                id: `kpi-${title.replace(/ /g, '-').toLowerCase()}`,
                title,
                content: (
                  <div className="flex flex-col items-center justify-center text-center space-y-8 py-12">
                    <div className={`w-32 h-32 rounded-3xl bg-white/5 flex items-center justify-center ${accent} scale-150 mb-8`}>
                      {icon && typeof icon === 'object' ? React.cloneElement(icon, { size: 64 }) : icon}
                    </div>
                    <h1 className="text-8xl font-black text-white tracking-tighter">{value}</h1>
                    <p className="text-2xl text-dark-400 font-medium">{title}</p>
                    <div className="mt-8 text-primary font-bold text-xl">{trend !== undefined ? `${trend > 0 ? '+' : ''}${trend}% Trend` : ''}</div>
                  </div>
                )
              })
            }}
            className="p-2 rounded-lg bg-white/5 text-dark-400 opacity-0 group-hover:opacity-100 hover:text-white hover:bg-white/10 transition-all"
            title="Focus Mode"
          >
            <Maximize2 size={14} />
          </button>
          {trend !== undefined && (
            <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full
              ${trend >= 0
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-red-500/10 text-red-400'}`}>
              {trend >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {Math.abs(trend)}%
            </div>
          )}
        </div>
      </div>
      <div className="stat-value mb-0.5">{value}</div>
      <div className="stat-label">{title}</div>
      {subtitle && <div className="text-xs text-dark-500 mt-1">{subtitle}</div>}
      {trendLabel && <div className="text-xs text-dark-500 mt-1">{trendLabel}</div>}
    </motion.div>
  )
}

// ─── Custom Chart Tooltip ─────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-dark-800 border border-white/10 rounded-lg px-3 py-2 text-xs shadow-dark">
      <p className="text-dark-400 mb-1">{label}</p>
      <p className="text-white font-semibold">{formatCurrency(payload[0]?.value || 0)}</p>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function ExecutiveDashboard({ isEmbedded = false }) {
  const executiveMode = useAuthStore((s) => s.executiveMode)
  const user = useAuthStore((s) => s.user)
  const openPanel = useUIStore((s) => s.openSidePanel)
  const navigate = useNavigate()

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['executive-dashboard'],
    queryFn: async () => {
      const res = await dashboardAPI.executive()
      return res.data
    },
    refetchInterval: 60_000, // Refresh every minute
  })

  if (isLoading) return <DashboardSkeleton />
  if (error || !data) return <DashboardError onRetry={refetch} error={error} />

  const { kpis, charts, trends } = data
  const revenueData = (charts?.revenue_trend || []).map((d) => ({
    month: d.month,
    revenue: d.revenue,
  }))
  const pipelineData = (charts?.pipeline_stages || []).map((d) => ({
    stage: d.stage?.split?.(' ')?.[0] || 'Unknown', // Short label
    count: d.count,
    value: d.value,
    color: d.color,
  }))

  return (
    <div className={isEmbedded ? "space-y-6" : "p-4 lg:p-6 space-y-6"}>
      {/* Header */}
      {!isEmbedded && (
        <div className="flex items-start justify-between">
          <div>
            <motion.h1
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="font-display text-2xl lg:text-3xl text-white"
            >
              {executiveMode ? `Executive Command Center • ${user?.first_name || 'Executive'}` : `${getGreeting()}, ${user?.first_name || 'User'}`}
            </motion.h1>
            <p className="text-dark-400 text-sm mt-1">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {dataUpdatedAt > 0 && (
              <span className="text-xs text-dark-500">
                Updated {new Date(dataUpdatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button onClick={() => refetch()} className="btn-ghost p-2">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── KPI Grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis?.properties && (
          <KpiCard
            title="Portfolio Value"
            value={formatCurrency(parseFloat(kpis.properties.portfolio_value || 0), 'USD')}
            subtitle={`${kpis.properties.total || 0} properties`}
            icon={<Building2 size={20} />}
            trend={trends?.portfolio}
            trendLabel="vs last month"
            delay={0}
            onClick={() => navigate('/properties')}
          />
        )}
        {kpis?.sales && (
          <KpiCard
            title="YTD Sales Revenue"
            value={formatCurrency(parseFloat(kpis.sales.ytd_value || 0), 'USD')}
            subtitle={`${kpis.sales.ytd_count || 0} transactions`}
            icon={<TrendingUp size={20} />}
            accent="text-emerald-400"
            trend={trends?.sales}
            delay={0.05}
            onClick={() => navigate('/sales')}
          />
        )}
        {kpis?.rentals && (
          <KpiCard
            title="Monthly Rental Income"
            value={formatCurrency(parseFloat(kpis.rentals.monthly_income || 0))}
            subtitle={`${kpis.rentals.active_leases || 0} active leases`}
            icon={<Home size={20} />}
            accent="text-blue-400"
            trend={trends?.rentals}
            trendLabel={`${formatCurrency(parseFloat(kpis.rentals.annual_income || 0))} annualised`}
            delay={0.1}
            onClick={() => navigate('/rentals')}
          />
        )}
        {kpis?.sales && (
          <KpiCard
            title="Pipeline Value"
            value={formatCurrency(parseFloat(kpis.sales.pipeline_value || 0), 'USD')}
            subtitle="Active opportunities"
            icon={<BarChart3 size={20} />}
            accent="text-purple-400"
            delay={0.15}
            onClick={() => openPanel('add-sale')}
          />
        )}
      </div>

      {/* ── Second KPI Row ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis?.properties && (
          <>
            <KpiCard
              title="Occupancy Rate"
              value={`${kpis.properties.occupancy_rate || 0}%`}
              subtitle={`${kpis.properties.occupied || 0} of ${kpis.properties.total || 1} occupied`}
              icon={<Building2 size={20} />}
              accent="text-primary"
              delay={0.2}
              onClick={() => navigate('/properties')}
            />
            <KpiCard
              title="Available Properties"
              value={String(kpis.properties.available || 0)}
              subtitle={`${kpis.properties.under_contract || 0} under contract`}
              icon={<Building2 size={20} />}
              accent="text-primary"
              delay={0.25}
              onClick={() => openPanel('add-property')}
            />
          </>
        )}
        {kpis?.commissions && (
          <KpiCard
            title="YTD Commissions Paid"
            value={formatCurrency(parseFloat(kpis.commissions.ytd_paid || 0))}
            subtitle={`${formatCurrency(parseFloat(kpis.commissions.pending || 0))} pending`}
            icon={<Award size={20} />}
            accent="text-amber-400"
            delay={0.3}
            onClick={() => navigate('/commissions')}
          />
        )}
        {(kpis?.rentals || kpis?.crm) && (
          <KpiCard
            title={kpis?.rentals?.overdue_count > 0 ? '⚠ Overdue Rentals' : 'Active Contacts'}
            value={kpis?.rentals?.overdue_count > 0
              ? formatCurrency(parseFloat(kpis.rentals.overdue_amount || 0))
              : formatNumber(kpis?.crm?.total_contacts || 0)
            }
            subtitle={kpis?.rentals?.overdue_count > 0
              ? `${kpis.rentals.overdue_count} invoices overdue`
              : `+${kpis?.crm?.new_leads_this_month || 0} new leads this month`
            }
            icon={kpis?.rentals?.overdue_count > 0 ? <AlertTriangle size={20} /> : <Users size={20} />}
            accent={kpis?.rentals?.overdue_count > 0 ? 'text-red-400' : 'text-emerald-400'}
            delay={0.35}
            onClick={() => {
              if (kpis?.rentals?.overdue_count > 0) {
                navigate('/rentals')
              } else {
                navigate('/crm')
              }
            }}
          />
        )}
      </div>

      {/* ── Third KPI Row ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis?.supply_chain && (
          <>
            <KpiCard
              title="Procurement Approvals"
              value={String(kpis.supply_chain.pending_approvals || 0)}
              subtitle="Pending MD/Finance review"
              icon={<ShoppingBag size={20} />}
              accent={kpis.supply_chain.pending_approvals > 0 ? 'text-amber-400' : 'text-primary'}
              delay={0.4}
              onClick={() => navigate('/procurement')}
            />
            <KpiCard
              title="Low Stock Alerts"
              value={String(kpis.supply_chain.low_stock_items || 0)}
              subtitle="Items below reorder point"
              icon={<Package size={20} />}
              accent={kpis.supply_chain.low_stock_items > 0 ? 'text-rose-400' : 'text-primary'}
              delay={0.45}
              onClick={() => navigate('/inventory')}
            />
          </>
        )}
        {kpis?.finance && (
          <>
            <KpiCard
              title="Operating Margin"
              value={`${kpis.finance.operating_margin || 0}%`}
              subtitle={`Target: 35.0%`}
              icon={<TrendingUp size={20} />}
              accent="text-emerald-400"
              delay={0.5}
              onClick={() => navigate('/finance/reports')}
            />
            <KpiCard
              title="Cash Position"
              value={formatCurrency(parseFloat(kpis.finance.cash_position || 0))}
              subtitle="Consolidated Bank Balances"
              icon={<DollarSign size={20} />}
              accent="text-emerald-400"
              delay={0.55}
              onClick={() => navigate('/finance/bank')}
            />
          </>
        )}
      </div>

      {/* ── Charts Row ───────────────────────────────────────────────── */}
      {(charts?.revenue_trend || charts?.pipeline_stages) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Revenue Trend - spans 2 cols */}
          {charts?.revenue_trend && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className={`${charts?.pipeline_stages ? 'lg:col-span-2' : 'lg:col-span-3'} card p-5`}
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="font-semibold text-white">Revenue Trend</h3>
                  <p className="text-xs text-dark-400 mt-0.5">Monthly revenue – last 12 months</p>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => {
                        useUIStore.getState().setFocusedElement({
                          id: 'chart-revenue',
                          title: 'Revenue Analysis',
                          content: (
                            <div className="bg-dark-900/50 p-8 rounded-3xl border border-white/5 h-[600px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={revenueData}>
                                  <defs>
                                    <linearGradient id="revGradFocus" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#E5A645" stopOpacity={0.3} />
                                      <stop offset="95%" stopColor="#E5A645" stopOpacity={0} />
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                                  <XAxis dataKey="month" tick={{ fill: '#777' }} />
                                  <YAxis tick={{ fill: '#777' }} tickFormatter={(v) => formatCurrency(v, 'USD')} />
                                  <Tooltip content={<ChartTooltip />} />
                                  <Area type="monotone" dataKey="revenue" stroke="#E5A645" strokeWidth={4} fill="url(#revGradFocus)" />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          )
                        })
                    }}
                    className="p-2 rounded-lg bg-white/5 text-dark-400 hover:text-white transition-colors"
                  >
                    <Maximize2 size={16} />
                  </button>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span className="text-xs text-dark-400">Revenue</span>
                  </div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={revenueData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E5A645" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#E5A645" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#777' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#777' }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => formatCurrency(v, 'USD')} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="revenue" stroke="#E5A645" strokeWidth={2}
                    fill="url(#revGrad)" dot={false} activeDot={{ r: 4, fill: '#E5A645' }} />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          )}

          {/* Pipeline Stages */}
          {charts?.pipeline_stages && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className={`${charts?.revenue_trend ? 'lg:col-span-1' : 'lg:col-span-3'} card p-5`}
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="font-semibold text-white mb-1">Pipeline Stages</h3>
                  <p className="text-xs text-dark-400">Active opportunities by stage</p>
                </div>
                <button 
                  onClick={() => {
                    useUIStore.getState().setFocusedElement({
                      id: 'chart-pipeline',
                      title: 'Pipeline Analysis',
                      content: (
                        <div className="h-[500px] w-full">
                           <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={pipelineData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                              <XAxis dataKey="stage" tick={{ fill: '#777' }} />
                              <YAxis tick={{ fill: '#777' }} />
                              <Tooltip contentStyle={{ background: '#333', borderRadius: 8 }} />
                              <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                                {pipelineData.map((entry, i) => (
                                  <Cell key={i} fill={entry.color || '#E5A645'} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )
                    })
                  }}
                  className="p-2 rounded-lg bg-white/5 text-dark-400 hover:text-white transition-colors"
                >
                  <Maximize2 size={16} />
                </button>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={pipelineData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="stage" tick={{ fontSize: 10, fill: '#777' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#777' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#333', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                    labelStyle={{ color: '#fff', fontSize: 12 }}
                    itemStyle={{ color: '#E5A645', fontSize: 11 }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {pipelineData.map((entry, i) => (
                      <Cell key={i} fill={entry.color || '#E5A645'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {pipelineData.slice(0, 4).map((s) => (
                  <div key={s.stage} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                      <span className="text-dark-400">{s.stage}</span>
                    </div>
                    <span className="text-white font-medium">{s.count} deals</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* ── Top Agents ───────────────────────────────────────────────── */}
      {charts?.top_agents && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="card p-5"
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold text-white">Top Performing Agents</h3>
              <p className="text-xs text-dark-400 mt-0.5">Year-to-date by commission earned</p>
            </div>
            <span className="badge-gold text-xs">YTD Leaderboard</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {charts.top_agents.map((agent, i) => (
              <div key={agent.employee_number}
                onClick={() => navigate('/commissions')}
                className="flex flex-col items-center p-4 rounded-xl bg-dark-700/50 border border-white/5 cursor-pointer hover:border-primary/30 transition-colors">
                <div className="relative mb-3">
                  <div className="w-12 h-12 rounded-full bg-primary/20 border-2 border-primary/30
                                  flex items-center justify-center text-primary font-semibold text-sm">
                    {agent.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  {i === 0 && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary
                                    flex items-center justify-center text-dark-900 text-[10px] font-bold">
                      #1
                    </div>
                  )}
                </div>
                <p className="text-sm font-medium text-white text-center leading-tight">{agent.name}</p>
                <p className="text-xs text-dark-400 mt-0.5">{agent.deal_count} deals</p>
                <p className="text-sm font-semibold text-primary mt-2">
                  {formatCurrency(parseFloat(agent.total_commission))}
                </p>
              </div>
            ))}
            {charts.top_agents.length === 0 && (
              <div className="col-span-5 text-center py-8 text-dark-400 text-sm">
                No commission data for this period yet.
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
           <ChartSkeleton height={220} title="REVENUE ANALYSIS" />
        </div>
        <div className="lg:col-span-1">
           <ChartSkeleton height={160} title="PIPELINE OVERVIEW" />
        </div>
      </div>
    </div>
  )
}

function DashboardError({ onRetry, error }) {
  return (
    <div className="flex items-center justify-center h-96">
      <div className="text-center space-y-3">
        <AlertTriangle size={40} className="text-red-400 mx-auto" />
        <p className="text-white font-medium">Failed to load dashboard</p>
        <p className="text-dark-400 text-sm">Check your connection and try again</p>
        
        {/* Debug info */}
        {error && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg max-w-lg mx-auto text-left">
            <p className="text-red-400 text-xs font-mono break-all font-bold">Error: {error.message || String(error)}</p>
            {error.response && <p className="text-red-400 text-xs font-mono break-all mt-1">Status: {error.response.status}</p>}
          </div>
        )}

        <button onClick={onRetry} className="btn-primary mt-2">
          <RefreshCw size={16} /> Retry
        </button>
      </div>
    </div>
  )
}
