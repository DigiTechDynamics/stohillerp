import { describe, it, expect, afterEach } from 'vitest'
import { formatCurrency, getDefaultCurrency, setDefaultCurrency } from './format'

describe('formatCurrency', () => {
  afterEach(() => setDefaultCurrency('USD'))

  it('shows amounts to the cent', () => {
    expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56')
    expect(formatCurrency('99.5', 'USD')).toBe('$99.50')
  })

  it("uses the company currency when the amount doesn't carry one", () => {
    setDefaultCurrency('ZAR')
    expect(getDefaultCurrency()).toBe('ZAR')
    expect(formatCurrency(10)).toContain('10.00')
    expect(formatCurrency(10)).not.toContain('$')
    expect(formatCurrency(10, null)).toBe(formatCurrency(10))
  })

  it('shows a dash for missing values instead of a made-up zero', () => {
    expect(formatCurrency(null)).toBe('—')
    expect(formatCurrency(undefined)).toBe('—')
    expect(formatCurrency('abc')).toBe('—')
  })

  it('falls back to the code for non-ISO currencies such as ZWG', () => {
    expect(formatCurrency(5, 'ZWG')).toMatch(/ZWG\s?5\.00/)
  })
})
