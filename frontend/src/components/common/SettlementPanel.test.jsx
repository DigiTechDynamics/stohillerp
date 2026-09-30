import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/services/api', () => {
  const invoices = [
    { id: 'i1', invoice_number: 'INV-1', status: 'overdue', document_type: 'invoice', balance_due: '100.00', due_date: '2026-01-31' },
    { id: 'i2', invoice_number: 'INV-2', status: 'posted', document_type: 'invoice', balance_due: '80.00', due_date: '2026-02-28' },
    { id: 'i3', invoice_number: 'CN-1', status: 'posted', document_type: 'credit_note', balance_due: '50.00', due_date: '2026-02-28' },
    { id: 'i4', invoice_number: 'INV-4', status: 'paid', document_type: 'invoice', balance_due: '0.00', due_date: '2026-03-31' },
  ]
  const list = vi.fn(() => Promise.resolve({ data: { results: invoices } }))
  return { financeAPI: { ar: { invoices: { list } }, ap: { invoices: { list } } } }
})

import SettlementPanel from './SettlementPanel'

function renderPanel(props) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SettlementPanel side="ar" partyId="c1" currencyCode="USD" {...props} />
    </QueryClientProvider>,
  )
}

describe('SettlementPanel', () => {
  it('lists only open invoices, not credit notes or paid ones', async () => {
    renderPanel({ available: '150.00', onSubmit: vi.fn() })
    expect(await screen.findByText('INV-1')).toBeInTheDocument()
    expect(screen.getByText('INV-2')).toBeInTheDocument()
    expect(screen.queryByText('CN-1')).not.toBeInTheDocument()
    expect(screen.queryByText('INV-4')).not.toBeInTheDocument()
  })

  it('fills oldest first up to the amount available and submits the split', async () => {
    const onSubmit = vi.fn()
    renderPanel({ available: '150.00', onSubmit })
    await screen.findByText('INV-1')
    fireEvent.click(screen.getByText('Oldest first'))
    expect(screen.getByLabelText('Apply to INV-1')).toHaveValue(100)
    expect(screen.getByLabelText('Apply to INV-2')).toHaveValue(50)
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onSubmit).toHaveBeenCalledWith([{ invoice: 'i1', amount: '100.00' }, { invoice: 'i2', amount: '50.00' }])
  })

  it('blocks applying more than is available', async () => {
    renderPanel({ available: '50.00', onSubmit: vi.fn() })
    await screen.findByText('INV-1')
    fireEvent.change(screen.getByLabelText('Apply to INV-1'), { target: { value: '60' } })
    await waitFor(() => expect(screen.getByText(/more than is available/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
  })
})
