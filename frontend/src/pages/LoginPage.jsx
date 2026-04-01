import { useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from 'framer-motion'
import { authAPI } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import toast from 'react-hot-toast'
import { AlertCircle, Eye, EyeOff, Mail, Lock, Loader2, ArrowRight } from 'lucide-react'
import logo from '@/assets/logo.png'

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [email, setEmail] = useState('admin@stohill.co.za')
  const [password, setPassword] = useState('admin123!')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [focusedField, setFocusedField] = useState(null)

  // Perspective Tilt Effect
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const mouseXSpring = useSpring(x)
  const mouseYSpring = useSpring(y)
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ['5deg', '-5deg'])
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ['-5deg', '5deg'])

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const xPct = mouseX / width - 0.5
    const yPct = mouseY / height - 0.5
    x.set(xPct)
    y.set(yPct)
  }

  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const loginRes = await authAPI.login(email, password)
      const { access, refresh } = loginRes.data
      
      setAuth(null, access, refresh, rememberMe)
      const userRes = await authAPI.me()
      const userData = userRes.data
      
      setAuth(userData, access, refresh, rememberMe)
      sessionStorage.setItem('stohill_session_active', 'true')
      
      toast.success(`Welcome back, ${userData.first_name || 'Admin'}!`)
      navigate('/dashboard')
    } catch (err) {
      const resp = err?.response?.data
      const msg = resp?.error?.message?.detail || resp?.error?.message || resp?.detail || 'Invalid credentials. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // Animation Variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] }
    }
  }

  return (
    <div 
      id="stohill-login-ui"
      className="min-h-screen bg-dark-950 flex items-center justify-center p-4 relative overflow-hidden font-body selection:bg-primary/30"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Premium Background Layer */}
      <div className="absolute inset-0 grid-bg opacity-20 pointer-events-none" />
      
      {/* Migrating Animated Blobs - Premium Mesh Effect */}
      <motion.div 
        animate={{ 
          x: [0, 100, -50, 0],
          y: [0, -50, 100, 0],
          scale: [1, 1.2, 0.9, 1]
        }}
        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px] pointer-events-none" 
      />
      <motion.div 
        animate={{ 
          x: [0, -80, 60, 0],
          y: [0, 120, -40, 0],
          scale: [1, 0.8, 1.1, 1]
        }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
        className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[150px] pointer-events-none" 
      />

      <motion.div
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative w-full max-w-[440px] z-10"
      >
        <div className="flex flex-col items-center">
          
          {/* Logo Section with Pulsing Ring */}
          <motion.div 
            variants={itemVariants}
            className="relative mb-8"
          >
            <motion.div 
              animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.5, 0.3] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-[-15px] rounded-full border border-primary/20 pointer-events-none"
            />
            <div className="w-28 h-28 rounded-full bg-dark-900 border border-white/5 flex items-center justify-center shadow-2xl backdrop-blur-xl relative z-10 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
              <img src={logo} alt="Stohill Logo" className="w-16 h-16 object-contain" />
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="text-center mb-10">
            <h1 className="text-2xl font-light tracking-[0.2em] text-white uppercase leading-none">
              Stohill <span className="font-semibold text-primary">Properties</span>
            </h1>
            <p className="text-[10px] text-dark-500 uppercase tracking-[0.4em] mt-3 font-medium opacity-60">
              Enterprise Resource Platform
            </p>
          </motion.div>

          <motion.div variants={itemVariants} className="w-full">
            <div className="bg-dark-900/40 border border-white/5 p-8 rounded-3xl backdrop-blur-2xl shadow-dark relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
              
              <AnimatePresence mode="wait">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -10, height: 0 }}
                    className="flex items-center gap-3 p-4 rounded-xl bg-red-500/5 border border-red-500/20 mb-6"
                  >
                    <AlertCircle size={18} className="text-red-500 flex-shrink-0" />
                    <p className="text-xs text-red-500 font-medium">{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={handleLogin} className="space-y-6">
                
                {/* Email Input */}
                <div className="relative group/field">
                  <div className={`absolute left-0 top-1/3 transition-colors duration-300 ${focusedField === 'email' ? 'text-primary' : 'text-dark-500'}`}>
                    <Mail size={18} strokeWidth={1.5} />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-transparent border-b border-white/10 pl-8 pr-4 py-3 text-sm text-white placeholder:text-dark-600 focus:placeholder:text-dark-500 transition-all duration-300 outline-none"
                    placeholder="E-mail Address"
                    required
                  />
                  {/* Expanding Underline */}
                  <motion.div 
                    initial={false}
                    animate={{ scaleX: focusedField === 'email' ? 1 : 0 }}
                    className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-primary origin-left transition-transform duration-500"
                  />
                </div>

                {/* Password Input */}
                <div className="relative group/field">
                  <div className={`absolute left-0 top-1/3 transition-colors duration-300 ${focusedField === 'password' ? 'text-primary' : 'text-dark-500'}`}>
                    <Lock size={18} strokeWidth={1.5} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent border-b border-white/10 pl-8 pr-12 py-3 text-sm text-white placeholder:text-dark-600 focus:placeholder:text-dark-500 transition-all duration-300 outline-none"
                    placeholder="Access Code"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-0 top-1/3 text-dark-500 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                  </button>
                  {/* Expanding Underline */}
                  <motion.div 
                    initial={false}
                    animate={{ scaleX: focusedField === 'password' ? 1 : 0 }}
                    className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-primary origin-left transition-transform duration-500"
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] pt-4">
                  <label className="flex items-center gap-2 cursor-pointer group/check">
                    <div className={`relative flex items-center justify-center w-4 h-4 rounded border transition-all duration-300 ${rememberMe ? 'bg-primary border-primary' : 'border-white/20 bg-transparent group-hover/check:border-primary/50'}`}>
                      <input
                        type="checkbox"
                        className="opacity-0 absolute inset-0 cursor-pointer"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                      />
                      {rememberMe && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-1.5 h-1.5 bg-dark-900 rounded-[2px]"
                        />
                      )}
                    </div>
                    <span className="text-dark-500 group-hover/check:text-dark-300 transition-colors uppercase tracking-wider font-bold">Keep me signed in</span>
                  </label>
                  
                  <Link to="/forgot-password" title="Recover Access" className="text-dark-600 hover:text-primary transition-colors font-semibold uppercase tracking-wider border-b border-transparent hover:border-primary/30 pb-0.5">
                    Trouble Logging in?
                  </Link>
                </div>

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary text-dark-950 h-12 rounded-2xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-3 shadow-gold hover:bg-primary-hover active:shadow-none disabled:opacity-50 disabled:grayscale transition-all"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Validating...
                    </>
                  ) : (
                    <>
                      Secure Login
                      <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </motion.button>

              </form>
            </div>
          </motion.div>

          <motion.p 
            variants={itemVariants}
            className="mt-12 text-[10px] text-dark-600 uppercase tracking-[0.2em] font-medium"
          >
            &copy; {new Date().getFullYear()} Stohill Properties. All rights reserved.
          </motion.p>
        </div>
      </motion.div>
    </div>
  )
}
