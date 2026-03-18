import { useState, useEffect } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { Upload, FileText, CheckCircle, AlertCircle, RefreshCw, Landmark } from 'lucide-react'
import { bankingAPI, documentsAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'

export default function StatementUploadForm() {
  const queryClient = useQueryClient()
  const { closeSidePanel, sidePanelData } = useUIStore()
  const initialAccount = sidePanelData?.account
  
  const { data: accountsRaw } = useQuery({
    queryKey: ['banking-accounts-minimal'],
    queryFn: () => bankingAPI.accounts.list(),
    enabled: !initialAccount
  })
  const accounts = accountsRaw?.data?.results || []

  const [selectedAccount, setSelectedAccount] = useState(initialAccount || null)
  const [file, setFile] = useState(null)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('upload') // upload, processing, complete

  useEffect(() => {
    if (initialAccount) setSelectedAccount(initialAccount)
  }, [initialAccount])

  const uploadMutation = useMutation({
    mutationFn: async (formData) => {
      if (!selectedAccount) throw new Error('No bank account selected')

      // 1. Upload the file to documents API
      const docResp = await documentsAPI.upload(formData)
      const docId = docResp.data.id

      // 2. Create the statement record linked to the document
      const stmtResp = await bankingAPI.statements.create({
        bank_account: selectedAccount.id,
        reference: `Upload-${new Date().toISOString().split('T')[0]}`,
        statement_date: new Date().toISOString().split('T')[0],
        opening_balance: selectedAccount.current_balance,
        closing_balance: selectedAccount.current_balance, // Should be updated after parsing
        document: docId
      })

      // 3. Trigger backend processing
      return bankingAPI.statements.process_statement(stmtResp.data.id)
    },
    onSuccess: () => {
      setStep('complete')
      queryClient.invalidateQueries({ queryKey: ['banking-statements'] })
      queryClient.invalidateQueries({ queryKey: ['banking-accounts'] })
    },
    onError: (err) => {
      setError(err.response?.data?.detail || 'Failed to upload and process statement.')
      setStep('upload')
    }
  })

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    if (selectedFile) {
      setFile(selectedFile)
      setError(null)
    }
  }

  const handleUpload = (e) => {
    e.preventDefault()
    if (!file) return setError('Please select a file first.')
    
    setStep('processing')
    const formData = new FormData()
    formData.append('file', file)
    formData.append('title', `Bank Statement - ${account.code} - ${new Date().toLocaleDateString()}`)
    formData.append('document_type', 'bank_statement')
    
    uploadMutation.mutate(formData)
  }

  return (
    <div className="p-6 flex flex-col h-full bg-dark-900">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-400 border border-amber-500/20">
          <Landmark size={24} />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Upload Statement</h3>
          <p className="text-xs text-dark-500">
            {selectedAccount ? `Importing for ${selectedAccount.bank_name}` : 'Select a bank account to proceed'}
          </p>
        </div>
      </div>

      {!initialAccount && step === 'upload' && (
        <div className="mb-6 space-y-2">
          <label className="text-[10px] font-bold text-dark-400 uppercase tracking-widest">Select Bank Account</label>
          <select 
            className="form-input w-full"
            value={selectedAccount?.id || ''}
            onChange={(e) => {
              const acc = accounts.find(a => a.id === e.target.value)
              setSelectedAccount(acc)
            }}
          >
            <option value="" disabled>Choose an account...</option>
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.bank_name} - {acc.account_number}</option>
            ))}
          </select>
        </div>
      )}

      {step === 'upload' && (
        <form onSubmit={handleUpload} className="space-y-6 flex-1">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2">
              <AlertCircle size={14} className="flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="relative group">
            <input 
              type="file" 
              accept=".csv,.ofx,.qif"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className={`
              border-2 border-dashed rounded-2xl p-12 text-center transition-all
              ${file ? 'border-primary/50 bg-primary/5' : 'border-white/5 hover:border-white/10 bg-dark-800/50'}
            `}>
              <div className="w-16 h-16 rounded-2xl bg-dark-700 mx-auto mb-4 flex items-center justify-center text-dark-400 group-hover:text-primary transition-colors">
                {file ? <FileText size={32} className="text-primary" /> : <Upload size={32} />}
              </div>
              <p className="text-sm font-medium text-white mb-1">
                {file ? file.name : 'Click or drag to upload'}
              </p>
              <p className="text-xs text-dark-500">Supports .CSV, .OFX, .QIF (Max 10MB)</p>
            </div>
          </div>

          <div className="bg-dark-800/50 rounded-xl p-4 border border-white/5">
            <h4 className="text-[10px] font-bold text-dark-400 uppercase tracking-widest mb-3">Tips for successful import</h4>
            <ul className="space-y-2">
              <li className="text-[11px] text-dark-500 flex gap-2">
                <span className="text-primary">•</span> Ensure dates are in YYYY-MM-DD format
              </li>
              <li className="text-[11px] text-dark-500 flex gap-2">
                <span className="text-primary">•</span> Amount column should include positive and negative values
              </li>
            </ul>
          </div>

          <button 
            type="submit" 
            disabled={!file}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2 mt-auto"
          >
            <Upload size={18} /> Start Import
          </button>
        </form>
      )}

      {step === 'processing' && (
        <div className="flex flex-col items-center justify-center flex-1 py-12 text-center">
          <div className="w-20 h-20 rounded-full border-4 border-primary/20 border-t-primary animate-spin mb-6" />
          <h4 className="text-lg font-medium text-white mb-2">Processing Statement</h4>
          <p className="text-sm text-dark-400 max-w-xs">
            We are parsing your file and matching it against the chart of accounts. This usually takes a few seconds...
          </p>
        </div>
      )}

      {step === 'complete' && (
        <div className="flex flex-col items-center justify-center flex-1 py-12 text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 mb-6 border border-emerald-500/20">
            <CheckCircle size={40} />
          </div>
          <h4 className="text-lg font-medium text-white mb-2">Import Successful!</h4>
          <p className="text-sm text-dark-400 mb-8 max-w-xs">
            Your bank statement has been uploaded and processed. You can now start the reconciliation process.
          </p>
          <button 
            onClick={closeSidePanel} 
            className="w-full btn-primary py-3"
          >
            Done
          </button>
        </div>
      )}
    </div>
  )
}
