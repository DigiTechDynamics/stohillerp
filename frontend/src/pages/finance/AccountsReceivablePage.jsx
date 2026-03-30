import { useState } from 'react'
import { Plus, Search, FileText, Download, TrendingUp, DollarSign } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { financeAPI } from '@/services/api'
import { formatCurrency } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import DataManagementButtons from '@/components/common/DataManagementButtons'
import Pagination from '@/components/common/Pagination'
import { useQueryClient } from '@tanstack/react-query'

export default function AccountsReceivablePage() {
  const [activeTab, setActiveTab] = useState('customers')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('-created_at')
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()
  const openPanel = useUIStore((s) => s.openSidePanel)

  const { data: invoicesData, isLoading: loadingInvoices } = useQuery({
    queryKey: ['ar-invoices', { search, ordering: sort, page }],
    queryFn: () => financeAPI.ar.invoices.list({ search, ordering: sort, page }),
    enabled: activeTab === 'invoices'
  })

  const { data: customersData, isLoading: loadingCustomers } = useQuery({
    queryKey: ['ar-customers', { search, ordering: sort, page }],
    queryFn: () => financeAPI.ar.customers.list({ search, ordering: sort, page }),
    enabled: activeTab === 'customers'
  })

  const { data: receiptsData, isLoading: loadingReceipts } = useQuery({
    queryKey: ['ar-receipts', { search, ordering: sort, page }],
    queryFn: () => financeAPI.ar.receipts.list({ search, ordering: sort, page }),
    enabled: activeTab === 'receipts'
  })

  const invoices = invoicesData?.data?.results || invoicesData?.data || []
  const customers = customersData?.data?.results || customersData?.data || []
  const receipts = receiptsData?.data?.results || receiptsData?.data || []

  // Mock PDF Downloader
  const handleDownloadPDF = (e, invoiceId) => {
    e.stopPropagation()
    // In a real app, this would fetch a blob from the server
    const link = document.createElement('a')
    link.href = `data:text/plain;charset=utf-8,Mock PDF Content for Invoice ${invoiceId}`
    link.download = `Invoice_${invoiceId}.pdf`
    link.click()
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-white">Accounts Receivable</h1>
          <p className="text-dark-400 text-sm mt-1">Manage customers, sales invoices, and incoming receipts</p>
        </div>
        <button 
          className="btn-primary flex items-center gap-2" 
          onClick={() => {
            const panel = activeTab === 'customers' ? 'new-customer' : 
                          activeTab === 'invoices' ? 'new-ar-invoice' : 
                          'new-ar-receipt';
            openPanel(panel);
          }}
        >
          <Plus size={16} /> New {activeTab === 'customers' ? 'Customer' : activeTab === 'invoices' ? 'Invoice' : 'Receipt'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-5 bg-gradient-to-br from-primary/10 to-transparent">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
              <TrendingUp size={24} />
            </div>
            <span className="text-[10px] text-primary font-bold uppercase tracking-wider">Total AR</span>
          </div>
          <p className="text-2xl font-semibold text-white">{formatCurrency(1245000, 'USD')}</p>
          <p className="text-xs text-dark-400 mt-1">Outstanding customer balances</p>
        </div>
      </div>

      <div className="flex border-b border-white/10 gap-6">
        {['customers', 'invoices', 'receipts'].map(tab => (
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
        <div className="flex items-center gap-3 w-full max-w-2xl">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="form-input pl-9 w-full h-9 text-xs"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1) }}
            className="form-input h-9 text-xs w-auto min-w-[140px]"
          >
            <option value="-created_at">Newest First</option>
            {activeTab === 'customers' && (
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
            {activeTab === 'receipts' && (
              <>
                <option value="receipt_reference">Receipt Ref (A-Z)</option>
              </>
            )}
          </select>
        </div>
        {activeTab === 'customers' && (
          <DataManagementButtons 
            module="customers" 
            onImportSuccess={() => queryClient.invalidateQueries({ queryKey: ['ar-customers'] })} 
          />
        )}
      </div>

      {activeTab === 'invoices' && (
        <div className="space-y-4">

          <div className="card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Due Date</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Balance Due</th>
                  <th className="w-24">Status</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-white/2 cursor-pointer transition-colors"
                      onClick={() => openPanel('ar-invoice-detail', { invoice: inv })}>
                    <td className="px-4 py-3 font-mono text-xs text-primary">{inv.invoice_number}</td>
                    <td className="px-4 py-3 text-sm text-white font-medium">{inv.customer_name}</td>
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
                      <div className="flex items-center justify-end gap-1">
                        <button 
                          className="btn-ghost p-1.5 text-dark-400 hover:text-white"
                          onClick={(e) => { e.stopPropagation(); financeAPI.ar.invoices.email(inv.id).then(() => alert(`Emailed ${inv.invoice_number} successfully!`)).catch(err => alert('Failed to email invoice.')); }}
                          title="Email Invoice to Customer"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                        </button>
                        <button 
                          className="btn-ghost p-1.5 text-dark-400 hover:text-white"
                          onClick={(e) => handleDownloadPDF(e, inv.invoice_number)}
                          title="Download PDF"
                        >
                          <Download size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && !loadingInvoices && (
                  <tr>
                    <td colSpan={8} className="text-center py-16 text-dark-400">
                      <div className="flex flex-col items-center">
                        <FileText size={48} className="text-dark-600 mb-4" />
                        <p>No invoices found. Create a new invoice to get started.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'customers' && (
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer Name</th>
                  <th>AR Account</th>
                  <th className="text-right">Credit Limit</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} 
                      className="hover:bg-white/2 cursor-pointer transition-colors"
                      onClick={() => openPanel('new-customer', { customer: c })}
                  >
                    <td className="px-4 py-3 text-sm text-white font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-xs text-dark-300">{c.ar_account_code} - {c.ar_account_name}</td>
                    <td className="px-4 py-3 text-sm text-dark-300 text-right">{formatCurrency(c.credit_limit, c.currency_code)}</td>
                    <td className="px-4 py-3 text-sm text-white font-semibold text-right">{formatCurrency(c.balance || 0, c.currency_code)}</td>
                  </tr>
                ))}
                {customers.length === 0 && !loadingCustomers && (
                  <tr>
                    <td colSpan={4} className="text-center py-16 text-dark-400">
                      <div className="flex flex-col items-center">
                        <FileText size={48} className="text-dark-600 mb-4" />
                        <p>No customers found. Sync tenants or create a new AR customer.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'receipts' && (
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Receipt Ref</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Bank Account</th>
                  <th className="text-right">Amount</th>
                  <th className="w-24">Status</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r) => (
                  <tr key={r.id} className="hover:bg-white/2 cursor-pointer transition-colors"
                      onClick={() => openPanel('customer-receipt-detail', { receipt: r })}>
                    <td className="px-4 py-3 font-mono text-xs text-primary">{r.receipt_reference}</td>
                    <td className="px-4 py-3 text-sm text-white font-medium">{r.customer_name}</td>
                    <td className="px-4 py-3 text-xs text-dark-300">{r.receipt_date}</td>
                    <td className="px-4 py-3 text-xs text-dark-300">{r.bank_account_name}</td>
                    <td className="px-4 py-3 text-sm text-success font-semibold text-right">+{formatCurrency(r.amount, r.currency_code)}</td>
                    <td className="px-4 py-3">
                      <span className={`badge-${r.status === 'posted' ? 'primary' : 'secondary'} text-[10px] uppercase`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {receipts.length === 0 && !loadingReceipts && (
                  <tr>
                    <td colSpan={6} className="text-center py-16 text-dark-400">
                      <div className="flex flex-col items-center">
                        <FileText size={48} className="text-dark-600 mb-4" />
                        <p>No receipts found. Log a payment to see receipt entries.</p>
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
          activeTab === 'customers' ? customersData?.data?.total_pages :
          activeTab === 'invoices' ? invoicesData?.data?.total_pages :
          receiptsData?.data?.total_pages
        }
        totalCount={
          activeTab === 'customers' ? customersData?.data?.count :
          activeTab === 'invoices' ? invoicesData?.data?.count :
          receiptsData?.data?.count
        }
        onPageChange={setPage}
      />
    </div>
  )
}
