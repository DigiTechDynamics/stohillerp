// HR settings: the departments and job positions employees are filed under.
import { Building2, Briefcase } from 'lucide-react'
import { hrAPI } from '@/services/api'
import CrudTable from '@/components/common/CrudTable'
import SettingsPage from '@/components/common/SettingsPage'
import { useOptions } from '@/pages/propman/common'

function Departments() {
  const employees = useOptions(['employees', 'options'], () => hrAPI.employees.list({ page_size: 200 }),
    (e) => [e.id, e.full_name || `${e.first_name} ${e.last_name}`])
  return (
    <CrudTable label="department" queryKey={['departments']} api={hrAPI.departments}
      description="Departments group employees and job positions. A department with employees cannot be deleted."
      columns={[
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Name' },
        { key: 'manager_name', label: 'Manager', render: (r) => r.manager_name || '—' },
      ]}
      fields={[
        { key: 'name', label: 'Name', required: true },
        { key: 'code', label: 'Code', required: true, placeholder: 'e.g. FIN' },
        { key: 'manager', label: 'Manager', type: 'select', options: employees },
      ]} />
  )
}

function JobPositions() {
  const departments = useOptions(['departments', 'options'], () => hrAPI.departments.list({ page_size: 200 }), (d) => [d.id, d.name])
  return (
    <CrudTable label="job position" queryKey={['job-positions']} api={hrAPI.jobPositions}
      description="The roles offered on the employee form and on employment contracts."
      columns={[
        { key: 'name', label: 'Position' },
        { key: 'department_name', label: 'Department', render: (r) => r.department_name || '—' },
        { key: 'expected_employees', label: 'Headcount', align: 'right' },
      ]}
      fields={[
        { key: 'name', label: 'Position', required: true },
        { key: 'department', label: 'Department', type: 'select', options: departments },
        { key: 'expected_employees', label: 'Planned headcount', type: 'number' },
        { key: 'description', label: 'Description', type: 'textarea', span: 4 },
      ]}
      defaults={{ expected_employees: 1 }} />
  )
}

const TABS = [
  { id: 'departments', label: 'Departments', icon: Building2, render: () => <Departments /> },
  { id: 'positions', label: 'Job positions', icon: Briefcase, render: () => <JobPositions /> },
]

export default function HRSettingsPage() {
  return (
    <SettingsPage title="HR settings" backTo="/hr" backLabel="HR"
      description="Departments and job positions used on employee records." tabs={TABS} />
  )
}
