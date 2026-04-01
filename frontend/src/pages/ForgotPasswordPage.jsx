import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { authAPI } from '@/services/api'
import toast from 'react-hot-toast'
import { AlertCircle, Mail, ArrowLeft } from 'lucide-react'
import logo from '@/assets/logo.png'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await authAPI.forgotPassword(email)
      setSuccess(true)
      toast.success('Password reset link sent! Check your email.')
    } catch (err) {
      const resp = err?.response?.data
      const msg = resp?.error || resp?.detail || 'An error occurred. Please try again.'
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
            Recover Password
          </h1>

          <p className="text-sm text-dark-400 text-center mb-10 w-4/5">
            Enter your email ID below and we'll send you a link to reset your password.
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
                className="bg-emerald-500/10 border border-emerald-500/30 p-6 rounded text-center"
              >
                <h3 className="text-emerald-500 font-medium mb-2">Check your inbox</h3>
                <p className="text-sm text-dark-400 mb-6">
                  We've sent a password reset link to <br/>
                  <span className="font-semibold text-dark-100">{email}</span>
                </p>
                <Link to="/login" className="inline-flex items-center gap-2 text-primary hover:text-primary-hover transition-colors text-sm font-medium">
                  <ArrowLeft size={16} /> Back to Login
                </Link>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                
                <div className="relative">
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 text-dark-400">
                    <Mail size={20} strokeWidth={1.5} />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-transparent border-t-0 border-r-0 border-l-0 border-b border-dark-300 dark:border-white/20 pl-10 pr-4 py-3 text-dark-100 placeholder:text-dark-400 focus:ring-0 focus:border-primary transition-colors duration-300 outline-none"
                    placeholder="Email ID"
                    required
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary text-white w-full justify-center mt-6"
                >
                  {loading ? 'Sending Link...' : 'Send Reset Link'}
                </button>

                <div className="text-center pt-6">
                  <Link to="/login" className="text-sm text-dark-400 hover:text-dark-100 transition-colors uppercase tracking-wider">
                    Back to Login
                  </Link>
                </div>

              </form>
            )}
          </div>

        </div>
      </motion.div>
    </div>
  )
}
