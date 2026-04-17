import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Building2, Calendar, ClipboardCheck, Star, Camera, MessageSquare, Save, Loader2, CheckCircle2, ChevronRight, ChevronLeft, MapPin } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { rentalsAPI, propertiesAPI, hrAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'

const ROOMS = [
  { id: 'living', name: 'Living Room', items: ['Walls', 'Floor', 'Ceiling', 'Windows', 'Lighting'] },
  { id: 'kitchen', name: 'Kitchen', items: ['Stove/Oven', 'Sinks', 'Cupboards', 'Countertops', 'Taps'] },
  { id: 'bedroom1', name: 'Master Bedroom', items: ['Walls', 'Built-in Cupboards', 'Door/Locks', 'Electrical'] },
  { id: 'bathroom', name: 'Main Bathroom', items: ['Toilet', 'Shower/Bath', 'Basin', 'Tiling', 'Ventilation'] },
  { id: 'exterior', name: 'Exterior/Garden', items: ['Gates', 'Fencing', 'Roofing', 'Paving'] }
]

const CONDITION_LEVELS = [
  { value: 'excellent', label: 'Excellent', color: 'bg-emerald-500' },
  { value: 'good', label: 'Good', color: 'bg-sky-500' },
  { value: 'fair', label: 'Fair/Needs Work', color: 'bg-amber-500' },
  { value: 'poor', label: 'Poor/Defective', color: 'bg-rose-500' }
]

export default function PropertyInspectionWizard() {
  const queryClient = useQueryClient()
  const closePanel = useUIStore(s => s.closeSidePanel)
  
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    property: '',
    unit: '',
    inspector: '',
    inspection_type: 'routine',
    inspection_date: new Date().toISOString().split('T')[0],
    condition_data: {},
    overall_rating: 8,
    final_comments: ''
  })

  // Fetch data
  const { data: propertiesRes } = useQuery({
    queryKey: ['properties-compact'],
    queryFn: () => propertiesAPI.list({ page_size: 100 })
  })
  const { data: employeesRes } = useQuery({
    queryKey: ['employees-compact'],
    queryFn: () => hrAPI.employees.list({ page_size: 100 })
  })

  const properties = propertiesRes?.data?.results || []
  const employees = employeesRes?.data?.results || []

  // Mutation
  const mutation = useMutation({
    mutationFn: (data) => rentalsAPI.inspections.create(data),
    onSuccess: () => {
      toast.success('Inspection recorded successfully')
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
      setStep(4)
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to save inspection')
    }
  })

  const handleConditionUpdate = (room, item, value) => {
    setFormData(prev => ({
      ...prev,
      condition_data: {
        ...prev.condition_data,
        [room]: {
          ...(prev.condition_data[room] || {}),
          [item]: value
        }
      }
    }))
  }

  const nextStep = () => {
    if (step === 1 && (!formData.property || !formData.inspector)) {
      return toast.error('Please select property and inspector')
    }
    setStep(s => s + 1)
  }

  if (step === 4) {
    return (
      <div className="p-12 text-center space-y-6">
        <motion.div 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-24 h-24 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto border-2 border-emerald-500/30 shadow-lg shadow-emerald-500/20"
        >
          <CheckCircle2 size={56} />
        </motion.div>
        <div className="space-y-2">
          <h2 className="text-3xl font-bold text-white font-display">Inspection Submitted</h2>
          <p className="text-dark-400 max-w-xs mx-auto">The report has been filed and maintenance alerts have been triggered where necessary.</p>
        </div>
        <div className="pt-6">
          <button onClick={closePanel} className="btn-primary w-full py-4 rounded-xl text-lg font-semibold shadow-gold">
            Return to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-dark-950/50 backdrop-blur-xl">
      {/* Header */}
      <div className="p-6 border-b border-white/5 bg-white/2">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
            <ClipboardCheck size={24} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white leading-tight">Field Inspection</h2>
            <p className="text-xs text-dark-500 uppercase font-bold tracking-widest mt-0.5">Mobile Field Unit v2.0</p>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="px-6 py-4 bg-dark-900/30 border-b border-white/5">
        <div className="flex justify-between items-center relative">
          <div className="absolute h-0.5 bg-dark-800 left-0 right-0 top-1/2 -translate-y-1/2 -z-10" />
          <div className="absolute h-0.5 bg-primary left-0 top-1/2 -translate-y-1/2 -z-10 transition-all duration-500" style={{ width: `${((step - 1) / 2) * 100}%` }} />
          {[1, 2, 3].map(s => (
            <div key={s} className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black border-2 transition-all ${step >= s ? 'bg-primary border-primary text-dark-950 shadow-gold scale-110' : 'bg-dark-900 border-dark-800 text-dark-500'}`}>
              {s}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="section-header">
                <h3 className="text-primary font-bold text-xs uppercase tracking-widest mb-4">Target Site</h3>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 text-dark-500" size={18} />
                  <select 
                    className="form-input pl-10 w-full py-3"
                    value={formData.property}
                    onChange={e => setFormData({...formData, property: e.target.value})}
                  >
                    <option value="">Select Property...</option>
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <select 
                    className="form-input py-3"
                    value={formData.inspection_type}
                    onChange={e => setFormData({...formData, inspection_type: e.target.value})}
                  >
                    <option value="routine">Routine Check</option>
                    <option value="move_in">Move-In</option>
                    <option value="move_out">Move-Out</option>
                    <option value="valuation">Valuation Visit</option>
                  </select>
                  <input 
                    type="date"
                    className="form-input py-3"
                    value={formData.inspection_date}
                    onChange={e => setFormData({...formData, inspection_date: e.target.value})}
                  />
                </div>

                <div className="relative">
                  <ClipboardCheck className="absolute left-3 top-3 text-dark-500" size={18} />
                  <select 
                    className="form-input pl-10 w-full py-3"
                    value={formData.inspector}
                    onChange={e => setFormData({...formData, inspector: e.target.value})}
                  >
                    <option value="">Assigned Inspector...</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-4 bg-primary/5 border border-primary/10 rounded-2xl flex gap-4">
                <Camera className="text-primary shrink-0" size={24} />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-white">Photo Documentation</p>
                  <p className="text-[10px] text-dark-400 leading-relaxed uppercase tracking-wider">Ensure GPS tagging is enabled on your mobile device for validation.</p>
                </div>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div 
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8 pb-32"
            >
              {ROOMS.map(room => (
                <div key={room.id} className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-1 bg-primary rounded-full" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">{room.name}</h3>
                  </div>
                  <div className="bg-dark-900/50 rounded-2xl border border-white/5 divide-y divide-white/5 overflow-hidden">
                    {room.items.map(item => (
                      <div key={item} className="p-4 space-y-3">
                        <p className="text-sm text-dark-300 font-medium">{item}</p>
                        <div className="grid grid-cols-4 gap-2">
                          {CONDITION_LEVELS.map(lvl => (
                            <button
                              key={lvl.value}
                              type="button"
                              onClick={() => handleConditionUpdate(room.id, item, lvl.value)}
                              className={`py-2 px-1 rounded-lg text-[10px] font-bold uppercase tracking-tight transition-all border ${
                                formData.condition_data[room.id]?.[item] === lvl.value
                                  ? `${lvl.color} border-white/20 text-white shadow-lg`
                                  : 'bg-dark-800 border-white/5 text-dark-500'
                              }`}
                            >
                              {lvl.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {step === 3 && (
            <motion.div 
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="space-y-4">
                <label className="text-xs font-bold text-dark-500 uppercase tracking-widest block">Overall Condition Rating</label>
                <div className="flex justify-between items-center bg-dark-900 rounded-2xl p-6 border border-white/5">
                  <span className="text-4xl font-black text-primary font-display">{formData.overall_rating}/10</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star 
                        key={star} 
                        size={24} 
                        className={formData.overall_rating >= star * 2 ? 'text-primary fill-primary' : 'text-dark-700'} 
                        onClick={() => setFormData({...formData, overall_rating: star * 2})}
                      />
                    ))}
                  </div>
                </div>
                <input 
                  type="range" 
                  min="1" max="10" 
                  className="w-full h-2 bg-dark-800 rounded-lg appearance-none cursor-pointer accent-primary" 
                  value={formData.overall_rating}
                  onChange={e => setFormData({...formData, overall_rating: parseInt(e.target.value)})}
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-primary" />
                  <label className="text-xs font-bold text-dark-500 uppercase tracking-widest block">Summary Comments</label>
                </div>
                <textarea 
                  className="form-input w-full h-40 py-4 resize-none rounded-2xl"
                  placeholder="Record any major defects, safety concerns or general observations here..."
                  value={formData.final_comments}
                  onChange={e => setFormData({...formData, final_comments: e.target.value})}
                />
              </div>

              <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-amber-300">
                  <Save size={18} />
                  <span className="text-sm font-bold uppercase tracking-wider">Ready for Submission</span>
                </div>
                <p className="text-xs text-amber-200/70 leading-relaxed italic">
                  Ensure all rooms have been assessed. Photos uploaded via mobile will be synced upon hitting submit.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Navigation */}
      {step < 4 && (
        <div className="p-6 border-t border-white/5 bg-dark-900/50 backdrop-blur-md">
          <div className="flex gap-3">
            {step > 1 && (
              <button 
                onClick={() => setStep(s => s - 1)}
                className="btn-secondary px-6 py-4 flex items-center gap-2"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <button 
              onClick={step === 3 ? () => mutation.mutate(formData) : nextStep}
              disabled={mutation.isPending}
              className="btn-primary flex-1 py-4 rounded-xl flex items-center justify-center gap-2 font-bold text-lg shadow-gold transition-all active:scale-95"
            >
              {mutation.isPending ? (
                <Loader2 size={24} className="animate-spin" />
              ) : (
                <>
                  {step === 3 ? 'Finalize Report' : 'Next Section'}
                  {step < 3 && <ChevronRight size={20} />}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
