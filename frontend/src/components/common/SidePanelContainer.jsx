// Stohill Properties - Side Panel Container
// Slide-in contextual panels for record details
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { X, Building2, MapPin, BedDouble, Bath, Square, Calendar, DollarSign, Briefcase, FileText, User, Mail, Phone, ExternalLink, Trash2, Edit2, Loader2, Key, MessageSquare, CheckCircle, Plus } from 'lucide-react'
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { propertiesAPI, crmAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import { useConfirmStore } from '@/stores/useConfirmStore'
import { formatCurrency, formatDate, getStatusColor } from '@/utils/format'
import ActionGuard from '@/components/common/ActionGuard'
import AccountForm from '@/components/modules/finance/AccountForm'
import AccountDetailPanel from '@/components/modules/finance/AccountDetailPanel'
import JournalEntryDetailPanel from '@/components/modules/finance/JournalEntryDetailPanel'
import EmployeeForm from '@/components/modules/hr/EmployeeForm'
import EmployeeDetailPanel from '@/components/modules/hr/EmployeeDetailPanel'
import LeaveManagementPanel from '@/components/modules/hr/LeaveManagementPanel'
import DocumentUploadForm from '@/components/modules/documents/DocumentUploadForm'
import ComplianceAuditPanel from '@/components/modules/documents/ComplianceAuditPanel'
import DepartmentForm from '@/components/modules/hr/DepartmentForm'
import DepartmentListPanel from '@/components/modules/hr/DepartmentListPanel'
import LeaseForm from '@/components/modules/rentals/LeaseForm'
import LeaseDetailPanel from '@/components/modules/rentals/LeaseDetailPanel'
import RentalInvoiceForm from '@/components/modules/rentals/RentalInvoiceForm'
import RentalPaymentForm from '@/components/modules/rentals/RentalPaymentForm'
import TenantForm from '@/components/modules/rentals/TenantForm'
import MaintenanceForm from '@/components/modules/rentals/MaintenanceForm'
import MaintenanceDetailPanel from '@/components/modules/rentals/MaintenanceDetailPanel'
import LeaseRenewalForm from '@/components/modules/rentals/LeaseRenewalForm'
import PropertyForm from '@/components/modules/properties/PropertyForm'
import CustomerForm from '@/components/modules/finance/CustomerForm'
import CustomerInvoiceForm from '@/components/modules/finance/CustomerInvoiceForm'
import CustomerReceiptForm from '@/components/modules/finance/CustomerReceiptForm'
import SupplierForm from '@/components/modules/finance/SupplierForm'
import SupplierInvoiceForm from '@/components/modules/finance/SupplierInvoiceForm'
import SupplierPaymentForm from '@/components/modules/finance/SupplierPaymentForm'
import CustomerReceiptDetailPanel from '@/components/modules/finance/CustomerReceiptDetailPanel'
import SupplierPaymentDetailPanel from '@/components/modules/finance/SupplierPaymentDetailPanel'
import ARInvoiceDetailPanel from '@/components/modules/finance/ARInvoiceDetailPanel'
import APInvoiceDetailPanel from '@/components/modules/finance/APInvoiceDetailPanel'
import SupplierDetailPanel from '@/components/modules/finance/SupplierDetailPanel'
import TaxCodeForm from '@/components/modules/finance/TaxCodeForm'
import PostingProfileForm from '@/components/modules/finance/PostingProfileForm'
import Chatter from '@/components/common/Chatter'
import AssetForm from '@/components/modules/finance/AssetForm'
import AssetCategoryForm from '@/components/modules/finance/AssetCategoryForm'
import AssetDetailPanel from '@/components/modules/finance/AssetDetailPanel'
import AssetDisposalForm from '@/components/modules/finance/AssetDisposalForm'
import RunDepreciationForm from '@/components/modules/finance/RunDepreciationForm'
import CommissionStructureForm from '@/components/modules/commissions/CommissionStructureForm'
import CommissionCalculator from '@/components/modules/commissions/CommissionCalculator'
import CommissionDetailPanel from '@/components/modules/commissions/CommissionDetailPanel'
import CurrencyForm from '@/components/modules/finance/CurrencyForm'
import ExchangeRateForm from '@/components/modules/finance/ExchangeRateForm'
import OpportunityForm from '@/components/modules/crm/OpportunityForm'
import ActivityForm from '@/components/modules/crm/ActivityForm'
import CrmDetailPanel from '@/components/modules/crm/CrmDetailPanel'
import CrmContactDetailPanel from '@/components/modules/crm/ContactDetailPanel'
import BankAccountForm from '@/components/modules/finance/BankAccountForm'
import BankTransactionView from '@/components/modules/finance/BankTransactionView'
import StatementUploadForm from '@/components/modules/finance/StatementUploadForm'
import ReconciliationRulesForm from '@/components/modules/finance/ReconciliationRulesForm'
import UserForm from '@/components/modules/admin/UserForm'
import RoleForm from '@/components/modules/admin/RoleForm'
import SODRuleForm from '@/components/modules/admin/SODRuleForm'
import SaleForm from '@/components/modules/sales/SaleForm'
import SaleDetailPanel from '@/components/modules/sales/SaleDetailPanel'
import FiscalYearForm from '@/components/modules/finance/FiscalYearForm'
import PayrollRunForm from '@/components/modules/payroll/PayrollRunForm'
import UserProfileForm from '@/components/modules/admin/UserProfileForm'
import FundTransferWizard from '@/components/modules/finance/FundTransferWizard'
import PropertyInspectionWizard from '@/components/modules/rentals/PropertyInspectionWizard'

function PropertyDetailPanel({ property }) {
  const queryClient = useQueryClient()
  const openPanel = useUIStore(s => s.openSidePanel)
  const closePanel = useUIStore(s => s.closeSidePanel)
  const confirm = useConfirmStore(s => s.confirm)
  const setContext = useUIStore(s => s.setContext)
  
  useEffect(() => {
    if (property?.id) {
      setContext('property', property.id)
    }
  }, [property?.id, setContext])

  if (!property) return null

  const deleteMutation = useMutation({
    mutationFn: () => propertiesAPI.delete(property.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      toast.success('Property archived successfully')
      closePanel()
    },
    onError: (err) => {
      toast.error('Failed to archive property')
    }
  })

  const handleArchive = async () => {
    const ok = await confirm({
      title: 'Archive Property',
      message: 'Are you sure you want to archive this property record? This will move it to historical records and release all linked marketing data.',
      confirmLabel: 'Archive Now',
      type: 'danger'
    })
    if (ok) {
      deleteMutation.mutate()
    }
  }

  return (
    <div className="p-6 space-y-6">
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
      <ActionGuard>
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
      </ActionGuard>
    </div>
  )
}

function ContactDetailPanel({ contact }) {
  const openPanel = useUIStore(s => s.openSidePanel)
  
  const { data: activitiesRes, isLoading: activitiesLoading } = useQuery({
    queryKey: ['crm-activities', contact?.id],
    queryFn: () => crmAPI.activities.list({ contact: contact?.id }),
    enabled: !!contact?.id
  })
  
  const activities = activitiesRes?.data?.results || []

  if (!contact) return null

  const getActivityIcon = (type) => {
    switch(type) {
      case 'call': return <Phone size={14} className="text-blue-400" />
      case 'email': return <Mail size={14} className="text-amber-400" />
      case 'meeting': return <User size={14} className="text-purple-400" />
      case 'viewing': return <Building2 size={14} className="text-emerald-400" />
      case 'whatsapp': return <MessageSquare size={14} className="text-green-400" />
      default: return <FileText size={14} className="text-dark-400" />
    }
  }

  return (
    <div className="p-6 space-y-8">
      {/* Profile Header */}
      <div className="flex items-start gap-5">
        <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold border border-primary/20">
          {contact.first_name?.[0]}{contact.last_name?.[0]}
        </div>
        <div className="flex-1 min-w-0 py-1">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-2xl font-semibold text-white truncate">{contact.first_name} {contact.last_name}</h2>
            <span className="badge-primary text-[10px] py-0.5 px-2">{contact.contact_type}</span>
          </div>
          <p className="text-dark-400 flex items-center gap-1.5">
            <Briefcase size={14} /> {contact.company || 'Individual Client'}
          </p>
        </div>
      </div>

      {/* Contact Info */}
      <div className="grid grid-cols-1 gap-4">
        <div className="bg-dark-800/50 border border-white/5 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-dark-400">
            <Mail size={18} />
          </div>
          <div>
            <p className="text-[10px] text-dark-500 uppercase font-bold tracking-wider">Email Address</p>
            <p className="text-white text-sm">{contact.email || '—'}</p>
          </div>
        </div>
        <div className="bg-dark-800/50 border border-white/5 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-dark-400">
            <Phone size={18} />
          </div>
          <div>
            <p className="text-[10px] text-dark-500 uppercase font-bold tracking-wider">Mobile Number</p>
            <p className="text-white text-sm">{contact.phone_mobile || '—'}</p>
          </div>
        </div>
      </div>

      {/* Linked Properties Section */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-dark-500 uppercase tracking-widest flex items-center gap-2">
          <Building2 size={14} /> Linked Properties
        </h3>
        
        {contact.active_leases?.length > 0 ? (
          <div className="space-y-3">
            {contact.active_leases.map(lease => (
              <div 
                key={lease.id}
                className="group relative p-4 rounded-xl bg-dark-800/80 border border-white/5 hover:border-primary/30 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      <Key size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white group-hover:text-primary transition-colors">
                        {lease.property_name}
                      </p>
                      <p className="text-[10px] text-dark-500 font-mono mt-0.5">
                        {lease.property_ref} · Lease {lease.lease_number}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => openPanel('property-detail', { property: { id: lease.property_id, name: lease.property_name, reference_number: lease.property_ref } })}
                    className="p-2 rounded-lg bg-white/5 text-dark-400 hover:text-white hover:bg-white/10 transition-all opacity-0 group-hover:opacity-100"
                    title="View Property Profile"
                  >
                    <ExternalLink size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-white/10 rounded-xl p-8 text-center bg-white/2">
            <Building2 size={32} className="mx-auto text-dark-700 mb-2" />
            <p className="text-xs text-dark-500">No active property leases found for this contact.</p>
          </div>
        )}
      </div>

      {/* Guarantor Info */}
      {contact.guarantor_name && (
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-amber-500 uppercase tracking-widest flex items-center gap-2">
            <User size={14} /> Guarantor Information
          </h3>
          <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center border-b border-amber-500/10 pb-2">
              <span className="text-xs text-dark-400">Name</span>
              <span className="text-sm font-medium text-white">{contact.guarantor_name}</span>
            </div>
            <div className="flex justify-between items-center border-b border-amber-500/10 pb-2">
              <span className="text-xs text-dark-400">Relationship</span>
              <span className="text-sm font-medium text-amber-400">{contact.guarantor_relationship || 'Not Specified'}</span>
            </div>
            <div className="flex justify-between items-center border-b border-amber-500/10 pb-2">
              <span className="text-xs text-dark-400">Email</span>
              <span className="text-sm font-medium text-white">{contact.guarantor_email || '—'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-dark-400">Phone</span>
              <span className="text-sm font-medium text-white">{contact.guarantor_phone || '—'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Unified Chatter & Activities */}
      <div className="border-t border-white/5 -mx-6 pt-6">
        <Chatter contactId={contact.id} contactData={contact} />
      </div>
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
            className="fixed right-0 top-0 h-screen w-full max-w-lg bg-dark-900 border-l border-white/10 z-[90] shadow-2xl overflow-y-auto custom-scrollbar"
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
                    activeSidePanel === 'compliance-check' ? 'Compliance Audit' :
                    activeSidePanel === 'department-form' ? (sidePanelData?.department ? 'Edit Department' : 'New Department') :
                    activeSidePanel === 'department-list' ? 'Departments' :
                    activeSidePanel === 'lease-form' ? (sidePanelData?.lease ? 'Edit Lease' : 'New Lease') :
                    activeSidePanel === 'lease-detail' ? 'Lease Overview' :
                    activeSidePanel === 'lease-renewal-form' ? 'Renew Lease Agreement' :
                    activeSidePanel === 'rental-invoice-form' ? 'New Rental Invoice' :
                    activeSidePanel === 'rental-payment-form' ? 'Record Payment' :
                    activeSidePanel === 'tenant-form' ? 'New Tenant' :
                    activeSidePanel === 'maintenance-form' ? 'Log Maintenance' :
                    activeSidePanel === 'maintenance-detail' ? 'Maintenance Ticket' :
                    activeSidePanel === 'property-form' ? (sidePanelData?.property ? 'Edit Property' : 'New Property Record') :
                    activeSidePanel === 'new-customer' ? 'New Customer' :
                    activeSidePanel === 'new-ar-invoice' ? 'New sales Invoice' :
                    activeSidePanel === 'new-ar-receipt' ? 'New Customer Receipt' :
                    activeSidePanel === 'new-supplier' ? 'New Supplier' :
                    activeSidePanel === 'new-ap-invoice' ? 'New Purchase Invoice' :
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
                    activeSidePanel === 'exchange-rate-form' ? (sidePanelData?.rate ? 'Capture Exchange Rate' : 'Capture Exchange Rate') :
                    activeSidePanel === 'opportunity-form' ? (sidePanelData?.opportunity ? 'Edit Opportunity' : 'New Opportunity') :
                    activeSidePanel === 'crm-detail' ? (sidePanelData?.type === 'lead' ? 'Lead Profile' : 'Opportunity Profile') :
                    activeSidePanel === 'activity-form' ? 'Log New Activity' :
                    activeSidePanel === 'contact-detail' ? 'Contact Profile' :
                    activeSidePanel === 'bank-account-form' ? (sidePanelData?.account ? 'Edit Bank Account' : 'New Bank Account') :
                    activeSidePanel === 'bank-transaction-view' ? 'Bank Account Transactions' :
                    activeSidePanel === 'statement-upload-form' ? 'Upload Bank Statement' :
                    activeSidePanel === 'reconciliation-rules-form' ? 'Reconciliation Rules' :
                    activeSidePanel === 'sale-form' ? (sidePanelData?.sale ? 'Edit Transaction' : 'New Sale Transaction') : 
                    activeSidePanel === 'sale-detail' ? 'Transaction Details' :
                    activeSidePanel === 'fiscal-year-form' ? (sidePanelData?.fiscalYear ? 'Edit Fiscal Year' : 'New Fiscal Year') :
                    activeSidePanel === 'payroll-run-form' ? (sidePanelData?.id ? 'Edit Payroll Run' : 'New Payroll Run') :
                    activeSidePanel === 'fund-transfer-wizard' ? 'Internal Fund Transfer' :
                    activeSidePanel === 'property-inspection-wizard' ? 'Field Inspection' :
                    activeSidePanel === 'my-profile' ? 'My Profile' :
                    'Details'}
                </h2>
              </div>
              <button onClick={closeSidePanel} className="btn-ghost p-1.5 hover:bg-white/5 rounded-full transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Panel Content Builder */}
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

              {activeSidePanel === 'lease-renewal-form' && (
                <LeaseRenewalForm />
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

              {activeSidePanel === 'maintenance-detail' && (
                <MaintenanceDetailPanel />
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
              
              {activeSidePanel === 'my-profile' && (
                <UserProfileForm />
              )}

              {activeSidePanel === 'fund-transfer-wizard' && (
                <FundTransferWizard />
              )}

              {activeSidePanel === 'property-inspection-wizard' && (
                <PropertyInspectionWizard />
              )}

              {/* Fallback for other panels if not implemented yet */}
              {!['property-detail', 'contact-detail', 'contact-form', 'account-form', 'account-detail', 'journal-entry-detail', 'employee-form', 'employee-detail', 'leave-management', 'document-upload', 'compliance-check', 'department-form', 'department-list', 'lease-form', 'lease-detail', 'lease-renewal-form', 'rental-invoice-form', 'rental-payment-form', 'tenant-form', 'maintenance-form', 'maintenance-detail', 'property-form', 'new-customer', 'new-ar-invoice', 'new-ar-receipt', 'new-supplier', 'new-ap-invoice', 'new-ap-payment', 'customer-receipt-detail', 'supplier-payment-detail', 'ar-invoice-detail', 'ap-invoice-detail', 'supplier-detail', 'tax-code-form', 'posting-profile-form', 'commission-structure-form', 'commission-calculator', 'commission-detail', 'currency-form', 'exchange-rate-form', 'opportunity-form', 'crm-detail', 'activity-form', 'bank-account-form', 'bank-transaction-view', 'statement-upload-form', 'reconciliation-rules-form', 'user-form', 'role-form', 'sod-rule-form', 'sale-form', 'sale-detail', 'asset-form', 'asset-category-form', 'asset-detail', 'asset-disposal', 'run-depreciation', 'payroll-run-form', 'fiscal-year-form', 'fund-transfer-wizard', 'property-inspection-wizard', 'my-profile'].includes(activeSidePanel) && (
                <div className="p-20 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mx-auto mb-4 border border-white/5">
                    <FileText size={32} className="text-dark-600" />
                  </div>
                  <h3 className="text-white font-medium mb-1">Coming Soon</h3>
                  <p className="text-xs text-dark-400">The detail view for this module is being developed.</p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
