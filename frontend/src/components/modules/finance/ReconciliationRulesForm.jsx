import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Save, Trash2, CheckCircle, AlertCircle, Wand2, Filter } from 'lucide-react'
import { bankingAPI, financeAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'

export default function ReconciliationRulesForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel } = useUIStore()
  const [error, setError] = useState(null)

  const { data: rulesData, isLoading } = useQuery({
    queryKey: ['reconciliation-rules'],
    queryFn: () => bankingAPI.rules.list() // Need to ensure bankingAPI.rules exists in api.js
  })
  const rules = rulesData?.data?.results || []

  const { data: accountsData } = useQuery({
    queryKey: ['finance-accounts-all'],
    queryFn: () => financeAPI.accounts.list()
  })
  const glAccounts = accountsData?.data?.results || []

  const [newRule, setNewRule] = useState({
    name: '',
    rule_type: 'exact_match',
    match_keyword: '',
    auto_post: false,
    target_account: '',
    is_active: true,
    priority: 10
  })

  // Since bankingAPI.rules might be missing in api.js, I should probably add it there too.
  // Assuming it's there for this component logic:
  const createMutation = useMutation({
    mutationFn: (data) => bankingAPI.rules.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-rules'] })
      setNewRule({
        name: '',
        rule_type: 'exact_match',
        match_keyword: '',
        auto_post: false,
        target_account: '',
        is_active: true,
        priority: 10
      })
    },
    onError: () => setError('Failed to save rule.')
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => bankingAPI.rules.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reconciliation-rules'] })
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    createMutation.mutate(newRule)
  }

  return (
    <div className="p-6 flex flex-col h-full bg-dark-900 overflow-y-auto custom-scrollbar">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
          <Wand2 size={24} />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Reconciliation Rules</h3>
          <p className="text-xs text-dark-500">Define logic for automated ledger matching.</p>
        </div>
      </div>

      {/* active rules list */}
      <div className="space-y-4 mb-10">
        <h4 className="text-[10px] font-bold text-dark-400 uppercase tracking-widest px-1">Active Rules</h4>
        {rules.map(rule => (
          <div key={rule.id} className="card p-4 flex items-center justify-between group hover:border-primary/30 transition-all">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${rule.is_active ? 'bg-primary/10 text-primary' : 'bg-dark-700 text-dark-500'}`}>
                <Filter size={16} />
              </div>
              <div>
                <p className="text-sm font-medium text-white">{rule.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-dark-500 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                    {rule.rule_type.replace('_', ' ').toUpperCase()}
                  </span>
                  {rule.auto_post && (
                    <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-tighter flex items-center gap-1">
                      <CheckCircle size={8} /> Auto-Post
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button 
              onClick={() => deleteMutation.mutate(rule.id)}
              className="p-2 text-dark-500 hover:text-rose-500 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {rules.length === 0 && !isLoading && (
          <div className="p-10 text-center border border-dashed border-white/5 rounded-2xl text-dark-500 text-xs italic">
            No rules defined yet. Use the form below to add one.
          </div>
        )}
      </div>

      {/* New Rule form */}
      <div className="card p-6 bg-dark-800/30 border-primary/10">
        <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest mb-6 flex items-center gap-2">
          <Plus size={12} /> Create New Rule
        </h4>
        
        <form onSubmit={handleSubmit} className="space-y-5 text-left">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2">
              <AlertCircle size={14} className="flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Rule Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Bank Fees Auto-Post"
              value={newRule.name}
              onChange={e => setNewRule({...newRule, name: e.target.value})}
              className="form-input w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Match Type</label>
              <select 
                value={newRule.rule_type}
                onChange={e => setNewRule({...newRule, rule_type: e.target.value})}
                className="form-input w-full"
              >
                <option value="exact_match">Exact Match</option>
                <option value="keyword_match">Keyword Match</option>
                <option value="date_amount_match">Date + Amount</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Keyword / Value</label>
              <input
                type="text"
                placeholder="Search text..."
                value={newRule.match_keyword}
                onChange={e => setNewRule({...newRule, match_keyword: e.target.value})}
                className="form-input w-full"
              />
            </div>
          </div>

          <div className="p-4 bg-dark-900/50 rounded-xl border border-white/5 space-y-4">
            <label className="flex items-center justify-between group cursor-pointer">
              <span className="text-xs text-dark-300 group-hover:text-white transition-colors">Automate Posting</span>
              <div className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={newRule.auto_post}
                  onChange={e => setNewRule({...newRule, auto_post: e.target.checked})}
                  className="sr-only peer" 
                />
                <div className="w-9 h-5 bg-dark-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </div>
            </label>

            {newRule.auto_post && (
              <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Target GL Account</label>
                <select 
                  required
                  value={newRule.target_account}
                  onChange={e => setNewRule({...newRule, target_account: e.target.value})}
                  className="form-input w-full"
                >
                  <option value="">Select Account</option>
                  {glAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <button 
            type="submit" 
            disabled={createMutation.isPending || !newRule.name}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2"
          >
            {createMutation.isPending ? 'Saving...' : <><Save size={18} /> Add Rule</>}
          </button>
        </form>
      </div>

      <div className="mt-8 pt-6 border-t border-white/5 flex gap-3">
        <button onClick={closeSidePanel} className="flex-1 btn-secondary py-3">
          Done
        </button>
      </div>
    </div>
  )
}
