import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowRightLeft, Building2, DollarSign, Info, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { financeAPI, propertiesAPI } from '@/services/api'
import { formatCurrency } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'

export default function FundTransferWizard() {
  const queryClient = useQueryClient()
  const closePanel = useUIStore(s => s.closeSidePanel)
  
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    from_property_id: '',
    to_property_id: '',
    amount: '',
    reason: '',
    date: new Date().toISOString().split('T')[0]
  })

  // Fetch properties for selection
  const { data: propertiesRes, isLoading: loadingProps } = useQuery({
    queryKey: ['properties-compact'],
    queryFn: () => propertiesAPI.list({ page_size: 100 })
  })
  const properties = propertiesRes?.data?.results || []

  const transferMutation = useMutation({
    mutationFn: (data) => financeAPI.transfers.propertyTransfer(data),
    onSuccess: () => {
      toast.success('Fund transfer completed successfully')
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] })
      queryClient.invalidateQueries({ queryKey: ['finance-accounts'] })
      setStep(3)
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Transfer failed')
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (step === 1) {
      if (!formData.from_property_id || !formData.to_property_id || formData.from_property_id === formData.to_property_id) {
        return toast.error('Please select different source and target properties')
      }
      setStep(2)
    } else {
      transferMutation.mutate(formData)
    }
  }

  const fromProp = properties.find(p => p.id === formData.from_property_id)
  const toProp = properties.find(p => p.id === formData.to_property_id)

  if (step === 3) {
    return (
      <div className="p-8 text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
          <CheckCircle2 size={48} />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-white">Transfer Successful</h2>
          <p className="text-dark-400 mt-2">The funds have been moved and the general ledger has been updated.</p>
        </div>
        <div className="bg-dark-800 rounded-xl p-4 border border-white/5 text-left space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-dark-500">Amount</span>
            <span className="text-white font-semibold">{formatCurrency(formData.amount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-dark-500">From</span>
            <span className="text-white">{fromProp?.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-dark-500">To</span>
            <span className="text-white">{toProp?.name}</span>
          </div>
        </div>
        <button onClick={closePanel} className="btn-primary w-full py-3">Close Wizard</button>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-8">
        {[1, 2].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${step >= s ? 'bg-primary text-dark-900 shadow-gold' : 'bg-dark-700 text-dark-500'}`}>
              {s}
            </div>
            <span className={`text-xs font-medium uppercase tracking-wider ${step >= s ? 'text-white' : 'text-dark-500'}`}>
              {s === 1 ? 'Selection' : 'Confirmation'}
            </span>
            {s === 1 && <div className="w-8 h-px bg-dark-700 mx-2" />}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {step === 1 ? (
          <div className="space-y-6">
            <div className="space-y-4">
              <label className="block text-xs font-bold text-dark-500 uppercase tracking-widest">Source Portfolio</label>
              <div className="grid grid-cols-1 gap-4">
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" size={16} />
                  <select 
                    className="form-input pl-10 w-full"
                    value={formData.from_property_id}
                    onChange={e => setFormData({...formData, from_property_id: e.target.value})}
                    required
                  >
                    <option value="">Select source property...</option>
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.reference_number})</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex items-center justify-center py-2 text-dark-600">
                  <ArrowRightLeft size={20} className="rotate-90" />
                </div>

                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" size={16} />
                  <select 
                    className="form-input pl-10 w-full"
                    value={formData.to_property_id}
                    onChange={e => setFormData({...formData, to_property_id: e.target.value})}
                    required
                  >
                    <option value="">Select destination property...</option>
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.reference_number})</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block text-xs font-bold text-dark-500 uppercase tracking-widest">Transfer Details</label>
              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" size={16} />
                  <input 
                    type="number" 
                    placeholder="Amount"
                    className="form-input pl-10 w-full"
                    value={formData.amount}
                    onChange={e => setFormData({...formData, amount: e.target.value})}
                    required
                  />
                </div>
                <input 
                  type="date"
                  className="form-input w-full"
                  value={formData.date}
                  onChange={e => setFormData({...formData, date: e.target.value})}
                  required
                />
              </div>
              <textarea 
                placeholder="Reason for transfer..."
                className="form-input w-full h-24 py-3"
                value={formData.reason}
                onChange={e => setFormData({...formData, reason: e.target.value})}
                required
              />
            </div>
            
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 flex gap-3 text-dark-300">
              <Info className="text-primary shrink-0" size={18} />
              <p className="text-xs leading-relaxed">
                This wizard facilitates internal fund movements between property accounts. 
                Accounting entries will be auto-generated in the General Journal.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-dark-800 rounded-2xl border border-white/5 overflow-hidden">
              <div className="p-4 border-b border-white/5 bg-white/2">
                <h3 className="text-sm font-semibold text-white">Review Transfer</h3>
              </div>
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="text-center flex-1">
                    <div className="w-12 h-12 rounded-xl bg-dark-700 flex items-center justify-center text-dark-400 mx-auto mb-2">
                      <Building2 size={24} />
                    </div>
                    <p className="text-xs text-dark-500 uppercase font-bold tracking-wider">Source</p>
                    <p className="text-sm text-white font-medium mt-1 truncate">{fromProp?.name}</p>
                  </div>
                  <div className="px-4 text-primary">
                    <ArrowRightLeft size={24} />
                  </div>
                  <div className="text-center flex-1">
                    <div className="w-12 h-12 rounded-xl bg-dark-700 flex items-center justify-center text-dark-400 mx-auto mb-2">
                      <Building2 size={24} />
                    </div>
                    <p className="text-xs text-dark-500 uppercase font-bold tracking-wider">Target</p>
                    <p className="text-sm text-white font-medium mt-1 truncate">{toProp?.name}</p>
                  </div>
                </div>

                <div className="text-center pt-4 border-t border-white/5">
                  <p className="text-xs text-dark-500 uppercase font-bold tracking-wider mb-1">Total Amount</p>
                  <p className="text-4xl font-display text-primary">{formatCurrency(formData.amount)}</p>
                </div>

                <div className="space-y-3 pt-4 border-t border-white/5">
                  <div className="flex justify-between text-sm">
                    <span className="text-dark-500">Transfer Date</span>
                    <span className="text-white">{formData.date}</span>
                  </div>
                  <div>
                    <span className="text-xs text-dark-500 uppercase font-bold block mb-1">Reason</span>
                    <p className="text-sm text-dark-200 bg-dark-700/50 p-3 rounded-lg border border-white/5 italic">
                      "{formData.reason}"
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex gap-3 text-amber-200">
              <AlertCircle className="shrink-0" size={18} />
              <p className="text-xs leading-relaxed">
                Confirming this transfer will create unalterable journal entries in the current fiscal period. 
                Please ensure portfolio balances are sufficient.
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-4">
          {step === 2 && (
            <button 
              type="button" 
              onClick={() => setStep(1)}
              className="btn-secondary flex-1 py-3"
            >
              Back
            </button>
          )}
          <button 
            type="submit" 
            disabled={transferMutation.isPending}
            className="btn-primary flex-[2] py-3 flex items-center justify-center gap-2"
          >
            {transferMutation.isPending ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                {step === 1 ? 'Continue to Review' : 'Confirm & Post Transfer'}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
