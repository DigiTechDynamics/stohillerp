import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/services/api', () => {
  const ok = (data) => Promise.resolve({ data })
  return {
    apiErrorMessage: (e, fallback) => fallback,
    saveBlobResponse: vi.fn(),
    ownerPortalAPI: {
      quotes: vi.fn(() => ok([{ id: 'q1', job: 'MR-0001', category: 'Plumbing', description: 'Burst geyser', supplier: 'FixIt',
        amount: '8500.00', property: 'Sea View', valid_until: null, quote_notes: '' }])),
      maintenance: vi.fn(() => ok([])),
      decide: vi.fn(() => ok({ status: 'accepted' })),
    },
    contractorPortalAPI: {
      jobs: vi.fn(() => ok([{ reference: 'MR-0002', category: 'Electrical', description: 'No power in unit 3', priority: 'high',
        status: 'acknowledged', property: 'Sea View', address: '1 Beach Rd', unit: '3', notes: '' }])),
      reportDone: vi.fn(() => ok({})),
      updateJob: vi.fn(() => ok({})),
    },
  }
})

import { OwnerMaintenance } from './OwnerPortal'
import { ContractorJobs } from './ContractorPortal'
import { ownerPortalAPI, contractorPortalAPI } from '@/services/api'

function renderWith(element) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>)
}

describe('owner portal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lets the owner approve a quote waiting for them', async () => {
    renderWith(<OwnerMaintenance />)
    expect(await screen.findByText(/Burst geyser/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Approve/ }))
    await waitFor(() => expect(ownerPortalAPI.decide).toHaveBeenCalledWith('q1', true, ''))
  })
})

describe('contractor portal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reports a job done with the progress note', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderWith(<ContractorJobs />)
    expect(await screen.findByText('No power in unit 3')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Progress note'), { target: { value: 'Replaced breaker' } })
    fireEvent.click(screen.getByRole('button', { name: 'Report done' }))
    await waitFor(() => expect(contractorPortalAPI.reportDone).toHaveBeenCalledWith('MR-0002', 'Replaced breaker'))
  })
})
