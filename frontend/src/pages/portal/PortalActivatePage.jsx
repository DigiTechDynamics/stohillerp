// Public page from the tenant's invitation email: choose a password.
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authAPI, apiErrorMessage } from '@/services/api'
import BrandLogo from '@/components/common/BrandLogo'

export default function PortalActivatePage() {
  const [params] = useSearchParams()
  const uid = params.get('uid') || ''
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('The passwords do not match.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await authAPI.portalActivate({ uid, token, password })
      setDone(true)
    } catch (err) {
      setError(apiErrorMessage(err, 'This link is not valid.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4">
      <div className="card p-8 w-full max-w-md space-y-5">
        <div className="flex items-center gap-3">
          <BrandLogo className="w-10 h-10" />
          <div>
            <p className="font-display text-white text-lg leading-none">Stohill Properties</p>
            <p className="text-[10px] text-primary/70 uppercase tracking-[0.15em]">Tenant portal</p>
          </div>
        </div>
        {!uid || !token ? (
          <p className="text-dark-300 text-sm">This activation link is incomplete. Open the link from your invitation email again.</p>
        ) : done ? (
          <div className="space-y-4">
            <p className="text-white">Your account is ready.</p>
            <Link to="/login" className="btn-primary inline-flex">Sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-dark-300 text-sm">Choose a password to view your invoices, pay online and log maintenance requests.</p>
            <input type="password" className="form-input w-full" placeholder="New password" aria-label="New password" autoComplete="new-password"
              required value={password} onChange={e => setPassword(e.target.value)} />
            <input type="password" className="form-input w-full" placeholder="Confirm password" aria-label="Confirm password" autoComplete="new-password"
              required value={confirm} onChange={e => setConfirm(e.target.value)} />
            {error && <p className="text-rose-400 text-sm" role="alert">{error}</p>}
            <button className="btn-primary w-full" disabled={busy}>{busy ? 'Activating...' : 'Activate account'}</button>
          </form>
        )}
      </div>
    </div>
  )
}
