import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Landmark, Plus, RefreshCw, Wallet, ArrowRightLeft, MoreVertical, CheckCircle2, Search, Filter, Upload
} from 'lucide-react'
import { bankingAPI, financeAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import Pagination from '@/components/common/Pagination'
import ReconciliationWorkspace from './ReconciliationWorkspace'

export default function BankingPage() {
  const [tab, setTab] = useState('accounts')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('name')
  const [page, setPage] = useState(1)
  const [reconAccountId, setReconAccountId] = useState('')
  const { openSidePanel } = useUIStore.getState()

  const { data: accountsData, isLoading, refetch } = useQuery({
    queryKey: ['banking-accounts', { search, ordering: sort, page }],
    queryFn: () => bankingAPI.accounts.list({ search, ordering: sort, page })
  })

  const { data: statementsRaw } = useQuery({
    queryKey: ['bank-statements', { page }],
    queryFn: () => bankingAPI.statements.list({ page }),
    enabled: tab === 'statements'
  })
  const statements = statementsRaw?.data?.results || []

  const { data: paymentsRaw } = useQuery({
    queryKey: ['ap-payments', { page }],
    queryFn: () => financeAPI.ap.payments.list({ page }),
    enabled: tab === 'payments'
  })
  const payments = paymentsRaw?.data?.results || []

  const { data: draftPaymentsRaw } = useQuery({
    queryKey: ['ap-payments', { status: 'draft' }],
    queryFn: () => financeAPI.ap.payments.list({ status: 'draft', page_size: 200 }),
  })
  const draftPayments = draftPaymentsRaw?.data?.results || []
  const draftPaymentTotal = draftPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)

  const accounts = accountsData?.data?.results || accountsData?.data || []
  const totalBalance = accounts.reduce((sum, acc) => sum + parseFloat(acc.current_balance || 0), 0)
  const unreconciled = accounts.reduce((sum, acc) => sum + (acc.unreconciled_lines || 0), 0)
  const reconAccount = reconAccountId || accounts[0]?.id || ''

  const tabs = [
    { id: 'accounts', label: 'Bank Accounts' },
    { id: 'statements', label: 'Statements' },
    { id: 'reconciliation', label: 'Reconciliation Workspace' },
    { id: 'payments', label: 'Payment Batches' },
  ]

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-white">Cash & Bank Management</h1>
          <p className="text-dark-400 text-sm mt-1">Real-time liquidity and automated reconciliation</p>
        </div>
        <div className="flex items-center gap-3">

          <button className="btn-secondary" onClick={() => refetch()}>
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button 
            className="btn-secondary flex items-center gap-2"
            onClick={() => openSidePanel('reconciliation-rules-form')}
          >
            <Filter size={16} />
            Rules
          </button>
          <button 
            className="btn-primary"
            onClick={() => openSidePanel('bank-account-form')}
          >
            <Plus size={16} />
            New Account
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-5 bg-gradient-to-br from-primary/10 to-transparent">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
              <Wallet size={24} />
            </div>
            <span className="text-[10px] text-primary font-bold uppercase tracking-wider text-right">Liquidity</span>
          </div>
          <p className="stat-value">{formatCurrency(totalBalance)}</p>
          <p className="text-xs text-dark-400 mt-1">Book balance across {accounts.length} account(s)</p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
              <ArrowRightLeft size={24} />
            </div>
            <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider text-right">Reconciliation</span>
          </div>
          <p className="stat-value">{unreconciled} Items</p>
          <p className="text-xs text-dark-400 mt-1">Statement lines not yet reconciled</p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
              <CheckCircle2 size={24} />
            </div>
            <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider text-right">Payments</span>
          </div>
          <p className="stat-value">{formatCurrency(draftPaymentTotal)}</p>
          <p className="text-xs text-dark-400 mt-1">{draftPayments.length} draft payment(s) awaiting posting</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/5 pb-px">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setPage(1) }}
            className={`
              px-4 py-3 text-sm font-medium transition-all relative
              ${tab === t.id ? 'text-primary' : 'text-dark-400 hover:text-white'}
            `}
          >
            {t.label}
            {tab === t.id && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-gold"
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        <AnimatePresence mode="wait">
          {tab === 'accounts' && (
            <motion.div
              key="accounts"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
                  <input
                    type="text"
                    placeholder="Search accounts..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                    className="form-input pl-9"
                  />
                </div>
                <select
                  value={sort}
                  onChange={(e) => { setSort(e.target.value); setPage(1) }}
                  className="form-input w-auto min-w-[150px]"
                >
                  <option value="name">Name (A-Z)</option>
                  <option value="-name">Name (Z-A)</option>
                  <option value="account_number">Account # (A-Z)</option>
                  <option value="code">Code</option>
                </select>
                <button className="btn-ghost p-2 text-dark-400">
                  <Filter size={18} />
                </button>
              </div>

              <div className="card overflow-hidden">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Account Name</th>
                      <th>Bank / Branch</th>
                      <th>Account Number</th>
                      <th>Type</th>
                      <th className="text-right">Balance</th>
                      <th className="text-center">Status</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((account) => (
                      <tr key={account.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-primary">
                              <Landmark size={16} />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">{account.code || account.name}</p>
                              <p className="text-[10px] text-dark-500 uppercase tracking-wider">{account.gl_account_name}</p>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="text-sm text-dark-300">{account.bank_name}</div>
                          <div className="text-xs text-dark-500">{account.branch_code}</div>
                        </td>
                        <td className="text-sm font-mono text-dark-300">{account.account_number}</td>
                        <td>
                          <span className="badge-gray text-[10px] uppercase">
                            {account.account_type}
                          </span>
                        </td>
                        <td className="text-right">
                          <div className="text-sm font-semibold text-white">{formatCurrency(account.current_balance)}</div>
                          <div className="text-[10px] text-dark-500">{account.currency_code}</div>
                        </td>
                        <td className="text-center">
                          <span className={account.is_active ? 'badge-green' : 'badge-gray'}>
                            {account.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                         <td className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button 
                              onClick={() => openSidePanel('statement-upload-form', { account })}
                              className="p-2 text-dark-500 hover:text-amber-400 transition-colors"
                              title="Upload Statement"
                            >
                              <Upload size={16} />
                            </button>
                            <button 
                              onClick={() => openSidePanel('bank-transaction-view', { account })}
                              className="p-2 text-dark-500 hover:text-primary transition-colors"
                              title="View Transactions"
                            >
                              <ArrowRightLeft size={16} />
                            </button>
                            <button 
                              onClick={() => openSidePanel('bank-account-form', { account })}
                              className="p-2 text-dark-500 hover:text-white transition-colors"
                              title="Edit Account"
                            >
                              <MoreVertical size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {accounts.length === 0 && !isLoading && (
                      <tr>
                        <td colSpan={7} className="text-center py-20">
                          <Landmark size={40} className="mx-auto mb-3 text-dark-600" />
                          <p className="text-dark-400">No bank accounts found.</p>
                          <button 
                            onClick={() => openSidePanel('bank-account-form')}
                            className="btn-ghost mt-2 text-primary"
                          >
                            Add your first account
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <Pagination 
                currentPage={page}
                totalPages={accountsData?.data?.total_pages}
                totalCount={accountsData?.data?.count}
                onPageChange={setPage}
              />
            </motion.div>
          )}

          {tab === 'reconciliation' && (
            <motion.div
              key="reconciliation"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="mb-4 flex items-center gap-3">
                <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Account</label>
                <select className="form-input w-auto min-w-[260px]" aria-label="Account to reconcile"
                  value={reconAccount} onChange={(e) => setReconAccountId(e.target.value)}>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.code || acc.name} - {acc.bank_name} {acc.account_number}</option>
                  ))}
                </select>
              </div>
              <ReconciliationWorkspace accountId={reconAccount} />
            </motion.div>
          )}

          {tab === 'statements' && (
            <motion.div
              key="statements"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white uppercase tracking-tight">Recent Statements</h3>
                <button 
                  onClick={() => openSidePanel('statement-upload-form')}
                  className="btn-primary flex items-center gap-2"
                >
                  <Plus size={16} /> Upload Statement
                </button>
              </div>
              
              <div className="bg-dark-800/30 border border-white/5 rounded-2xl overflow-hidden">
                 <table className="w-full text-left">
                    <thead>
                      <tr className="bg-dark-900/50 text-[10px] uppercase font-bold text-dark-500 tracking-widest border-b border-white/5">
                        <th className="px-6 py-4">Account</th>
                        <th className="px-6 py-4">Period</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Transactions</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs">
                      {statements.map(stmt => (
                        <tr key={stmt.id} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-4 text-white font-medium">{stmt.bank_account_code || stmt.bank_account_name}<div className="text-[10px] text-dark-500 font-mono">{stmt.reference}</div></td>
                          <td className="px-6 py-4 text-dark-400">
                            {formatDate(stmt.statement_date)} · closing {formatCurrency(stmt.closing_balance)}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`badge ${stmt.status === 'reconciled' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'}`}>
                              {stmt.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right text-white">{stmt.lines?.filter(l => l.is_reconciled).length || 0}/{stmt.lines?.length || 0} reconciled</td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => { setReconAccountId(stmt.bank_account); setTab('reconciliation') }}
                              className="text-primary hover:text-white transition-colors"
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                      {statements.length === 0 && (
                        <tr>
                          <td colSpan="5" className="px-6 py-12 text-center text-dark-500">
                             No bank statements found. Upload your first statement to begin.
                          </td>
                        </tr>
                      )}
                    </tbody>
                 </table>
              </div>

              <Pagination 
                currentPage={page}
                totalPages={statementsRaw?.data?.total_pages}
                totalCount={statementsRaw?.data?.count}
                onPageChange={setPage}
              />
            </motion.div>
          )}

          {tab === 'payments' && (
            <motion.div
              key="payments"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white uppercase tracking-tight">Payment Batches</h3>
                <button 
                  onClick={() => openSidePanel('new-ap-payment')}
                  className="btn-primary flex items-center gap-2"
                >
                  <Plus size={16} /> New Payment
                </button>
              </div>

              <div className="bg-dark-800/30 border border-white/5 rounded-2xl overflow-hidden">
                 <table className="w-full text-left">
                    <thead>
                      <tr className="bg-dark-900/50 text-[10px] uppercase font-bold text-dark-500 tracking-widest border-b border-white/5">
                        <th className="px-6 py-4">Payment Ref</th>
                        <th className="px-6 py-4">Supplier</th>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs">
                      {payments.map(p => (
                        <tr key={p.id} className="hover:bg-white/5 transition-colors cursor-pointer" onClick={() => openSidePanel('supplier-payment-detail', { payment: p })}>
                          <td className="px-6 py-4 text-primary font-mono">{p.payment_reference}</td>
                          <td className="px-6 py-4 text-white font-medium">{p.supplier_name}</td>
                          <td className="px-6 py-4 text-dark-400">{formatDate(p.payment_date)}</td>
                          <td className="px-6 py-4">
                             <span className={`badge ${p.status === 'posted' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'}`}>
                               {p.status}
                             </span>
                          </td>
                          <td className="px-6 py-4 text-right text-white font-bold">{formatCurrency(p.amount, p.currency_code)}</td>
                        </tr>
                      ))}
                      {payments.length === 0 && (
                        <tr>
                          <td colSpan="5" className="px-6 py-12 text-center text-dark-500">
                             No payment records found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                 </table>
              </div>

              <Pagination 
                currentPage={page}
                totalPages={paymentsRaw?.data?.total_pages}
                totalCount={paymentsRaw?.data?.count}
                onPageChange={setPage}
              />
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}
