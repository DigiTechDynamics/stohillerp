import { documentsAPI } from '@/services/api'
import CrudTable from '@/components/common/CrudTable'

export default function DocumentTypesManager() {
  return (
    <CrudTable label="document type" queryKey={['document-categories']} api={documentsAPI.categories}
      description="The types documents are filed under. Deactivate a type to stop new uploads using it; types with documents cannot be deleted."
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code' },
        { key: 'retention_years', label: 'Keep (years)', align: 'right' },
        { key: 'document_count', label: 'Documents', align: 'right' },
        { key: 'is_active', label: 'Active', render: (r) => (r.is_active ? 'Yes' : 'No') },
      ]}
      fields={[
        { key: 'name', label: 'Name', required: true },
        { key: 'code', label: 'Code', required: true, readOnlyOnEdit: true },
        { key: 'description', label: 'Description', span: 2 },
        { key: 'retention_years', label: 'Keep for (years)', type: 'number' },
        { key: 'sort_order', label: 'Order', type: 'number' },
        { key: 'is_active', label: 'Active', type: 'checkbox' },
      ]}
      defaults={{ retention_years: 7, sort_order: 100, is_active: true }} />
  )
}
