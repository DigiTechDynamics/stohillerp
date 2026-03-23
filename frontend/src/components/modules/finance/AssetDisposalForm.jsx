import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, X, Trash2, AlertTriangle, DollarSign, Calendar } from 'lucide-react'
import { fixedAssetsAPI } from '@/services/api'
import { formatCurrency } from '@/utils/format'

export default function AssetDisposalForm({ asset, onClose }) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    disposal_date: new Date().toISOString().split('T')[0],
    net_proceeds: '0.00',
    notes: ''
  })

  // Get current NBV for UI feedback
  const statutoryBook = asset.books?.find(b => b.book_type === 'Statutory')
  const currentNBV = statutoryBook ? parseFloat(statutoryBook.current_nbv) : 0

  const mutation = useMutation({
    mutationFn: (data) => fixedAssetsAPI.assets.dispose(asset.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['fixed-assets'])
      onClose()
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    mutation.mutate(formData)
  }

  const gainLoss = parseFloat(formData.net_proceeds || 0) - currentNBV

  return (
    <div className="flex flex-col h-full bg-dark-900 text-white">
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-rose-500/10 text-rose-500 rounded-lg">
            <Trash2 size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold">Asset Disposal</h2>
            <p className="text-dark-400 text-xs mt-1">Finalize financial records for {asset.name}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-dark-400 transition-colors">
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex gap-3">
          <AlertTriangle className="text-amber-500 shrink-0" size={18} />
          <p className="text-xs text-amber-400/90 leading-relaxed">
            This action will remove the asset from the active register and post the final Gain/Loss to the General Ledger. This cannot be undone.
          </p>
        </div>

        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Disposal Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" size={16} />
                <input 
                  type="date"
                  required
                  className="form-input w-full pl-10"
                  value={formData.disposal_date}
                  onChange={e => setFormData({...formData, disposal_date: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Net Proceeds</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500 text-sm">$</span>
                <input 
                  type="number"
                  step="0.01"
                  required
                  className="form-input w-full pl-8"
                  placeholder="0.00"
                  value={formData.net_proceeds}
                  onChange={e => setFormData({...formData, net_proceeds: e.target.value})}
                />
              </div>
            </div>
          </div>

          <div className="bg-dark-800/50 p-5 rounded-2xl border border-white/5 space-y-4">
            <div className="flex justify-between items-center text-xs">
              <span className="text-dark-400 uppercase font-bold tracking-widest">Current Net Book Value</span>
              <span className="text-white font-medium">{formatCurrency(currentNBV)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-dark-400 uppercase font-bold tracking-widest">Estimated Gain / (Loss)</span>
              <span className={`text-sm font-bold ${gainLoss >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {gainLoss >= 0 ? '+' : ''}{formatCurrency(gainLoss)}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Reason / Notes</label>
            <textarea 
              className="form-input w-full min-h-[100px] py-3"
              placeholder="Reason for disposal (e.g. Sold as scrap, End of life)..."
              value={formData.notes}
              onChange={e => setFormData({...formData, notes: e.target.value})}
            />
          </div>
        </section>
      </form>

      <div className="p-6 border-t border-white/5 bg-dark-900/80 backdrop-blur-xl flex items-center justify-end gap-3 mt-auto">
        <button 
          type="button"
          onClick={onClose}
          className="px-6 py-2.5 rounded-xl text-sm font-medium text-dark-400 hover:text-white transition-all"
        >
          Keep Asset
        </button>
        <button 
          onClick={handleSubmit}
          disabled={mutation.isPending}
          className="bg-rose-600 hover:bg-rose-500 text-white px-8 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 shadow-lg shadow-rose-900/20"
        >
          {mutation.isPending ? 'Processing...' : 'Confirm Disposal'}
        </button>
      </div>
    </div>
  )
}
