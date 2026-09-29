// Stohill Properties - Root Application Component
// Handles routing, auth guards, and global layout

import { lazy, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore, useUIStore } from '@/stores/authStore'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'

// Page imports: lazy-loaded so each module is its own chunk, downloaded on
// first visit. LoginPage stays eager because it's the entry screen.
const ExecutiveDashboard = lazy(() => import('@/pages/dashboard/ExecutiveDashboard'))
const PropertiesPage = lazy(() => import('@/pages/properties/PropertiesPage'))
const CRMPage = lazy(() => import('@/pages/crm/CRMPage'))
const SalesPage = lazy(() => import('@/pages/sales/SalesPage'))
const RentalsPage = lazy(() => import('@/pages/rentals/RentalsPage'))
const FinancePage = lazy(() => import('@/pages/finance/FinancePage'))
const JournalEntriesPage = lazy(() => import('@/pages/finance/JournalEntriesPage'))
const ReportsPage = lazy(() => import('@/pages/finance/ReportsPage'))
const AccountsPayablePage = lazy(() => import('@/pages/finance/AccountsPayablePage'))
const AccountsReceivablePage = lazy(() => import('@/pages/finance/AccountsReceivablePage'))
const BankingPage = lazy(() => import('@/pages/banking/BankingPage'))
const TaxReportsPage = lazy(() => import('@/pages/finance/TaxReportsPage'))
const CommissionsPage = lazy(() => import('@/pages/commissions/CommissionsPage'))
const DocumentsPage = lazy(() => import('@/pages/documents/DocumentsPage'))
const HRPage = lazy(() => import('@/pages/hr/HRPage'))
const AgentsPage = lazy(() => import('@/pages/hr/AgentsPage'))
const FiscalPeriodsPage = lazy(() => import('@/pages/finance/FiscalPeriodsPage'))
const PostingProfilesPage = lazy(() => import('@/pages/finance/PostingProfilesPage'))
const AssetsPage = lazy(() => import('@/pages/finance/AssetsPage'))
const CreateJournalEntryPage = lazy(() => import('@/pages/finance/CreateJournalEntryPage'))
const BatchApprovalPage = lazy(() => import('@/pages/finance/BatchApprovalPage'))
const PayrollPage = lazy(() => import('@/pages/payroll/PayrollPage'))
const UserAccessPage = lazy(() => import('@/pages/admin/UserAccessPage'))

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
