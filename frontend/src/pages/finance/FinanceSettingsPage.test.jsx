import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/services/api', () => {
  const ok = (data) => Promise.resolve({ data })
  return {
    apiErrorMessage: (e, fallback) => fallback || 'error',
    adminAPI: { roles: { list: vi.fn(() => ok({ results: [{ id: 'r1', name: 'Finance Manager' }] })) } },
    financeAPI: {
      costCenters: { list: vi.fn(() => ok({ results: [] })), create: vi.fn(() => ok({ id: 'c1' })), update: vi.fn() },
      recurringJournals: { list: vi.fn(() => ok({ results: [] })), create: vi.fn(() => ok({ id: 't1' })), runDue: vi.fn() },
      journals: { list: vi.fn(() => ok({ results: [{ id: 'j1', code: 'GJ', name: 'General' }] })) },
      approvalRules: { list: vi.fn(() => ok({ results: [] })), create: vi.fn(() => ok({ id: 'a1' })) },
      accounts: { search: vi.fn(() => ok([])) },
      fx: { revalue: vi.fn() },
    },
  }
})

import FinanceSettingsPage from './FinanceSettingsPage'
import { financeAPI } from '@/services/api'
import { toast } from 'react-hot-toast'

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><FinanceSettingsPage /></QueryClientProvider>)
}

describe('Finance Settings add buttons', () => {
  beforeEach(() => vi.clearAllMocks())

  it('cost centre Add explains what is missing, then creates', async () => {
    renderPage()
    const add = await screen.findByRole('button', { name: /Add/ })
    expect(add).not.toBeDisabled()
    fireEvent.click(add)
    expect(toast.error).toHaveBeenCalledWith('Please fill in: Code, Name.')
    expect(financeAPI.costCenters.create).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Cost centre code'), { target: { value: 'HQ' } })
    fireEvent.change(screen.getByLabelText('Cost centre name'), { target: { value: 'Head office' } })
    fireEvent.click(add)
    await waitFor(() => expect(financeAPI.costCenters.create).toHaveBeenCalledWith({ code: 'HQ', name: 'Head office' }))
  })

  it('New template opens the form and Save says what is missing', async () => {
    renderPage()
    fireEvent.click(screen.getByText('Recurring Journals'))
    fireEvent.click(await screen.findByRole('button', { name: /New template/ }))
    expect(screen.getByText('New recurring journal')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }))
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Name, Entry description, Journal'))
    expect(financeAPI.recurringJournals.create).not.toHaveBeenCalled()
  })

  it('approval rule Add requires a name and role, then creates', async () => {
    renderPage()
    fireEvent.click(screen.getByText('Approval Rules'))
    const add = await screen.findByRole('button', { name: 'Add rule' })
    fireEvent.click(add)
    expect(toast.error).toHaveBeenCalledWith('Please fill in: Rule name, Approver role.')

    fireEvent.change(screen.getByLabelText('Rule name'), { target: { value: 'Big invoices' } })
    await screen.findByRole('option', { name: 'Finance Manager' })
    fireEvent.change(screen.getByLabelText('Approver role'), { target: { value: 'r1' } })
    fireEvent.click(add)
    await waitFor(() => expect(financeAPI.approvalRules.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Big invoices', role: 'r1' })))
  })
})
