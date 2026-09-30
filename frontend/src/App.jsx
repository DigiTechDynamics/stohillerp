// Stohill Properties - Root Application Component
// Handles routing, auth guards, and global layout

import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore, useUIStore } from '@/stores/authStore'
import AppLayout from '@/components/layout/AppLayout'
import PageLoader from '@/components/common/PageLoader'
import LoginPage from '@/pages/LoginPage'
import { isPortalUser } from '@/utils/portal'

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
const FinanceSettingsPage = lazy(() => import('@/pages/finance/FinanceSettingsPage'))
const PurchasingPage = lazy(() => import('@/pages/procurement/PurchasingPage'))
const ProjectsPage = lazy(() => import('@/pages/projects/ProjectsPage'))
const PortalLayout = lazy(() => import('@/pages/portal/PortalLayout'))
const PortalActivatePage = lazy(() => import('@/pages/portal/PortalActivatePage'))
const PortalHome = lazy(() => import('@/pages/portal/PortalPages').then(m => ({ default: m.PortalHome })))
const PortalInvoices = lazy(() => import('@/pages/portal/PortalPages').then(m => ({ default: m.PortalInvoices })))
const PortalStatement = lazy(() => import('@/pages/portal/PortalPages').then(m => ({ default: m.PortalStatement })))
const PortalMaintenance = lazy(() => import('@/pages/portal/PortalPages').then(m => ({ default: m.PortalMaintenance })))
const PortalPaymentReturn = lazy(() => import('@/pages/portal/PortalPages').then(m => ({ default: m.PortalPaymentReturn })))

// Auth guard for the ERP. Tenant (portal-only) logins are sent to the portal.
function PrivateRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (isPortalUser(user)) return <Navigate to="/portal" replace />
  return <>{children}</>
}

// Auth guard for the tenant portal.
function PortalRoute({ children }) {
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
      <Route path="/portal/activate" element={<Suspense fallback={<PageLoader />}><PortalActivatePage /></Suspense>} />
      <Route
        path="/portal"
        element={
          <PortalRoute>
            <Suspense fallback={<PageLoader />}><PortalLayout /></Suspense>
          </PortalRoute>
        }
      >
        <Route index element={<PortalHome />} />
        <Route path="invoices" element={<PortalInvoices />} />
        <Route path="statement" element={<PortalStatement />} />
        <Route path="maintenance" element={<PortalMaintenance />} />
        <Route path="payments/:reference" element={<PortalPaymentReturn />} />
      </Route>
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
        <Route path="finance/settings" element={<FinanceSettingsPage />} />
        <Route path="procurement" element={<PurchasingPage />} />
        <Route path="projects" element={<ProjectsPage />} />
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
