import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, X, AlertCircle } from 'lucide-react'
import { financeAPI } from '@/services/api'
import AccountCombobox from '@/components/common/AccountCombobox'

export default function PostingProfileForm({ profile, onClose }) {
  const queryClient = useQueryClient()
  const isEditing = !!profile

  const [formData, setFormData] = useState({
    name: '',
    is_default: false,
    bank_main: '',
    bank_trust: '',
    accounts_receivable: '',
    accounts_payable: '',
    vat_receivable: '',
    vat_payable: '',
    commission_receivable: '',
    commission_payable: '',
    retained_earnings: '',
    rental_income: '',
    commission_income: '',
  })

  useEffect(() => {
    if (profile) {
      setFormData({
        ...profile,
        // Ensure FKs are just IDs for the form
        bank_main: profile.bank_main?.id || profile.bank_main || '',
        bank_trust: profile.bank_trust?.id || profile.bank_trust || '',
        accounts_receivable: profile.accounts_receivable?.id || profile.accounts_receivable || '',
        accounts_payable: profile.accounts_payable?.id || profile.accounts_payable || '',
        vat_receivable: profile.vat_receivable?.id || profile.vat_receivable || '',
        vat_payable: profile.vat_payable?.id || profile.vat_payable || '',
        commission_receivable: profile.commission_receivable?.id || profile.commission_receivable || '',
        commission_payable: profile.commission_payable?.id || profile.commission_payable || '',
        retained_earnings: profile.retained_earnings?.id || profile.retained_earnings || '',
        rental_income: profile.rental_income?.id || profile.rental_income || '',
        commission_income: profile.commission_income?.id || profile.commission_income || '',
      })
    }
  }, [profile])

  const mutation = useMutation({
    mutationFn: (data) => 
      isEditing 
        ? financeAPI.postingProfiles.update(profile.id, data)
        : financeAPI.postingProfiles.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posting-profiles'] })
      onClose()
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    
    // Validate all account fields are present
    const requiredAccounts = [
      'bank_main', 'bank_trust', 'accounts_receivable', 'accounts_payable',
      'vat_receivable', 'vat_payable', 'commission_receivable', 'commission_payable',
      'retained_earnings', 'rental_income', 'commission_income'
    ]
    
    const missing = requiredAccounts.filter(key => !formData[key])
    if (missing.length > 0) {
      // Set error manually if mutation hasn't run
      setError(`Please map all GL accounts. Missing: ${missing.join(', ').replace(/_/g, ' ')}`)
      return
    }

    mutation.mutate(formData)
  }

  const handleAccountChange = (field, accountId) => {
    setFormData(prev => ({ ...prev, [field]: accountId }))
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full bg-dark-900">
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display text-white">
            {isEditing ? 'Edit Posting Profile' : 'New Posting Profile'}
          </h2>
          <p className="text-dark-400 text-xs mt-1">Configure default GL account mappings</p>
        </div>
        <button type="button" onClick={onClose} className="p-2 text-dark-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {mutation.isError && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
            <AlertCircle className="text-red-400 shrink-0" size={18} />
            <div className="text-sm text-red-100">
              {mutation.error.response?.data?.detail || 'An error occurred while saving. Please check all fields.'}
            </div>
          </div>
        )}

        {/* General Settings */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">General Settings</h3>
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-dark-300">Profile Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="form-input w-full"
                placeholder="e.g., Default Rental Profile"
              />
            </div>
            <label className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 cursor-pointer hover:bg-white/10 transition-colors">
              <input
                type="checkbox"
                checked={formData.is_default}
                onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                className="w-4 h-4 rounded border-white/10 bg-dark-800 text-primary focus:ring-primary/20"
              />
              <div>
                <span className="text-sm font-medium text-white">Set as Default Profile</span>
                <p className="text-[10px] text-dark-400">Used automatically if no other profile is specified</p>
              </div>
            </label>
          </div>
        </div>

        {/* Account Mappings */}
        <div className="space-y-6">
          <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">Account Mappings</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Assets */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold text-dark-400 uppercase tracking-widest pl-1">Asset Accounts</h4>
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-dark-400 uppercase">Main Bank Account</label>
                <AccountCombobox 
                  value={formData.bank_main} 
                  onChange={(val) => handleAccountChange('bank_main', val)}
                  placeholder="Select Bank Account..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-dark-400 uppercase">Trust Bank Account</label>
                <AccountCombobox 
                  value={formData.bank_trust} 
                  onChange={(val) => handleAccountChange('bank_trust', val)}
                  placeholder="Select Trust Account..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-dark-400 uppercase">Accounts Receivable</label>
                <AccountCombobox 
                  value={formData.accounts_receivable} 
                  onChange={(val) => handleAccountChange('accounts_receivable', val)}
                  placeholder="Select AR Control..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-dark-400 uppercase">Commission Receivable</label>
                <AccountCombobox 
                  value={formData.commission_receivable} 
                  onChange={(val) => handleAccountChange('commission_receivable', val)}
                />
              </div>
            </div>

            {/* Liabilities */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold text-dark-400 uppercase tracking-widest pl-1">Liability Accounts</h4>

              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-dark-400 uppercase">Accounts Payable</label>
                <AccountCombobox 
                  value={formData.accounts_payable} 
                  onChange={(val) => handleAccountChange('accounts_payable', val)}
                  placeholder="Select AP Control..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-dark-400 uppercase">VAT Payable</label>
                <AccountCombobox 
                  value={formData.vat_payable} 
                  onChange={(val) => handleAccountChange('vat_payable', val)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-dark-400 uppercase">VAT Receivable</label>
                <AccountCombobox 
                  value={formData.vat_receivable} 
                  onChange={(val) => handleAccountChange('vat_receivable', val)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-dark-400 uppercase">Tenant Deposits</label>
                <AccountCombobox 
                  value={formData.tenant_deposits} 
                  onChange={(val) => handleAccountChange('tenant_deposits', val)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-dark-400 uppercase">Commission Payable</label>
                <AccountCombobox 
                  value={formData.commission_payable} 
                  onChange={(val) => handleAccountChange('commission_payable', val)}
                />
              </div>
            </div>

            {/* Equity & Revenue */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold text-dark-400 uppercase tracking-widest pl-1">Equity & Revenue</h4>

              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-dark-400 uppercase">Retained Earnings</label>
                <AccountCombobox 
                  value={formData.retained_earnings} 
                  onChange={(val) => handleAccountChange('retained_earnings', val)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-dark-400 uppercase">Rental Income</label>
                <AccountCombobox 
                  value={formData.rental_income} 
                  onChange={(val) => handleAccountChange('rental_income', val)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-dark-400 uppercase">Commission Income</label>
                <AccountCombobox 
                  value={formData.commission_income} 
                  onChange={(val) => handleAccountChange('commission_income', val)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 border-t border-white/5 bg-white/[0.02] flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-dark-300 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="btn-primary flex items-center gap-2 px-6"
        >
          {mutation.isPending ? 'Saving...' : (
            <><Save size={18} /> {isEditing ? 'Update Profile' : 'Create Profile'}</>
          )}
        </button>
      </div>
    </form>
  )
}
