import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { 
  ShoppingBag, Box, Package, AlertTriangle, 
  Truck, ArrowRight, BarChart, TrendingDown 
} from 'lucide-react'
import { dashboardAPI } from '@/services/api'
import { formatCurrency, formatNumber } from '@/utils/format'
import { KpiCard, DashboardSkeleton } from '@/components/common/DashboardKpis'
import { useNavigate } from 'react-router-dom'

export default function SupplyChainDashboard() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-supply-chain'],
    queryFn: () => dashboardAPI.supplyChain().then(res => res.data)
  })

  if (isLoading) return <DashboardSkeleton />

  const { kpis, recent_pos } = data

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Inventory Valuation"
          value={formatCurrency(kpis.inventory_valuation)}
          subtitle="Total Asset Value"
          icon={<Box size={20} />}
          accent="text-blue-400"
          onClick={() => navigate('/inventory')}
        />
        <KpiCard
          title="Open POs"
          value={formatNumber(kpis.open_purchase_orders)}
          subtitle="Awaiting Delivery"
          icon={<ShoppingBag size={20} />}
          accent="text-emerald-400"
          onClick={() => navigate('/procurement')}
        />
        <KpiCard
          title="Low Stock Alerts"
          value={formatNumber(kpis.low_stock_alerts)}
          subtitle="Below Reorder Point"
          icon={<AlertTriangle size={20} />}
          accent="text-amber-400"
          onClick={() => navigate('/inventory')}
        />
        <KpiCard
          title="Inbound Shipments"
          value={formatNumber(kpis.pending_deliveries)}
          subtitle="Pending Receipt"
          icon={<Truck size={20} />}
          accent="text-primary"
          onClick={() => navigate('/procurement')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-white">Recent Purchase Orders</h3>
            <button onClick={() => navigate('/procurement')} className="text-xs text-primary hover:underline">View All</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/5 text-dark-500 uppercase text-[10px] font-bold tracking-widest">
                  <th className="pb-3">PO Number</th>
                  <th className="pb-3">Vendor</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recent_pos.map((po) => (
                  <tr key={po.po_number} className="group hover:bg-white/5 transition-colors">
                    <td className="py-3 font-mono text-xs text-primary">{po.po_number}</td>
                    <td className="py-3 text-dark-300">{po.vendor__name}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        po.status === 'purchase' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'
                      }`}>
                        {po.status}
                      </span>
                    </td>
                    <td className="py-3 text-right text-white font-medium">{formatCurrency(po.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6 bg-primary/5 border-primary/20">
            <h4 className="text-sm font-bold text-white mb-4 uppercase tracking-widest">Supply Chain Health</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-dark-800 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500">
                    <TrendingDown size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Stock-outs</p>
                    <p className="text-[10px] text-dark-400">{kpis.low_stock_alerts} items critical</p>
                  </div>
                </div>
                <button onClick={() => navigate('/inventory')} className="btn-primary py-1 px-3 text-[10px]">ORDER</button>
              </div>

              <div className="flex items-center justify-between p-3 bg-dark-800 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                    <Package size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Replenishment</p>
                    <p className="text-[10px] text-dark-400">{kpis.pending_deliveries} POs in transit</p>
                  </div>
                </div>
                <button onClick={() => navigate('/procurement')} className="btn-ghost py-1 px-3 text-[10px]">TRACK</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
