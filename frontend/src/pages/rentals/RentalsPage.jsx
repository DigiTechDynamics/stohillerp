// Stohill Properties - Property Management Module
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Plus, Home, Key, Wrench, Calendar, Filter,
  AlertTriangle, FileText, Building2, DollarSign,
  TrendingUp, MapPin, Users, Receipt, Edit2, Trash2,
  RefreshCw, Zap, CheckCircle, Eye, Download
} from 'lucide-react'
import toast from 'react-hot-toast'
import { rentalsAPI, propertiesAPI, crmAPI } from '@/services/api'
import { formatCurrency, formatDate, getStatusColor } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import { useConfirmStore } from '@/stores/useConfirmStore'
import DataManagementButtons from '@/components/common/DataManagementButtons'
import Pagination from '@/components/common/Pagination'
import { useQueryClient } from '@tanstack/react-query'
import PDFPreviewModal from '@/components/common/PDFPreviewModal'

const TABS = [
  { id: 'properties', label: 'Managed Properties', icon: Building2 },
  { id: 'tenants', label: 'Tenants', icon: Users },
  { id: 'leases', label: 'Leases', icon: Key },
  { id: 'invoices', label: 'Invoices', icon: Receipt },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench },
  { id: 'automation', label: 'Automation & Billing', icon: RefreshCw },
]

export default function RentalsPage() {
  const [activeTab, setActiveTab] = useState('properties')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('-created_at')
  const [page, setPage] = useState(1)
  const [automationLoading, setAutomationLoading] = useState(false)
  const openPanel = useUIStore((s) => s.openSidePanel)
  const queryClient = useQueryClient()
  const confirm = useConfirmStore((s) => s.confirm)

  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState(null)

  // ── Automation Actions ──────────────────────────────────────────
  const handleRunBilling = async () => {
    const ok = await confirm({
      title: 'Run Rent Billing',
      message: 'Generate monthly invoices for all eligible active leases? This will push all generated invoices to the Finance ledger.',
      confirmLabel: 'Run Billing',
      type: 'confirm'
    })
    if (!ok) return
    setAutomationLoading(true)
    try {
      const { data } = await rentalsAPI.invoices.runBilling()
      toast.success(`Processed ${data.processed} invoices. ${data.failed} failed.`)
      queryClient.invalidateQueries({ queryKey: ['rental-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['rental-stats'] })
    } catch (err) {
      toast.error('Billing failed to execute')
    } finally {
      setAutomationLoading(false)
    }
  }

  const handleRunLateFees = async () => {
    const ok = await confirm({
      title: 'Process Late Fees',
      message: 'Apply late payment penalties to all invoices past the 5-day grace period? Penalties will be synced to Finance AR immediately.',
      confirmLabel: 'Process Fees',
      type: 'danger'
    })
    if (!ok) return
    setAutomationLoading(true)
    try {
      const { data } = await rentalsAPI.invoices.runLateFees()
      toast.success(`Applied ${data.applied} penalties. Total: ${formatCurrency(data.total_penalties)}`)
      queryClient.invalidateQueries({ queryKey: ['rental-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['rental-stats'] })
    } catch (err) {
      toast.error('Late fee processing failed')
    } finally {
      setAutomationLoading(false)
    }
  }

  // ── PDF Actions ──────────────────────────────────────────────
  const handleDownloadPDF = async (e, invoice) => {
    e.stopPropagation()
    try {
      const response = await rentalsAPI.invoices.download(invoice.id)
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `Rental_Invoice_${invoice.invoice_number}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      toast.error('Download failed')
    }
  }

  const handlePreviewPDF = async (e, invoice) => {
    e.stopPropagation()
    try {
      setSelectedInvoice(invoice)
      setIsPreviewOpen(true)
      setPreviewUrl('')
      const response = await rentalsAPI.invoices.download(invoice.id)
      
      // Check if response is actually a JSON error wrapped in a blob
      if (response.data.type === 'application/json') {
        const text = await response.data.text()
        const error = JSON.parse(text)
        toast.error(error.error || 'Failed to load preview')
        setIsPreviewOpen(false)
        return
      }

      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
      setPreviewUrl(url)
    } catch (err) {
      toast.error('Preview failed to load')
      setIsPreviewOpen(false)
    }
  }

  // ── Data Queries ──────────────────────────────────────────────────
  const { data: statsRes } = useQuery({
    queryKey: ['rental-stats'],
    queryFn: () => rentalsAPI.leases.stats(),
  })
  const stats = statsRes?.data || {}

  const { data: propsRes, isLoading: propsLoading } = useQuery({
    queryKey: ['rental-properties', { search, ordering: sort, page }],
    queryFn: () => propertiesAPI.list({ search, status__in: 'available,occupied,listed_rent,maintenance', ordering: sort, page }),
    enabled: activeTab === 'properties',
  })
  const properties = propsRes?.data?.results || []

  const { data: leasesRes, isLoading: leasesLoading } = useQuery({
    queryKey: ['rental-leases', { search, ordering: sort, page }],
    queryFn: () => rentalsAPI.leases.list({ search, ordering: sort, page }),
    enabled: activeTab === 'leases',
  })
  const leases = leasesRes?.data?.results || []

  const { data: tenantsRes, isLoading: tenantsLoading } = useQuery({
    queryKey: ['rental-tenants', { search, ordering: sort, page }],
    queryFn: () => crmAPI.contacts.list({ search, contact_type: 'tenant', ordering: sort, page }),
    enabled: activeTab === 'tenants',
  })
  const tenants = tenantsRes?.data?.results || []

  const { data: invoicesRes, isLoading: invoicesLoading } = useQuery({
    queryKey: ['rental-invoices', { search, ordering: sort, page }],
    queryFn: () => rentalsAPI.invoices.list({ search, ordering: sort, page }),
    enabled: activeTab === 'invoices',
  })
  const invoices = invoicesRes?.data?.results || []

  const { data: maintRes, isLoading: maintLoading } = useQuery({
    queryKey: ['rental-maintenance', { search, ordering: sort, page }],
    queryFn: () => rentalsAPI.maintenance.list({ search, ordering: sort, page }),
    enabled: activeTab === 'maintenance',
  })
  const maintenance = maintRes?.data?.results || []

  const isLoading = activeTab === 'properties' ? propsLoading
    : activeTab === 'tenants' ? tenantsLoading
    : activeTab === 'leases' ? leasesLoading
    : activeTab === 'invoices' ? invoicesLoading
    : activeTab === 'automation' ? false
    : maintLoading

  // ── KPI Cards ─────────────────────────────────────────────────────
  const kpis = [
    {
      label: 'Active Leases',
      value: stats.active_leases ?? '—',
      icon: Key,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: 'Monthly Rental Income',
      value: stats.monthly_income ? formatCurrency(parseFloat(stats.monthly_income)) : '—',
      icon: DollarSign,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'Overdue Rent',
      value: stats.overdue_amount ? formatCurrency(parseFloat(stats.overdue_amount)) : '$0',
      sub: stats.overdue_count ? `${stats.overdue_count} invoices` : null,
      icon: AlertTriangle,
      color: stats.overdue_count > 0 ? 'text-red-400' : 'text-dark-500',
      bg: stats.overdue_count > 0 ? 'bg-red-500/10' : 'bg-white/5',
    },
    {
      label: 'Vacancy Rate',
      value: stats.vacancy_rate != null ? `${stats.vacancy_rate}%` : '—',
      sub: stats.total_rental_properties ? `${stats.occupied_count}/${stats.total_rental_properties} occupied` : null,
      icon: Building2,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
    },
  ]

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-white">Property Management</h1>
          <p className="text-dark-400 text-sm mt-1">Manage properties, leases, invoicing and maintenance</p>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === 'properties' && (
            <DataManagementButtons 
              module="properties" 
              onImportSuccess={() => queryClient.invalidateQueries({ queryKey: ['rental-properties'] })} 
              onExportSuccess={() => {}}
            />
          )}
          {activeTab === 'tenants' && (
            <DataManagementButtons 
              module="crm" 
              onImportSuccess={() => queryClient.invalidateQueries({ queryKey: ['rental-tenants'] })} 
              onExportSuccess={() => {}}
            />
          )}
          {activeTab === 'leases' && (
            <DataManagementButtons 
              module="leases" 
              onImportSuccess={() => queryClient.invalidateQueries({ queryKey: ['rental-leases'] })} 
              onExportSuccess={() => {}}
            />
          )}

          {activeTab === 'tenants' && (
            <button className="btn-primary flex items-center gap-2" onClick={() => openPanel('tenant-form')}>
              <Plus size={16} /> New Tenant
            </button>
          )}
          {activeTab === 'leases' && (
            <button className="btn-primary flex items-center gap-2" onClick={() => openPanel('lease-form')}>
              <Plus size={16} /> New Lease
            </button>
          )}
          {activeTab === 'invoices' && (
            <button className="btn-primary flex items-center gap-2" onClick={() => openPanel('rental-invoice-form')}>
              <Plus size={16} /> New Invoice
            </button>
          )}
          {activeTab === 'maintenance' && (
            <button className="btn-primary flex items-center gap-2" onClick={() => openPanel('maintenance-form')}>
              <Plus size={16} /> Log Ticket
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="card p-4"
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center ${kpi.color}`}>
                <kpi.icon size={20} />
              </div>
              <div>
                <p className="text-lg font-semibold text-white">{kpi.value}</p>
                <p className="text-[10px] text-dark-500 uppercase tracking-wider">{kpi.label}</p>
                {kpi.sub && <p className="text-[10px] text-dark-500">{kpi.sub}</p>}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/5 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSearch(''); setPage(1) }}
            className={`flex items-center gap-2 pb-3 px-4 border-b-2 transition-colors text-xs font-bold uppercase tracking-wider whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-dark-500 hover:text-dark-300'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search and Sort (Hidden in Automation) */}
      {activeTab !== 'automation' && (
        <div className="flex items-center gap-3 w-full max-w-2xl">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
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
            <option value="-created_at">Newest First</option>
            {activeTab === 'properties' && (
              <>
                <option value="name">Property Name (A-Z)</option>
                <option value="-name">Property Name (Z-A)</option>
                <option value="reference_number">Reference (A-Z)</option>
              </>
            )}
            {activeTab === 'tenants' && (
              <>
                <option value="first_name">Name (A-Z)</option>
                <option value="-first_name">Name (Z-A)</option>
              </>
            )}
            {activeTab === 'leases' && (
              <>
                <option value="lease_number">Lease # (A-Z)</option>
              </>
            )}
            {activeTab === 'invoices' && (
              <>
                <option value="invoice_number">Invoice # (A-Z)</option>
                <option value="-total_amount">Highest Amount</option>
              </>
            )}
            {activeTab === 'maintenance' && (
              <>
                <option value="title">Title (A-Z)</option>
              </>
            )}
          </select>
        </div>
      )}

      {/* ── Properties Tab ────────────────────────────────────────────── */}
      {activeTab === 'properties' && (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Property Name</th>
                <th>Type</th>
                <th>Location</th>
                <th>Status</th>
                <th className="text-right">Monthly Rate</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {properties.map((prop) => (
                  <motion.tr
                    key={prop.id}
                    layout={false}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-white/2 transition-colors cursor-pointer"
                    onClick={() => openPanel('property-detail', { property: prop })}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-primary">{prop.reference_number}</td>
                    <td className="px-4 py-3 text-sm text-white font-medium">{prop.name}</td>
                    <td className="px-4 py-3 text-xs text-dark-400 uppercase">{prop.property_type_name || prop.property_type}</td>
                    <td className="px-4 py-3 text-xs text-dark-400">
                      <span className="flex items-center gap-1">
                        <MapPin size={10} /> {prop.suburb}, {prop.city}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge text-[10px] uppercase font-bold ${getStatusColor(prop.status)}`}>
                        {prop.status?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-white font-semibold text-right">
                      {prop.rental_rate ? formatCurrency(parseFloat(prop.rental_rate), prop.currency_code) : '—'}
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {properties.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <Building2 size={40} className="mx-auto mb-3 text-dark-600" />
                    <p className="text-dark-400">No properties found.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tenants Tab ────────────────────────────────────────────────── */}
      {activeTab === 'tenants' && (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Entity / Company</th>
                <th>Email</th>
                <th>Mobile</th>
                <th>Status</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {tenants.map((tenant) => (
                  <motion.tr
                    key={tenant.id}
                    layout={false}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-white/2 transition-colors cursor-pointer"
                    onClick={() => openPanel('contact-detail', { contact: tenant })}
                  >
                    <td className="px-4 py-3 text-sm text-white font-medium">{tenant.first_name} {tenant.last_name}</td>
                    <td className="px-4 py-3 text-sm text-dark-300">{tenant.company || '—'}</td>
                    <td className="px-4 py-3 text-sm text-dark-300">{tenant.email || '—'}</td>
                    <td className="px-4 py-3 text-sm text-dark-300">{tenant.phone_mobile || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`badge text-[10px] uppercase font-bold ${getStatusColor(tenant.status)}`}>
                        {tenant.status?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2 text-dark-400">
                        <button 
                          className="p-1 hover:text-primary transition-colors"
                          onClick={(e) => { e.stopPropagation(); openPanel('contact-form', { contact: tenant }) }}
                          title="Edit Tenant"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          className="p-1 hover:text-red-400 transition-colors"
                          onClick={(e) => { e.stopPropagation(); handleDeleteTenant(tenant.id) }}
                          title="Delete Tenant"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {tenants.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={5} className="text-center py-16">
                    <Users size={40} className="mx-auto mb-3 text-dark-600" />
                    <p className="text-dark-400">No tenants found.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Leases Tab ────────────────────────────────────────────────── */}
      {activeTab === 'leases' && (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Lease #</th>
                <th>Property</th>
                <th>Tenant</th>
                <th>Term</th>
                <th>Status</th>
                <th className="text-right">Monthly Rent</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {leases.map((lease) => {
                  const isDue = lease.status === 'active' && new Date(lease.next_invoice_date) <= new Date()
                  return (
                    <motion.tr
                      key={lease.id}
                      layout={false}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-white/2 transition-colors cursor-pointer"
                      onClick={() => openPanel('lease-detail', { lease })}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-primary">{lease.lease_number}</td>
                      <td className="px-4 py-3 text-sm text-white font-medium">
                        <div className="flex flex-col">
                          <span>{lease.property_name}</span>
                          {isDue && (
                            <span className="text-[9px] text-amber-500 font-bold uppercase tracking-tighter flex items-center gap-1">
                              <Calendar size={10} /> Due for Billing
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-dark-300">{lease.tenant_name}</td>
                      <td className="px-4 py-3 text-xs text-dark-400">
                        {formatDate(lease.start_date)} — {formatDate(lease.end_date)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge text-[10px] uppercase font-bold ${getStatusColor(lease.status)}`}>
                          {lease.status?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-white font-semibold text-right">
                        {formatCurrency(parseFloat(lease.monthly_rental), lease.currency_code)}
                      </td>
                    </motion.tr>
                  )
                })}
              </AnimatePresence>
              {leases.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <Key size={40} className="mx-auto mb-3 text-dark-600" />
                    <p className="text-dark-400">No leases found. Create your first lease.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Invoices Tab ──────────────────────────────────────────────── */}
      {activeTab === 'invoices' && (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Property</th>
                <th>Tenant</th>
                <th>Period</th>
                <th>Status</th>
                <th className="text-right">Total</th>
                <th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {invoices.map((inv) => (
                  <motion.tr
                    key={inv.id}
                    layout={false}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-white/2 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-primary">{inv.invoice_number}</td>
                    <td className="px-4 py-3 text-sm text-white font-medium">{inv.property_name}</td>
                    <td className="px-4 py-3 text-sm text-dark-300">{inv.tenant_name}</td>
                    <td className="px-4 py-3 text-xs text-dark-400">
                      {formatDate(inv.period_start)} — {formatDate(inv.period_end)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge text-[10px] uppercase font-bold ${getStatusColor(inv.status)}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-white font-semibold text-right">
                      {formatCurrency(parseFloat(inv.total_amount), inv.currency_code)}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-right">
                      <span className={parseFloat(inv.balance_due) > 0 ? 'text-red-400' : 'text-emerald-400'}>
                        {formatCurrency(parseFloat(inv.balance_due), inv.currency_code)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={(e) => handlePreviewPDF(e, inv)}
                          className="p-1.5 rounded-lg bg-white/5 text-dark-400 hover:text-white transition-all"
                          title="Preview PDF"
                        >
                          <Eye size={14} />
                        </button>
                        <button 
                          onClick={(e) => handleDownloadPDF(e, inv)}
                          className="p-1.5 rounded-lg bg-white/5 text-dark-400 hover:text-white transition-all"
                          title="Download PDF"
                        >
                          <Download size={14} />
                        </button>
                        {parseFloat(inv.balance_due) > 0 && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); openPanel('rental-payment-form', { invoice: inv }) }}
                            className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all"
                            title="Record Payment"
                          >
                            <DollarSign size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {invoices.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <Receipt size={40} className="mx-auto mb-3 text-dark-600" />
                    <p className="text-dark-400">No invoices found.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Maintenance Tab ───────────────────────────────────────────── */}
      {activeTab === 'maintenance' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {maintenance.map((ticket) => (
              <motion.div 
                key={ticket.id} 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="card p-5 group hover:border-primary/20 transition-all cursor-pointer flex flex-col justify-between"
                onClick={() => openPanel('maintenance-detail', { ticket })}
              >
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-colors ${
                      ticket.priority === 'emergency' ? 'bg-red-500/10 text-red-400 border-red-500/20'
                      : ticket.priority === 'high' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      : 'bg-primary/10 text-primary border-primary/20 group-hover:bg-primary/20'
                    }`}>
                      <Wrench size={20} />
                    </div>
                    <div className="text-right">
                      <span className={`badge text-[10px] uppercase font-bold ${getStatusColor(ticket.status)}`}>
                        {ticket.status?.replace(/_/g, ' ')}
                      </span>
                      <p className="text-[10px] text-dark-500 mt-1 uppercase tracking-tighter">{ticket.reference}</p>
                    </div>
                  </div>

                  <h3 className="text-sm font-semibold text-white mb-1 group-hover:text-primary transition-colors">{ticket.category}</h3>
                  <p className="text-xs text-dark-400 line-clamp-2 mb-4 h-8 leading-relaxed italic">
                    "{ticket.description}"
                  </p>

                  <div className="space-y-2 mb-4 text-[10px]">
                    <div className="flex items-center gap-2 text-dark-300">
                      <Building2 size={12} className="text-primary" />
                      <span className="font-medium truncate">{ticket.property_name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-dark-400">
                      <User size={12} />
                      <span className="truncate">{ticket.tenant_name || 'Guest / Website'}</span>
                      {!ticket.tenant_name && (
                        <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ring-1 ring-blue-500/10 ml-1">
                          Website
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      ticket.priority === 'emergency' ? 'bg-red-400 animate-pulse'
                      : ticket.priority === 'high' ? 'bg-amber-400'
                      : 'bg-emerald-400'
                    }`} />
                    <p className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">{ticket.priority}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-white">
                      {ticket.actual_cost ? formatCurrency(parseFloat(ticket.actual_cost)) 
                        : ticket.estimated_cost ? formatCurrency(parseFloat(ticket.estimated_cost)) 
                        : '—'}
                    </p>
                    <p className="text-[9px] text-dark-500 uppercase tracking-tighter">
                      {ticket.actual_cost ? 'Actual Cost' : 'Est. Cost'}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {maintenance.length === 0 && !isLoading && (
            <div className="text-center py-24 card bg-white/2 border-dashed border-white/5">
              <div className="w-16 h-16 rounded-full bg-dark-800 flex items-center justify-center mx-auto mb-4 text-dark-600">
                <Wrench size={32} />
              </div>
              <h3 className="text-white font-medium text-lg">No tickets logged</h3>
              <p className="text-dark-500 text-sm max-w-xs mx-auto">All properties are currently healthy. New maintenance requests will appear here once logged through the portal or website.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Automation Tab ───────────────────────────────────────────── */}
      {activeTab === 'automation' && (
        <div className="space-y-6 max-w-5xl mx-auto py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Billing Engine */}
            <div className="card p-6 space-y-6 border-emerald-500/10 hover:border-emerald-500/20 transition-all">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <Receipt size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">Rent Billing Engine</h3>
                  <p className="text-xs text-dark-400 mt-1">Generate bulk monthly rental invoices for all active leases.</p>
                </div>
              </div>
              
              <div className="bg-dark-800/50 rounded-xl p-4 border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-dark-500 uppercase font-bold tracking-widest">Leases with Pending Billing</span>
                  <span className="text-lg font-bold text-emerald-400">{stats.leases_pending_billing ?? '0'}</span>
                </div>
                <div className="w-full bg-dark-700 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-emerald-500 h-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, (stats.leases_pending_billing / (stats.active_leases || 1)) * 100)}%` }} 
                  />
                </div>
              </div>

              <button 
                onClick={handleRunBilling}
                disabled={automationLoading}
                className="w-full btn-primary py-4 text-lg font-semibold flex items-center justify-center gap-3 shadow-emerald"
              >
                {automationLoading ? <RefreshCw className="animate-spin" size={24} /> : <Zap size={24} />}
                Run Monthly Billing
              </button>
            </div>

            {/* Late Fee Engine */}
            <div className="card p-6 space-y-6 border-amber-500/10 hover:border-amber-500/20 transition-all">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400">
                  <AlertTriangle size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">Late Fee Automator</h3>
                  <p className="text-xs text-dark-400 mt-1">Apply penalties to accounts past the contract grace period.</p>
                </div>
              </div>

              <div className="bg-dark-800/50 rounded-xl p-4 border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-dark-500 uppercase font-bold tracking-widest">Invoices Eligible for Penalty</span>
                  <span className="text-lg font-bold text-amber-400">{stats.overdue_count ?? '0'}</span>
                </div>
                <p className="text-[10px] text-dark-500">
                  Targeting invoices more than 5 days past due. Penalties will be synced to Finance AR immediately.
                </p>
              </div>

              <button 
                onClick={handleRunLateFees}
                disabled={automationLoading}
                className="w-full btn-secondary py-4 text-lg font-semibold flex items-center justify-center gap-3 border-amber-500/20 text-amber-400 hover:bg-amber-500/5"
              >
                {automationLoading ? <RefreshCw className="animate-spin" size={24} /> : <TrendingUp size={24} />}
                Process Late Fees
              </button>
            </div>
          </div>

          {/* Guidelines / Logs */}
          <div className="card p-6 bg-dark-800/30 border-white/5">
            <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest mb-4 inline-block border-b border-primary/20 pb-1">
              Automation Guidelines
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs leading-relaxed">
              <div className="space-y-2">
                <p className="text-white font-medium flex items-center gap-2 italic">
                  <CheckCircle size={14} className="text-emerald-400" /> Duplicate Protection
                </p>
                <p className="text-dark-500">The billing engine verifies previous periods to prevent double-invoicing for the same month.</p>
              </div>
              <div className="space-y-2">
                <p className="text-white font-medium flex items-center gap-2 italic">
                  <CheckCircle size={14} className="text-emerald-400" /> Real-time Sync
                </p>
                <p className="text-dark-500">All generated invoices and applied fees are pushed to the Finance/AR ledger instantly with unique references.</p>
              </div>
              <div className="space-y-2">
                <p className="text-white font-medium flex items-center gap-2 italic">
                  <CheckCircle size={14} className="text-emerald-400" /> Audit Trail
                </p>
                <p className="text-dark-500">Every bulk action is recorded in the system audit logs, including the count and total value processed.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab !== 'stats' && activeTab !== 'automation' && (
        <Pagination 
          currentPage={page}
          totalPages={
            activeTab === 'properties' ? propsRes?.data?.total_pages :
            activeTab === 'tenants' ? tenantsRes?.data?.total_pages :
            activeTab === 'leases' ? leasesRes?.data?.total_pages :
            activeTab === 'invoices' ? invoicesRes?.data?.total_pages :
            maintRes?.data?.total_pages
          }
          totalCount={
            activeTab === 'properties' ? propsRes?.data?.count :
            activeTab === 'tenants' ? tenantsRes?.data?.count :
            activeTab === 'leases' ? leasesRes?.data?.count :
            activeTab === 'invoices' ? invoicesRes?.data?.count :
            maintRes?.data?.count
          }
          onPageChange={setPage}
        />
      )}

      <PDFPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false)
          if (previewUrl) {
            window.URL.revokeObjectURL(previewUrl)
            setPreviewUrl('')
          }
        }}
        pdfUrl={previewUrl}
        title={`Rental Invoice: ${selectedInvoice?.invoice_number}`}
        filename={`Rental_Invoice_${selectedInvoice?.invoice_number}.pdf`}
      />
    </div>
  )
}
