// "Charge VAT on rent" switch for a lease, showing the VAT and the total the tenant pays a month.
import { useCompanyProfile } from '@/hooks/useCompanyProfile'
import { formatCurrency } from '@/utils/format'

export default function VatOnRent({ rent, checked, onChange, disabled = false }) {
  const { data: company } = useCompanyProfile()
  const rate = parseFloat(company?.vat_rate ?? 0)
  const amount = parseFloat(rent) || 0
  const vat = checked ? Math.round(amount * rate) / 100 : 0
  return (
    <div className={`rounded-lg border p-3 ${checked ? 'border-primary/40 bg-primary/5' : 'border-white/5 bg-dark-800'}`}>
      <label className="flex items-center gap-2 text-sm text-dark-200 cursor-pointer">
        <input type="checkbox" aria-label="Charge VAT on rent" checked={!!checked} disabled={disabled}
          onChange={(e) => onChange(e.target.checked)} className="form-checkbox" />
        Charge VAT on rent{rate ? ` (${rate}%)` : ''}
      </label>
      <p className="text-xs text-dark-400 mt-1">
        {checked
          ? `Rent ${formatCurrency(amount)} + VAT ${formatCurrency(vat)} = ${formatCurrency(amount + vat)} a month on each invoice.`
          : 'Usually for commercial leases. Residential rent is normally VAT-exempt.'}
      </p>
    </div>
  )
}
