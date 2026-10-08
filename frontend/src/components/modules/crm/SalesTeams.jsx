import { useQuery } from '@tanstack/react-query'
import { crmAPI, hrAPI } from '@/services/api'
import CrudTable from '@/components/common/CrudTable'

// Sales teams: a leader and members (agents), used to assign and report on deals.
export default function SalesTeams() {
  const { data: employeesRes } = useQuery({
    queryKey: ['employees', 'options'],
    queryFn: () => hrAPI.employees.list({ page_size: 200 }),
  })
  const employees = (employeesRes?.data?.results || employeesRes?.data || []).map((e) => [e.id, e.full_name || `${e.first_name} ${e.last_name}`])
  return (
    <div className="h-full overflow-y-auto pr-2">
      <CrudTable label="sales team" queryKey={['sales-teams']} api={crmAPI.salesTeams}
        description="Group agents into teams. Deals and leads can be assigned to a team and filtered by it on the pipeline."
        columns={[
          { key: 'name', label: 'Team' },
          { key: 'team_leader_name', label: 'Leader', render: (r) => r.team_leader_name || '—' },
          { key: 'member_count', label: 'Members', align: 'right' },
          { key: 'description', label: 'Territory / notes', render: (r) => r.description || '—' },
          { key: 'is_active', label: 'Active', render: (r) => (r.is_active ? 'Yes' : 'No') },
        ]}
        fields={[
          { key: 'name', label: 'Name', required: true },
          { key: 'team_leader', label: 'Team leader', type: 'select', options: employees },
          { key: 'members', label: 'Members (Ctrl/Cmd-click to pick several)', type: 'multiselect', options: employees, span: 2 },
          { key: 'description', label: 'Territory / notes', type: 'textarea', span: 2 },
          { key: 'is_active', label: 'Active', type: 'checkbox' },
        ]}
        defaults={{ is_active: true, members: [] }} />
    </div>
  )
}
