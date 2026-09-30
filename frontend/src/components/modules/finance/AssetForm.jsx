import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, X, Calendar, DollarSign, Tag, Info, Layers } from 'lucide-react'
import { fixedAssetsAPI } from '@/services/api'
import CurrencySelect from '@/components/common/CurrencySelect'

export default function AssetForm({ asset, onClose }) {
  const queryClient = useQueryClient()
  const isEditing = !!asset

  const [formData, setFormData] = useState({
    code: asset?.code || '',
    name: asset?.name || '',
    category: asset?.category || '',
    acquisition_date: asset?.acquisition_date || new Date().toISOString().split('T')[0],
    acquisition_cost: asset?.acquisition_cost || '',
    serial_number: asset?.serial_number || '',
    status: asset?.status || 'active',
    currency: asset?.currency || '',
  })

  // State for Statutory Book
  const [bookData, setBookData] = useState({
    method: asset?.books?.[0]?.method || 'straight_line',
    useful_life_months: asset?.books?.[0]?.useful_life_months || 60,
    salvage_value: asset?.books?.[0]?.salvage_value || '0',
    total_expected_units: asset?.books?.[0]?.total_expected_units || '',
  })

  // Data Fetching
  const { data: categoriesData } = useQuery({
    queryKey: ['asset-categories'],
    queryFn: () => fixedAssetsAPI.categories.list(),
  })
  const categories = categoriesData?.data?.results || []


  const mutation = useMutation({
    mutationFn: (data) => 
      isEditing 
        ? fixedAssetsAPI.assets.update(asset.id, data)
        : fixedAssetsAPI.assets.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixed-assets'] })
      onClose()
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    // For simplicity, we bundle the book data with the asset creation
    // The backend ViewSet/Serializer would normally handle this via nested writes
    const payload = {
      ...formData,
      books: [
        {
          ...bookData,
          book_type: 'Statutory',
          current_nbv: formData.acquisition_cost, // Initial NBV = Cost
        }
      ]
    }
    mutation.mutate(payload)
  }

  return (
    <div className="flex flex-col h-full bg-dark-900">
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{isEditing ? 'Edit Asset' : 'New Fixed Asset'}</h2>
          <p className="text-dark-400 text-xs mt-1">Define asset details and depreciation rules.</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-dark-400 transition-colors">
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {/* Basic Info */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-primary mb-2">
            <Info size={16} />
            <span className="text-xs font-bold uppercase tracking-widest">Basic Information</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Asset Code</label>
              <input 
                type="text"
                required
                className="form-input w-full"
                placeholder="e.g. VEH-001"
                value={formData.code}
                onChange={e => setFormData({...formData, code: e.target.value})}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Category</label>
              <select name="category" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} required className="form-input w-full">
                <option value="">Select Category</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Asset Name</label>
            <input 
              type="text"
              required
              className="form-input w-full"
              placeholder="e.g. Delivery Van 2024"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>
        </section>

        {/* Acquisition Details */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-emerald-500 mb-2">
            <DollarSign size={16} />
            <span className="text-xs font-bold uppercase tracking-widest">Acquisition</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Acquisition Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" size={16} />
                <input 
                  type="date"
                  required
                  className="form-input w-full pl-10"
                  value={formData.acquisition_date}
                  onChange={e => setFormData({...formData, acquisition_date: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Acquisition Cost</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500 text-sm">$</span>
                <input 
                  type="number"
                  step="0.01"
                  required
                  className="form-input w-full pl-8"
                  placeholder="0.00"
                  value={formData.acquisition_cost}
                  onChange={e => setFormData({...formData, acquisition_cost: e.target.value})}
                />
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            <CurrencySelect 
              value={formData.currency}
              onChange={(val) => setFormData(prev => ({ ...prev, currency: val }))}
              label="Acquisition Currency"
            />
          </div>
        </section>

        {/* Depreciation Rules */}
        <section className="space-y-4 p-5 bg-dark-800/50 rounded-2xl border border-white/5">
          <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-2 text-primary">
                <Layers size={16} />
                <span className="text-xs font-bold uppercase tracking-widest">Statutory Book Rules</span>
             </div>
             <span className="text-[8px] bg-primary/20 text-primary px-2 py-0.5 rounded uppercase font-bold">Standard Recording</span>
          </div>
          
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Depreciation Method</label>
            <select 
              className="form-input w-full bg-dark-900/50"
              value={bookData.method}
              onChange={e => setBookData({...bookData, method: e.target.value})}
            >
              <option value="straight_line">Straight Line</option>
              <option value="declining_balance">Declining Balance</option>
              <option value="double_declining">Double Declining Balance</option>
              <option value="units_of_production">Units of Production</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            {bookData.method !== 'units_of_production' ? (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Useful Life (Months)</label>
                <input 
                  type="number"
                  required
                  className="form-input w-full bg-dark-900/50"
                  value={bookData.useful_life_months}
                  onChange={e => setBookData({...bookData, useful_life_months: e.target.value})}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Total Expected Units</label>
                <input 
                  type="number"
                  required
                  className="form-input w-full bg-dark-900/50"
                  placeholder="e.g. 100000"
                  value={bookData.total_expected_units}
                  onChange={e => setBookData({...bookData, total_expected_units: e.target.value})}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Salvage Value</label>
              <input 
                type="number"
                step="0.01"
                className="form-input w-full bg-dark-900/50"
                value={bookData.salvage_value}
                onChange={e => setBookData({...bookData, salvage_value: e.target.value})}
              />
            </div>
          </div>
        </section>

        {/* Physical Tracking */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-dark-400 mb-2">
            <Tag size={16} />
            <span className="text-xs font-bold uppercase tracking-widest">Physical tracking</span>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Serial Number</label>
            <input 
              type="text"
              className="form-input w-full"
              placeholder="e.g. SN-9988-X"
              value={formData.serial_number}
              onChange={e => setFormData({...formData, serial_number: e.target.value})}
            />
          </div>
        </section>
      </form>

      <div className="p-6 border-t border-white/5 bg-dark-900/80 backdrop-blur-xl flex items-center justify-end gap-3 mt-auto">
        <button 
          type="button"
          onClick={onClose}
          className="px-6 py-2.5 rounded-xl text-sm font-medium text-dark-400 hover:text-white hover:bg-white/5 transition-all"
        >
          Cancel
        </button>
        <button 
          onClick={handleSubmit}
          disabled={mutation.isPending}
          className="btn-primary px-8 py-2.5 flex items-center gap-2 shadow-lg shadow-primary/20"
        >
          <Save size={18} />
          {mutation.isPending ? 'Saving...' : 'Save Asset'}
        </button>
      </div>
    </div>
  )
}
