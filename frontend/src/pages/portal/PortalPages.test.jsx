import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/services/api', () => {
  const ok = (data) => Promise.resolve({ data })
  return {
    apiErrorMessage: (e, fallback) => fallback,
    saveBlobResponse: vi.fn(),
    portalAPI: {
      invoices: vi.fn(() => ok([
        { id: 'a', number: 'INV-A', type: 'invoice', invoice_date: '2026-09-01', due_date: '2026-09-07', currency: 'USD', total: '500.00', balance: '500.00', status: 'overdue', payable: true },
        { id: 'b', number: 'INV-B', type: 'invoice', invoice_date: '2026-09-15', due_date: '2026-09-30', currency: 'USD', total: '120.00', balance: '120.00', status: 'posted', payable: true },
        { id: 'c', number: 'INV-C', type: 'invoice', invoice_date: '2026-08-01', due_date: '2026-08-07', currency: 'USD', total: '90.00', balance: '0.00', status: 'paid', payable: false },
      ])),
      invoicePdf: vi.fn(),
      payments: {
        list: vi.fn(() => ok([])),
        start: vi.fn(() => ok({ reference: 'PAY-1', redirect_url: 'https://gateway.example/pay/PAY-1' })),
        detail: vi.fn(() => ok({ reference: 'PAY-1', amount: '620.00', currency: 'USD', status: 'pending', gateway: 'test', allocations: [] })),
        refresh: vi.fn(),
        simulate: vi.fn(() => ok({ reference: 'PAY-1', amount: '620.00', currency: 'USD', status: 'paid', gateway: 'test', allocations: [{}, {}] })),
      },
    },
  }
})

import { PortalInvoices, PortalPaymentReturn } from './PortalPages'
import { portalAPI } from '@/services/api'
import { hasPortal, homePathFor, isPortalUser } from '@/utils/portal'

function renderAt(path, element, routePath = '*') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path={routePath} element={element} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('portal invoices', () => {
  const originalLocation = window.location
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, assign: vi.fn() } })
  })
  afterEach(() => Object.defineProperty(window, 'location', { configurable: true, value: originalLocation }))

  it('pays the selected open invoices and sends the tenant to the gateway', async () => {
    renderAt('/portal/invoices', <PortalInvoices />)
    await screen.findByText('INV-A')
    expect(screen.queryByLabelText('Pay INV-C')).not.toBeInTheDocument()   // already paid

    const pay = screen.getByRole('button', { name: /Pay online/ })
    expect(pay).toBeDisabled()
    fireEvent.click(screen.getByText('Select all due'))
    expect(screen.getByText((_, el) => el?.tagName === 'STRONG' && /620/.test(el.textContent))).toBeInTheDocument()
    fireEvent.click(pay)

    await waitFor(() => expect(portalAPI.payments.start).toHaveBeenCalledWith(['a', 'b']))
    await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith('https://gateway.example/pay/PAY-1'))
  })
})

describe('payment return page', () => {
  it('lets a test-gateway payment be simulated as paid', async () => {
    renderAt('/portal/payments/PAY-1?simulate=1', <PortalPaymentReturn />, '/portal/payments/:reference')
    expect(await screen.findByText('Waiting for confirmation')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Simulate success'))
    expect(await screen.findByText('Payment received - thank you')).toBeInTheDocument()
    expect(portalAPI.payments.simulate).toHaveBeenCalledWith('PAY-1', 'paid')
    expect(screen.getByText('Applied to 2 invoices.')).toBeInTheDocument()
  })
})

describe('isPortalUser', () => {
  it('is true only for logins that have nothing but portal modules', () => {
    expect(isPortalUser({ accessible_modules: ['portal'] })).toBe(true)
    expect(isPortalUser({ accessible_modules: ['owner_portal'] })).toBe(true)
    expect(isPortalUser({ accessible_modules: ['portal', 'owner_portal'] })).toBe(true)
    expect(isPortalUser({ accessible_modules: ['portal', 'finance_ar'] })).toBe(false)
    expect(isPortalUser({ accessible_modules: [] })).toBe(false)
    expect(isPortalUser(null)).toBe(false)
  })

  it('sends each external login to its own portal', () => {
    expect(homePathFor({ accessible_modules: ['portal'] })).toBe('/portal')
    expect(homePathFor({ accessible_modules: ['owner_portal'] })).toBe('/owner')
    expect(homePathFor({ accessible_modules: ['contractor_portal'] })).toBe('/contractor')
    expect(homePathFor({ accessible_modules: ['rentals', 'crm'] })).toBe('/dashboard')
    expect(hasPortal({ accessible_modules: ['portal', 'owner_portal'] }, 'owner')).toBe(true)
    expect(hasPortal({ accessible_modules: ['portal'] }, 'contractor')).toBe(false)
  })
})
