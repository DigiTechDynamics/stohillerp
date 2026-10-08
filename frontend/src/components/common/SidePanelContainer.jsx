// Stohill Properties - Side Panel Container
// Slide-in contextual panels for record details
import { Suspense, lazy } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Building2, MapPin, BedDouble, Bath, Square, DollarSign, Briefcase, FileText, Trash2, Edit2, Loader2 } from 'lucide-react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { propertiesAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import { formatCurrency, getStatusColor } from '@/utils/format'
import { confirmDialog } from '@/components/common/Dialogs'
// Module forms/panels load on demand: importing them eagerly pulled every
// module's UI into the initial bundle for every user.
const AccountForm = lazy(() => import('@/components/modules/finance/AccountForm'))
const AccountDetailPanel = lazy(() => import('@/components/modules/finance/AccountDetailPanel'))
const JournalEntryDetailPanel = lazy(() => import('@/components/modules/finance/JournalEntryDetailPanel'))
const EmployeeForm = lazy(() => import('@/components/modules/hr/EmployeeForm'))
const EmployeeDetailPanel = lazy(() => import('@/components/modules/hr/EmployeeDetailPanel'))
const LeaveManagementPanel = lazy(() => import('@/components/modules/hr/LeaveManagementPanel'))
const DocumentUploadForm = lazy(() => import('@/components/modules/documents/DocumentUploadForm'))
const DocumentDetailPanel = lazy(() => import('@/components/modules/documents/DocumentDetailPanel'))
const ComplianceAuditPanel = lazy(() => import('@/components/modules/documents/ComplianceAuditPanel'))
const DepartmentForm = lazy(() => import('@/components/modules/hr/DepartmentForm'))
const DepartmentListPanel = lazy(() => import('@/components/modules/hr/DepartmentListPanel'))
const LeaseForm = lazy(() => import('@/components/modules/rentals/LeaseForm'))
const LeaseDetailPanel = lazy(() => import('@/components/modules/rentals/LeaseDetailPanel'))
const RentalInvoiceForm = lazy(() => import('@/components/modules/rentals/RentalInvoiceForm'))
const RentalInvoiceDetailPanel = lazy(() => import('@/components/modules/rentals/RentalInvoiceDetailPanel'))
const RentalPaymentForm = lazy(() => import('@/components/modules/rentals/RentalPaymentForm'))
const TenantForm = lazy(() => import('@/components/modules/rentals/TenantForm'))
const MaintenanceForm = lazy(() => import('@/components/modules/rentals/MaintenanceForm'))
const PropertyForm = lazy(() => import('@/components/modules/properties/PropertyForm'))
const CustomerForm = lazy(() => import('@/components/modules/finance/CustomerForm'))
const CustomerInvoiceForm = lazy(() => import('@/components/modules/finance/CustomerInvoiceForm'))
const CustomerReceiptForm = lazy(() => import('@/components/modules/finance/CustomerReceiptForm'))
const SupplierForm = lazy(() => import('@/components/modules/finance/SupplierForm'))
const SupplierInvoiceForm = lazy(() => import('@/components/modules/finance/SupplierInvoiceForm'))
const SupplierPaymentForm = lazy(() => import('@/components/modules/finance/SupplierPaymentForm'))
const CustomerReceiptDetailPanel = lazy(() => import('@/components/modules/finance/CustomerReceiptDetailPanel'))
const SupplierPaymentDetailPanel = lazy(() => import('@/components/modules/finance/SupplierPaymentDetailPanel'))
const ARInvoiceDetailPanel = lazy(() => import('@/components/modules/finance/ARInvoiceDetailPanel'))
const APInvoiceDetailPanel = lazy(() => import('@/components/modules/finance/APInvoiceDetailPanel'))
const SupplierDetailPanel = lazy(() => import('@/components/modules/finance/SupplierDetailPanel'))
const TaxCodeForm = lazy(() => import('@/components/modules/finance/TaxCodeForm'))
const PostingProfileForm = lazy(() => import('@/components/modules/finance/PostingProfileForm'))
const AssetForm = lazy(() => import('@/components/modules/finance/AssetForm'))
const AssetCategoryForm = lazy(() => import('@/components/modules/finance/AssetCategoryForm'))
const AssetDetailPanel = lazy(() => import('@/components/modules/finance/AssetDetailPanel'))
const AssetDisposalForm = lazy(() => import('@/components/modules/finance/AssetDisposalForm'))
const RunDepreciationForm = lazy(() => import('@/components/modules/finance/RunDepreciationForm'))
const CommissionStructureForm = lazy(() => import('@/components/modules/commissions/CommissionStructureForm'))
const CommissionCalculator = lazy(() => import('@/components/modules/commissions/CommissionCalculator'))
const CommissionDetailPanel = lazy(() => import('@/components/modules/commissions/CommissionDetailPanel'))
const CurrencyForm = lazy(() => import('@/components/modules/finance/CurrencyForm'))
const ExchangeRateForm = lazy(() => import('@/components/modules/finance/ExchangeRateForm'))
const OpportunityForm = lazy(() => import('@/components/modules/crm/OpportunityForm'))
const ActivityForm = lazy(() => import('@/components/modules/crm/ActivityForm'))
const CrmDetailPanel = lazy(() => import('@/components/modules/crm/CrmDetailPanel'))
const CrmContactDetailPanel = lazy(() => import('@/components/modules/crm/ContactDetailPanel'))
const BankAccountForm = lazy(() => import('@/components/modules/finance/BankAccountForm'))
const BankTransactionView = lazy(() => import('@/components/modules/finance/BankTransactionView'))
const StatementUploadForm = lazy(() => import('@/components/modules/finance/StatementUploadForm'))
const ReconciliationRulesForm = lazy(() => import('@/components/modules/finance/ReconciliationRulesForm'))
const UserForm = lazy(() => import('@/components/modules/admin/UserForm'))
const RoleForm = lazy(() => import('@/components/modules/admin/RoleForm'))
const SODRuleForm = lazy(() => import('@/components/modules/admin/SODRuleForm'))
const SaleForm = lazy(() => import('@/components/modules/sales/SaleForm'))
const SaleDetailPanel = lazy(() => import('@/components/modules/sales/SaleDetailPanel'))
const FiscalYearForm = lazy(() => import('@/components/modules/finance/FiscalYearForm'))
const PayrollRunForm = lazy(() => import('@/components/modules/payroll/PayrollRunForm'))

function PropertyDetailPanel({ property }) {
  const queryClient = useQueryClient()
  const openPanel = useUIStore(s => s.openSidePanel)
  const closePanel = useUIStore(s => s.closeSidePanel)

  const deleteMutation = useMutation({
    mutationFn: () => propertiesAPI.delete(property.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      toast.success('Property archived successfully')
      closePanel()
    },
    onError: () => {
      toast.error('Failed to archive property')
    }
  })

  if (!property) return null

  const handleArchive = async () => {
    if (await confirmDialog({ title: 'Archive this property?', message: 'The property record will be archived.', confirmLabel: 'Archive', tone: 'danger' })) {
      deleteMutation.mutate()
    }
  }

  return (
    <div className="p-6 space-y-6">
      <Link to={`/properties/${property.id}`} onClick={closePanel} className="btn-primary w-full justify-center">
        Open property workspace (units, photos, inspections, meters...)
      </Link>
      {/* Hero */}
      <div className="h-48 rounded-xl bg-dark-700 overflow-hidden border border-white/5">
        {property.primary_image ? (
          <img src={property.primary_image} alt={property.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Building2 size={48} className="text-dark-600" />
          </div>
        )}
      </div>

      {/* Title */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">{property.reference_number}</span>
          <span className={getStatusColor(property.status) + ' badge text-[10px] uppercase font-bold'}>
            {property.status?.replace(/_/g, ' ')}
          </span>
        </div>
        <h2 className="text-xl font-semibold text-white">{property.name}</h2>
        <div className="flex items-center gap-1.5 text-dark-400 text-sm mt-1.5">
          <MapPin size={14} className="text-dark-500" />
          <span>{property.suburb}, {property.city}</span>
        </div>
      </div>

      {/* Specs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-dark-700/50 border border-white/5 rounded-xl p-3 text-center">
          <BedDouble size={18} className="text-primary mx-auto mb-1" />
          <p className="text-white font-semibold">{property.bedrooms || '—'}</p>
          <p className="text-[10px] text-dark-500 uppercase">Beds</p>
        </div>
        <div className="bg-dark-700/50 border border-white/5 rounded-xl p-3 text-center">
          <Bath size={18} className="text-primary mx-auto mb-1" />
          <p className="text-white font-semibold">{property.bathrooms || '—'}</p>
          <p className="text-[10px] text-dark-500 uppercase">Baths</p>
        </div>
        <div className="bg-dark-700/50 border border-white/5 rounded-xl p-3 text-center">
          <Square size={18} className="text-primary mx-auto mb-1" />
          <p className="text-white font-semibold">{property.floor_size || '—'}</p>
          <p className="text-[10px] text-dark-500 uppercase">m²</p>
        </div>
      </div>

      {/* Financials */}
      <div className="space-y-3 bg-dark-800/50 rounded-xl p-4 border border-white/5">
        <h3 className="text-xs font-bold text-dark-500 uppercase tracking-widest flex items-center gap-2">
          <DollarSign size={12} /> Financial Overview
        </h3>
        <div className="space-y-2.5 pt-1">
          {[
            { label: 'Asking Price', value: property.asking_price ? formatCurrency(parseFloat(property.asking_price)) : null },
            { label: 'Rental Rate', value: property.rental_rate ? `${formatCurrency(parseFloat(property.rental_rate))}/mo` : null },
            { label: 'Current Valuation', value: property.current_valuation ? formatCurrency(parseFloat(property.current_valuation)) : null },
            { label: 'Monthly Rates', value: property.rates_monthly ? formatCurrency(parseFloat(property.rates_monthly)) : null },
            { label: 'Monthly Levies', value: property.levies_monthly ? formatCurrency(parseFloat(property.levies_monthly)) : null },
          ].filter(f => f.value).map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0">
              <span className="text-xs text-dark-400">{label}</span>
              <span className="text-sm font-medium text-white">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Description */}
      {property.description && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-dark-500 uppercase tracking-widest">Description</h3>
          <p className="text-sm text-dark-300 leading-relaxed text-balance">{property.description}</p>
        </div>
      )}

      {/* Actions */}
      <div className="pt-4 flex gap-3">
        <button 
          onClick={() => openPanel('property-form', { property })}
          className="flex-1 btn-primary py-2.5 flex items-center justify-center gap-2"
        >
          <Edit2 size={16} /> Edit Record
        </button>
        <button 
          onClick={handleArchive}
          disabled={deleteMutation.isPending}
          className="btn-secondary px-4 py-2.5 flex items-center gap-2 text-red-400 hover:text-red-300"
        >
          {deleteMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
          Archive
        </button>
      </div>
    </div>
  )
}

// Record panels with a two-column layout (details beside the chatter) need
// more room than a form; in the standard width their content overflowed.
const WIDE_PANELS = new Set(['crm-detail', 'contact-detail', 'bank-transaction-view'])

function PanelLoader() {
  return (
    <div role="status" className="flex items-center justify-center py-16">
      <Loader2 size={20} className="animate-spin text-primary" />
    </div>
  )
}

export default function SidePanelContainer() {
  const { activeSidePanel, sidePanelData, closeSidePanel } = useUIStore()

  return (
    <AnimatePresence>
      {activeSidePanel && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80]"
            onClick={closeSidePanel}
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={`side-panel-shell fixed right-0 top-0 h-screen w-full ${WIDE_PANELS.has(activeSidePanel) ? 'max-w-4xl' : 'max-w-xl'} bg-dark-900 border-l border-white/10 z-[90] shadow-2xl overflow-y-auto overflow-x-hidden custom-scrollbar`}
          >
            {/* Panel Header */}
            <div className="sticky top-0 bg-dark-900/90 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <Briefcase size={16} className="text-primary" />
                <h2 className="font-semibold text-white text-sm">
                  {activeSidePanel === 'property-detail' ? 'Property Profile' :
                    activeSidePanel === 'contact-detail' ? 'Contact Profile' : 
                    activeSidePanel === 'contact-form' ? (sidePanelData?.contact ? 'Edit Contact' : 'New Contact') : 
                    activeSidePanel === 'account-detail' ? 'Account Details' : 
                    activeSidePanel === 'account-form' ? (sidePanelData?.account ? 'Edit Account' : 'New Account') :
                    activeSidePanel === 'journal-entry-detail' ? 'Journal Entry Details' :
                    activeSidePanel === 'employee-form' ? (sidePanelData?.employee ? 'Edit Employee' : 'New Employee') :
                    activeSidePanel === 'employee-detail' ? 'Employee Profile' :
                    activeSidePanel === 'leave-management' ? 'Leave Management' :
                    activeSidePanel === 'document-upload' ? 'Upload Document' :
                    activeSidePanel === 'document-detail' ? 'Document' :
                    activeSidePanel === 'compliance-check' ? 'Compliance Audit' :
                    activeSidePanel === 'department-form' ? (sidePanelData?.department ? 'Edit Department' : 'New Department') :
                    activeSidePanel === 'department-list' ? 'Departments' :
                    activeSidePanel === 'lease-form' ? (sidePanelData?.lease ? 'Edit Lease' : 'New Lease') :
                    activeSidePanel === 'lease-detail' ? 'Lease Overview' :
                    activeSidePanel === 'rental-invoice-form' ? 'New Rental Invoice' :
                    activeSidePanel === 'rental-invoice-detail' ? 'Rental Invoice' :
                    activeSidePanel === 'rental-payment-form' ? 'Record Payment' :
                    activeSidePanel === 'tenant-form' ? 'New Tenant' :
                    activeSidePanel === 'maintenance-form' ? (sidePanelData?.ticket ? 'Edit Maintenance Ticket' : 'Log Maintenance') :
                    activeSidePanel === 'property-form' ? (sidePanelData?.property ? 'Edit Property' : 'New Property Record') :
                    activeSidePanel === 'new-customer' ? (sidePanelData?.customer ? 'Edit Customer' : 'New Customer') :
                    activeSidePanel === 'new-ar-invoice' ? (sidePanelData?.invoice ? 'Edit Sales Invoice' : 'New Sales Invoice') :
                    activeSidePanel === 'new-ar-receipt' ? 'New Customer Receipt' :
                    activeSidePanel === 'new-supplier' ? (sidePanelData?.supplier ? 'Edit Supplier' : 'New Supplier') :
                    activeSidePanel === 'new-ap-invoice' ? (sidePanelData?.invoice ? 'Edit Purchase Invoice' : 'New Purchase Invoice') :
                    activeSidePanel === 'new-ap-payment' ? 'New Supplier Payment' :
                    activeSidePanel === 'customer-receipt-detail' ? 'Receipt Details' :
                    activeSidePanel === 'supplier-payment-detail' ? 'Payment Details' :
                    activeSidePanel === 'ar-invoice-detail' ? 'Invoice Details' :
                    activeSidePanel === 'ap-invoice-detail' ? 'Purchase Invoice Details' :
                    activeSidePanel === 'supplier-detail' ? 'Supplier Profile' :
                    activeSidePanel === 'tax-code-form' ? (sidePanelData?.taxCode ? 'Edit Tax Code' : 'New Tax Code') :
                    activeSidePanel === 'posting-profile-form' ? (sidePanelData?.profile ? 'Edit Posting Profile' : 'New Posting Profile') :
                    activeSidePanel === 'asset-form' ? (sidePanelData?.asset ? 'Edit Asset' : 'New Fixed Asset') :
                    activeSidePanel === 'asset-category-form' ? (sidePanelData?.category ? 'Edit Asset Category' : 'New Asset Category') :
                    activeSidePanel === 'asset-detail' ? 'Asset Profile' :
                    activeSidePanel === 'asset-disposal' ? 'Asset Disposal' :
                    activeSidePanel === 'run-depreciation' ? 'Execute Depreciation Run' :
                    activeSidePanel === 'currency-form' ? (sidePanelData?.currency ? 'Edit Currency' : 'New Currency') :
                    activeSidePanel === 'exchange-rate-form' ? (sidePanelData?.rate ? 'Edit Exchange Rate' : 'Capture Exchange Rate') :
                    activeSidePanel === 'opportunity-form' ? (sidePanelData?.opportunity ? 'Edit Opportunity' : 'New Opportunity') :
                    activeSidePanel === 'crm-detail' ? (sidePanelData?.type === 'lead' ? 'Lead Profile' : 'Opportunity Profile') :
                    activeSidePanel === 'activity-form' ? (sidePanelData?.activity ? 'Edit Activity' : 'Log New Activity') :
                    activeSidePanel === 'contact-detail' ? 'Contact Profile' :
                    activeSidePanel === 'bank-account-form' ? (sidePanelData?.account ? 'Edit Bank Account' : 'New Bank Account') :
                    activeSidePanel === 'bank-transaction-view' ? 'Bank Account Transactions' :
                    activeSidePanel === 'statement-upload-form' ? 'Upload Bank Statement' :
                    activeSidePanel === 'reconciliation-rules-form' ? 'Reconciliation Rules' :
                    activeSidePanel === 'sale-form' ? (sidePanelData?.sale ? 'Edit Transaction' : 'New Sale Transaction') : 
                    activeSidePanel === 'sale-detail' ? 'Transaction Details' :
                    activeSidePanel === 'fiscal-year-form' ? (sidePanelData?.fiscalYear ? 'Edit Fiscal Year' : 'New Fiscal Year') :
                    activeSidePanel === 'payroll-run-form' ? (sidePanelData?.id ? 'Edit Payroll Run' : 'New Payroll Run') :
                    'Details'}
                </h2>
              </div>
              <button onClick={closeSidePanel} className="btn-ghost p-1.5 hover:bg-white/5 rounded-full transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Panel Content Builder (Suspense: panels are lazy-loaded) */}
            <Suspense fallback={<PanelLoader />}>
            <div className="relative">
              {activeSidePanel === 'property-detail' && sidePanelData?.property && (
                <PropertyDetailPanel property={sidePanelData.property} />
              )}

              {activeSidePanel === 'contact-detail' && (sidePanelData?.contactId || sidePanelData?.contact) && (
                <div className="h-full min-h-screen">
                  <CrmContactDetailPanel 
                    contactId={sidePanelData.contactId || sidePanelData.contact?.id} 
                    contact={sidePanelData.contact} 
                  />
                </div>
              )}

              {activeSidePanel === 'contact-form' && (
                <TenantForm />
              )}

              {activeSidePanel === 'opportunity-form' && (
                <OpportunityForm />
              )}

              {activeSidePanel === 'crm-detail' && sidePanelData?.id && (
                <CrmDetailPanel id={sidePanelData.id} type={sidePanelData.type} />
              )}

              {activeSidePanel === 'activity-form' && (
                <ActivityForm />
              )}

              {activeSidePanel === 'bank-account-form' && (
                <BankAccountForm />
              )}

              {activeSidePanel === 'bank-transaction-view' && (
                <BankTransactionView />
              )}

              {activeSidePanel === 'statement-upload-form' && (
                <StatementUploadForm />
              )}

              {activeSidePanel === 'reconciliation-rules-form' && (
                <ReconciliationRulesForm />
              )}


              {activeSidePanel === 'account-form' && (
                <AccountForm />
              )}

              {activeSidePanel === 'account-detail' && sidePanelData?.account && (
                <AccountDetailPanel account={sidePanelData.account} />
              )}

              {activeSidePanel === 'journal-entry-detail' && sidePanelData?.entry && (
                <JournalEntryDetailPanel entry={sidePanelData.entry} />
              )}

              {activeSidePanel === 'employee-form' && (
                <EmployeeForm />
              )}

              {activeSidePanel === 'employee-detail' && sidePanelData?.employee && (
                <EmployeeDetailPanel employee={sidePanelData.employee} />
              )}

              {activeSidePanel === 'leave-management' && (
                <LeaveManagementPanel />
              )}

              {activeSidePanel === 'document-upload' && (
                <DocumentUploadForm />
              )}

              {activeSidePanel === 'document-detail' && sidePanelData?.document && (
                <DocumentDetailPanel document={sidePanelData.document} />
              )}

              {activeSidePanel === 'compliance-check' && (
                <ComplianceAuditPanel />
              )}

              {activeSidePanel === 'department-form' && (
                <DepartmentForm />
              )}

              {activeSidePanel === 'department-list' && (
                <DepartmentListPanel />
              )}

              {activeSidePanel === 'lease-form' && (
                <LeaseForm />
              )}

              {activeSidePanel === 'lease-detail' && sidePanelData?.lease && (
                <LeaseDetailPanel />
              )}

              {activeSidePanel === 'rental-invoice-detail' && sidePanelData?.invoice && (
                <RentalInvoiceDetailPanel invoice={sidePanelData.invoice} />
              )}

              {activeSidePanel === 'rental-invoice-form' && (
                <RentalInvoiceForm />
              )}

              {activeSidePanel === 'rental-payment-form' && (
                <RentalPaymentForm />
              )}

              {activeSidePanel === 'tenant-form' && (
                <TenantForm />
              )}

              {activeSidePanel === 'maintenance-form' && (
                <MaintenanceForm />
              )}

              {activeSidePanel === 'property-form' && (
                <PropertyForm />
              )}

              {activeSidePanel === 'new-customer' && (
                <CustomerForm />
              )}

              {activeSidePanel === 'new-ar-invoice' && (
                <CustomerInvoiceForm />
              )}

              {activeSidePanel === 'new-ar-receipt' && (
                <CustomerReceiptForm />
              )}

              {activeSidePanel === 'new-supplier' && (
                <SupplierForm />
              )}

              {activeSidePanel === 'new-ap-invoice' && (
                <SupplierInvoiceForm />
              )}

              {activeSidePanel === 'new-ap-payment' && (
                <SupplierPaymentForm />
              )}
              
              {activeSidePanel === 'customer-receipt-detail' && (
                <CustomerReceiptDetailPanel receipt={sidePanelData?.receipt} />
              )}

              {activeSidePanel === 'supplier-payment-detail' && (
                <SupplierPaymentDetailPanel payment={sidePanelData?.payment} />
              )}

              {activeSidePanel === 'ar-invoice-detail' && (
                <ARInvoiceDetailPanel invoice={sidePanelData?.invoice} />
              )}

              {activeSidePanel === 'ap-invoice-detail' && (
                <APInvoiceDetailPanel invoice={sidePanelData?.invoice} />
              )}

              {activeSidePanel === 'supplier-detail' && (
                <SupplierDetailPanel supplier={sidePanelData?.supplier} />
              )}

              {activeSidePanel === 'commission-structure-form' && (
                <CommissionStructureForm />
              )}

              {activeSidePanel === 'commission-calculator' && (
                <CommissionCalculator />
              )}

              {activeSidePanel === 'commission-detail' && (
                <CommissionDetailPanel />
              )}

              {activeSidePanel === 'tax-code-form' && (
                <TaxCodeForm />
              )}

              {activeSidePanel === 'posting-profile-form' && (
                <PostingProfileForm 
                  profile={sidePanelData?.profile} 
                  onClose={closeSidePanel} 
                />
              )}

              {activeSidePanel === 'asset-form' && (
                <AssetForm 
                  asset={sidePanelData?.asset} 
                  onClose={closeSidePanel} 
                />
              )}

              {activeSidePanel === 'asset-category-form' && (
                <AssetCategoryForm 
                  category={sidePanelData?.category} 
                  onClose={closeSidePanel} 
                />
              )}

              {activeSidePanel === 'asset-detail' && (
                <AssetDetailPanel 
                  asset={sidePanelData?.asset} 
                  onClose={closeSidePanel} 
                />
              )}

              {activeSidePanel === 'asset-disposal' && (
                <AssetDisposalForm 
                  asset={sidePanelData?.asset} 
                  onClose={closeSidePanel} 
                />
              )}

              {activeSidePanel === 'run-depreciation' && (
                <RunDepreciationForm />
              )}

              {activeSidePanel === 'currency-form' && (
                <CurrencyForm />
              )}

              {activeSidePanel === 'exchange-rate-form' && (
                <ExchangeRateForm />
              )}

              {activeSidePanel === 'user-form' && (
                <UserForm {...sidePanelData} />
              )}

              {activeSidePanel === 'role-form' && (
                <RoleForm {...sidePanelData} />
              )}

              {activeSidePanel === 'sod-rule-form' && (
                <SODRuleForm {...sidePanelData} />
              )}

              {activeSidePanel === 'sale-form' && (
                <SaleForm 
                  sale={sidePanelData?.sale} 
                  onSaveSuccess={sidePanelData?.onSaveSuccess} 
                />
              )}

              {activeSidePanel === 'sale-detail' && (
                <SaleDetailPanel sale={sidePanelData?.sale} />
              )}

              {activeSidePanel === 'fiscal-year-form' && (
                <FiscalYearForm />
              )}

              {activeSidePanel === 'payroll-run-form' && (
                <PayrollRunForm data={sidePanelData} onSuccess={sidePanelData?.onSuccess} />
              )}

              {/* Fallback for other panels if not implemented yet */}
              {!['property-detail', 'contact-detail', 'contact-form', 'account-form', 'account-detail', 'journal-entry-detail', 'employee-form', 'employee-detail', 'leave-management', 'document-upload', 'document-detail', 'compliance-check', 'department-form', 'department-list', 'lease-form', 'lease-detail', 'rental-invoice-form', 'rental-invoice-detail', 'rental-payment-form', 'tenant-form', 'maintenance-form', 'property-form', 'new-customer', 'new-ar-invoice', 'new-ar-receipt', 'new-supplier', 'new-ap-invoice', 'new-ap-payment', 'customer-receipt-detail', 'supplier-payment-detail', 'ar-invoice-detail', 'ap-invoice-detail', 'supplier-detail', 'tax-code-form', 'posting-profile-form', 'commission-structure-form', 'commission-calculator', 'commission-detail', 'currency-form', 'exchange-rate-form', 'opportunity-form', 'crm-detail', 'activity-form', 'bank-account-form', 'bank-transaction-view', 'statement-upload-form', 'reconciliation-rules-form', 'user-form', 'role-form', 'sod-rule-form', 'sale-form', 'sale-detail', 'asset-form', 'asset-category-form', 'asset-detail', 'asset-disposal', 'run-depreciation', 'payroll-run-form', 'fiscal-year-form'].includes(activeSidePanel) && (
                <div className="p-20 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mx-auto mb-4 border border-white/5">
                    <FileText size={32} className="text-dark-600" />
                  </div>
                  <h3 className="text-white font-medium mb-1">Coming Soon</h3>
                  <p className="text-xs text-dark-400">The detail view for this module is being developed.</p>
                </div>
              )}
            </div>
            </Suspense>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
