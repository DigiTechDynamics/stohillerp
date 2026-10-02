import { useState } from 'react'
import { Plus, Search, ShoppingCart, Wallet, CreditCard, Settings2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { financeAPI } from '@/services/api'
import { formatCurrency } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import { useNavigate } from 'react-router-dom'
import DataManagementButtons from '@/components/common/DataManagementButtons'
import Pagination from '@/components/common/Pagination'
import RecordActions from '@/components/common/RecordActions'
import { useQueryClient } from '@tanstack/react-query'

export default function AccountsPayablePage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('suppliers')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('-created_at')
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()
  const openPanel = useUIStore((s) => s.openSidePanel)

  const { data: invoicesData, isLoading: loadingInvoices } = useQuery({
    queryKey: ['ap-invoices', { search, ordering: sort, page }],
    queryFn: () => financeAPI.ap.invoices.list({ search, ordering: sort, page }),
    enabled: activeTab === 'invoices'
  })

  const { data: suppliersData, isLoading: loadingSuppliers } = useQuery({
    queryKey: ['ap-suppliers', { search, ordering: sort, page }],
    queryFn: () => financeAPI.ap.suppliers.list({ search, ordering: sort, page }),
    enabled: activeTab === 'suppliers'
  })

  const { data: paymentsData, isLoading: loadingPayments } = useQuery({
    queryKey: ['ap-payments', { search, ordering: sort, page }],
    queryFn: () => financeAPI.ap.payments.list({ search, ordering: sort, page }),
    enabled: activeTab === 'payments'
  })

  const { data: agingData } = useQuery({
    queryKey: ['ap-aging-total'],
    queryFn: () => financeAPI.reports.apAging(),
  })
  const totals = agingData?.data?.totals

  const invoices = invoicesData?.data?.results || invoicesData?.data || []
  const suppliers = suppliersData?.data?.results || suppliersData?.data || []
  const payments = paymentsData?.data?.results || paymentsData?.data || []

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-white">Accounts Payable</h1>
          <p className="text-dark-400 text-sm mt-1">Manage suppliers, purchase invoices, and outgoing payments</p>
        </div>
        <button 
          className="btn-primary flex items-center gap-2" 
          onClick={() => {
            const panel = activeTab === 'suppliers' ? 'new-supplier' : 
                          activeTab === 'invoices' ? 'new-ap-invoice' : 
                          'new-ap-payment';
            openPanel(panel);
          }}
        >
          <Plus size={16} /> New {activeTab === 'suppliers' ? 'Supplier' : activeTab === 'invoices' ? 'Invoice' : 'Payment'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-5 bg-gradient-to-br from-amber-500/10 to-transparent">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-500">
              <CreditCard size={24} />
            </div>
            <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">Total AP</span>
          </div>
          <p className="text-2xl font-semibold text-white">{formatCurrency(totals?.total || 0)}</p>
          <p className="text-xs text-dark-400 mt-1">
            Outstanding supplier obligations{totals && parseFloat(totals.current) > 0 ? ` · ${formatCurrency(totals.current)} not yet due` : ''}
          </p>
        </div>
      </div>

      <div className="flex border-b border-white/10 gap-6">
        {['suppliers', 'invoices', 'payments'].map(tab => (
          <button
            key={tab}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab 
                ? 'border-primary text-primary' 
                : 'border-transparent text-dark-400 hover:text-white'
            }`}
            onClick={() => { setActiveTab(tab); setPage(1) }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="form-input pl-9 w-64 h-9 text-xs"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1) }}
            className="form-input h-9 text-xs w-auto min-w-[140px]"
          >
            <option value="-created_at">Newest First</option>
            {activeTab === 'suppliers' && (
              <>
                <option value="name">Name (A-Z)</option>
                <option value="-name">Name (Z-A)</option>
              </>
            )}
            {activeTab === 'invoices' && (
              <>
                <option value="invoice_number">Invoice # (A-Z)</option>
                <option value="reference">Reference (A-Z)</option>
              </>
            )}
            {activeTab === 'payments' && (
              <>
                <option value="payment_reference">Payment Ref (A-Z)</option>
              </>
            )}
          </select>
          {activeTab === 'suppliers' && (
            <button 
              onClick={() => navigate('/finance/tax')}
              className="btn-secondary flex items-center gap-2 h-9 text-[10px] font-bold uppercase"
            >
              <Settings2 size={14} /> Tax Config
            </button>
          )}
          {activeTab === 'suppliers' && (
            <DataManagementButtons 
              module="suppliers" 
              onImportSuccess={() => queryClient.invalidateQueries({ queryKey: ['ap-suppliers'] })} 
            />
          )}
        </div>
      </div>

      {activeTab === 'invoices' && (
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Supplier</th>
                  <th>Date</th>
                  <th>Due Date</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Balance Due</th>
                  <th className="w-24">Status</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-white/2 cursor-pointer transition-colors"
                      onClick={() => openPanel('ap-invoice-detail', { invoice: inv })}>
                    <td className="px-4 py-3 font-mono text-xs text-primary">{inv.invoice_number}</td>
                    <td className="px-4 py-3 text-sm text-white font-medium">{inv.supplier_name}</td>
                    <td className="px-4 py-3 text-xs text-dark-300">{inv.invoice_date}</td>
                    <td className="px-4 py-3 text-xs text-dark-300">{inv.due_date}</td>
                    <td className="px-4 py-3 text-sm text-white font-semibold text-right">
                      {formatCurrency(inv.total_amount, inv.currency_code)}
                    </td>
                    <td className="px-4 py-3 text-sm text-white font-semibold text-right">
                      {formatCurrency(inv.balance_due, inv.currency_code)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge-${inv.status === 'posted' ? 'primary' : inv.status === 'paid' ? 'success' : 'secondary'} text-[10px] uppercase`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RecordActions record={inv} label="invoice" onEdit={() => openPanel('new-ap-invoice', { invoice: inv })}
                        deleteFn={financeAPI.ap.invoices.delete} invalidate={['ap-invoices', 'ap-aging-total']} />
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && !loadingInvoices && (
                  <tr>
                    <td colSpan={8} className="text-center py-16 text-dark-400">
                      <div className="flex flex-col items-center">
                        <ShoppingCart size={48} className="text-dark-600 mb-4" />
                        <p>No purchase invoices found. Record a bill to get started.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'suppliers' && (
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Supplier Name</th>
                  <th>AP Account</th>
                  <th>Terms</th>
                  <th className="text-right">Balance Owed</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-white/2 cursor-pointer transition-colors group"
                      onClick={() => openPanel('supplier-detail', { supplier: s })}>
                    <td className="px-4 py-3 text-sm text-white font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-xs text-dark-300">{s.ap_account_code ? `${s.ap_account_code} ${s.ap_account_name}` : '—'}</td>
                    <td className="px-4 py-3 text-xs text-dark-300">{s.payment_terms_days} Days</td>
                    <td className="px-4 py-3 text-sm text-white font-semibold text-right">{formatCurrency(s.balance || 0, s.currency_code)}</td>
                    <td className="px-4 py-3 text-right">
                      <RecordActions record={s} label="supplier" onEdit={() => openPanel('new-supplier', { supplier: s })}
                        deleteFn={financeAPI.ap.suppliers.delete} invalidate={['ap-suppliers']} />
                    </td>
                  </tr>
                ))}
                {suppliers.length === 0 && !loadingSuppliers && (
                  <tr>
                    <td colSpan={5} className="text-center py-16 text-dark-400">
                      <div className="flex flex-col items-center">
                        <ShoppingCart size={48} className="text-dark-600 mb-4" />
                        <p>No suppliers found. Create a new supplier record.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Payment Ref</th>
                  <th>Supplier</th>
                  <th>Date</th>
                  <th>Bank Account</th>
                  <th className="text-right">Amount</th>
                  <th className="w-24">Status</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-white/2 cursor-pointer transition-colors"
                      onClick={() => openPanel('supplier-payment-detail', { payment: p })}>
                    <td className="px-4 py-3 font-mono text-xs text-primary">{p.payment_reference}</td>
                    <td className="px-4 py-3 text-sm text-white font-medium">{p.supplier_name}</td>
                    <td className="px-4 py-3 text-xs text-dark-300">{p.payment_date}</td>
                    <td className="px-4 py-3 text-xs text-dark-300">{p.bank_account_name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-red-400 font-semibold text-right">-{formatCurrency(p.amount, p.currency_code)}</td>
                    <td className="px-4 py-3">
                      <span className={`badge-${p.status === 'posted' ? 'primary' : 'secondary'} text-[10px] uppercase`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RecordActions record={p} label="payment" deleteFn={financeAPI.ap.payments.delete}
                        invalidate={['ap-payments', 'ap-aging-total']} />
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && !loadingPayments && (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-dark-400">
                      <div className="flex flex-col items-center">
                        <Wallet size={48} className="text-dark-600 mb-4" />
                        <p>No payments found. Record a payment to see history.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination 
        currentPage={page}
        totalPages={
          activeTab === 'suppliers' ? suppliersData?.data?.total_pages :
          activeTab === 'invoices' ? invoicesData?.data?.total_pages :
          paymentsData?.data?.total_pages
        }
        totalCount={
          activeTab === 'suppliers' ? suppliersData?.data?.count :
          activeTab === 'invoices' ? invoicesData?.data?.count :
          paymentsData?.data?.count
        }
        onPageChange={setPage}
      />
    </div>
  )
}
