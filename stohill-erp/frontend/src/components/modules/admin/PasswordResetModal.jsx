import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Key, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react'
import { adminAPI } from '@/services/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export default function PasswordResetModal({ user, isOpen, onClose }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (data) => adminAPI.users.setPassword(user.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-users'])
      onClose()
      setPassword('')
      setConfirmPassword('')
    },
    onError: (err) => {
      setError(err.response?.data?.non_field_errors?.[0] || 'Failed to update password')
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    
    if (password.length < 8) {
      setError('Password must be at least 8 characters long')
      return
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    mutation.mutate({ password, password_confirm: confirmPassword })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm"
      />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-md bg-dark-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-dark-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Key size={20} />
            </div>
            <div>
              <h3 className="text-white font-medium">Set User Password</h3>
              <p className="text-xs text-dark-400">Updating access for {user?.full_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-dark-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center gap-3 text-rose-400 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-medium text-dark-300">New Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input w-full"
              placeholder="Minimum 8 characters"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-dark-300">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="form-input w-full"
              placeholder="Must match new password"
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {mutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ShieldCheck size={16} />
              )}
              Set Password
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
