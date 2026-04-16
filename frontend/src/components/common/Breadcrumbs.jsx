import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'
import { useUIStore } from '@/stores/authStore'
import { motion } from 'framer-motion'

const routeLabels = {
  dashboard: 'Intelligence',
  crm: 'CRM Pipeline',
  properties: 'Properties',
  rentals: 'Rentals',
  sales: 'Sales & Deals',
  inventory: 'Inventory',
  procurement: 'Procurement',
  finance: 'Finance',
  entries: 'Journal Entries',
  approvals: 'Approvals',
  reports: 'Reports',
  ap: 'Accounts Payable',
  ar: 'Accounts Receivable',
  bank: 'Banking',
  tax: 'Tax & VAT',
  periods: 'Fiscal Periods',
  'posting-profiles': 'Posting Profiles',
  assets: 'Fixed Assets',
  commissions: 'Commissions',
  documents: 'Documents',
  hr: 'Human Resources',
  payroll: 'Payroll',
  agents: 'Agents',
  profile: 'My Profile',
  admin: 'Admin',
  access: 'Access Control',
  'new': 'Create New',
  'edit': 'Edit'
}

export default function Breadcrumbs() {
  const location = useLocation()
  const { theme } = useUIStore()
  
  const pathnames = location.pathname.split('/').filter((x) => x)
  
  if (pathnames.length === 0) return null

  return (
    <nav className="hidden md:flex items-center space-x-1.5 text-[11px] font-medium tracking-wide pointer-events-auto">
      <Link 
        to="/" 
        className={`flex items-center gap-1 transition-colors ${
          theme === 'light' 
            ? 'text-dark-400 hover:text-primary' 
            : 'text-dark-500 hover:text-white'
        }`}
      >
        <Home size={12} />
      </Link>

      {pathnames.map((value, index) => {
        const last = index === pathnames.length - 1
        const to = `/${pathnames.slice(0, index + 1).join('/')}`
        const label = routeLabels[value] || value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, ' ')

        return (
          <React.Fragment key={to}>
            <ChevronRight 
              size={10} 
              className={theme === 'light' ? 'text-dark-300' : 'text-dark-600'} 
            />
            {last ? (
              <motion.span 
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                className={theme === 'light' ? 'text-primary font-bold' : 'text-primary font-bold'}
              >
                {label}
              </motion.span>
            ) : (
              <Link 
                to={to}
                className={`transition-colors ${
                  theme === 'light' 
                    ? 'text-dark-500 hover:text-primary' 
                    : 'text-dark-400 hover:text-white'
                }`}
              >
                {label}
              </Link>
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}
