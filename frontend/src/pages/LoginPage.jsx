// Stohill Properties - Login Page
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { authAPI } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { homePathFor, isPortalUser } from '@/utils/portal'
import toast from 'react-hot-toast'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'
import BrandLogo from '@/components/common/BrandLogo'

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      // 1. Authenticate and get tokens
      const loginRes = await authAPI.login(email, password)
      const { access, refresh } = loginRes.data
      
      // 2. Set temporary tokens so we can fetch user info
      setAuth(null, access, refresh)
      
      // 3. Fetch user profile
      const userRes = await authAPI.me()
      const userData = userRes.data
      
      // 4. Save full auth state
      setAuth(userData, access, refresh)
      
      toast.success(`Welcome${isPortalUser(userData) ? '' : ' back'}, ${userData.first_name || 'Admin'}!`)
      navigate(homePathFor(userData))
    } catch (err) {
      const resp = err?.response?.data
      const msg = resp?.error?.message?.detail || resp?.error?.message || resp?.detail || 'Invalid credentials. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-50" />
      <div className="absolute inset-0 bg-gradient-radial from-primary/5 via-transparent to-transparent" />

      <div className="absolute top-1/4 right-1/4 w-96 h-96 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-80 h-80 rounded-full bg-primary/3 blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative w-full max-w-md"
      >
        <div className="bg-dark-900 border border-white/8 rounded-2xl p-8 shadow-dark">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center shadow-lg border border-white/5">
              <BrandLogo className="w-9 h-9" />
            </div>
            <div>
              <h1 className="font-display text-2xl text-white leading-none">Stohill Properties</h1>
              <p className="text-xs text-primary/70 tracking-[0.2em] uppercase font-body mt-0.5">
                ERP Platform
              </p>
            </div>
          </div>

          <h2 className="text-xl font-semibold text-white mb-1">Sign in to your workspace</h2>
          <p className="text-sm text-dark-400 mb-6">Property Command Center</p>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4"
            >
              <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </motion.div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input"
                placeholder="you@stohill.co.za"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="form-label">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-input pr-10"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-3 mt-2"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-dark-600 mt-4">
          © 2026 Stohill Properties. All rights reserved.
        </p>
      </motion.div>
    </div>
  )
}
