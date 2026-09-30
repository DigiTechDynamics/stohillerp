import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/services/api', () => {
  const ok = (data) => Promise.resolve({ data })
  return {
    propertiesAPI: { properties: { list: vi.fn(() => ok({ results: [] })) } },
    financeAPI: {
      periods: { list: vi.fn(() => ok({ results: [] })) },
      fiscalYears: { list: vi.fn(() => ok({ results: [] })) },
      accounts: {
        list: vi.fn(() => ok({
          results: [
            { id: 'a1', code: '4100', name: 'Rental Income', account_type: 'revenue', allow_direct_posting: true },
            { id: 'a2', code: '5300', name: 'Maintenance', account_type: 'expense', allow_direct_posting: true },
            { id: 'a3', code: '1010', name: 'Bank', account_type: 'asset', allow_direct_posting: true },
            { id: 'a4', code: '4000', name: 'Revenue', account_type: 'revenue', allow_direct_posting: false },
          ],
        })),
      },
      budgets: {
        list: vi.fn(() => ok({ results: [{ id: 'b1', account: 'a2', budgeted_amount: '250.00' }] })),
        create: vi.fn(() => ok({})),
        update: vi.fn(() => ok({})),
      },
      reports: {},
    },
  }
})

import ReportsPage, { BudgetEditor } from './ReportsPage'
import { financeAPI } from '@/services/api'

function renderWithQuery(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('ReportsPage', () => {
  it('lists the management reports that now have an API behind them', () => {
    renderWithQuery(<ReportsPage />)
    for (const name of ['Accounts Receivable Aging', 'Accounts Payable Aging', 'General Ledger Detail',
      'Budget vs Actual', 'Cash Flow Statement']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
  })
})

describe('BudgetEditor', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asks for a period first', () => {
    renderWithQuery(<BudgetEditor periodId="" />)
    expect(screen.getByText(/Select a period/)).toBeInTheDocument()
  })

  it('shows only postable P&L accounts and saves new and changed budgets', async () => {
    const onSaved = vi.fn()
    renderWithQuery(<BudgetEditor periodId="p1" onSaved={onSaved} />)

    const rent = await screen.findByLabelText('Budget for 4100')
    const maintenance = screen.getByLabelText('Budget for 5300')
    expect(maintenance).toHaveValue(250)
    expect(screen.queryByLabelText('Budget for 1010')).toBeNull()   // balance sheet
    expect(screen.queryByLabelText('Budget for 4000')).toBeNull()   // header account

    fireEvent.change(rent, { target: { value: '1200' } })
    fireEvent.change(maintenance, { target: { value: '300' } })
    fireEvent.click(screen.getByText('Save budget'))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(financeAPI.budgets.create).toHaveBeenCalledWith({ fiscal_period: 'p1', account: 'a1', budgeted_amount: '1200' })
    expect(financeAPI.budgets.update).toHaveBeenCalledWith('b1', { budgeted_amount: '300' })
  })
})
