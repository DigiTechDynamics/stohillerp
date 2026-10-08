// Documents settings: the types documents are filed under, and the compliance
// requirements (FICA, EAAB, ...) that compliance records are kept against.
import { FolderTree, ShieldCheck } from 'lucide-react'
import { documentsAPI } from '@/services/api'
import CrudTable from '@/components/common/CrudTable'
import SettingsPage from '@/components/common/SettingsPage'
import DocumentTypesManager from '@/components/modules/documents/DocumentTypesManager'

const APPLIES_TO = [['contact', 'Contact / client'], ['employee', 'Employee'], ['property', 'Property'], ['company', 'Company']]

function ComplianceRequirements() {
  return (
    <CrudTable label="requirement" queryKey={['compliance-requirements']} api={documentsAPI.requirements}
      description="What must be on file and how often it is renewed. Requirements with records can be edited but not deleted."
      columns={[
        { key: 'name', label: 'Requirement' },
        { key: 'regulation', label: 'Regulation' },
        { key: 'applies_to', label: 'Applies to', render: (r) => APPLIES_TO.find(([v]) => v === r.applies_to)?.[1] ?? r.applies_to },
        { key: 'is_mandatory', label: 'Mandatory', render: (r) => (r.is_mandatory ? 'Yes' : 'No') },
        { key: 'renewal_period_months', label: 'Renew every', render: (r) => (r.renewal_period_months ? `${r.renewal_period_months} months` : 'Once') },
        { key: 'record_count', label: 'Records', align: 'right' },
      ]}
      fields={[
        { key: 'name', label: 'Requirement', required: true },
        { key: 'regulation', label: 'Regulation', required: true, placeholder: 'e.g. FICA' },
        { key: 'applies_to', label: 'Applies to', type: 'select', options: APPLIES_TO, required: true },
        { key: 'renewal_period_months', label: 'Renew every (months)', type: 'number', nullable: true, placeholder: 'Blank = once' },
        { key: 'is_mandatory', label: 'Mandatory', type: 'checkbox' },
        { key: 'description', label: 'Description', type: 'textarea', span: 4 },
      ]}
      defaults={{ applies_to: 'contact', is_mandatory: true }} />
  )
}

const TABS = [
  { id: 'types', label: 'Document types', icon: FolderTree, render: () => <DocumentTypesManager /> },
  { id: 'compliance', label: 'Compliance requirements', icon: ShieldCheck, render: () => <ComplianceRequirements /> },
]

export default function DocumentSettingsPage() {
  return (
    <SettingsPage title="Document settings" backTo="/documents" backLabel="Documents"
      description="Document types and the compliance requirements tracked against clients, staff and properties." tabs={TABS} />
  )
}
