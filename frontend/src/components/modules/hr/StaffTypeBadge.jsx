// Tells company employees and agents apart at a glance, and marks managers.
export default function StaffTypeBadge({ employee, className = '' }) {
  const agent = employee?.staff_type === 'agent'
  return (
    <span className={`inline-flex gap-1 ${className}`}>
      <span className={`badge text-[10px] uppercase ${agent ? 'bg-sky-500/10 text-sky-400' : 'bg-violet-500/10 text-violet-400'}`}>
        {agent ? 'Agent' : 'Employee'}
      </span>
      {employee?.is_manager && <span className="badge text-[10px] uppercase bg-amber-500/10 text-amber-400">Manager</span>}
    </span>
  )
}
