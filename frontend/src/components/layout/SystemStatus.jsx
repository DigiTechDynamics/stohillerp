import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, ShieldCheck, Wifi, WifiOff, RefreshCcw } from 'lucide-react'
import { authAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'

export default function SystemStatus() {
  const [status, setStatus] = useState('online') // online, offline, checking
  const [latency, setLatency] = useState(0)
  const [lastChecked, setLastChecked] = useState(new Date())
  const { theme } = useUIStore()

  const checkHealth = async () => {
    const start = performance.now()
    try {
      await authAPI.healthCheck()
      const end = performance.now()
      setLatency(Math.round(end - start))
      setStatus('online')
      setLastChecked(new Date())
    } catch (error) {
      setStatus('offline')
    }
  }

  useEffect(() => {
    checkHealth()
    const interval = setInterval(checkHealth, 60000) // Every 60 seconds
    return () => clearInterval(interval)
  }, [])

  const getStatusColor = () => {
    if (status === 'offline') return 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
    if (latency > 1000) return 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
    return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
  }

  const getStatusLabel = () => {
    if (status === 'offline') return 'Disconnected'
    if (latency > 1000) return 'High Latency'
    return 'System Operational'
  }

  return (
    <div className="group relative flex items-center">
      <div className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-all border
                      ${theme === 'light' ? 'bg-surface-main/50 border-border-color' : 'bg-dark-800/30 border-white/5'}`}>
        <div className="relative">
          <div className={`w-2 h-2 rounded-full ${getStatusColor()} transition-colors duration-500`} />
          {status === 'online' && (
            <motion.div
              animate={{ scale: [1, 1.8, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className={`absolute inset-0 rounded-full ${latency > 1000 ? 'bg-amber-500' : 'bg-emerald-500'}`}
            />
          )}
        </div>
        
        <div className="flex flex-col items-start leading-none">
          <span className={`text-[9px] font-bold uppercase tracking-widest ${theme === 'light' ? 'text-dark-900' : 'text-white'}`}>
            {status === 'offline' ? 'Offline' : 'Cloud'}
          </span>
          <span className="text-[8px] text-dark-500 font-medium uppercase mt-0.5">
            {status === 'online' ? `${latency}ms` : 'Check connection'}
          </span>
        </div>
      </div>

      {/* Tooltip */}
      <div className={`absolute top-full right-0 mt-2 w-48 p-3 rounded-xl shadow-2xl z-50 pointer-events-none 
                      opacity-0 group-hover:opacity-100 transition-all scale-95 group-hover:scale-100 origin-top-right border
                      ${theme === 'light' ? 'bg-white border-border-color' : 'bg-dark-900 border-white/10 backdrop-blur-xl'}`}>
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Status</span>
            <div className="flex items-center gap-1.5">
               <span className={`w-1.5 h-1.5 rounded-full ${getStatusColor()}`} />
               <span className="text-[10px] font-bold text-white capitalize">{status}</span>
            </div>
          </div>
          
          <div className="space-y-1.5">
            <div className="flex items-center justify-between opacity-70">
              <span className="text-[9px] text-dark-400">Environment</span>
              <span className="text-[9px] text-white font-mono">Production</span>
            </div>
            <div className="flex items-center justify-between opacity-70">
              <span className="text-[9px] text-dark-400">Response Time</span>
              <span className="text-[9px] text-white font-mono">{latency}ms</span>
            </div>
          </div>

          <div className="pt-2 border-t border-white/5 flex items-center justify-between">
            <span className="text-[8px] text-dark-600">Last refined: {lastChecked.toLocaleTimeString()}</span>
            <Activity size={10} className="text-primary animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}
