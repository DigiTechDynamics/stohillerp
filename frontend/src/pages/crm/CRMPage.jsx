// Stohill Properties - Unified CRM Dashboard (Odoo-parity)
import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Plus, User, Mail, Edit2, Trash2, TrendingUp, LayoutGrid, List, BarChart2, SlidersHorizontal, CheckSquare, Calendar as CalendarIcon
} from 'lucide-react'
import { crmAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import { toast } from 'react-hot-toast'
import DataManagementButtons from '@/components/common/DataManagementButtons'
import Pagination from '@/components/common/Pagination'
import OpportunityTable from '@/components/modules/crm/OpportunityTable'
import KanbanBoard from '@/components/modules/crm/KanbanBoard'
import FilterPanel from '@/components/modules/crm/FilterPanel'
import BulkActionBar from '@/components/modules/crm/BulkActionBar'
import CrmReportingPage from '@/pages/crm/CrmReportingPage'
import CrmCalendar from '@/components/modules/crm/CrmCalendar'
import { confirmDialog } from '@/components/common/Dialogs'

const TABS = [
  { id: 'leads', label: 'Leads', icon: Mail },
  { id: 'pipeline', label: 'Pipeline', icon: TrendingUp },
  { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
  { id: 'contacts', label: 'Contacts', icon: User },
  { id: 'reporting', label: 'Reporting', icon: BarChart2 },
]

export default function CRMPage() {
  const [activeTab, setActiveTab] = useState('pipeline')
  const [viewMode, setViewMode] = useState('kanban')
  const [search, setSearch] = useState('')
  const [pipelineId, setPipelineId] = useState(null)
  const [page, setPage] = useState(1)
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const [activeFilters, setActiveFilters] = useState({})
  const [selectedIds, setSelectedIds] = useState([])

  const queryClient = useQueryClient()
  const openPanel = useUIStore((s) => s.openSidePanel)

  // ── Data Queries ──────────────────────────────────────────────────
  const { data: pipelinesRes } = useQuery({
    queryKey: ['crm-pipelines'],
    queryFn: () => crmAPI.pipelines.list()
  })

  const { data: contactsRes, refetch: refetchContacts } = useQuery({
    queryKey: ['crm-contacts', { search, page }],
    queryFn: () => crmAPI.contacts.list({ search, page }),
    enabled: activeTab === 'contacts'
  })

  const { data: oppsRes, isLoading: oppsLoading } = useQuery({
    queryKey: ['crm-opportunities', { search, activeTab, page }],
    queryFn: () => crmAPI.opportunities.list({ search, is_lead: activeTab === 'leads', page }),
    enabled: (activeTab === 'leads' || activeTab === 'pipeline') && viewMode === 'table'
  })

  const contacts = contactsRes?.data?.results || []
  const opportunities = oppsRes?.data?.results || []
  const pipelines = Array.isArray(pipelinesRes?.data) ? pipelinesRes.data : (pipelinesRes?.data?.results || [])

  // ── Handlers ──────────────────────────────────────────────────────
  const handleDeleteContact = async (id) => {
    if (!(await confirmDialog({ title: 'Delete this contact?', message: 'This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }))) return
    try {
      await crmAPI.contacts.delete(id)
      refetchContacts()
      toast.success('Contact deleted')
    } catch (error) {
      const detail = error.response?.data?.detail || error.response?.data?.error
      if (detail) toast.error(detail)
      else toast.error('Failed to delete contact.')
    }
  }

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }, [])

  const clearSelection = useCallback(() => setSelectedIds([]), [])

  const handleApplyFilters = useCallback((filters) => {
    setActiveFilters(filters)
    queryClient.invalidateQueries({ queryKey: ['kanban'] })
  }, [queryClient])

  const activeFilterCount = [
    activeFilters.priority?.length || 0,
    activeFilters.tags?.length || 0,
    activeFilters.assigned_agent ? 1 : 0,
    activeFilters.date_from ? 1 : 0,
    activeFilters.stages?.length || 0,
  ].reduce((a, b) => a + b, 0)

  // Map filters to kanban params
  const kanbanFilters = {
    ...(activeFilters.priority?.length === 1 ? { priority: activeFilters.priority[0] } : {}),
    ...(activeFilters.assigned_agent ? { assigned_agent: activeFilters.assigned_agent } : {}),
    ...(activeFilters.tags?.length ? { tags: activeFilters.tags } : {}),
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner border border-primary/5">
            <TrendingUp size={24} />
          </div>
          <div>
            <h1 className="font-display text-2xl text-white font-bold tracking-tight">Sales & Relations</h1>
            <p className="text-dark-400 text-xs mt-0.5 font-medium uppercase tracking-widest opacity-60">
              {activeTab === 'pipeline' ? 'Active Sales Pipeline' :
                activeTab === 'leads' ? 'Unqualified Leads' :
                  activeTab === 'contacts' ? 'Contact Directory' :
                    activeTab === 'calendar' ? 'Team Schedule' : 'Analytics & Reporting'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <DataManagementButtons
            module="crm"
            onImportSuccess={() => queryClient.invalidateQueries({ queryKey: ['crm-contacts'] })}
          />
          {activeTab !== 'reporting' && (
            <>
              <button
                className="btn-secondary flex items-center gap-2 h-10 px-4 text-xs font-bold uppercase tracking-wider"
                onClick={() => openPanel('opportunity-form', { is_lead: activeTab === 'leads' })}
              >
                <Plus size={16} /> New {activeTab === 'leads' ? 'Lead' : 'Deal'}
              </button>
              <button
                className="btn-primary flex items-center gap-2 h-10 px-4 text-xs font-bold uppercase tracking-wider shadow-lg shadow-primary/20"
                onClick={() => openPanel('contact-form')}
              >
                <Plus size={16} /> Add Contact
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs & View Toggle */}
      <div className="flex items-center justify-between border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-1">
          {TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); clearSelection() }}
                className={`flex items-center gap-2 pb-3 px-5 border-b-2 transition-all text-[11px] font-bold uppercase tracking-widest ${
                  activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-dark-500 hover:text-dark-300'
                }`}
              >
                <Icon size={13} /> {tab.label}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-3 mb-2">
          {activeTab !== 'contacts' && activeTab !== 'reporting' && activeTab !== 'calendar' && (
            <>
              {/* Kanban/Table toggle */}
              <div className="flex items-center bg-dark-800 rounded-xl p-1 border border-white/5 shadow-inner">
                <button
                  onClick={() => setViewMode('kanban')}
                  className={`p-1.5 px-3 rounded-lg transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider ${viewMode === 'kanban' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-dark-500 hover:text-white'}`}
                >
                  <LayoutGrid size={14} /> Kanban
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 px-3 rounded-lg transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider ${viewMode === 'table' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-dark-500 hover:text-white'}`}
                >
                  <List size={14} /> Table
                </button>
              </div>

              {/* Filter button */}
              <button
                onClick={() => setFilterPanelOpen(true)}
                className={`flex items-center gap-2 h-9 px-3 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${
                  activeFilterCount > 0
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'border-white/10 text-dark-500 hover:text-white hover:border-white/20'
                }`}
              >
                <SlidersHorizontal size={13} />
                Filters
                {activeFilterCount > 0 && (
                  <span className="bg-primary text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </>
          )}

          {/* Pipeline selector */}
          {activeTab === 'pipeline' && pipelines.length > 1 && (
            <select
              className="bg-dark-800 border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-wider px-3 py-2 text-dark-300 outline-none focus:border-primary/50 transition-all"
              value={pipelineId || ''}
              onChange={(e) => setPipelineId(e.target.value)}
            >
              <option value="">All Pipelines</option>
              {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Search Toolbar (hide on reporting/calendar) */}
      {activeTab !== 'reporting' && activeTab !== 'calendar' && (
        <div className="flex items-center gap-4 w-full flex-shrink-0 bg-dark-800/20 p-2 rounded-2xl border border-white/5">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-primary opacity-50" />
            <input
              type="text"
              placeholder={`Search ${activeTab === 'contacts' ? 'contacts' : activeTab === 'leads' ? 'leads' : 'pipeline deals'}...`}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="form-input pl-11 w-full bg-dark-800/50 border-white/5 focus:border-primary/30 h-11"
            />
          </div>
          {/* Active filter chips */}
          {activeFilterCount > 0 && (
            <div className="flex items-center gap-2 text-[10px] text-dark-400">
              <span className="font-bold text-primary">{activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active</span>
              <button
                onClick={() => handleApplyFilters({})}
                className="text-dark-600 hover:text-red-400 transition-colors font-bold"
              >
                Clear
              </button>
            </div>
          )}
          {/* Bulk selection count */}
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20">
              <CheckSquare size={13} className="text-primary" />
              <span className="text-[10px] font-bold text-primary">{selectedIds.length} selected</span>
            </div>
          )}
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden mt-4">

        {/* Reporting Tab */}
        {activeTab === 'reporting' ? (
          <CrmReportingPage />
        ) : activeTab === 'calendar' ? (
          <CrmCalendar />
        ) : activeTab === 'contacts' ? (
          /* Contacts Table */
          <div className="h-full flex flex-col space-y-4 overflow-y-auto pr-2 scrollbar-hide">
            <div className="card overflow-hidden border-white/5 bg-dark-800/20">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="text-[10px] uppercase tracking-widest opacity-50">Contact</th>
                    <th className="text-[10px] uppercase tracking-widest opacity-50">Email</th>
                    <th className="text-[10px] uppercase tracking-widest opacity-50">Phone</th>
                    <th className="text-[10px] uppercase tracking-widest opacity-50">Type</th>
                    <th className="text-[10px] uppercase tracking-widest opacity-50">Status</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence mode="popLayout">
                    {contacts.map((contact) => (
                      <motion.tr
                        key={contact.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="hover:bg-primary/5 transition-colors cursor-pointer group"
                        onClick={() => openPanel('contact-detail', { contactId: contact.id, contact })}
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-dark-700 flex items-center justify-center text-xs font-bold text-white border border-white/5 shadow-inner group-hover:border-primary/30 transition-all">
                              {contact.first_name?.[0]}{contact.last_name?.[0]}
                            </div>
                            <div>
                              <p className="text-sm text-white font-bold group-hover:text-primary transition-colors">{contact.first_name} {contact.last_name}</p>
                              <p className="text-[10px] text-dark-500 font-medium uppercase tracking-tighter">{contact.company || 'Individual'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-xs text-dark-300 font-medium">{contact.email}</td>
                        <td className="px-4 py-4 text-xs text-dark-300 font-mono">{contact.phone_mobile || '—'}</td>
                        <td className="px-4 py-4">
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-dark-700 text-dark-400 border border-white/5 font-bold uppercase tracking-widest">
                            {contact.contact_type}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest border ${
                            contact.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                              contact.status === 'blacklisted' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                'bg-dark-700 text-dark-400 border-white/5'
                          }`}>
                            {contact.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 text-dark-500">
                            <button className="p-1.5 hover:text-primary transition-colors hover:bg-white/5 rounded-lg" onClick={(e) => { e.stopPropagation(); openPanel('contact-form', { contact }) }}>
                              <Edit2 size={14} />
                            </button>
                            <button className="p-1.5 hover:text-red-400 transition-colors hover:bg-white/5 rounded-lg" onClick={(e) => { e.stopPropagation(); handleDeleteContact(contact.id) }}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={page}
              totalPages={contactsRes?.data?.total_pages}
              totalCount={contactsRes?.data?.count}
              onPageChange={setPage}
            />
          </div>
        ) : (
          /* Leads / Pipeline */
          <div className="h-full flex flex-col overflow-hidden">
            {viewMode === 'table' ? (
              <>
                <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide">
                  <OpportunityTable opportunities={opportunities} isLoading={oppsLoading} />
                </div>
                <div className="mt-4">
                  <Pagination
                    currentPage={page}
                    totalPages={oppsRes?.data?.total_pages}
                    totalCount={oppsRes?.data?.count}
                    onPageChange={setPage}
                  />
                </div>
              </>
            ) : (
              <div className="h-full overflow-hidden">
                <KanbanBoard
                  pipelineId={pipelineId}
                  isLead={activeTab === 'leads'}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  filters={kanbanFilters}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filter Panel (Slide-in) */}
      <FilterPanel
        isOpen={filterPanelOpen}
        onClose={() => setFilterPanelOpen(false)}
        filters={activeFilters}
        onApply={handleApplyFilters}
      />

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedIds={selectedIds}
        onClearSelection={clearSelection}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ['kanban'] })}
      />
    </div>
  )
}
