import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  Settings, Plus, Search, MoreVertical, Edit2, Trash2, 
  CheckCircle2, AlertCircle, ArrowLeft
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { financeAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'

export default function PostingProfilesPage() {
  const [search, setSearch] = useState('')
  const queryClient = useQueryClient()
  const openPanel = useUIStore((s) => s.openSidePanel)

  const { data, isLoading, error } = useQuery({
    queryKey: ['posting-profiles', { search }],
    queryFn: () => financeAPI.postingProfiles.list({ search }),
  })

  const profiles = data?.data?.results || data?.data || []

  const deleteMutation = useMutation({
    mutationFn: (id) => financeAPI.postingProfiles.delete(id),
    onSuccess: () => queryClient.invalidateQueries(['posting-profiles']),
  })

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this posting profile?')) {
      deleteMutation.mutate(id)
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/finance" className="p-2 rounded-xl bg-white/5 text-dark-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="font-display text-2xl text-white">Posting Profiles</h1>
            <p className="text-dark-400 text-sm mt-1">Configure default GL account mappings for automated transactions</p>
          </div>
        </div>
        <button 
          className="btn-primary flex items-center gap-2"
          onClick={() => openPanel('posting-profile-form')}
        >
          <Plus size={16} /> New Profile
        </button>
      </div>

      {/* Info Card */}
      <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary shrink-0">
          <Settings size={20} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Understanding Posting Profiles</h3>
          <p className="text-xs text-dark-300 mt-1 max-w-3xl leading-relaxed">
            Posting Profiles define which General Ledger accounts are used when the system automatically posts transactions 
            for Sales, Rentals, Commissions, and Payments. The **Default Profile** is used unless a specific profile is assigned elsewhere.
            Hardcoded system defaults (e.g., 2000 for AP, 1100 for AR) are used as a fallback if no profile is active.
          </p>
        </div>
      </div>

      {/* Search and List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Available Profiles</h2>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
            <input
              type="text"
              placeholder="Search profiles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 w-64 h-9 text-xs"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-dark-400 gap-4">
            <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            <span className="text-sm">Loading profiles...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-red-400 gap-2 text-center">
            <AlertCircle size={32} />
            <p>Failed to load posting profiles.</p>
            <button onClick={() => queryClient.invalidateQueries(['posting-profiles'])} className="text-xs text-primary underline">Try again</button>
          </div>
        ) : profiles.length === 0 ? (
          <div className="card py-20 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center text-dark-500 mb-4 border border-white/5">
              <Settings size={32} />
            </div>
            <h3 className="text-white font-medium">No Profiles Configured</h3>
            <p className="text-dark-400 text-sm mt-1 max-w-xs">
              System is currently using hardcoded defaults. Create your first profile to customize your GL mappings.
            </p>
            <button 
              className="mt-6 btn-primary flex items-center gap-2"
              onClick={() => openPanel('posting-profile-form')}
            >
              <Plus size={16} /> Create First Profile
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {profiles.map((profile) => (
              <div key={profile.id} className="card p-5 group hover:border-primary/30 transition-all border-white/10 bg-white/[0.02]">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${profile.is_default ? 'bg-primary/20 text-primary' : 'bg-white/5 text-dark-400'}`}>
                      <Settings size={20} />
                    </div>
                    <div>
                      <h4 className="font-medium text-white group-hover:text-primary transition-colors">{profile.name}</h4>
                      {profile.is_default && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <CheckCircle2 size={10} className="text-emerald-400" />
                          <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Active System Default</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => openPanel('posting-profile-form', { profile })}
                      className="p-2 rounded-lg bg-white/5 text-dark-400 hover:text-white hover:bg-white/10"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button 
                      onClick={() => handleDelete(profile.id)}
                      className="p-2 rounded-lg bg-white/5 text-dark-400 hover:text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 mt-6 pt-4 border-t border-white/5">
                  <div className="flex justify-between text-[10px] uppercase font-bold tracking-wider">
                    <span className="text-dark-400">AP Control</span>
                    <span className="text-white font-mono">{profile.accounts_payable?.code || profile.accounts_payable || '---'}</span>
                  </div>
                  <div className="flex justify-between text-[10px] uppercase font-bold tracking-wider">
                    <span className="text-dark-400">AR Control</span>
                    <span className="text-white font-mono">{profile.accounts_receivable?.code || profile.accounts_receivable || '---'}</span>
                  </div>
                  <div className="flex justify-between text-[10px] uppercase font-bold tracking-wider">
                    <span className="text-dark-400">Main Bank</span>
                    <span className="text-white font-mono">{profile.bank_main?.code || profile.bank_main || '---'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
