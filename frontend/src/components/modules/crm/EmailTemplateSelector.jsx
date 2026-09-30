// Stohill Properties - Email Template Selector
// Used inside ActivityForm when activity type = 'email'
import { useQuery } from '@tanstack/react-query'
import { Mail, Loader2 } from 'lucide-react'
import { crmAPI } from '@/services/api'

export default function EmailTemplateSelector({ value, onChange, onBodySelect }) {
  const { data, isLoading } = useQuery({
    queryKey: ['crm-email-templates'],
    queryFn: () => crmAPI.emailTemplates.list()
  })

  const templates = data?.data?.results || data?.data || []

  const handleSelect = (e) => {
    const templateId = e.target.value
    onChange(templateId)
    if (onBodySelect && templateId) {
      const template = templates.find(t => String(t.id) === String(templateId))
      if (template) {
        onBodySelect(template.subject, template.body)
      }
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-dark-600 text-xs">
        <Loader2 size={12} className="animate-spin" />
        <span>Loading templates...</span>
      </div>
    )
  }

  if (templates.length === 0) return null

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-dark-500 uppercase tracking-widest flex items-center gap-1.5">
        <Mail size={11} /> Email Template
      </label>
      <select
        value={value}
        onChange={handleSelect}
        className="form-input w-full text-xs h-10 pr-8"
      >
        <option value="">— No template / write manually —</option>
        {templates.map(t => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      {value && templates.find(t => String(t.id) === String(value)) && (
        <p className="text-[10px] text-dark-500 italic pl-1">
          Subject: {templates.find(t => String(t.id) === String(value))?.subject}
        </p>
      )}
    </div>
  )
}
