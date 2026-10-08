// Payroll deduction settings: statutory rates (AIDS levy, NSSA...) and PAYE
// tax brackets per currency. Payroll refuses to run when one is missing, so
// these screens are where it is put right.
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Calculator, DollarSign, Save, Plus, Loader2 } from 'lucide-react'
import { payrollAPI, apiErrorMessage } from '@/services/api'
import { getDefaultCurrency } from '@/utils/format'
import CurrencySelect from '@/components/common/CurrencySelect'
import CrudTable from '@/components/common/CrudTable'

function SettingRow({ setting }) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState(String(setting.value))
  const [saving, setSaving] = useState(false)
  useEffect(() => setValue(String(setting.value)), [setting.value])
  const dirty = Number(value) !== Number(setting.value)

  const save = async () => {
    setSaving(true)
    try {
      await payrollAPI.settings.update(setting.id, { value })
      queryClient.invalidateQueries({ queryKey: ['payrollSettings'] })
      toast.success(`${setting.name} saved.`)
    } catch (err) {
      toast.error(apiErrorMessage(err, `Could not save ${setting.name}.`))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 p-4 bg-white/[0.02] rounded-xl border border-white/5 hover:border-white/10 transition-all">
      <div className="min-w-0">
        <div className="font-bold text-white text-sm">{setting.name}</div>
        <div className="text-[10px] text-dark-500 uppercase tracking-tight">{setting.key}{setting.description ? ` · ${setting.description}` : ''}</div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <input
          type="number"
          aria-label={setting.name}
          className="form-input w-28 h-9 text-right font-mono text-xs"
          value={value}
          step="0.00001"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && dirty) save() }}
        />
        <button type="button" onClick={save} disabled={!dirty || saving} title={`Save ${setting.name}`}
          className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all border border-primary/20 disabled:opacity-40">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        </button>
      </div>
    </div>
  )
}

function AddSettingForm() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)

  if (!form) {
    return (
      <button type="button" className="w-full btn-ghost border border-dashed border-white/10 hover:border-primary/30 h-10 text-[10px] font-bold uppercase tracking-widest gap-2 justify-center"
        onClick={() => setForm({ name: '', key: '', value: '', description: '' })}>
        <Plus size={14} /> Add setting
      </button>
    )
  }
  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await payrollAPI.settings.create(form)
      queryClient.invalidateQueries({ queryKey: ['payrollSettings'] })
      toast.success('Setting added.')
      setForm(null)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not add the setting.'))
    } finally {
      setSaving(false)
    }
  }
  return (
    <form onSubmit={save} className="grid grid-cols-2 gap-2 p-4 rounded-xl border border-white/10">
      <input className="form-input text-xs" placeholder="Name, e.g. NSSA Ceiling (ZWG)" aria-label="Setting name" required
        value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <input className="form-input text-xs font-mono" placeholder="key, e.g. nssa_ceiling_zwg" aria-label="Setting key" required
        value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
      <input className="form-input text-xs" type="number" step="0.00001" placeholder="Value" aria-label="Setting value" required
        value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
      <input className="form-input text-xs" placeholder="Description" aria-label="Setting description"
        value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <div className="col-span-2 flex justify-end gap-2">
        <button type="button" className="btn-ghost text-xs" onClick={() => setForm(null)}>Cancel</button>
        <button type="submit" className="btn-primary text-xs" disabled={saving}>{saving ? 'Saving...' : 'Add'}</button>
      </div>
    </form>
  )
}

const DeductionSettingsView = ({ selectedRun }) => {
  const { data: settingsData } = useQuery({
    queryKey: ['payrollSettings'],
    queryFn: () => payrollAPI.settings.list({ page_size: 100 }).then((res) => res.data),
  })
  const settings = settingsData?.results || settingsData || []

  // Brackets are per currency: the selected run's, else the company's base currency.
  const [currency, setCurrency] = useState(selectedRun?.currency || '')
  useEffect(() => { if (selectedRun?.currency) setCurrency(selectedRun.currency) }, [selectedRun?.currency])

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Statutory Rates */}
        <div className="card overflow-hidden bg-dark-900 border-white/5 shadow-2xl">
          <div className="p-6 border-b border-white/5 bg-dark-800/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-gold-sm">
                <Calculator size={20} />
              </div>
              <div>
                <h3 className="text-white font-bold">Statutory Rates</h3>
                <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold">Zimbabwe Social Security & Levies</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {settings.map((setting) => <SettingRow key={setting.id} setting={setting} />)}
            {settings.length === 0 && (
              <div className="text-center py-6 text-dark-500 text-xs italic">No statutory settings found.</div>
            )}
            <AddSettingForm />
          </div>
        </div>

        {/* PAYE brackets */}
        <div className="card overflow-hidden border-white/5 shadow-2xl bg-dark-950">
          <div className="p-6 border-b border-white/5 bg-dark-800/50 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-gold-sm">
                <DollarSign size={20} />
              </div>
              <div>
                <h3 className="text-white font-bold">PAYE Tax Brackets</h3>
                <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold">
                  Monthly thresholds{selectedRun?.currency_code ? ` for ${selectedRun.currency_code}` : ` (base currency ${getDefaultCurrency()})`}
                </p>
              </div>
            </div>
            <CurrencySelect value={currency} onChange={setCurrency} label="Currency" />
          </div>
          <div className="p-4">
            {currency ? (
              <CrudTable
                label="tax bracket"
                queryKey={['taxBrackets']}
                api={payrollAPI.taxBrackets}
                params={{ currency }}
                compact
                description="Tax = income × rate − fixed deduction, using the bracket the income falls in. Leave the upper limit blank for the top bracket."
                columns={[
                  { key: 'min_amount', label: 'From', align: 'right' },
                  { key: 'max_amount', label: 'To', align: 'right', render: (r) => r.max_amount ?? 'and above' },
                  { key: 'tax_rate', label: 'Rate %', align: 'right' },
                  { key: 'fixed_deduction', label: 'Fixed deduction', align: 'right' },
                ]}
                fields={[
                  { key: 'min_amount', label: 'From', type: 'number', required: true },
                  { key: 'max_amount', label: 'To (blank: no limit)', type: 'number', nullable: true },
                  { key: 'tax_rate', label: 'Rate %', type: 'number', required: true },
                  { key: 'fixed_deduction', label: 'Fixed deduction', type: 'number' },
                ]}
                toPayload={(p) => ({ ...p, max_amount: p.max_amount === '' ? null : p.max_amount, fixed_deduction: p.fixed_deduction || 0 })}
                defaults={{ fixed_deduction: 0 }}
              />
            ) : (
              <p className="p-6 text-center text-dark-500 text-xs">Choose the currency whose brackets you want to set.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default DeductionSettingsView
