// Outside services: is email, SMS and online payment actually connected?
// Shows what to configure and lets an administrator send a test message.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, AlertTriangle, Info, Send, Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { adminAPI, apiErrorMessage } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'

function TestSend({ kind }) {
  const user = useAuthStore((s) => s.user)
  const [to, setTo] = useState(kind === 'email' ? user?.email || '' : '')
  const [busy, setBusy] = useState(false)
  const send = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const { data } = await (kind === 'email' ? adminAPI.integrations.testEmail(to) : adminAPI.integrations.testSms(to))
      if (data.status === 'sent') toast.success(`Test ${kind === 'email' ? 'email' : 'SMS'} sent to ${data.recipient}.`)
      else if (data.status === 'logged') toast(`Recorded but not sent: no ${kind === 'email' ? 'mail server' : 'SMS gateway'} is configured.`)
      else toast.error(data.error || `The test ${kind} failed.`)
    } catch (err) {
      toast.error(apiErrorMessage(err, `The test ${kind} failed.`))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={send} className="flex gap-2 mt-3">
      <input className="form-input text-xs" required value={to} onChange={(e) => setTo(e.target.value)}
        aria-label={kind === 'email' ? 'Test email address' : 'Test mobile number'}
        placeholder={kind === 'email' ? 'name@example.com' : '+263771234567'} type={kind === 'email' ? 'email' : 'tel'} />
      <button type="submit" className="btn-secondary text-xs whitespace-nowrap" disabled={busy}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send test
      </button>
    </form>
  )
}

export default function IntegrationsView() {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => (await adminAPI.integrations.list()).data,
  })
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" /></div>

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {items.map((item) => {
        const Icon = item.manual ? Info : item.configured ? CheckCircle2 : AlertTriangle
        const tone = item.manual ? 'text-sky-400' : item.configured ? 'text-emerald-400' : 'text-amber-400'
        return (
          <div key={item.key} className="card p-5">
            <div className="flex items-start gap-3">
              <Icon size={20} className={`${tone} flex-shrink-0 mt-0.5`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white">{item.name}</h3>
                  <span className={`text-[10px] uppercase font-bold ${tone}`}>
                    {item.manual ? 'Manual process' : item.configured ? 'Connected' : 'Not configured'}
                  </span>
                </div>
                <p className="text-sm text-dark-300 mt-1">{item.detail}</p>
                {(!item.configured || item.manual) && <p className="text-xs text-dark-500 mt-2">{item.how}</p>}
                {item.testable && <TestSend kind={item.key} />}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
