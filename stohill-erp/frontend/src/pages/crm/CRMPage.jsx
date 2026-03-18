// Stohil Properties - CRM Page
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, User, Mail, Phone, Calendar, Filter, Columns, Edit2, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { crmAPI } from '@/services/api'
import { formatCurrency, formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import DataManagementButtons from '@/components/common/DataManagementButtons'
import Pagination from '@/components/common/Pagination'
import { useQueryClient } from '@tanstack/react-query'

export default function CRMPage() {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('first_name')
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()
  const openPanel = useUIStore((s) => s.openSidePanel)

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this contact?')) return
    try {
      await crmAPI.contacts.delete(id)
      refetch()
    } catch (error) {
      alert('Failed to delete contact. It might be linked to other records.')
    }
  }

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['crm-contacts', { search, ordering: sort, page }],
    queryFn: () => crmAPI.contacts.list({ search, ordering: sort, page }),
  })

  const contacts = data?.data?.results || []

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-white">Client Relations</h1>
          <p className="text-dark-400 text-sm mt-1">Manage contacts, leads and relationships</p>
        </div>
        <div className="flex items-center gap-3">
          <DataManagementButtons 
            module="crm" 
            onImportSuccess={() => queryClient.invalidateQueries(['crm-contacts'])} 
          />
          <Link to="/crm/kanban" className="btn-secondary flex items-center gap-2">
            <Columns size={16} /> Kanban
          </Link>
          <button className="btn-primary flex items-center gap-2" onClick={() => openPanel('contact-form')}>
            <Plus size={16} /> Add Contact
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 w-full max-w-2xl">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="form-input pl-9 w-full"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value); setPage(1) }}
          className="form-input w-auto min-w-[150px]"
        >
          <option value="first_name">Name (A-Z)</option>
          <option value="-first_name">Name (Z-A)</option>
          <option value="-created_at">Newest First</option>
        </select>
        <button className="btn-ghost p-2 text-dark-400">
          <Filter size={18} />
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <User size={20} />
          </div>
          <div>
            <p className="text-xs text-dark-400">Total Contacts</p>
            <p className="text-lg font-semibold text-white">{data?.data?.count || 0}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <Calendar size={20} />
          </div>
          <div>
            <p className="text-xs text-dark-400">Active Leads</p>
            <p className="text-lg font-semibold text-white">12</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
            <Mail size={20} />
          </div>
          <div>
            <p className="text-xs text-dark-400">Interactions (MTD)</p>
            <p className="text-lg font-semibold text-white">45</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Contact</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Stage</th>
              <th>Last Contact</th>
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
                  exit={{ opacity: 0 }}
                  className="hover:bg-white/2 transition-colors cursor-pointer"
                  onClick={() => openPanel('contact-detail', { contact })}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center text-xs font-semibold text-white">
                        {contact.first_name?.[0]}{contact.last_name?.[0]}
                      </div>
                      <div>
                        <p className="text-sm text-white font-medium">{contact.first_name} {contact.last_name}</p>
                        <p className="text-xs text-dark-400">{contact.organisation || 'Individual'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-dark-300">
                    <div className="flex items-center gap-2">
                      <Mail size={12} className="text-dark-500" />
                      {contact.email}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-dark-300">
                    <div className="flex items-center gap-2">
                      <Phone size={12} className="text-dark-500" />
                      {contact.phone || '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge-primary text-[10px] uppercase">
                      {contact.status || 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-dark-400">
                    {contact.last_contact ? formatDate(contact.last_contact) : 'No activity'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        className="p-1 hover:text-primary transition-colors"
                        onClick={(e) => { e.stopPropagation(); openPanel('contact-form', { contact }) }}
                        title="Edit Contact"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        className="p-1 hover:text-red-400 transition-colors"
                        onClick={(e) => { e.stopPropagation(); handleDelete(contact.id) }}
                        title="Delete Contact"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
            {contacts.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="text-center py-20">
                  <User size={40} className="mx-auto mb-3 text-dark-600" />
                  <p className="text-dark-400">No contacts found.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination 
        currentPage={page}
        totalPages={data?.data?.total_pages}
        totalCount={data?.data?.count}
        onPageChange={setPage}
      />
    </div>
  )
}
