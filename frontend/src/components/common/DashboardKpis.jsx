import { motion } from 'framer-motion'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { formatCurrency } from '@/utils/format'

export function KpiCard({ title, value, subtitle, icon, trend, trendLabel, accent = 'text-primary', delay = 0, onClick }) {
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
      <div className="stat-value mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis">{value}</div>
      <div className="stat-label">{title}</div>
      {subtitle && <div className="text-xs text-dark-500 mt-1">{subtitle}</div>}
      {trendLabel && <div className="text-xs text-dark-500 mt-1">{trendLabel}</div>}
    </motion.div>
  )
}

export function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-dark-800 border border-white/10 rounded-lg px-3 py-2 text-xs shadow-dark">
      <p className="text-dark-400 mb-1">{label}</p>
      <p className="text-white font-semibold">{formatCurrency(payload[0]?.value || 0)}</p>
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="h-8 w-64 bg-dark-700 rounded-lg" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 bg-dark-800 rounded-xl border border-white/5" />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 bg-dark-800 rounded-xl border border-white/5" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 h-72 bg-dark-800 rounded-xl border border-white/5" />
        <div className="h-72 bg-dark-800 rounded-xl border border-white/5" />
      </div>
    </div>
  )
}
