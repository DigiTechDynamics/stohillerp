// Stohill Properties - Root Application Component
// Handles routing, auth guards, and global layout

import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore, useUIStore } from '@/stores/authStore'
import AppLayout from '@/components/layout/AppLayout'
import PageLoader from '@/components/common/PageLoader'
import LoginPage from '@/pages/LoginPage'
import { hasPortal, homePathFor, isPortalUser } from '@/utils/portal'

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
const OwnerHome = lazy(() => import('@/pages/portal/OwnerPortal').then(m => ({ default: m.OwnerHome })))
const OwnerProperties = lazy(() => import('@/pages/portal/OwnerPortal').then(m => ({ default: m.OwnerProperties })))
const OwnerStatement = lazy(() => import('@/pages/portal/OwnerPortal').then(m => ({ default: m.OwnerStatement })))
const OwnerMaintenance = lazy(() => import('@/pages/portal/OwnerPortal').then(m => ({ default: m.OwnerMaintenance })))
const ContractorJobs = lazy(() => import('@/pages/portal/ContractorPortal').then(m => ({ default: m.ContractorJobs })))
const ContractorOpenJobs = lazy(() => import('@/pages/portal/ContractorPortal').then(m => ({ default: m.ContractorOpenJobs })))
const ContractorQuotes = lazy(() => import('@/pages/portal/ContractorPortal').then(m => ({ default: m.ContractorQuotes })))
const PropertyWorkspace = lazy(() => import('@/pages/properties/PropertyWorkspace'))
const PropertySettingsPage = lazy(() => import('@/pages/propman/PropertySettingsPage'))
const CrmSettingsPage = lazy(() => import('@/pages/crm/CrmSettingsPage'))
const HRSettingsPage = lazy(() => import('@/pages/hr/HRSettingsPage'))
const DocumentSettingsPage = lazy(() => import('@/pages/documents/DocumentSettingsPage'))
const AssetSettingsPage = lazy(() => import('@/pages/finance/AssetSettingsPage'))

// Auth guard for the ERP. Portal-only logins (tenants, owners, contractors) go to their portal.
function PrivateRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (isPortalUser(user)) return <Navigate to={homePathFor(user)} replace />
  return <>{children}</>
}

// Auth guard for a portal. A portal-only login without this portal goes to its own.
function PortalRoute({ kind, children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (isPortalUser(user) && !hasPortal(user, kind)) return <Navigate to={homePathFor(user)} replace />
  return <>{children}</>
}

const portal = (kind) => (
  <PortalRoute kind={kind}>
    <Suspense fallback={<PageLoader />}><PortalLayout kind={kind} /></Suspense>
  </PortalRoute>
)

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
      <Route path="/owner" element={portal('owner')}>
        <Route index element={<OwnerHome />} />
        <Route path="properties" element={<OwnerProperties />} />
        <Route path="statement" element={<OwnerStatement />} />
        <Route path="maintenance" element={<OwnerMaintenance />} />
      </Route>
      <Route path="/contractor" element={portal('contractor')}>
        <Route index element={<ContractorJobs />} />
        <Route path="open" element={<ContractorOpenJobs />} />
        <Route path="quotes" element={<ContractorQuotes />} />
      </Route>
      <Route path="/portal" element={portal('tenant')}>
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
        <Route path="properties/settings" element={<PropertySettingsPage />} />
        <Route path="properties/:id" element={<PropertyWorkspace />} />
        <Route path="crm" element={<CRMPage />} />
        <Route path="crm/settings" element={<CrmSettingsPage />} />
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
        <Route path="finance/assets/settings" element={<AssetSettingsPage />} />
        <Route path="finance/settings" element={<FinanceSettingsPage />} />
        <Route path="procurement" element={<PurchasingPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="commissions" element={<CommissionsPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="documents/settings" element={<DocumentSettingsPage />} />
        <Route path="hr" element={<HRPage />} />
        <Route path="hr/settings" element={<HRSettingsPage />} />
        <Route path="hr/leave-management" element={<HRPage />} />
        <Route path="payroll" element={<PayrollPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="user-access" element={<UserAccessPage />} />
        {/* /admin/* is proxied to the Django admin in production; keep old in-app links working */}
        <Route path="admin/access" element={<Navigate to="/user-access" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
