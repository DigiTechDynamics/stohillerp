import React, { useState } from 'react'
import { User, Briefcase, Mail, Phone, CreditCard, Calendar, ShieldCheck, MapPin } from 'lucide-react'
import { formatCurrency, formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'
import EmployeeStatementModal from './EmployeeStatementModal'

export default function EmployeeDetailPanel({ employee }) {
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  if (!employee) return null
  const openSidePanel = useUIStore((s) => s.openSidePanel)

  const Section = ({ title, icon: Icon, children }) => (
    <div className="space-y-3">
      <h3 className="text-[10px] font-bold text-dark-500 uppercase tracking-widest flex items-center gap-2">
        <Icon size={12} /> {title}
      </h3>
      <div className="bg-dark-800/50 rounded-xl p-4 border border-white/5 space-y-3">
        {children}
      </div>
    </div>
  )

  const InfoRow = ({ label, value }) => (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-xs text-dark-400">{label}</span>
      <span className="text-sm font-medium text-white">{value || '—'}</span>
    </div>
  )

  return (
    <div className="p-6 space-y-8">
      {/* Header Profile */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center text-xl font-bold text-primary border border-primary/20">
          {employee.first_name?.[0]}{employee.last_name?.[0]}
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-semibold text-white">{employee.first_name} {employee.last_name}</h2>
            <span className={`badge text-[10px] uppercase font-bold
              ${employee.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {employee.status}
            </span>
          </div>
          <p className="text-sm text-dark-400 flex items-center gap-1.5">
            <Briefcase size={14} className="text-primary" />
            {employee.job_title} • <span className="font-mono text-xs">{employee.employee_number}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-dark-700/50 border border-white/5 rounded-xl p-3 text-center">
          <Calendar size={18} className="text-primary mx-auto mb-1" />
          <p className="text-white font-semibold text-sm">{formatDate(employee.start_date)}</p>
          <p className="text-[10px] text-dark-500 uppercase">Joined</p>
        </div>
        <div className="bg-dark-700/50 border border-white/5 rounded-xl p-3 text-center">
          <ShieldCheck size={18} className="text-primary mx-auto mb-1" />
          <p className="text-white font-semibold text-sm">{employee.employment_type?.replace(/_/g, ' ')}</p>
          <p className="text-[10px] text-dark-500 uppercase">Type</p>
        </div>
      </div>

      <Section title="Contact Information" icon={Mail}>
        <InfoRow label="Email" value={employee.email} />
        <InfoRow label="Phone" value={employee.phone} />
        <InfoRow label="ID Number" value={employee.id_number} />
        <InfoRow label="Office" value={employee.office_location || 'Main Office'} />
      </Section>

      <Section title="Job & Reporting" icon={Briefcase}>
        <InfoRow label="Department" value={employee.department_name} />
        <InfoRow label="Reports To" value={employee.manager_name} />
        <InfoRow label="Job Title" value={employee.job_title} />
      </Section>

      <Section title="Financials (Private)" icon={CreditCard}>
        <div className="grid grid-cols-2 gap-6 pb-2">
          <div>
            <p className="text-[10px] text-dark-400 uppercase mb-1">Basic Salary</p>
            <p className="text-lg font-semibold text-white">{formatCurrency(employee.basic_salary)}</p>
          </div>
          <div>
            <p className="text-[10px] text-dark-400 uppercase mb-1">Comm. Rate</p>
            <p className="text-lg font-semibold text-white">{employee.commission_rate}%</p>
          </div>
        </div>
        <div className="pt-3 border-t border-white/5 space-y-2">
          <InfoRow label="Bank" value={employee.bank_name} />
          {employee.fidelity_fund_number && (
            <>
               <InfoRow label="Fidelity Fund #" value={employee.fidelity_fund_number} />
               <InfoRow label="FF Expiry" value={formatDate(employee.fidelity_fund_expiry)} />
            </>
          )}
        </div>
      </Section>

      {employee.notes && (
        <div className="space-y-2">
          <h3 className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Employee Notes</h3>
          <p className="text-sm text-dark-300 leading-relaxed bg-dark-800/30 p-4 rounded-xl border border-white/5 italic">
            "{employee.notes}"
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="pt-4 flex gap-3">
        <button 
          className="flex-1 btn-primary py-2.5 flex items-center justify-center gap-2"
          onClick={() => openSidePanel('employee-form', { employee })}
        >
          Edit Profile
        </button>
        <button 
          className="btn-secondary px-4 py-2.5"
          onClick={() => setIsStatementModalOpen(true)}
        >
          Generate Statement
        </button>
      </div>

      <EmployeeStatementModal 
        isOpen={isStatementModalOpen}
        onClose={() => setIsStatementModalOpen(false)}
        employeeId={employee.id}
      />
    </div>
  )
}
