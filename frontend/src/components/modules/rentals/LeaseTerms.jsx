// Commercial lease terms: escalation (fixed / stepped / CPI), options and break
// clauses, guarantees, turnover rent, e-signature, debit order and custom fields.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { TrendingUp, Flag, ShieldCheck, BarChart3, PenLine, Landmark, SlidersHorizontal, Loader2 } from 'lucide-react'
import { rentalsAPI, propmanAPI } from '@/services/api'
import { formatDate } from '@/utils/format'
import CrudTable from '@/components/common/CrudTable'
import { act, Badge, money, label, rowsOf, useCustomFieldDefs } from '@/pages/propman/common'

function Section({ icon: Icon, title, children }) {
  return (
    <div className="space-y-2 bg-dark-800/50 border border-white/5 rounded-xl p-4">
      <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-2"><Icon size={12} /> {title}</h4>
      {children}
    </div>
  )
}

export default function LeaseTerms({ lease: initial }) {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['lease', initial.id], queryFn: () => rentalsAPI.leases.detail(initial.id) })
  const lease = data?.data || initial
  const currency = lease.currency_code
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['lease', lease.id] })
    queryClient.invalidateQueries({ queryKey: ['rental-leases'] })
    queryClient.invalidateQueries({ queryKey: ['rental-tenants'] })
    queryClient.invalidateQueries({ queryKey: ['rental-stats'] })
  }

  return (
    <div className="space-y-4">
      <Escalation lease={lease} onSaved={refresh} />
      {lease.escalation_type === 'stepped' && (
        <CrudTable compact label="step" queryKey={['escalation-steps']} api={propmanAPI.escalationSteps} params={{ lease: lease.id }}
          description="Each step sets a new rent or a % increase from its date."
          columns={[
            { key: 'effective_date', label: 'From', render: (r) => formatDate(r.effective_date) },
            { key: 'new_rent', label: 'Rent', render: (r) => (r.new_rent ? money(r.new_rent, currency) : `+${r.percent}%`) },
            { key: 'applied_on', label: 'Applied', render: (r) => (r.applied_on ? formatDate(r.applied_on) : 'Pending') },
          ]}
          fields={[
            { key: 'effective_date', label: 'Effective', type: 'date', required: true },
            { key: 'new_rent', label: 'New rent', type: 'number', nullable: true },
            { key: 'percent', label: 'or % increase', type: 'number', nullable: true },
          ]} />
      )}

      <Section icon={Flag} title="Options & break clauses">
        <CrudTable compact label="option" queryKey={['lease-options']} api={propmanAPI.leaseOptions} params={{ lease: lease.id }}
          columns={[
            { key: 'option_type', label: 'Option', render: (r) => label(r.option_type) },
            { key: 'notice_deadline', label: 'Notice by', render: (r) => formatDate(r.notice_deadline) },
            { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
          ]}
          rowActions={(r) => r.status === 'open' && (
            <>
              <button className="btn-ghost text-[10px] px-1" onClick={async () => { if (await act(propmanAPI.leaseOptions.decide(r.id, 'exercised'), 'Option exercised.')) queryClient.invalidateQueries({ queryKey: ['lease-options'] }) }}>Exercised</button>
              <button className="btn-ghost text-[10px] px-1" onClick={async () => { if (await act(propmanAPI.leaseOptions.decide(r.id, 'declined'), 'Option declined.')) queryClient.invalidateQueries({ queryKey: ['lease-options'] }) }}>Declined</button>
            </>
          )}
          fields={[
            { key: 'option_type', label: 'Type', type: 'select', required: true,
              options: [['renewal', 'Option to renew'], ['break', 'Break clause'], ['purchase', 'Option to purchase'], ['expansion', 'Option to expand']] },
            { key: 'notice_deadline', label: 'Notice deadline', type: 'date', required: true },
            { key: 'effective_date', label: 'Takes effect', type: 'date' },
            { key: 'term_months', label: 'Term (months)', type: 'number', nullable: true },
            { key: 'alert_days', label: 'Alert days before', type: 'number' },
            { key: 'terms', label: 'Terms', type: 'textarea', span: 2 },
          ]}
          defaults={{ option_type: 'renewal', alert_days: 90 }} />
      </Section>

      <Section icon={ShieldCheck} title="Guarantees & sureties">
        <CrudTable compact label="guarantee" queryKey={['guarantees']} api={propmanAPI.guarantees} params={{ lease: lease.id }}
          columns={[
            { key: 'guarantee_type', label: 'Type', render: (r) => label(r.guarantee_type) },
            { key: 'amount', label: 'Amount', render: (r) => money(r.amount, currency) },
            { key: 'expiry_date', label: 'Expires', render: (r) => formatDate(r.expiry_date) },
            { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
          ]}
          fields={[
            { key: 'guarantee_type', label: 'Type', type: 'select', required: true,
              options: [['bank_guarantee', 'Bank guarantee'], ['surety', 'Personal surety'], ['insurance', 'Deposit insurance'], ['other', 'Other']] },
            { key: 'provider', label: 'Provider / surety', required: true },
            { key: 'reference', label: 'Reference' },
            { key: 'amount', label: 'Amount', type: 'number', required: true },
            { key: 'issued_on', label: 'Issued', type: 'date' },
            { key: 'expiry_date', label: 'Expires', type: 'date' },
            { key: 'status', label: 'Status', type: 'select', options: [['held', 'Held'], ['returned', 'Returned'], ['called', 'Called up'], ['expired', 'Expired']] },
            { key: 'notes', label: 'Notes', type: 'textarea', span: 2 },
          ]}
          defaults={{ guarantee_type: 'bank_guarantee', status: 'held' }} />
      </Section>

      {parseFloat(lease.turnover_rent_percent || 0) > 0 && (
        <Section icon={BarChart3} title={`Turnover rent (${lease.turnover_rent_percent}% of sales)`}>
          <CrudTable compact label="turnover report" queryKey={['turnover']} api={propmanAPI.turnover} params={{ lease: lease.id }}
            description="Rent above the base rent is billed on the next invoice."
            columns={[
              { key: 'month', label: 'Month', render: (r) => formatDate(r.month) },
              { key: 'turnover', label: 'Turnover', render: (r) => money(r.turnover, currency) },
              { key: 'percentage_rent', label: '% rent', render: (r) => (r.billed_invoice_number ? money(r.percentage_rent, currency) : 'Not billed') },
            ]}
            fields={[
              { key: 'month', label: 'Month', type: 'date', required: true },
              { key: 'turnover', label: 'Turnover', type: 'number', required: true },
            ]} />
        </Section>
      )}

      <Signature lease={lease} onChanged={refresh} />
      <DebitOrder lease={lease} currency={currency} />
      <CustomFields lease={lease} onSaved={refresh} />
    </div>
  )
}

function Escalation({ lease, onSaved }) {
  const [form, setForm] = useState({
    escalation_type: lease.escalation_type || 'fixed', rental_escalation_rate: lease.rental_escalation_rate ?? '',
    cpi_margin: lease.cpi_margin ?? '', turnover_rent_percent: lease.turnover_rent_percent ?? '',
  })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    // Only the turnover % may be cleared; the other fields keep their value when left empty.
    const payload = Object.fromEntries(Object.entries(form)
      .filter(([k, v]) => v !== '' || k === 'turnover_rent_percent')
      .map(([k, v]) => [k, v === '' ? null : v]))
    if (await act(rentalsAPI.leases.update(lease.id, payload), 'Escalation saved.')) onSaved()
    setBusy(false)
  }
  return (
    <Section icon={TrendingUp} title="Escalation & turnover">
      <div className="grid grid-cols-2 gap-2">
        <select aria-label="Escalation type" className="form-input text-xs" value={form.escalation_type}
          onChange={(e) => setForm({ ...form, escalation_type: e.target.value })}>
          <option value="fixed">Fixed % each year</option>
          <option value="stepped">Stepped (schedule)</option>
          <option value="cpi">CPI-linked</option>
          <option value="none">No escalation</option>
        </select>
        {form.escalation_type === 'fixed' && (
          <input aria-label="Escalation %" type="number" step="any" className="form-input text-xs" placeholder="Escalation %"
            value={form.rental_escalation_rate} onChange={(e) => setForm({ ...form, rental_escalation_rate: e.target.value })} />
        )}
        {form.escalation_type === 'cpi' && (
          <input aria-label="CPI margin %" type="number" step="any" className="form-input text-xs" placeholder="CPI + margin %"
            value={form.cpi_margin} onChange={(e) => setForm({ ...form, cpi_margin: e.target.value })} />
        )}
        <input aria-label="Turnover rent %" type="number" step="any" className="form-input text-xs" placeholder="Turnover rent % (retail)"
          value={form.turnover_rent_percent} onChange={(e) => setForm({ ...form, turnover_rent_percent: e.target.value })} />
      </div>
      <button className="btn-secondary text-xs w-full py-2" disabled={busy} onClick={save}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
      </button>
    </Section>
  )
}

function Signature({ lease, onChanged }) {
  const status = lease.signature_status || 'not_sent'
  return (
    <Section icon={PenLine} title="Signature">
      <p className="text-xs text-dark-300">Status: <Badge value={status} />{lease.signature_reference ? ` · ref ${lease.signature_reference}` : ''}</p>
      <div className="flex gap-2">
        {status !== 'signed' && (
          <button className="btn-secondary text-xs flex-1" onClick={async () => { if (await act(rentalsAPI.leases.sendForSignature(lease.id), 'Sent for signature.')) onChanged() }}>
            Send for signature
          </button>
        )}
        {status !== 'signed' && (
          <button className="btn-secondary text-xs flex-1" onClick={async () => {
            if (await act(rentalsAPI.leases.markSigned(lease.id, true), 'Marked signed. The lease is now active.')) onChanged()
          }}>Mark signed</button>
        )}
      </div>
      {status === 'signed' && lease.signature_signed_at && (
        <p className="text-xs text-dark-400">Signed {formatDate(lease.signature_signed_at)}.</p>
      )}
    </Section>
  )
}

function DebitOrder({ lease, currency }) {
  const { data: interest } = useQuery({ queryKey: ['deposit-interest', lease.id], queryFn: () => propmanAPI.depositInterest.list({ lease: lease.id }) })
  const credited = rowsOf(interest).reduce((s, r) => s + parseFloat(r.amount), 0)
  return (
    <Section icon={Landmark} title="Debit order & deposit interest">
      <CrudTable compact label="mandate" queryKey={['mandates']} api={propmanAPI.mandates} params={{ lease: lease.id }}
        emptyText="No debit order mandate."
        columns={[
          { key: 'reference', label: 'Mandate' },
          { key: 'collection_day', label: 'Day' },
          { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
        ]}
        fields={[
          { key: 'reference', label: 'Mandate reference', required: true },
          { key: 'account_holder', label: 'Account holder', required: true },
          { key: 'bank_name', label: 'Bank', required: true },
          { key: 'branch_code', label: 'Branch code', required: true },
          { key: 'account_number', label: 'Account number', required: true },
          { key: 'account_type', label: 'Account type', type: 'select', options: [['current', 'Current'], ['savings', 'Savings']] },
          { key: 'collection_day', label: 'Collection day (1-28)', type: 'number', required: true },
          { key: 'signed_on', label: 'Signed on', type: 'date', required: true },
          { key: 'collect_full_balance', label: 'Collect the full balance', type: 'checkbox' },
          { key: 'fixed_amount', label: 'Or fixed amount', type: 'number', nullable: true },
          { key: 'status', label: 'Status', type: 'select', options: [['active', 'Active'], ['suspended', 'Suspended'], ['cancelled', 'Cancelled']] },
        ]}
        defaults={{ account_type: 'current', collection_day: 1, collect_full_balance: true, status: 'active' }} />
      <p className="text-xs text-dark-400">Deposit interest credited so far: {money(credited, currency)}</p>
    </Section>
  )
}

function CustomFields({ lease, onSaved }) {
  const defs = useCustomFieldDefs('lease')
  const [values, setValues] = useState(() => ({ ...(lease.custom_fields || {}) }))
  if (!defs.length) return null
  const save = async () => {
    if (await act(rentalsAPI.leases.update(lease.id, { custom_fields: values }), 'Saved.')) onSaved()
  }
  return (
    <Section icon={SlidersHorizontal} title="Custom fields">
      <div className="grid grid-cols-2 gap-2">
        {defs.map((d) => (
          <label key={d.key} className="text-[10px] text-dark-500 uppercase">
            {d.label}{d.required ? ' *' : ''}
            {d.field_type === 'choice' ? (
              <select className="form-input text-xs w-full" value={values[d.key] ?? ''} onChange={(e) => setValues({ ...values, [d.key]: e.target.value })}>
                <option value="">—</option>
                {(d.choices || []).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : d.field_type === 'boolean' ? (
              <input type="checkbox" className="block mt-1" checked={!!values[d.key]} onChange={(e) => setValues({ ...values, [d.key]: e.target.checked })} />
            ) : (
              <input className="form-input text-xs w-full" type={d.field_type === 'number' ? 'number' : d.field_type === 'date' ? 'date' : 'text'}
                value={values[d.key] ?? ''} onChange={(e) => setValues({ ...values, [d.key]: e.target.value })} />
            )}
          </label>
        ))}
      </div>
      <button className="btn-secondary text-xs w-full py-2" onClick={save}>Save</button>
    </Section>
  )
}
