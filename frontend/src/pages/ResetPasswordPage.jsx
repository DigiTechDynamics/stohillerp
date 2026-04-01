import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { authAPI } from '@/services/api'
import toast from 'react-hot-toast'
import { AlertCircle, Lock, Eye, EyeOff, CheckCircle } from 'lucide-react'
import logo from '@/assets/logo.png'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const uid = searchParams.get('uid')
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Verify token presence
  useEffect(() => {
    if (!uid || !token) {
      setError('Invalid or expired password reset link.')
    }
  }, [uid, token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    setLoading(true)
    setError('')
    
    try {
      await authAPI.resetPassword(uid, token, password)
      setSuccess(true)
      toast.success('Password updated successfully!')
      
      // Auto redirect after 3s
      setTimeout(() => {
        navigate('/login')
      }, 3000)
    } catch (err) {
      const resp = err?.response?.data
      const msg = resp?.error || resp?.detail || 'An error occurred while resetting your password.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4 relative overflow-hidden font-body">
      <div className="absolute inset-0 grid-bg opacity-30" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative w-full max-w-[420px] z-10"
      >
        <div className="flex flex-col items-center">
          
          <div className="w-24 h-24 rounded-full bg-dark-800 border border-dark-600 dark:border-white/10 flex items-center justify-center shadow-lg mb-8 backdrop-blur-md">
            <img src={logo} alt="Stohill Logo" className="w-14 h-14 object-contain" />
          </div>

          <h1 className="text-xl font-light tracking-[0.15em] text-dark-100 uppercase mb-4 text-center">
            Set New Password
          </h1>

          <p className="text-sm text-dark-400 text-center mb-10 w-4/5">
            Create a new, strong password for your Stohill account.
          </p>

          <div className="w-full">
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="flex items-center gap-2 p-3 rounded bg-red-500/10 border border-red-500/20 mb-6"
              >
                <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-500">{error}</p>
              </motion.div>
            )}

            {success ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-emerald-500/10 border border-emerald-500/30 p-6 rounded text-center flex flex-col items-center"
              >
                <CheckCircle size={40} className="text-emerald-500 mb-4" strokeWidth={1.5} />
                <h3 className="text-emerald-500 font-medium mb-2">Password Updated</h3>
                <p className="text-sm text-dark-400 mb-6">
                  Your password has been successfully reset. Redirecting you to login...
                </p>
                <Link to="/login" className="btn-primary">
                  Go to Login Now
                </Link>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                
                {/* New Password */}
                <div className="relative">
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 text-dark-400">
                    <Lock size={20} strokeWidth={1.5} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent border-t-0 border-r-0 border-l-0 border-b border-dark-300 dark:border-white/20 pl-10 pr-12 py-3 text-dark-100 placeholder:text-dark-400 focus:ring-0 focus:border-primary transition-colors duration-300 outline-none"
                    placeholder="New Password"
                    required
                    autoFocus
                    disabled={!uid || !token}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-100 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} strokeWidth={1.5} /> : <Eye size={18} strokeWidth={1.5} />}
                  </button>
                </div>

                {/* Confirm Password */}
                <div className="relative mt-4">
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 text-dark-400">
                    <Lock size={20} strokeWidth={1.5} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-transparent border-t-0 border-r-0 border-l-0 border-b border-dark-300 dark:border-white/20 pl-10 pr-12 py-3 text-dark-100 placeholder:text-dark-400 focus:ring-0 focus:border-primary transition-colors duration-300 outline-none"
                    placeholder="Confirm Password"
                    required
                    disabled={!uid || !token}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !uid || !token}
                  className="btn-primary text-white w-full justify-center mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Updating...' : 'Reset Password'}
                </button>

              </form>
            )}
          </div>

        </div>
      </motion.div>
    </div>
  )
}
