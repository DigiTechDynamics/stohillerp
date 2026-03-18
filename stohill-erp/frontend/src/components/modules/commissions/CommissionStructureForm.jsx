// Stohil Properties - Commission Structure Form
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Plus, Trash2, Award, Percent } from 'lucide-react'
import { useUIStore } from '@/stores/authStore'
import { commissionsAPI } from '@/services/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export default function CommissionStructureForm() {
  const closePanel = useUIStore((s) => s.closeSidePanel)
  const payload = useUIStore((s) => s.panelPayload)
  const isEditing = !!payload?.structure
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    base_rate: '0',
    calculation_type: 'standard', // standard, tiered
    tiers: []
  })

  useEffect(() => {
    if (isEditing && payload.structure) {
      setFormData({
        name: payload.structure.name || '',
        description: payload.structure.description || '',
        base_rate: payload.structure.base_rate || '0',
        calculation_type: payload.structure.calculation_type || 'standard',
        tiers: payload.structure.tiers || []
      })
    }
  }, [isEditing, payload])

  const addTier = () => {
    setFormData(prev => ({
      ...prev,
      tiers: [...prev.tiers, { threshold_amount: '0', rate_percentage: '0' }]
    }))
  }

  const removeTier = (index) => {
    setFormData(prev => ({
      ...prev,
      tiers: prev.tiers.filter((_, i) => i !== index)
    }))
  }

  const updateTier = (index, field, value) => {
    setFormData(prev => {
      const newTiers = [...prev.tiers]
      newTiers[index][field] = value
      return { ...prev, tiers: newTiers }
    })
  }

  // NOTE: Assuming this API has a POST to commissions/structures/ for simplicity
  const mutation = useMutation({
    mutationFn: (data) => 
      isEditing 
        ? commissionsAPI.structures.update(payload.structure.id, data)
        : commissionsAPI.structures.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['commissions-structures'])
      closePanel()
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    mutation.mutate(formData)
  }

  return (
    <div className="flex flex-col h-full bg-dark-950">
      <div className="flex items-center justify-between p-6 border-b border-white/10">
        <div>
          <h2 className="text-xl font-display text-white">
            {isEditing ? 'Edit Structure' : 'New Commission Structure'}
          </h2>
          <p className="text-sm text-dark-400 mt-1">Configure automated agent earnings</p>
        </div>
        <button onClick={closePanel} className="p-2 hover:bg-white/5 rounded-full transition-colors">
          <X size={20} className="text-dark-400 hover:text-white" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <form id="structure-form" onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Structure Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="form-input w-full"
                placeholder="e.g. Senior Broker Tier"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Calculation Type</label>
                <select
                  value={formData.calculation_type}
                  onChange={(e) => setFormData({ ...formData, calculation_type: e.target.value })}
                  className="form-input w-full"
                >
                  <option value="standard">Standard Flat Rate</option>
                  <option value="tiered">Tiered Target</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Base Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.base_rate}
                  onChange={(e) => setFormData({ ...formData, base_rate: e.target.value })}
                  className="form-input w-full"
                  placeholder="e.g. 10.5"
                />
              </div>
            </div>

            {formData.calculation_type === 'tiered' && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-white">Tier Configurations</label>
                  <button type="button" onClick={addTier} className="btn-secondary text-xs flex items-center gap-1 py-1">
                    <Plus size={14} /> Add Tier
                  </button>
                </div>
                <div className="space-y-3">
                  {formData.tiers.map((tier, index) => (
                    <div key={index} className="flex gap-3 items-end p-3 rounded-xl bg-dark-800 border border-white/5">
                      <div className="flex-1">
                        <label className="block text-xs text-dark-400 mb-1">Threshold Amount (&gt;)</label>
                        <input
                          type="number"
                          value={tier.threshold_amount}
                          onChange={(e) => updateTier(index, 'threshold_amount', e.target.value)}
                          className="form-input w-full py-1.5"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-dark-400 mb-1">Bonus Rate (%)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={tier.rate_percentage}
                          onChange={(e) => updateTier(index, 'rate_percentage', e.target.value)}
                          className="form-input w-full py-1.5"
                        />
                      </div>
                      <button type="button" onClick={() => removeTier(index)} className="p-2 text-dark-500 hover:text-red-400 mb-0.5">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {formData.tiers.length === 0 && (
                    <div className="text-center py-6 bg-dark-800/50 rounded-xl border border-dashed border-white/10">
                      <Percent size={24} className="mx-auto mb-2 text-dark-500" />
                      <p className="text-sm text-dark-400">No tiers added. Base rate will apply.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </form>
      </div>

      <div className="p-6 border-t border-white/10 bg-dark-900/50">
        <div className="flex gap-3">
          <button type="button" onClick={closePanel} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            type="submit"
            form="structure-form"
            disabled={mutation.isPending}
            className="btn-primary flex-1"
          >
            {mutation.isPending ? 'Saving...' : 'Save Structure'}
          </button>
        </div>
      </div>
    </div>
  )
}
