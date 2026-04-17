import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { ArrowUpRight, ArrowDownRight, Maximize2 } from 'lucide-react'
import { useUIStore } from '@/stores/authStore'
import { formatCurrency } from '@/utils/format'
import { KpiSkeleton, ChartSkeleton } from './Skeleton'

export function KpiCard({ title, value, subtitle, icon, trend, trendLabel, accent = 'text-primary', delay = 0, onClick }) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const mouseXSpring = useSpring(x)
  const mouseYSpring = useSpring(y)

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ['7deg', '-7deg'])
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ['-7deg', '7deg'])

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const xPct = (mouseX / width) - 0.5
    const yPct = (mouseY / height) - 0.5
    x.set(xPct)
    y.set(yPct)
  }

  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
  }

  const { setFocusedElement } = useUIStore()

  const handleFocus = (e) => {
    e.stopPropagation()
    setFocusedElement({
      id: `kpi-${title.replace(/\s+/g, '-').toLowerCase()}`,
      title,
      content: (
        <div className="flex flex-col items-center justify-center text-center space-y-8 py-12">
          <div className={`w-32 h-32 rounded-3xl bg-white/5 flex items-center justify-center ${accent} scale-150 mb-8`}>
            {React.cloneElement(icon, { size: 64 })}
          </div>
          <h1 className="text-8xl font-black text-white tracking-tighter">{value}</h1>
          <p className="text-2xl text-dark-400 font-medium">{title}</p>
          <div className="flex gap-12 mt-12 bg-white/5 p-8 rounded-3xl border border-white/5">
             <div className="text-left">
                <p className="text-[10px] font-bold text-dark-500 uppercase mb-1">Status</p>
                <p className="text-white font-bold">{subtitle || 'Active'}</p>
             </div>
             {trend !== undefined && (
                <div className="text-left">
                  <p className="text-[10px] font-bold text-dark-500 uppercase mb-1">Performance</p>
                  <p className={`font-bold ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {trend >= 0 ? '+' : ''}{trend}%
                  </p>
                </div>
             )}
          </div>
        </div>
      )
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      className={`kpi-card group ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      {/* Haptic Glow Overlay */}
      <div className="glow-overlay" />
      
      <div style={{ transform: 'translateZ(20px)' }} className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className={`w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center ${accent}`}>
            {icon}
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleFocus}
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
        <div className="stat-value mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis">{value}</div>
        <div className="stat-label">{title}</div>
        {subtitle && <div className="text-xs text-dark-500 mt-1">{subtitle}</div>}
        {trendLabel && <div className="text-xs text-dark-500 mt-1">{trendLabel}</div>}
      </div>
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
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
           <ChartSkeleton height={280} title="ANALYSIS" />
        </div>
        <div className="lg:col-span-1">
           <ChartSkeleton height={280} title="METRICS" />
        </div>
      </div>
    </div>
  )
}
