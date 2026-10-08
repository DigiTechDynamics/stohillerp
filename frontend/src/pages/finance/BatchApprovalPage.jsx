import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, User, Info, AlertTriangle } from 'lucide-react'
import { financeAPI, apiErrorMessage } from '@/services/api'
import { formatCurrency } from '@/utils/format'
import { useAuthStore } from '@/stores/authStore'
import Pagination from '@/components/common/Pagination'
import { confirmDialog, alertDialog } from '@/components/common/Dialogs'

export default function BatchApprovalPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  
  const [page, setPage] = useState(1)

  // Only fetch batches strictly waiting for approval
  const { data, isLoading } = useQuery({
    queryKey: ['journal-batches', 'pending', { page }],
    queryFn: () => financeAPI.batches.list({ status: 'pending_approval', page }),
  })

  const batches = data?.data?.results || []

  // Mutations
  const approveMutation = useMutation({
    mutationFn: (id) => financeAPI.batches.approve(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['journal-batches'] })
  })

  const postMutation = useMutation({
    mutationFn: (id) => financeAPI.batches.post(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['journal-batches'] })
  })

  const handleApprove = async (batch) => {
    if (batch.maker === currentUser?.id && !currentUser?.is_superuser) {
        alertDialog({ title: 'Maker/checker rule', message: 'You cannot approve a batch you created.', tone: 'warning' })
        return
    }
    if (await confirmDialog({ title: `Approve batch ${batch.batch_number}?`, confirmLabel: 'Approve' })) {
      try {
          await approveMutation.mutateAsync(batch.id)
      } catch (err) {
          alertDialog({ title: 'Batch not approved', message: apiErrorMessage(err, 'Unknown error'), tone: 'danger' })
      }
    }
  }

  const handlePost = async (batch) => {
    if (await confirmDialog({ title: `Post batch ${batch.batch_number}?`, message: 'The batch is posted to the General Ledger. This cannot be undone.', confirmLabel: 'Post', tone: 'warning' })) {
        try {
            await postMutation.mutateAsync(batch.id)
        } catch (err) {
            alertDialog({ title: 'Batch not posted', message: apiErrorMessage(err, 'Unknown error'), tone: 'danger' })
        }
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-white">Approvals Dashboard</h1>
          <p className="text-dark-400 text-sm mt-1">Maker/Checker queue for financial batches</p>
        </div>
        <button className="btn-secondary" onClick={() => navigate('/finance/entries')}>
           Back to Batches
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="md:col-span-2 space-y-4">
             <div className="card p-5 border border-amber-500/20 bg-amber-500/5">
                <h3 className="text-amber-500 font-bold uppercase tracking-widest text-xs mb-2 flex items-center gap-2">
                    <AlertTriangle size={14} /> Action Required
                </h3>
                <p className="text-sm text-dark-300">The following batches have been submitted for review. Please verify the totals before approving.</p>
             </div>

             <div className="space-y-4">
                 <AnimatePresence>
                     {batches.map(batch => (
                         <motion.div 
                            key={batch.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="card p-5"
                         >
                             <div className="flex justify-between items-start mb-4 border-b border-white/5 pb-4">
                                 <div>
                                     <h4 className="text-lg font-mono font-bold text-primary">{batch.batch_number}</h4>
                                     <p className="text-sm text-dark-300 mt-1">{batch.description}</p>
                                 </div>
                                 <div className="text-right">
                                     <p className="text-xs text-dark-500 uppercase font-bold tracking-widest mb-1">Batch Total</p>
                                     <p className="text-xl font-mono text-white">{formatCurrency(batch.total_debits)}</p>
                                 </div>
                             </div>

                             <div className="flex justify-between items-center">
                                 <div className="flex gap-4 text-xs text-dark-400">
                                     <div className="flex items-center gap-1.5 bg-dark-800 px-3 py-1.5 rounded-lg border border-white/5">
                                         <User size={12} className="text-dark-500" />
                                         Maker: <span className="text-white">{batch.maker_name}</span>
                                     </div>
                                     <div className="flex items-center gap-1.5 bg-dark-800 px-3 py-1.5 rounded-lg border border-white/5">
                                         <Info size={12} className="text-dark-500" />
                                         Entries: <span className="text-white">{batch.entries_count}</span>
                                     </div>
                                 </div>
                                 
                                 <div className="flex gap-2">
                                     <button 
                                        className="btn-primary text-xs py-1.5 px-4"
                                        onClick={() => handleApprove(batch)}
                                        disabled={approveMutation.isPending}
                                     >
                                         <CheckCircle size={14} className="mr-1.5 inline" /> Approve
                                     </button>
                                 </div>
                             </div>
                         </motion.div>
                     ))}
                 </AnimatePresence>

                 {batches.length === 0 && !isLoading && (
                     <div className="card p-12 text-center text-dark-400 border-dashed border-dark-600">
                         <CheckCircle size={32} className="mx-auto mb-3 opacity-50 text-emerald-500" />
                         <p>No batches are currently awaiting approval.</p>
                     </div>
                 )}
             </div>

             {data?.data?.count > 0 && (
                 <Pagination 
                    currentPage={page}
                    totalPages={data?.data?.total_pages}
                    totalCount={data?.data?.count}
                    onPageChange={setPage}
                 />
             )}
         </div>

         <div className="space-y-4">
              <div className="card p-5 border border-primary/20 bg-primary/5">
                <h3 className="text-primary font-bold uppercase tracking-widest text-xs mb-4">
                    Ready to Post
                </h3>
                
                <PendingPostList onPost={handlePost} isPosting={postMutation.isPending} />
             </div>
         </div>
      </div>
    </div>
  )
}

function PendingPostList({ onPost, isPosting }) {
    const { data, isLoading } = useQuery({
        queryKey: ['journal-batches', 'approved'],
        queryFn: () => financeAPI.batches.list({ status: 'approved' }),
    })
    
    const batches = data?.data?.results || []

    if (isLoading) return <div className="text-center text-xs text-dark-500">Loading...</div>

    if (batches.length === 0) return (
        <div className="text-center p-6 text-xs text-dark-500 border border-dashed border-white/10 rounded-xl">
            No approved batches ready to post.
        </div>
    )

    return (
        <div className="space-y-3">
            {batches.map(batch => (
                <div key={batch.id} className="bg-dark-800 p-4 rounded-xl border border-white/5 flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                        <span className="font-mono text-xs text-white bg-white/5 px-2 py-1 rounded">{batch.batch_number}</span>
                        <span className="font-mono text-xs text-emerald-400">{formatCurrency(batch.total_debits)}</span>
                    </div>
                    <div className="text-xs text-dark-400 flex items-center gap-1">
                       <CheckCircle size={10} className="text-blue-500" /> Approved by {batch.checker_name || 'Checker'}
                    </div>
                    <button 
                        className="w-full text-xs py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors font-bold uppercase tracking-wider disabled:opacity-50"
                        onClick={() => onPost(batch)}
                        disabled={isPosting}
                    >
                        Post Ledger
                    </button>
                </div>
            ))}
        </div>
    )
}
