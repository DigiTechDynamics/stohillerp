// Stohill Properties - Formatting Utilities

export function formatCurrency(amount, currencyCode = 'USD', style = 'full') {
  if (isNaN(amount) || amount === null) return `${currencyCode} 0`
  
  if (style === 'compact') {
    const symbol = currencyCode === 'USD' ? '$' : currencyCode + ' '
    if (amount >= 1_000_000_000) return `${symbol}${(amount / 1_000_000_000).toFixed(1)}B`
    if (amount >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(1)}M`
    if (amount >= 1_000) return `${symbol}${(amount / 1_000).toFixed(0)}K`
    return `${symbol}${amount.toFixed(0)}`
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch (e) {
    return `${currencyCode} ${new Intl.NumberFormat('en-US').format(amount)}`
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

