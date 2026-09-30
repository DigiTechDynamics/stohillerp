// Stohill Properties - Properties Page
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2, Map, Grid, List, Search, Plus, MapPin, BedDouble, Bath, Square, Eye, TrendingUp, Home, DollarSign
} from 'lucide-react'
import { propertiesAPI } from '@/services/api'
import { formatCurrency, getStatusColor } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import DataManagementButtons from '@/components/common/DataManagementButtons'
import Pagination from '@/components/common/Pagination'
import { useQueryClient } from '@tanstack/react-query'

const STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'available', label: 'Available' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'under_contract', label: 'Under Contract' },
  { value: 'listed_sale', label: 'Listed for Sale' },
  { value: 'listed_rent', label: 'Listed for Rent' },
  { value: 'sold', label: 'Sold' },
]

function PropertyCard({ property }) {
  const openPanel = useUIStore((s) => s.openSidePanel)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="kpi-card group cursor-pointer overflow-hidden p-0"
      onClick={() => openPanel('property-detail', { property })}
    >
      {/* Image */}
      <div className="h-44 bg-dark-700 relative overflow-hidden">
        {property.primary_image ? (
          <img src={property.primary_image} alt={property.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Building2 size={40} className="text-dark-600" />
          </div>
        )}
        {/* Status overlay */}
        <div className="absolute top-3 left-3">
          <span className={getStatusColor(property.status) + ' badge text-[10px] uppercase tracking-wide'}>
            {property.status.replace(/_/g, ' ')}
          </span>
        </div>
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="w-7 h-7 rounded-lg bg-dark-900/80 backdrop-blur flex items-center justify-center hover:bg-primary transition-colors">
            <Eye size={14} className="text-white" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="mb-1">
          <p className="text-xs text-primary font-mono">{property.reference_number}</p>
          <h3 className="font-semibold text-white text-sm leading-snug mt-0.5 truncate">{property.name}</h3>
        </div>
        <div className="flex items-center gap-1 text-dark-400 text-xs mb-3">
          <MapPin size={11} />
          <span className="truncate">{property.suburb}, {property.city}</span>
        </div>

        {/* Specs row */}
        <div className="flex items-center gap-3 text-xs text-dark-400 mb-3 pb-3 border-b border-white/5">
          {property.bedrooms && (
            <div className="flex items-center gap-1">
              <BedDouble size={12} /> <span>{property.bedrooms} bed</span>
            </div>
          )}
          {property.bathrooms && (
            <div className="flex items-center gap-1">
              <Bath size={12} /> <span>{property.bathrooms} bath</span>
            </div>
          )}
          {property.floor_size && (
            <div className="flex items-center gap-1">
              <Square size={12} /> <span>{property.floor_size}m²</span>
            </div>
          )}
        </div>

        {/* Price */}
        <div className="flex items-end justify-between">
          <div>
            {property.asking_price && (
              <p className="text-base font-semibold text-white">
                {formatCurrency(parseFloat(property.asking_price), property.currency_code)}
              </p>
            )}
            {property.rental_rate && (
              <p className="text-xs text-dark-400">
                {formatCurrency(property.rental_rate, property.currency_code)}/mo rental
              </p>
            )}
          </div>
          <span className="text-xs text-dark-500">{property.property_type_name}</span>
        </div>
      </div>
    </motion.div>
  )
}

function PropertyRow({ property }) {
  const openPanel = useUIStore((s) => s.openSidePanel)
  return (
    <tr
      className="cursor-pointer hover:bg-white/5 transition-colors"
      onClick={() => openPanel('property-detail', { property })}
    >
      <td className="px-4 py-3">
        <div>
          <p className="text-xs text-primary font-mono">{property.reference_number}</p>
          <p className="text-sm text-white font-medium">{property.name}</p>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-dark-300">{property.suburb}, {property.city}</td>
      <td className="px-4 py-3 text-sm text-dark-300">{property.property_type_name}</td>
      <td className="px-4 py-3">
        <span className={getStatusColor(property.status) + ' badge'}>
          {property.status.replace(/_/g, ' ')}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-white font-medium">
        {property.asking_price ? formatCurrency(parseFloat(property.asking_price), property.currency_code) : '—'}
      </td>
      <td className="px-4 py-3 text-xs text-dark-400">
        {property.bedrooms && `${property.bedrooms} bed`}
        {property.bathrooms && (property.bedrooms ? ` · ${property.bathrooms} bath` : `${property.bathrooms} bath`)}
      </td>
    </tr>
  )
}

export default function PropertiesPage() {
  const [viewMode, setViewMode] = useState('grid')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('-created_at')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['properties', { search, status, ordering: sort, page }],
    queryFn: () => propertiesAPI.list({ search, status, ordering: sort, page }),
  })

  const { data: statsData } = useQuery({
    queryKey: ['property-stats'],
    queryFn: () => propertiesAPI.stats(),
  })

  const queryClient = useQueryClient()
  const openPanel = useUIStore((s) => s.openSidePanel)
  const properties = data?.data?.results || []
  const stats = statsData?.data || {}

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-white">Property Operations</h1>
          <p className="text-dark-400 text-sm mt-1">
            {data?.data?.count || 0} properties in portfolio
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DataManagementButtons 
            module="properties" 
            onImportSuccess={() => queryClient.invalidateQueries({ queryKey: ['properties'] })} 
          />
          <button 
            onClick={() => openPanel('property-form')}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={16} /> Add Property
          </button>
        </div>
      </div>

      {/* Stats strip */}
      {stats.by_status && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { key: 'available', label: 'Available', icon: Home, color: 'text-emerald-400' },
            { key: 'occupied', label: 'Occupied', icon: Building2, color: 'text-blue-400' },
            { key: 'listed_sale', label: 'For Sale', icon: TrendingUp, color: 'text-primary' },
            { key: 'listed_rent', label: 'For Rent', icon: DollarSign, color: 'text-purple-400' },
            { key: 'under_contract', label: 'Under Contract', icon: Home, color: 'text-amber-400' },
            { key: 'sold', label: 'Sold', icon: Building2, color: 'text-gray-400' },
          ].map(({ key, label, icon: Icon, color }) => (
            <div key={key} className="card p-3 text-center">
              <Icon size={16} className={`${color} mx-auto mb-1`} />
              <p className="text-lg font-semibold text-white">{stats.by_status[key] || 0}</p>
              <p className="text-xs text-dark-400">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
          <input
            type="text"
            placeholder="Search properties..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="form-input pl-9"
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          className="form-input w-auto min-w-[150px]"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value); setPage(1) }}
          className="form-input w-auto min-w-[150px]"
        >
          <option value="-created_at">Newest First</option>
          <option value="name">Property Name (A-Z)</option>
          <option value="-name">Property Name (Z-A)</option>
          <option value="reference_number">Reference (A-Z)</option>
          <option value="-asking_price">Highest Price</option>
        </select>
        <div className="flex items-center bg-dark-800 border border-white/5 rounded-lg p-1 gap-0.5">
          {['grid', 'list', 'map'].map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`p-1.5 rounded transition-all ${viewMode === m
                ? 'bg-primary text-dark-900'
                : 'text-dark-400 hover:text-white'}`}
            >
              {m === 'grid' ? <Grid size={16} /> : m === 'list' ? <List size={16} /> : <Map size={16} />}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-72 bg-dark-800 rounded-xl animate-pulse border border-white/5" />
          ))}
        </div>
      ) : viewMode === 'list' ? (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Property</th>
                <th>Location</th>
                <th>Type</th>
                <th>Status</th>
                <th>Price</th>
                <th>Specs</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {properties.map((p) => <PropertyRow key={p.id} property={p} />)}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      ) : viewMode === 'map' ? (
        <div className="card h-96 flex items-center justify-center">
          <div className="text-center">
            <Map size={40} className="text-dark-600 mx-auto mb-3" />
            <p className="text-dark-400 text-sm">Map view requires a maps API key.</p>
            <p className="text-dark-500 text-xs mt-1">Configure VITE_MAPS_KEY to enable.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence mode="popLayout">
            {properties.map((p) => <PropertyCard key={p.id} property={p} />)}
          </AnimatePresence>
          {properties.length === 0 && !isLoading && (
            <div className="col-span-full text-center py-16 text-dark-400">
              <Building2 size={40} className="mx-auto mb-3 text-dark-600" />
              <p>No properties found matching your filters.</p>
            </div>
          )}
        </div>
      )}

      <Pagination 
        currentPage={page}
        totalPages={data?.data?.total_pages}
        totalCount={data?.data?.count}
        onPageChange={setPage}
      />
    </div>
  )
}
