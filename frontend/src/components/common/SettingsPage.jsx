// Shared frame for a module's settings: the option lists the module's forms pick from
// (types, categories, stages...). The open tab is kept in the URL (?tab=) so a link
// can point straight at one list, e.g. /properties/settings?tab=types.
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Settings2 } from 'lucide-react'
import { Tabs } from '@/pages/propman/common'

export function SettingsButton({ to, label = 'Settings' }) {
  return (
    <Link to={to} className="btn-secondary flex items-center gap-2" title="Set up the options this module uses">
      <Settings2 size={16} /> {label}
    </Link>
  )
}

export default function SettingsPage({ title, description, backTo, backLabel, tabs }) {
  const [params, setParams] = useSearchParams()
  const active = tabs.find((t) => t.id === params.get('tab')) || tabs[0]
  const choose = (id) => setParams((p) => { p.set('tab', id); return p }, { replace: true })

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div>
        {backTo && (
          <Link to={backTo} className="inline-flex items-center gap-1 text-xs text-dark-400 hover:text-white mb-2">
            <ArrowLeft size={12} /> {backLabel || 'Back'}
          </Link>
        )}
        <h1 className="font-display text-2xl text-white">{title}</h1>
        {description && <p className="text-dark-400 text-sm mt-1">{description}</p>}
      </div>
      <Tabs tabs={tabs} active={active.id} onChange={choose} />
      <div key={active.id}>{active.render()}</div>
    </div>
  )
}
