import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Zap, TrendingUp, AlertTriangle, 
  Activity, BarChart3, ChevronLeft, 
  ChevronRight, Sparkles, Target,
  Info
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { analyticsAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import { Skeleton } from '@/components/common/Skeleton'

/**
 * Contextual Intelligence Rail
 * Provides deep insights based on the active record (Lease, Property, etc.)
 */
export default function IntelligenceRail() {
  const { activeContext } = useUIStore()
  const [isExpanded, setIsExpanded] = useState(false)
  const [hasNewData, setHasNewData] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['intelligence-context', activeContext?.type, activeContext?.id],
    queryFn: () => analyticsAPI.context(activeContext.type, activeContext.id).then(res => res.data),
    enabled: !!activeContext?.type && !!activeContext?.id,
    staleTime: 60000, // 1 minute
  })

  // Trigger pulse when new data arrives
  useEffect(() => {
    if (data) {
      setHasNewData(true)
      const timer = setTimeout(() => setHasNewData(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [data])

  if (!activeContext?.type) return null

  return (
    <div className="relative z-40 bg-dark-900/50 backdrop-blur-xl border-l border-white/5 h-screen transition-all duration-300 ease-in-out"
         style={{ width: isExpanded ? '320px' : '48px' }}>
      
      {/* Toggle Button */}
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-12 bg-dark-800 border border-white/10 rounded-full flex items-center justify-center text-dark-400 hover:text-white hover:bg-dark-700 transition-all z-50"
      >
        {isExpanded ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Vertical Rail (Collapsed State) */}
      {!isExpanded && (
        <div className="flex flex-col items-center py-6 space-y-6">
          <motion.div 
            animate={hasNewData ? { scale: [1, 1.2, 1] } : {}}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              isLoading ? 'bg-white/5 animate-pulse' : 'bg-primary/20 text-primary'
            }`}
          >
            <Zap size={18} />
          </motion.div>
          <div className="h-px w-6 bg-white/5" />
          <Activity size={18} className="text-dark-500" />
          <TrendingUp size={18} className="text-dark-500" />
          <Target size={18} className="text-dark-500" />
        </div>
      )}

      {/* Expanded Intelligence Panel */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="p-6 h-full overflow-y-auto custom-scrollbar"
          >
            <div className="flex items-center gap-2 mb-6 text-primary">
              <Sparkles size={18} />
              <h3 className="text-xs font-bold uppercase tracking-widest">Contextual Intelligence</h3>
            </div>

            {isLoading ? (
              <div className="space-y-6">
                <Skeleton className="h-24 w-full rounded-2xl" />
                <Skeleton className="h-48 w-full rounded-2xl" />
                <Skeleton className="h-32 w-full rounded-2xl" />
              </div>
            ) : isError ? (
              <div className="p-8 text-center bg-red-500/5 border border-red-500/10 rounded-2xl">
                <AlertTriangle size={32} className="mx-auto text-red-500 mb-2" />
                <p className="text-xs text-dark-400">Failed to fetch intelligence profile.</p>
              </div>
            ) : data ? (
              <div className="space-y-6">
                {/* Header Info */}
                <div>
                   <p className="text-[10px] text-dark-500 uppercase font-bold mb-1">Analyzing</p>
                   <h4 className="text-lg font-semibold text-white truncate">{data.title}</h4>
                </div>

                {/* Score Widget */}
                {data.reliability_score !== undefined && (
                  <div className="p-5 bg-white/5 rounded-2xl border border-white/5 relative overflow-hidden group">
                    <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <Target size={48} className="text-primary" />
                    </div>
                    <p className="text-[10px] text-dark-400 font-bold uppercase tracking-widest mb-1">Reliability Score</p>
                    <div className="flex items-baseline gap-2">
                       <span className="text-3xl font-bold text-white">{data.reliability_score}%</span>
                       <span className={`text-[10px] font-bold ${data.reliability_trend === 'stable' ? 'text-blue-400' : 'text-emerald-400'}`}>
                         {data.reliability_trend?.toUpperCase()}
                       </span>
                    </div>
                    <div className="mt-3 w-full h-1.5 bg-dark-700 rounded-full overflow-hidden">
                       <div 
                         className="h-full bg-primary" 
                         style={{ width: `${data.reliability_score}%` }} 
                       />
                    </div>
                  </div>
                )}

                {/* Yield Widget */}
                {data.yield_index !== undefined && (
                  <div className="p-5 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-[10px] text-dark-400 font-bold uppercase tracking-widest mb-1">Performance Index</p>
                    <div className="flex items-baseline justify-between mb-4">
                       <span className="text-3xl font-bold text-white">{data.yield_index}%</span>
                       <span className="text-xs font-bold text-emerald-400">+{data.market_variance}% vs market</span>
                    </div>
                    {/* Sparkline Visual (Simple CSS representation) */}
                    <div className="flex items-end h-12 gap-1 px-1">
                      {data.sparkline?.map((v, i) => (
                        <div 
                          key={i} 
                          className="flex-1 bg-primary/20 hover:bg-primary transition-colors rounded-t-sm"
                          style={{ height: `${(v / 110) * 100}%` }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Alerts / Risks */}
                <div className="space-y-3">
                  {data.expiry_risk && (
                    <div className={`p-4 rounded-xl border flex items-center gap-3 ${
                      data.expiry_risk === 'low' ? 'bg-blue-500/5 border-blue-500/10 text-blue-400' :
                      data.expiry_risk === 'medium' ? 'bg-amber-500/5 border-amber-500/10 text-amber-400' :
                      'bg-red-500/5 border-red-500/10 text-red-500'
                    }`}>
                      <Info size={16} />
                      <div className="flex-1">
                        <p className="text-[10px] uppercase font-bold opacity-80">Expiry Risk: {data.expiry_risk}</p>
                        <p className="text-xs font-medium">{data.days_to_expiry} days remaining</p>
                      </div>
                    </div>
                  )}

                  {data.maintenance_cost_ratio && (
                    <div className="p-4 bg-white/5 rounded-xl border border-white/5 flex items-center gap-3">
                      <BarChart3 size={16} className="text-dark-400" />
                      <div className="flex-1">
                        <p className="text-[10px] uppercase font-bold text-dark-500">Maint. Cost Ratio</p>
                        <p className="text-xs text-white font-medium">{data.maintenance_cost_ratio}% of gross revenue</p>
                      </div>
                    </div>
                  )}
                  
                </div>

                {/* Footnote */}
                <p className="text-[10px] text-dark-500 text-center pt-8 border-t border-white/5">
                  Powered by Stohill Intelligence Suite v2.0
                </p>
              </div>
            ) : (
              <div className="p-20 text-center opacity-30">
                <BarChart3 size={32} className="mx-auto mb-2" />
                <p className="text-xs">No data available for context.</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
