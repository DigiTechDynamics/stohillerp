// Stohil Properties - Commission Calculator
import { useState } from 'react'
import { X, Calculator as CalcIcon, DollarSign, ArrowRight } from 'lucide-react'
import { useUIStore } from '@/stores/authStore'
import { formatCurrency } from '@/utils/format'

export default function CommissionCalculator() {
  const closePanel = useUIStore((s) => s.closeSidePanel)
  const [amount, setAmount] = useState('')
  const [rate, setRate] = useState('10')
  const [split, setSplit] = useState('100')

  const dealValue = parseFloat(amount) || 0
  const commRate = parseFloat(rate) || 0
  const agentSplit = parseFloat(split) || 0

  const totalCommission = dealValue * (commRate / 100)
  const agentShare = totalCommission * (agentSplit / 100)
  const houseShare = totalCommission - agentShare

  return (
    <div className="flex flex-col h-full bg-dark-950">
      <div className="flex items-center justify-between p-6 border-b border-white/10 bg-dark-900">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
            <CalcIcon size={20} />
          </div>
          <div>
            <h2 className="text-xl font-display text-white">Quick Calculator</h2>
            <p className="text-sm text-dark-400">Estimate deal commissions</p>
          </div>
        </div>
        <button onClick={closePanel} className="p-2 hover:bg-white/5 rounded-full transition-colors">
          <X size={20} className="text-dark-400 hover:text-white" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {/* Inputs */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Deal / Transaction Value</label>
            <div className="relative">
              <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="form-input pl-9 w-full text-lg font-semibold"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Commission Rate (%)</label>
              <input
                type="number"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="form-input w-full"
                placeholder="10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Agent Split (%)</label>
              <input
                type="number"
                value={split}
                onChange={(e) => setSplit(e.target.value)}
                className="form-input w-full"
                placeholder="100"
              />
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="card p-5 bg-gradient-to-br from-dark-800 to-dark-900 border-primary/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-10 -mt-10" />
          
          <h3 className="text-sm font-medium text-dark-300 mb-4">Estimated Breakdown</h3>
          
          <div className="space-y-4 relative z-10">
            <div className="flex justify-between items-center pb-4 border-b border-white/5">
              <span className="text-dark-400">Gross Commission</span>
              <span className="text-lg text-white font-medium">{formatCurrency(totalCommission)}</span>
            </div>
            
            <div className="flex justify-between items-center pb-2">
              <span className="text-primary font-medium flex items-center gap-2">
                <ArrowRight size={14} /> Agent Share
              </span>
              <span className="text-xl text-primary font-bold">{formatCurrency(agentShare)}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-dark-400 flex items-center gap-2">
                <ArrowRight size={14} /> House Share
              </span>
              <span className="text-white font-medium">{formatCurrency(houseShare)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
