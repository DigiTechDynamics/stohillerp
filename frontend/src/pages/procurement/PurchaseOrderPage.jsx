import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ShoppingBag, Plus, Search, Filter, RefreshCw, 
  ChevronRight, FileText, CheckCircle2, Truck, 
  CreditCard, X, MoreVertical, Trash2, ShieldCheck, UserCheck
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { procurementAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'
import toast from 'react-hot-toast'

const STATUS_CONFIG = {
  draft: { label: 'Draft', color: 'bg-dark-600 text-dark-100', icon: <FileText size={12} /> },
  pending_md: { label: 'MD Approval', color: 'bg-indigo-500/20 text-indigo-400', icon: <ShieldCheck size={12} /> },
  pending_finance: { label: 'Finance Approval', color: 'bg-purple-500/20 text-purple-400', icon: <UserCheck size={12} /> },
  purchase: { label: 'Confirmed', color: 'bg-amber-500/20 text-amber-500', icon: <CheckCircle2 size={12} /> },
  received: { label: 'Received', color: 'bg-emerald-500/20 text-emerald-400', icon: <Truck size={12} /> },
  billed: { label: 'Billed', color: 'bg-primary/20 text-primary', icon: <CreditCard size={12} /> },
  cancel: { label: 'Cancelled', color: 'bg-rose-500/20 text-rose-500', icon: <X size={12} /> },
}

export default function PurchaseOrderPage() {
  const queryClient = useQueryClient()
  const [selectedPO, setSelectedPO] = useState(null)
  const [search, setSearch] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Queries
  const { data: pos, isLoading } = useQuery({
    queryKey: ['procurement-pos', search],
    queryFn: () => procurementAPI.purchaseOrders.list({ search }).then(res => res.data)
  })

  // Mutations
  const submitForApprovalMutation = useMutation({
    mutationFn: (id) => procurementAPI.purchaseOrders.confirm(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['procurement-pos'])
      toast.success('PO Submitted for MD Approval')
      setSelectedPO(null)
    }
  })

  const approveMDMutation = useMutation({
    mutationFn: (id) => procurementAPI.purchaseOrders.approveMD(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['procurement-pos'])
      toast.success('Approved by MD. Now pending Finance.')
      setSelectedPO(null)
    }
  })

  const approveFinanceMutation = useMutation({
    mutationFn: (id) => procurementAPI.purchaseOrders.approveFinance(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['procurement-pos'])
      toast.success('Approved by Finance. PO Confirmed.')
      setSelectedPO(null)
    }
  })

  const receiveMutation = useMutation({
    mutationFn: (id) => procurementAPI.purchaseOrders.receive(id, {}), // No warehouse passed = Simplified mode
    onSuccess: () => {
      queryClient.invalidateQueries(['procurement-pos'])
      toast.success('Products Received into Inventory')
      setSelectedPO(null)
    }
  })

  const createMutation = useMutation({
    mutationFn: (data) => procurementAPI.purchaseOrders.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['procurement-pos'])
      toast.success('RFQ Created Successfully')
      setShowCreateModal(false)
    }
  })

  const billMutation = useMutation({
    mutationFn: (id) => procurementAPI.purchaseOrders.createBill(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['procurement-pos'])
      toast.success(`Vendor Bill Created: ${res.data.invoice_reference}`)
      setSelectedPO(null)
    }
  })

  return (
    <div className="p-8 space-y-8 bg-dark-950 min-h-screen text-dark-100">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-light tracking-widest text-white uppercase flex items-center gap-3">
            Procurement <span className="text-primary font-bold">Portal</span>
          </h1>
          <p className="text-dark-400 text-sm mt-1">Direct approval workflow: MD & Finance verification</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-primary text-dark-900 px-4 py-2 rounded-xl text-xs font-bold hover:shadow-[0_0_20px_rgba(212,175,55,0.3)] transition-all"
          >
            <Plus size={16} />
            CREATE RFQ
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        
        {/* PO List */}
        <div className={`xl:col-span-3 bg-dark-900/40 border border-white/5 rounded-3xl overflow-hidden backdrop-blur-xl ${selectedPO ? 'hidden xl:block' : ''}`}>
          <div className="p-6 border-b border-white/5 flex items-center justify-between bg-dark-900/20">
            <div className="relative w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" size={16} />
              <input 
                type="text" 
                placeholder="Search PO reference, vendor..."
                className="w-full bg-dark-950 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:border-primary/50 outline-none transition-all"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] text-dark-500 uppercase tracking-widest bg-dark-900/40">
                  <th className="px-8 py-4 font-bold">Reference</th>
                  <th className="px-8 py-4 font-bold">Vendor</th>
                  <th className="px-8 py-4 font-bold">Date</th>
                  <th className="px-8 py-4 font-bold">Total</th>
                  <th className="px-8 py-4 font-bold">Status</th>
                  <th className="px-8 py-4 font-bold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  <tr><td colSpan="6" className="px-8 py-12 text-center text-dark-500 italic">Finding purchase orders...</td></tr>
                ) : pos?.results?.length === 0 ? (
                  <tr><td colSpan="6" className="px-8 py-12 text-center text-dark-500 italic">No orders found.</td></tr>
                ) : pos?.results?.map((po) => (
                  <tr key={po.id} className="group hover:bg-white/[0.02] transition-all cursor-pointer" onClick={() => setSelectedPO(po)}>
                    <td className="px-8 py-5">
                      <span className="text-sm font-bold text-white group-hover:text-primary transition-colors">{po.reference}</span>
                    </td>
                    <td className="px-8 py-5 text-sm text-dark-300">{po.vendor_name}</td>
                    <td className="px-8 py-5 text-xs text-dark-400">{formatDate(po.order_date)}</td>
                    <td className="px-8 py-5 font-mono text-sm text-white">{formatCurrency(po.total_amount)}</td>
                    <td className="px-8 py-5">
                      <div className={`flex items-center gap-2 px-2 py-1 rounded-lg w-fit ${STATUS_CONFIG[po.status]?.color}`}>
                        {STATUS_CONFIG[po.status]?.icon}
                        <span className="text-[10px] font-bold uppercase tracking-wider">{STATUS_CONFIG[po.status]?.label}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right"><ChevronRight size={16} className="text-dark-600 group-hover:text-primary transition-all" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Info Panel */}
        <div className={`xl:col-span-1 bg-dark-900/60 border border-white/5 rounded-3xl p-8 backdrop-blur-3xl sticky top-8 h-fit ${!selectedPO ? 'hidden xl:block' : ''}`}>
          {selectedPO ? (
            <AnimatePresence mode="wait">
               <motion.div 
                 key={selectedPO.id}
                 initial={{ opacity: 0, x: 20 }}
                 animate={{ opacity: 1, x: 0 }}
                 className="space-y-8"
               >
                 <div>
                    <h2 className="text-2xl font-bold text-white tracking-widest">{selectedPO.reference}</h2>
                    <p className="text-xs text-primary font-bold uppercase">{selectedPO.vendor_name}</p>
                 </div>

                 <div className="space-y-4">
                    <p className="text-[10px] text-dark-500 uppercase font-bold tracking-widest">APPROVAL PIPELINE</p>
                    <div className="flex flex-col gap-3">
                       <WorkflowStep active={true} label="DraftCreated" sub="RFQ ready for review" />
                       <WorkflowStep active={['pending_md', 'pending_finance', 'purchase', 'received', 'billed'].includes(selectedPO.status)} label="MD Verification" sub={selectedPO.md_approved_at ? `Approved ${formatDate(selectedPO.md_approved_at)}` : "Awaiting MD decision"} />
                       <WorkflowStep active={['pending_finance', 'purchase', 'received', 'billed'].includes(selectedPO.status)} label="Finance Audit" sub={selectedPO.finance_approved_at ? `Audited ${formatDate(selectedPO.finance_approved_at)}` : "Awaiting Finance release"} />
                       <WorkflowStep active={['purchase', 'received', 'billed'].includes(selectedPO.status)} label="Confirmed PO" sub="Authorized for vendor fulfillment" />
                    </div>
                 </div>

                 <div className="border-t border-white/5 pt-8 space-y-3">
                    <div className="flex justify-between items-center text-sm">
                       <span className="text-dark-500">Value:</span>
                       <span className="text-white font-bold">{formatCurrency(selectedPO.total_amount)}</span>
                    </div>
                    {selectedPO.status === 'draft' && (
                       <button 
                         onClick={() => submitForApprovalMutation.mutate(selectedPO.id)}
                         disabled={submitForApprovalMutation.isPending}
                         className="w-full bg-primary text-dark-900 py-3 rounded-xl text-xs font-bold uppercase tracking-widest hover:shadow-[0_0_15px_rgba(212,175,55,0.4)] transition-all disabled:opacity-50"
                       >
                         {submitForApprovalMutation.isPending ? 'Submitting...' : 'Submit to MD'}
                       </button>
                    )}
                    {selectedPO.status === 'pending_md' && (
                       <button 
                         onClick={() => approveMDMutation.mutate(selectedPO.id)}
                         disabled={approveMDMutation.isPending}
                         className="w-full bg-indigo-500 text-white py-3 rounded-xl text-xs font-bold uppercase tracking-widest hover:shadow-[0_0_15px_rgba(99,102,241,0.4)] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                       >
                         <ShieldCheck size={14} />
                         {approveMDMutation.isPending ? 'Processing...' : 'MD Approve'}
                       </button>
                    )}
                    {selectedPO.status === 'pending_finance' && (
                       <button 
                         onClick={() => approveFinanceMutation.mutate(selectedPO.id)}
                         disabled={approveFinanceMutation.isPending}
                         className="w-full bg-purple-500 text-white py-3 rounded-xl text-xs font-bold uppercase tracking-widest hover:shadow-[0_0_15px_rgba(168,85,247,0.4)] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                       >
                         <UserCheck size={14} />
                         {approveFinanceMutation.isPending ? 'Auditing...' : 'Finance Release'}
                       </button>
                    )}
                    {selectedPO.status === 'purchase' && (
                       <button 
                         onClick={() => receiveMutation.mutate(selectedPO.id)}
                         disabled={receiveMutation.isPending}
                         className="w-full bg-emerald-500/20 text-emerald-400 py-3 rounded-xl text-xs font-bold uppercase tracking-widest border border-emerald-500/20 hover:bg-emerald-500/30 transition-all flex items-center justify-center gap-2"
                       >
                         <Truck size={14} />
                         {receiveMutation.isPending ? 'Processing...' : 'Mark as Received'}
                       </button>
                    )}
                    {selectedPO.status === 'received' && (
                       <button 
                         onClick={() => billMutation.mutate(selectedPO.id)}
                         disabled={billMutation.isPending}
                         className="w-full bg-primary/20 text-primary py-3 rounded-xl text-xs font-bold uppercase tracking-widest border border-primary/20 hover:bg-primary/30 transition-all disabled:opacity-50"
                       >
                         {billMutation.isPending ? 'Generating Bill...' : 'Create Vendor Bill'}
                       </button>
                    )}
                    <button className="w-full bg-dark-950 border border-white/5 py-3 rounded-xl text-xs font-bold uppercase text-dark-400 hover:text-white transition-all flex items-center justify-center gap-2">
                       <FileText size={14} /> Print PO
                    </button>
                 </div>
               </motion.div>
            </AnimatePresence>
          ) : (
            <div className="h-[400px] flex flex-col items-center justify-center text-center space-y-4 opacity-20">
               <ShoppingBag size={48} />
               <p className="text-xs uppercase tracking-widest">Select PO to interact</p>
            </div>
          )}
        </div>
      </div>

      <CreatePurchaseOrderModal 
        isOpen={showCreateModal} 
        onClose={() => setShowCreateModal(false)}
        onSave={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
      />
    </div>
  )
}

function CreatePurchaseOrderModal({ isOpen, onClose, onSave, isPending }) {
  const [vendor, setVendor] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [amount, setAmount] = useState('1500')

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 text-dark-100">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-dark-900 border border-white/10 rounded-3xl p-8 shadow-2xl">
         <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white uppercase tracking-widest">Create RFQ</h2>
            <button onClick={onClose} className="text-dark-500 hover:text-white"><X size={20} /></button>
         </div>

         <div className="space-y-4">
            <div>
               <label className="text-[10px] text-dark-500 font-bold uppercase mb-2 block">Vendor Name</label>
               <input 
                 type="text" 
                 className="w-full bg-dark-950 border border-white/10 rounded-xl py-3 px-4 text-white outline-none focus:border-primary/50 transition-all placeholder:text-dark-600" 
                 placeholder="e.g., Global Supplies Ltd"
                 value={vendor}
                 onChange={(e) => setVendor(e.target.value)}
               />
            </div>
            <div>
               <label className="text-[10px] text-dark-500 font-bold uppercase mb-2 block">Order Date</label>
               <input 
                 type="date" 
                 className="w-full bg-dark-950 border border-white/10 rounded-xl py-3 px-4 text-white outline-none focus:border-primary/50 transition-all"
                 value={date}
                 onChange={(e) => setDate(e.target.value)}
               />
            </div>
            <div>
               <label className="text-[10px] text-dark-500 font-bold uppercase mb-2 block">Estimated Total</label>
               <input 
                 type="number" 
                 className="w-full bg-dark-950 border border-white/10 rounded-xl py-3 px-4 text-white outline-none focus:border-primary/50 transition-all font-mono"
                 value={amount}
                 onChange={(e) => setAmount(e.target.value)}
               />
            </div>

            <div className="pt-6 flex gap-4">
               <button onClick={onClose} className="flex-1 py-3 border border-white/10 rounded-xl text-xs font-bold text-dark-400 hover:text-white transition-all">CANCEL</button>
               <button 
                 onClick={() => onSave({ vendor_name: vendor, order_date: date, total_amount: parseFloat(amount) })}
                 disabled={isPending || !vendor}
                 className="flex-1 py-3 bg-primary text-dark-900 rounded-xl text-xs font-bold uppercase hover:shadow-[0_0_15px_rgba(212,175,55,0.4)] disabled:opacity-50 transition-all font-mono"
               >
                 {isPending ? 'CREATING...' : 'CREATE DRAFT'}
               </button>
            </div>
         </div>
      </motion.div>
    </div>
  )
}

function WorkflowStep({ active, label, sub }) {
  return (
    <div className="flex items-start gap-4 group">
       <div className="flex flex-col items-center">
          <div className={`w-3 h-3 rounded-full border-2 transition-all duration-500 ${active ? 'bg-primary border-primary shadow-[0_0_8px_rgba(212,175,55,0.5)]' : 'border-dark-700'}`} />
          <div className="w-0.5 h-8 bg-dark-800" />
       </div>
       <div className={active ? 'opacity-100' : 'opacity-30'}>
          <p className="text-xs font-bold text-white tracking-widest uppercase">{label}</p>
          <p className="text-[10px] text-dark-500 font-light">{sub}</p>
       </div>
    </div>
  )
}
