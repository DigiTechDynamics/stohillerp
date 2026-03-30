// Stohill Properties - Root Application Component
// Handles routing, auth guards, and global layout

import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore, useUIStore } from '@/stores/authStore'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'

// Page imports
import ExecutiveDashboard from '@/pages/dashboard/ExecutiveDashboard'
import PropertiesPage from '@/pages/properties/PropertiesPage'
import CRMPage from '@/pages/crm/CRMPage'
import SalesPage from '@/pages/sales/SalesPage'
import RentalsPage from '@/pages/rentals/RentalsPage'
import FinancePage from '@/pages/finance/FinancePage'
import JournalEntriesPage from '@/pages/finance/JournalEntriesPage'
import ReportsPage from '@/pages/finance/ReportsPage'
import AccountsPayablePage from '@/pages/finance/AccountsPayablePage'
import AccountsReceivablePage from '@/pages/finance/AccountsReceivablePage'
import BankingPage from '@/pages/banking/BankingPage'
import TaxReportsPage from '@/pages/finance/TaxReportsPage'
import CommissionsPage from '@/pages/commissions/CommissionsPage'
import DocumentsPage from '@/pages/documents/DocumentsPage'
import HRPage from '@/pages/hr/HRPage'
import AgentsPage from '@/pages/hr/AgentsPage'
import FiscalPeriodsPage from '@/pages/finance/FiscalPeriodsPage'
import PostingProfilesPage from '@/pages/finance/PostingProfilesPage'
import AssetsPage from '@/pages/finance/AssetsPage'
import CreateJournalEntryPage from '@/pages/finance/CreateJournalEntryPage'
import BatchApprovalPage from '@/pages/finance/BatchApprovalPage'
import PayrollPage from '@/pages/payroll/PayrollPage'
import UserAccessPage from '@/pages/admin/UserAccessPage'

// Auth guard wrapper
function PrivateRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  const theme = useUIStore((s) => s.theme)

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light')
    } else {
      document.documentElement.classList.remove('light')
    }
  }, [theme])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<ExecutiveDashboard />} />
        <Route path="properties" element={<PropertiesPage />} />
        <Route path="crm" element={<CRMPage />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="rentals" element={<RentalsPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="finance/entries" element={<JournalEntriesPage />} />
        <Route path="finance/entries/new" element={<CreateJournalEntryPage />} />
        <Route path="finance/entries/:id/edit" element={<CreateJournalEntryPage />} />
        <Route path="finance/approvals" element={<BatchApprovalPage />} />
        <Route path="finance/reports" element={<ReportsPage />} />
        <Route path="finance/ap" element={<AccountsPayablePage />} />
        <Route path="finance/ar" element={<AccountsReceivablePage />} />
        <Route path="finance/bank" element={<BankingPage />} />
        <Route path="finance/tax" element={<TaxReportsPage />} />
        <Route path="finance/periods" element={<FiscalPeriodsPage />} />
        <Route path="finance/posting-profiles" element={<PostingProfilesPage />} />
        <Route path="finance/assets" element={<AssetsPage />} />
        <Route path="commissions" element={<CommissionsPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="hr" element={<HRPage />} />
        <Route path="hr/leave-management" element={<HRPage />} />
        <Route path="payroll" element={<PayrollPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="admin/access" element={<UserAccessPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
