// Stohill Properties - Formatting Utilities

// The company's reporting currency, loaded from core/company/ at start-up
// (see useCompanyProfile). Used when an amount has no currency of its own.
let defaultCurrency = 'USD'

export function setDefaultCurrency(code) {
  if (code) defaultCurrency = code
}

export function getDefaultCurrency() {
  return defaultCurrency
}

// Money is shown to the cent; 'compact' (charts, axes) abbreviates to K/M/B.
export function formatCurrency(amount, currencyCode, style = 'full') {
  const code = currencyCode || defaultCurrency
  const value = typeof amount === 'string' ? parseFloat(amount) : amount
  if (value === null || value === undefined || isNaN(value)) return '—'
  const options = style === 'compact'
    ? { style: 'currency', currency: code, notation: 'compact', maximumFractionDigits: 1 }
    : { style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2 }
  try {
    return new Intl.NumberFormat('en-US', options).format(value)
  } catch {
    // Not an ISO currency code the browser knows: show the code instead.
    return `${code} ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`
  }
}

export function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value)
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function formatRelative(dateStr) {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
  return `${Math.floor(diffDays / 365)} years ago`
}

export function getStatusColor(status) {
  const map = {
    available: 'badge-green',
    occupied: 'badge-blue',
    under_contract: 'badge-gold',
    listed_sale: 'badge-purple',
    listed_rent: 'badge-blue',
    sold: 'badge-gray',
    maintenance: 'badge-red',
    inactive: 'badge-gray',
    active: 'badge-green',
    draft: 'badge-gray',
    posted: 'badge-green',
    pending: 'badge-gold',
    pending_signature: 'badge-gold',
    approved: 'badge-blue',
    reversed: 'badge-red',
    paid: 'badge-green',
    overdue: 'badge-red',
    partial: 'badge-gold',
    sent: 'badge-blue',
    cancelled: 'badge-gray',
    expired: 'badge-gray',
    terminated: 'badge-red',
    renewed: 'badge-green',
    logged: 'badge-gold',
    acknowledged: 'badge-blue',
    in_progress: 'badge-blue',
    pending_parts: 'badge-gold',
    completed: 'badge-green',
    closed: 'badge-gray',
    emergency: 'badge-red',
    hot: 'badge-red',
    warm: 'badge-gold',
    cold: 'badge-blue',
  }
  return map[status] || 'badge-gray'
}

export function truncate(str, maxLen = 50) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '…' : str;
}


// ─── Country helpers (company country is an ISO code, e.g. "ZW") ────────────

/** "ZW" -> "Zimbabwe". Unknown or empty codes come back unchanged. */
export function countryName(code) {
  if (!code) return ''
  if (code.length !== 2) return code
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) || code
  } catch {
    return code
  }
}

// International dialling codes for the region the business works in.
const DIALLING_CODES = {
  ZW: '+263', ZA: '+27', BW: '+267', ZM: '+260', MZ: '+258', NA: '+264', MW: '+265', LS: '+266',
  SZ: '+268', KE: '+254', TZ: '+255', UG: '+256', NG: '+234', GH: '+233', GB: '+44', US: '+1',
}

/** Placeholder for a phone field in the company's country, e.g. "+263 77 123 4567". */
export function phonePlaceholder(code) {
  const prefix = DIALLING_CODES[(code || '').toUpperCase()]
  return prefix ? `${prefix}...` : '+<country code> number'
}
