import { motion } from 'framer-motion'

/**
 * Foundational Skeleton Component
 * Provides a shimmering placeholder that matches the UI aesthetics.
 */
export const Skeleton = ({ className = '', circle = false }) => {
  return (
    <div 
      className={`skeleton ${circle ? 'rounded-full' : 'rounded-lg'} ${className}`}
    />
  )
}

/**
 * KpiSkeleton
 * High-fidelity placeholder for the system KPI cards.
 */
export const KpiSkeleton = () => {
  return (
    <div className="bg-dark-900/60 border border-white/5 rounded-3xl p-6 relative overflow-hidden h-[180px]">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <Skeleton className="w-16 h-6 rounded-lg opacity-50" />
      </div>
      <div className="space-y-3">
        <Skeleton className="w-24 h-3 opacity-30" />
        <Skeleton className="w-32 h-8" />
        <Skeleton className="w-40 h-3 opacity-20" />
      </div>
    </div>
  )
}

/**
 * ChartSkeleton
 * Placeholder for large data visualization cards.
 */
export const ChartSkeleton = ({ height = 400, title = 'CHART ANALYSIS' }) => {
  return (
    <div className="bg-dark-900/40 border border-white/5 rounded-3xl p-8 backdrop-blur-xl">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Skeleton className="w-1.5 h-6 bg-primary/20 rounded-full" />
          <div className="space-y-1">
             <Skeleton className="w-32 h-4" />
             <Skeleton className="w-48 h-2 opacity-30" />
          </div>
        </div>
        <Skeleton className="w-24 h-4 opacity-40 invisible sm:visible" />
      </div>
      <div 
        className="w-full flex items-end gap-2 px-2" 
        style={{ height: `${height}px` }}
      >
        {/* Mocking bar chart structure */}
        {[60, 40, 80, 50, 90, 70, 45, 85].map((h, i) => (
          <Skeleton 
             key={i} 
             className="flex-1 rounded-t-lg opacity-20" 
             style={{ height: `${h}%` }} 
          />
        ))}
      </div>
    </div>
  )
}

/**
 * TableSkeleton
 * Placeholder for standard data tables.
 */
export const TableSkeleton = ({ rows = 5 }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 px-4 py-3 border-b border-white/5">
        {[20, 30, 25, 15].map((w, i) => (
          <Skeleton key={i} className="h-3 opacity-20" style={{ width: `${w}%` }} />
        ))}
      </div>
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4 border-b border-white/5">
          <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="w-1/3 h-3" />
            <Skeleton className="w-1/4 h-2 opacity-30" />
          </div>
          <Skeleton className="w-20 h-3 opacity-40" />
          <Skeleton className="w-24 h-6 rounded-full opacity-20" />
        </div>
      ))}
    </div>
  )
}
