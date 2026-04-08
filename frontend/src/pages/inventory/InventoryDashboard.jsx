import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Package, Warehouse, RefreshCw, AlertTriangle, Search, 
  Plus, Filter, ArrowRight, TrendingDown, BarChart2 
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { inventoryAPI } from '@/services/api'
import { formatCurrency } from '@/utils/format'
import toast from 'react-hot-toast'

export default function InventoryDashboard() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')

  // Queries
  const { data: products, isLoading } = useQuery({
    queryKey: ['inventory-products', search],
    queryFn: () => inventoryAPI.products.list({ search }).then(res => res.data)
  })

  const { data: warehouses } = useQuery({
    queryKey: ['inventory-warehouses'],
    queryFn: () => inventoryAPI.warehouses.list().then(res => res.data)
  })

  // KPI Calculations
  const lowStockCount = products?.results?.filter(p => p.total_stock <= 5 && p.product_type === 'storable').length || 0
  const totalValue = products?.results?.reduce((acc, p) => acc + (parseFloat(p.cost_price) * (p.total_stock || 0)), 0) || 0

  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [adjustData, setAdjustData] = useState({ product: '', warehouse: '', quantity: 1, type: 'in' })

  const adjustMutation = useMutation({
    mutationFn: (data) => inventoryAPI.moves.adjustment(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['inventory-products'])
      toast.success('Stock adjusted successfully')
      setShowAdjustModal(false)
    }
  })

  return (
    <div className="p-8 space-y-8 bg-dark-950 min-h-screen text-dark-100">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-light tracking-widest text-white uppercase flex items-center gap-3">
            Inventory <span className="text-primary font-bold">Command</span>
          </h1>
          <p className="text-dark-400 text-sm mt-1">Manage products, warehouses, and stock valuations</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowAdjustModal(true)}
            className="flex items-center gap-2 bg-dark-900 border border-white/10 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-dark-800 transition-all"
          >
            <RefreshCw size={16} />
            ADJUST STOCK
          </button>
          <button className="flex items-center gap-2 bg-primary text-dark-900 px-4 py-2 rounded-xl text-xs font-bold hover:shadow-[0_0_20px_rgba(212,175,55,0.3)] transition-all">
            <Plus size={16} />
            NEW PRODUCT
          </button>
        </div>
      </div>

      {/* KPI Section */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard title="Total Products" value={products?.count || 0} icon={<Package />} color="primary" />
        <StatCard title="Active Warehouses" value={warehouses?.results?.length || 0} icon={<Warehouse />} color="blue" />
        <StatCard title="Low Stock Items" value={lowStockCount} icon={<AlertTriangle className="text-amber-500" />} color="amber" />
        <StatCard title="Inventory Value" value={formatCurrency(totalValue)} icon={<BarChart2 />} color="green" />
      </div>

      {/* Main Content */}
      <div className="bg-dark-900/40 border border-white/5 rounded-3xl overflow-hidden backdrop-blur-xl">
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-dark-900/20">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" size={16} />
            <input 
              type="text" 
              placeholder="Search by SKU, Name, or Category..."
              className="w-full bg-dark-950 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:border-primary/50 outline-none transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
             <button className="p-2 bg-dark-950 border border-white/10 rounded-xl text-dark-400 hover:text-white transition-all">
               <Filter size={18} />
             </button>
             <button className="p-2 bg-dark-950 border border-white/10 rounded-xl text-dark-400 hover:text-white transition-all">
               <RefreshCw size={18} />
             </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] text-dark-500 uppercase tracking-widest bg-dark-900/40">
                <th className="px-8 py-4 font-bold">Product / SKU</th>
                <th className="px-8 py-4 font-bold">Type</th>
                <th className="px-8 py-4 font-bold">Stock on Hand</th>
                <th className="px-8 py-4 font-bold">Unit Cost</th>
                <th className="px-8 py-4 font-bold">Status</th>
                <th className="px-8 py-4 font-bold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                   <td colSpan="6" className="px-8 py-12 text-center text-dark-500 italic">Loading inventory data...</td>
                </tr>
              ) : products?.results?.length === 0 ? (
                <tr>
                   <td colSpan="6" className="px-8 py-12 text-center text-dark-500 italic">No products found. Start by adding one.</td>
                </tr>
              ) : products?.results?.map((product) => (
                <tr key={product.id} className="group hover:bg-white/[0.02] transition-all">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-dark-950 border border-white/10 flex items-center justify-center text-primary group-hover:border-primary/30 transition-all">
                        <Package size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white mb-0.5">{product.name}</p>
                        <p className="text-[10px] text-primary/70 font-mono tracking-tighter uppercase">{product.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className="text-xs text-dark-400 capitalize">{product.product_type}</span>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                       <span className="text-sm font-bold text-white">{product.total_stock || '0.00'} {product.uom}</span>
                       {(product.total_stock || 0) <= 5 && product.product_type === 'storable' && <TrendingDown size={14} className="text-rose-500/50" />}
                    </div>
                  </td>
                  <td className="px-8 py-5 font-mono text-sm text-dark-200">
                    {formatCurrency(product.cost_price)}
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${product.is_active ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-dark-600'}`} />
                      <span className="text-xs text-dark-400">{product.is_active ? 'Active' : 'Archived'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <button className="p-2 text-dark-500 hover:text-white transition-all">
                      <ArrowRight size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Adjustment Modal */}
      <AnimatePresence>
        {showAdjustModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={() => setShowAdjustModal(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-dark-900 border border-white/10 rounded-3xl p-8 shadow-2xl">
              <h2 className="text-xl font-bold text-white mb-6 uppercase tracking-widest">Stock Adjustment</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-dark-500 mb-2 block tracking-widest">Product</label>
                  <select 
                    className="w-full bg-dark-950 border border-white/10 rounded-xl py-3 px-4 text-white outline-none"
                    value={adjustData.product}
                    onChange={(e) => setAdjustData({...adjustData, product: e.target.value})}
                  >
                    <option value="">Select Product...</option>
                    {products?.results?.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-dark-500 mb-2 block tracking-widest">Warehouse</label>
                    <select 
                      className="w-full bg-dark-950 border border-white/10 rounded-xl py-3 px-4 text-white outline-none"
                      value={adjustData.warehouse}
                      onChange={(e) => setAdjustData({...adjustData, warehouse: e.target.value})}
                    >
                      <option value="">Select...</option>
                      {warehouses?.results?.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-dark-500 mb-2 block tracking-widest">Adjustment Type</label>
                    <select 
                      className="w-full bg-dark-950 border border-white/10 rounded-xl py-3 px-4 text-white outline-none"
                      value={adjustData.type}
                      onChange={(e) => setAdjustData({...adjustData, type: e.target.value})}
                    >
                      <option value="in">Inventory In (+)</option>
                      <option value="out">Inventory Out (-)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-dark-500 mb-2 block tracking-widest">Quantity</label>
                  <input 
                    type="number" 
                    className="w-full bg-dark-950 border border-white/10 rounded-xl py-3 px-4 text-white outline-none"
                    value={adjustData.quantity}
                    onChange={(e) => setAdjustData({...adjustData, quantity: e.target.value})}
                  />
                </div>

                <div className="flex gap-4 pt-6">
                  <button onClick={() => setShowAdjustModal(false)} className="flex-1 py-3 border border-white/10 rounded-xl text-xs font-bold text-dark-400 hover:text-white transition-all">CANCEL</button>
                  <button 
                    disabled={!adjustData.product || !adjustData.warehouse || adjustMutation.isPending}
                    onClick={() => adjustMutation.mutate(adjustData)}
                    className="flex-1 py-3 bg-primary text-dark-900 rounded-xl text-xs font-bold hover:shadow-[0_0_15px_rgba(212,175,55,0.4)] disabled:opacity-50 transition-all font-mono"
                  >
                    {adjustMutation.isPending ? 'PROCESSING...' : 'APPLY MOVE'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

function StatCard({ title, value, icon, color }) {
  const colors = {
    primary: 'bg-primary/10 border-primary/20 text-primary',
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    green: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
  }

  return (
    <div className={`p-6 rounded-3xl border ${colors[color]} backdrop-blur-md`}>
      <div className="flex items-center justify-between mb-4">
        <div className="p-3 bg-dark-950/50 rounded-2xl border border-white/5">
          {icon}
        </div>
      </div>
      <p className="text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">{title}</p>
      <h3 className="text-2xl font-bold text-white tracking-widest">{value}</h3>
    </div>
  )
}
