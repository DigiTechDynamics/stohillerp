import { useState, useEffect } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { Upload, FileText, CheckCircle, AlertCircle, Landmark } from 'lucide-react'
import { bankingAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'

// Imports a CSV bank statement for one account. The server parses it
// (date, description, reference and either amount or debit/credit columns),
// skips lines already imported and returns the new statement.
export default function StatementUploadForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel, sidePanelData } = useUIStore()
  const initialAccount = sidePanelData?.account

  const { data: accountsRaw } = useQuery({
    queryKey: ['banking-accounts-minimal'],
    queryFn: () => bankingAPI.accounts.list({ page_size: 200 }),
    enabled: !initialAccount,
  })
  const accounts = accountsRaw?.data?.results || []

  const [selectedAccount, setSelectedAccount] = useState(initialAccount || null)
  const [file, setFile] = useState(null)
  const [openingBalance, setOpeningBalance] = useState('')
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (initialAccount) setSelectedAccount(initialAccount)
  }, [initialAccount])

  const uploadMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData()
      formData.append('bank_account', selectedAccount.id)
      formData.append('file', file)
      if (openingBalance !== '') formData.append('opening_balance', openingBalance)
      return bankingAPI.statements.import(formData)
    },
    onSuccess: ({ data }) => {
      setResult(data)
      queryClient.invalidateQueries({ queryKey: ['banking-statements'] })
      queryClient.invalidateQueries({ queryKey: ['banking-accounts'] })
    },
    onError: (err) => {
      const message = err.response?.data?.error?.message
      setError(typeof message === 'string' ? message : message?.detail || JSON.stringify(message) || 'Import failed.')
    },
  })

  const handleUpload = (e) => {
    e.preventDefault()
    if (!selectedAccount) return setError('Choose the bank account first.')
    if (!file) return setError('Please select a file first.')
    setError(null)
    uploadMutation.mutate()
  }

  return (
    <div className="p-6 flex flex-col h-full bg-dark-900">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-400 border border-amber-500/20">
          <Landmark size={24} />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Import Statement</h3>
          <p className="text-xs text-dark-500">
            {selectedAccount ? `Importing for ${selectedAccount.bank_name} ${selectedAccount.account_number}` : 'Select a bank account to proceed'}
          </p>
        </div>
      </div>

      {result ? (
        <div className="flex flex-col items-center justify-center flex-1 py-12 text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 mb-6 border border-emerald-500/20">
            <CheckCircle size={40} />
          </div>
          <h4 className="text-lg font-medium text-white mb-2">Statement imported</h4>
          <p className="text-sm text-dark-400 mb-8 max-w-xs">
            {result.lines.length} new line(s)
            {result.skipped_duplicates ? `, ${result.skipped_duplicates} already imported and skipped` : ''}.
            Closing balance {result.closing_balance}. Run auto-match or match lines in the reconciliation workspace.
          </p>
          <button onClick={closeSidePanel} className="w-full btn-primary py-3">Done</button>
        </div>
      ) : (
        <form onSubmit={handleUpload} className="space-y-6 flex-1">
          {!initialAccount && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Bank Account</label>
              <select
                className="form-input w-full"
                value={selectedAccount?.id || ''}
                onChange={(e) => setSelectedAccount(accounts.find(a => a.id === e.target.value) || null)}
              >
                <option value="" disabled>Choose an account...</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.bank_name} - {acc.account_number}</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2">
              <AlertCircle size={14} className="flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="relative group">
            <input
              type="file"
              accept=".csv"
              aria-label="Statement file"
              onChange={(e) => { setFile(e.target.files[0] || null); setError(null) }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all ${file ? 'border-primary/50 bg-primary/5' : 'border-white/5 hover:border-white/10 bg-dark-800/50'}`}>
              <div className="w-16 h-16 rounded-2xl bg-dark-700 mx-auto mb-4 flex items-center justify-center text-dark-400 group-hover:text-primary transition-colors">
                {file ? <FileText size={32} className="text-primary" /> : <Upload size={32} />}
              </div>
              <p className="text-sm font-medium text-white mb-1">{file ? file.name : 'Click or drag to upload'}</p>
              <p className="text-xs text-dark-500">CSV export from your bank (max 10MB)</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Opening balance (optional)</label>
            <input
              type="number" step="0.01" className="form-input w-full" value={openingBalance}
              placeholder="Defaults to the previous statement's closing balance"
              onChange={(e) => setOpeningBalance(e.target.value)}
            />
          </div>

          <div className="bg-dark-800/50 rounded-xl p-4 border border-white/5">
            <h4 className="text-[10px] font-bold text-dark-400 uppercase tracking-widest mb-3">File format</h4>
            <ul className="space-y-1 text-[11px] text-dark-500">
              <li>Columns: date, description, reference, and amount (money in positive, out negative)</li>
              <li>or debit (money out) and credit (money in) columns instead of amount</li>
              <li>Dates as YYYY-MM-DD or DD/MM/YYYY; re-importing overlapping lines is safe</li>
            </ul>
          </div>

          <button type="submit" disabled={!file || uploadMutation.isPending}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2 mt-auto">
            <Upload size={18} /> {uploadMutation.isPending ? 'Importing...' : 'Import statement'}
          </button>
        </form>
      )}
    </div>
  )
}
