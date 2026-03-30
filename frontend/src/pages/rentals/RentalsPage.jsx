// Stohill Properties - Property Management Module
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Plus, Home, Key, Wrench, Calendar, Filter,
  AlertTriangle, FileText, Building2, DollarSign,
  TrendingUp, MapPin, Users, Receipt, Edit2, Trash2
} from 'lucide-react'
import { rentalsAPI, propertiesAPI, crmAPI } from '@/services/api'
import { formatCurrency, formatDate, getStatusColor } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import DataManagementButtons from '@/components/common/DataManagementButtons'
import Pagination from '@/components/common/Pagination'
import { useQueryClient } from '@tanstack/react-query'

const TABS = [
  { id: 'properties', label: 'Managed Properties', icon: Building2 },
  { id: 'tenants', label: 'Tenants', icon: Users },
  { id: 'leases', label: 'Leases', icon: Key },
  { id: 'invoices', label: 'Invoices', icon: Receipt },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench },
]

export default function RentalsPage() {
  const [activeTab, setActiveTab] = useState('properties')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('-created_at')
  const [page, setPage] = useState(1)
  const openPanel = useUIStore((s) => s.openSidePanel)

  const handleDeleteTenant = async (id) => {
    if (!window.confirm('Are you sure you want to delete this tenant contact?')) return
    try {
      await crmAPI.contacts.delete(id)
      setActiveTab('tenants') // Force refresh/stay on tab
    } catch (error) {
      alert('Failed to delete tenant. They might be linked to active leases.')
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

  const queryClient = useQueryClient()
  const isLoading = activeTab === 'properties' ? propsLoading
    : activeTab === 'tenants' ? tenantsLoading
    : activeTab === 'leases' ? leasesLoading
    : activeTab === 'invoices' ? invoicesLoading
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
            />
          )}
          {activeTab === 'tenants' && (
            <DataManagementButtons 
              module="crm" 
              onImportSuccess={() => queryClient.invalidateQueries({ queryKey: ['rental-tenants'] })} 
            />
          )}
          {activeTab === 'leases' && (
            <DataManagementButtons 
              module="leases" 
              onImportSuccess={() => queryClient.invalidateQueries({ queryKey: ['rental-leases'] })} 
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

      {/* Search and Sort */}
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
                {leases.map((lease) => (
                  <motion.tr
                    key={lease.id}
                    layout={false}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-white/2 transition-colors cursor-pointer"
                    onClick={() => openPanel('lease-detail', { lease })}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-primary">{lease.lease_number}</td>
                    <td className="px-4 py-3 text-sm text-white font-medium">{lease.property_name}</td>
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
                ))}
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
                      {parseFloat(inv.balance_due) > 0 && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); openPanel('rental-payment-form', { invoice: inv }) }}
                          className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all"
                          title="Record Payment"
                        >
                          <DollarSign size={14} />
                        </button>
                      )}
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
        <div className="space-y-3">
          {maintenance.map((ticket) => (
            <div key={ticket.id} className="card p-4 flex items-start gap-4 hover:border-white/10 transition-colors cursor-pointer">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                ticket.priority === 'emergency' ? 'bg-red-500/10 text-red-400'
                : ticket.priority === 'high' ? 'bg-amber-500/10 text-amber-400'
                : 'bg-white/5 text-dark-400'
              }`}>
                <Wrench size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-white truncate">{ticket.category}</p>
                  <span className={`badge text-[10px] uppercase font-bold ${getStatusColor(ticket.status)}`}>
                    {ticket.status?.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-xs text-dark-400 truncate mb-1">{ticket.description}</p>
                <div className="flex items-center gap-4 text-[10px] text-dark-500">
                  <span>{ticket.property_name}</span>
                  <span className="uppercase font-bold">{ticket.priority}</span>
                  <span>{formatDate(ticket.created_at)}</span>
                  {ticket.estimated_cost && <span>Est: {formatCurrency(parseFloat(ticket.estimated_cost))}</span>}
                </div>
              </div>
            </div>
          ))}
          {maintenance.length === 0 && !isLoading && (
            <div className="text-center py-16">
              <Wrench size={40} className="mx-auto mb-3 text-dark-600" />
              <p className="text-dark-400">No maintenance tickets found.</p>
            </div>
          )}
        </div>
      )}

      {activeTab !== 'stats' && (
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
    </div>
  )
}
