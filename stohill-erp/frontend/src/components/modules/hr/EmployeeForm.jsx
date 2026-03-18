import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, AlertCircle, User, Briefcase, CreditCard, Plus } from 'lucide-react'
import { hrAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full-Time' },
  { value: 'part_time', label: 'Part-Time' },
  { value: 'contract', label: 'Contract' },
  { value: 'commission_only', label: 'Commission Only' },
  { value: 'intern', label: 'Intern' },
]

const STATUS_CHOICES = [
  { value: 'active', label: 'Active' },
  { value: 'on_leave', label: 'On Leave' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'terminated', label: 'Terminated' },
]

export default function EmployeeForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel, openSidePanel: openPanel, sidePanelData } = useUIStore()
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('personal')
  
  const employee = sidePanelData?.employee
  const isEditing = !!employee?.id

  const [formData, setFormData] = useState({
    first_name: employee?.first_name || '',
    last_name: employee?.last_name || '',
    email: employee?.email || '',
    phone: employee?.phone || '',
    id_number: employee?.id_number || '',
    department: employee?.department || '',
    job_title: employee?.job_title || '',
    employment_type: employee?.employment_type || 'full_time',
    status: employee?.status || 'active',
    start_date: employee?.start_date || new Date().toISOString().split('T')[0],
    reports_to: employee?.reports_to || '',
    basic_salary: employee?.basic_salary || '0.00',
    commission_rate: employee?.commission_rate || '50.00',
    bank_name: employee?.bank_name || '',
    bank_account_number: employee?.bank_account_number || '',
    bank_branch_code: employee?.bank_branch_code || '',
    fidelity_fund_number: employee?.fidelity_fund_number || '',
    fidelity_fund_expiry: employee?.fidelity_fund_expiry || '',
    notes: employee?.notes || '',
  })

  const { data: deptsData } = useQuery({
    queryKey: ['hr-departments'],
    queryFn: () => hrAPI.departments.list(),
  })
  const departments = deptsData?.data?.results || []

  const { data: empsData } = useQuery({
    queryKey: ['hr-employees-lite'],
    queryFn: () => hrAPI.employees.list({ page_size: 1000 }),
  })
  const allEmployees = empsData?.data?.results || []

  const mutation = useMutation({
    mutationFn: (data) => 
      isEditing 
        ? hrAPI.employees.update(employee.id, data)
        : hrAPI.employees.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-employees'] })
      closeSidePanel()
    },
    onError: (err) => {
      const resp = err.response?.data
      setError(resp?.error?.message || resp || 'An error occurred')
    }
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    mutation.mutate(formData)
  }

  const TabButton = ({ id, label, icon: Icon }) => (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 pb-3 px-1 border-b-2 transition-colors text-xs font-bold uppercase tracking-wider ${
        activeTab === id ? 'border-primary text-primary' : 'border-transparent text-dark-500 hover:text-dark-300'
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  )

  return (
    <div className="flex flex-col h-full bg-dark-900">
      <div className="border-b border-white/5 bg-dark-800/50 p-6">
        <div className="flex gap-6">
          <TabButton id="personal" label="Personal" icon={User} />
          <TabButton id="job" label="Job & Role" icon={Briefcase} />
          <TabButton id="payroll" label="Payroll & Bank" icon={CreditCard} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        <form id="employee-form" onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2">
              <AlertCircle size={14} className="flex-shrink-0" />
              <p>{typeof error === 'object' ? JSON.stringify(error) : error}</p>
            </div>
          )}

          {activeTab === 'personal' && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">First Name</label>
                  <input name="first_name" value={formData.first_name} onChange={handleChange} required className="form-input w-full" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Last Name</label>
                  <input name="last_name" value={formData.last_name} onChange={handleChange} required className="form-input w-full" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Email Address</label>
                <input type="email" name="email" value={formData.email} onChange={handleChange} required className="form-input w-full" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Phone Number</label>
                  <input name="phone" value={formData.phone} onChange={handleChange} className="form-input w-full" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">ID / Passport Number</label>
                  <input name="id_number" value={formData.id_number} onChange={handleChange} className="form-input w-full" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Notes / Comments</label>
                <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3} className="form-input w-full resize-none" />
              </div>
            </div>
          )}

          {activeTab === 'job' && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Department</label>
                    <button 
                      type="button" 
                      onClick={() => openPanel('department-form')}
                      className="text-[10px] font-bold text-primary hover:text-primary-light flex items-center gap-1 transition-colors"
                    >
                      <Plus size={10} /> Add New
                    </button>
                  </div>
                  <select name="department" value={formData.department} onChange={handleChange} className="form-input w-full">
                    <option value="">Select Department</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Job Title</label>
                  <input name="job_title" value={formData.job_title} onChange={handleChange} required className="form-input w-full" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Employment Type</label>
                  <select name="employment_type" value={formData.employment_type} onChange={handleChange} className="form-input w-full">
                    {EMPLOYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Status</label>
                  <select name="status" value={formData.status} onChange={handleChange} className="form-input w-full">
                    {STATUS_CHOICES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Start Date</label>
                  <input type="date" name="start_date" value={formData.start_date} onChange={handleChange} required className="form-input w-full" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Reports To</label>
                  <select name="reports_to" value={formData.reports_to} onChange={handleChange} className="form-input w-full">
                    <option value="">No Manager (Top Level)</option>
                    {allEmployees.filter(e => e.id !== employee?.id).map(e => (
                      <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.job_title})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="border-t border-white/5 pt-5 mt-5">
                <h3 className="text-xs font-bold text-white mb-4">Registration Details (Agents)</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Fidelity Fund #</label>
                    <input name="fidelity_fund_number" value={formData.fidelity_fund_number} onChange={handleChange} className="form-input w-full" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Expiry Date</label>
                    <input type="date" name="fidelity_fund_expiry" value={formData.fidelity_fund_expiry} onChange={handleChange} className="form-input w-full" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'payroll' && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Basic Salary (USD)</label>
                  <input type="number" step="0.01" name="basic_salary" value={formData.basic_salary} onChange={handleChange} className="form-input w-full" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Commission Rate (%)</label>
                  <input type="number" step="0.1" name="commission_rate" value={formData.commission_rate} onChange={handleChange} className="form-input w-full" />
                </div>
              </div>

              <div className="border-t border-white/5 pt-5 mt-5">
                <h3 className="text-xs font-bold text-white mb-4">Bank Account Details</h3>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Bank Name</label>
                    <input name="bank_name" value={formData.bank_name} onChange={handleChange} className="form-input w-full" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Account Number</label>
                      <input name="bank_account_number" value={formData.bank_account_number} onChange={handleChange} className="form-input w-full" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Branch Code</label>
                      <input name="bank_branch_code" value={formData.bank_branch_code} onChange={handleChange} className="form-input w-full" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </form>
      </div>

      <div className="p-6 border-t border-white/5 bg-dark-800/30 flex gap-3">
        <button
          type="submit"
          form="employee-form"
          disabled={mutation.isPending}
          className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
        >
          {mutation.isPending ? 'Saving...' : <><Save size={18} /> {isEditing ? 'Update Employee' : 'Create Employee'}</>}
        </button>
        <button
          type="button"
          onClick={closeSidePanel}
          className="btn-secondary px-8 py-3"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
