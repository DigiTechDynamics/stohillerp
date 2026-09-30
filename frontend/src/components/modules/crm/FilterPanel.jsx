// Stohill Properties - CRM Filter Panel
// Slide-in drawer for advanced kanban/table filtering
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Filter, X, RotateCcw } from 'lucide-react'
import { crmAPI, hrAPI } from '@/services/api'

const PRIORITY_OPTIONS = [
  { value: '3', label: 'Very High', color: 'text-red-400' },
  { value: '2', label: 'High', color: 'text-orange-400' },
  { value: '1', label: 'Medium', color: 'text-primary' },
  { value: '0', label: 'Low', color: 'text-dark-500' },
]

export default function FilterPanel({ isOpen, onClose, filters, onApply }) {
  const [local, setLocal] = useState(filters || {
    priority: [],
    tags: [],
    assigned_agent: '',
    date_from: '',
    date_to: '',
    stages: [],
  })

  const { data: tagsRes } = useQuery({
    queryKey: ['crm-tags'],
    queryFn: () => crmAPI.tags.list()
  })
  const { data: agentsRes } = useQuery({
    queryKey: ['hr-employees-simple'],
    queryFn: () => hrAPI.employees.list({ page_size: 200 })
  })
  const { data: pipelinesRes } = useQuery({
    queryKey: ['crm-pipelines'],
    queryFn: () => crmAPI.pipelines.list()
  })

  const tags = tagsRes?.data?.results || tagsRes?.data || []
  const agents = agentsRes?.data?.results || []
  const pipelines = Array.isArray(pipelinesRes?.data) ? pipelinesRes.data : (pipelinesRes?.data?.results || [])
  const allStages = pipelines.flatMap(p => p.stages || [])

  const toggleMulti = (key, value) => {
    setLocal(prev => {
      const arr = prev[key] || []
      return {
        ...prev,
        [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value]
      }
    })
  }

  const handleReset = () => {
    const empty = { priority: [], tags: [], assigned_agent: '', date_from: '', date_to: '', stages: [] }
    setLocal(empty)
    onApply(empty)
  }

  const activeCount = [
    local.priority?.length,
    local.tags?.length,
    local.assigned_agent ? 1 : 0,
    local.date_from ? 1 : 0,
    local.stages?.length,
  ].reduce((a, b) => a + b, 0)

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-dark-800 border-l border-white/10 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-primary" />
                <span className="text-sm font-bold text-white">Filters</span>
                {activeCount > 0 && (
                  <span className="bg-primary text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    {activeCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeCount > 0 && (
                  <button
                    onClick={handleReset}
                    className="text-[10px] font-bold uppercase tracking-wider text-dark-500 hover:text-white flex items-center gap-1 transition-all"
                  >
                    <RotateCcw size={11} /> Reset
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-dark-500 hover:text-white transition-all"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Filter groups */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">

              {/* Priority */}
              <div>
                <p className="text-[10px] font-bold text-dark-500 uppercase tracking-widest mb-3">Priority</p>
                <div className="space-y-2">
                  {PRIORITY_OPTIONS.map(opt => (
                    <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={local.priority?.includes(opt.value)}
                        onChange={() => toggleMulti('priority', opt.value)}
                        className="accent-[#E5A645] w-3.5 h-3.5"
                      />
                      <span className={`text-xs font-semibold ${opt.color}`}>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Assigned Agent */}
              <div>
                <p className="text-[10px] font-bold text-dark-500 uppercase tracking-widest mb-3">Assigned Agent</p>
                <select
                  value={local.assigned_agent}
                  onChange={e => setLocal(p => ({ ...p, assigned_agent: e.target.value }))}
                  className="form-input w-full text-xs h-10"
                >
                  <option value="">All Agents</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>
                  ))}
                </select>
              </div>

              {/* Tags */}
              <div>
                <p className="text-[10px] font-bold text-dark-500 uppercase tracking-widest mb-3">Tags</p>
                <div className="flex flex-wrap gap-2">
                  {tags.map(tag => (
                    <button
                      key={tag.id}
                      onClick={() => toggleMulti('tags', tag.id)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                        local.tags?.includes(tag.id)
                          ? 'bg-primary text-white border-primary'
                          : 'border-white/10 text-dark-400 hover:border-white/20'
                      }`}
                      style={!local.tags?.includes(tag.id) ? { borderLeftColor: tag.color, borderLeftWidth: '3px' } : {}}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pipeline Stage */}
              {allStages.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-dark-500 uppercase tracking-widest mb-3">Stage</p>
                  <div className="space-y-1.5">
                    {allStages.filter(s => !s.is_terminal).map(stage => (
                      <label key={stage.id} className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={local.stages?.includes(stage.id)}
                          onChange={() => toggleMulti('stages', stage.id)}
                          className="accent-[#E5A645] w-3.5 h-3.5"
                        />
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                          <span className="text-xs font-semibold text-dark-300">{stage.name}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Expected Close Date Range */}
              <div>
                <p className="text-[10px] font-bold text-dark-500 uppercase tracking-widest mb-3">Expected Close Date</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-dark-600 font-bold uppercase tracking-widest">From</label>
                    <input
                      type="date"
                      value={local.date_from}
                      onChange={e => setLocal(p => ({ ...p, date_from: e.target.value }))}
                      className="form-input w-full text-xs h-9 mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-dark-600 font-bold uppercase tracking-widest">To</label>
                    <input
                      type="date"
                      value={local.date_to}
                      onChange={e => setLocal(p => ({ ...p, date_to: e.target.value }))}
                      className="form-input w-full text-xs h-9 mt-1"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-white/5 flex gap-3">
              <button
                onClick={() => { onApply(local); onClose() }}
                className="flex-1 btn-primary py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <Filter size={14} /> Apply Filters
              </button>
              <button
                onClick={onClose}
                className="btn-secondary px-4 py-3 text-xs font-bold"
              >
                Done
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
