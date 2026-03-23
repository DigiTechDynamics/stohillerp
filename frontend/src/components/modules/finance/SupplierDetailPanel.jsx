import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Mail, Phone, MapPin, Hash, ShieldCheck, ShieldAlert, Edit3, Trash2, Clock, DollarSign } from 'lucide-react'
import { financeAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import { toast } from 'react-hot-toast'

export default function SupplierDetailPanel({ supplier: initialSupplier }) {
  const queryClient = useQueryClient()
  const { closeSidePanel, openSidePanel } = useUIStore()

  const { data, isLoading } = useQuery({
    queryKey: ['supplier-detail', initialSupplier.id],
    queryFn: () => financeAPI.ap.suppliers.list({ id: initialSupplier.id }),
    initialData: { data: initialSupplier }
  })

  const supplier = data?.data?.results?.[0] || data?.data || initialSupplier

  const toggleMutation = useMutation({
    mutationFn: () => financeAPI.ap.suppliers.toggleActive(supplier.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ap-suppliers'] })
      queryClient.invalidateQueries({ queryKey: ['supplier-detail', supplier.id] })
      toast.success(`Supplier ${supplier.is_active ? 'deactivated' : 'activated'} successfully`)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: () => financeAPI.ap.suppliers.delete(supplier.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ap-suppliers'] })
      toast.success('Supplier deleted successfully')
      closeSidePanel()
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to delete supplier. Ensure they have no transactions.')
    }
  })

  if (isLoading) return <div className="p-20 text-center text-dark-400">Loading details...</div>

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-500 border border-amber-500/20">
            <Building2 size={24} />
          </div>
          <span className={`badge text-[10px] uppercase font-bold
            ${supplier.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
            {supplier.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>

        <div>
           <h2 className="text-xl font-semibold text-white">{supplier.name}</h2>
           <p className="text-dark-400 text-sm mt-1">Supplier / Vendor Profile</p>
        </div>
      </div>

      {/* Stats Card */}
      <div className="bg-dark-800/50 border border-white/5 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-2">
           <span className="text-[10px] text-dark-500 uppercase tracking-widest font-bold">Outstanding Balance</span>
           <DollarSign size={14} className="text-primary" />
        </div>
        <p className="text-3xl font-display text-white">{formatCurrency(parseFloat(supplier.balance || 0))}</p>
      </div>

      {/* Info Grid */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-bold text-dark-500 uppercase tracking-widest flex items-center gap-2">
          Contact Details
        </h3>
        <div className="grid grid-cols-1 gap-2">
          <div className="bg-dark-900 border border-white/5 rounded-xl p-3 flex items-center gap-3">
            <Mail size={14} className="text-dark-500" />
            <span className="text-sm text-white">{supplier.email || 'No email provided'}</span>
          </div>
          <div className="bg-dark-900 border border-white/5 rounded-xl p-3 flex items-center gap-3">
            <Phone size={14} className="text-dark-500" />
            <span className="text-sm text-white">{supplier.phone || 'No phone number'}</span>
          </div>
          <div className="bg-dark-900 border border-white/5 rounded-xl p-3 flex items-center gap-3">
            <MapPin size={14} className="text-dark-500" />
            <span className="text-sm text-white">{supplier.address || 'No address provided'}</span>
          </div>
        </div>
      </div>

      {/* Account Info */}
      <div className="bg-dark-800/30 rounded-xl p-4 border border-white/5 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-dark-500 uppercase tracking-widest">Tax Number</span>
          <span className="text-sm font-mono text-white">{supplier.tax_number || 'N/A'}</span>
        </div>
        <div className="flex justify-between items-center pt-2 border-t border-white/5">
          <span className="text-[10px] text-dark-500 uppercase tracking-widest">Terms</span>
          <span className="text-sm text-white font-medium">{supplier.payment_terms_days} Days</span>
        </div>
      </div>

      {/* Actions */}
      <div className="pt-6 grid grid-cols-2 gap-3">
        <button 
          onClick={() => openSidePanel('new-supplier', { supplier })}
          className="btn-secondary py-3 flex items-center justify-center gap-2 h-11"
        >
          <Edit3 size={16} /> Edit Details
        </button>
        <button 
          onClick={() => toggleMutation.mutate()}
          className={`btn-secondary py-3 flex items-center justify-center gap-2 h-11 transition-colors
            ${supplier.is_active ? 'hover:bg-red-500/10 hover:text-red-400' : 'hover:bg-emerald-500/10 hover:text-emerald-400'}`}
        >
          {supplier.is_active ? <><ShieldAlert size={16} /> Deactivate</> : <><ShieldCheck size={16} /> Activate</>}
        </button>
        <button 
          onClick={() => {
            if(window.confirm('Are you sure you want to delete this supplier? This action cannot be undone.')) {
              deleteMutation.mutate()
            }
          }}
          className="btn-secondary py-3 flex items-center justify-center gap-2 h-11 text-red-500/60 hover:text-red-500 hover:bg-red-500/10 col-span-2 mt-2"
        >
          <Trash2 size={16} /> Delete Supplier
        </button>
      </div>
    </div>
  )
}
