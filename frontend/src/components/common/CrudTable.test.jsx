import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/services/api', () => ({ apiErrorMessage: (e, fallback) => e?.message || fallback }))

import CrudTable from './CrudTable'
import { toast } from 'react-hot-toast'

const ok = (data) => Promise.resolve({ data })

function renderTable(api, props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CrudTable label="unit" queryKey={['units']} api={api} params={{ property: 'p1' }}
        columns={[{ key: 'unit_number', label: 'Unit' }, { key: 'floor_size', label: 'GLA' }]}
        fields={[
          { key: 'unit_number', label: 'Unit number', required: true },
          { key: 'floor_size', label: 'Floor area', type: 'number', nullable: true },
          { key: 'unit_type', label: 'Type', type: 'select', options: [['office', 'Office'], ['retail', 'Retail']] },
        ]}
        {...props} />
    </QueryClientProvider>,
  )
}

describe('CrudTable', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists records filtered by the params', async () => {
    const api = { list: vi.fn(() => ok({ results: [{ id: 'u1', unit_number: 'A1', floor_size: '120.00' }] })) }
    renderTable(api)
    expect(await screen.findByText('A1')).toBeInTheDocument()
    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ property: 'p1' }))
  })

  it('says what is missing, then creates with the params and empty numbers as null', async () => {
    const api = { list: vi.fn(() => ok([])), create: vi.fn(() => ok({ id: 'u2' })) }
    renderTable(api)
    fireEvent.click(await screen.findByText(/Add unit/))
    fireEvent.click(screen.getByText('Save'))
    expect(toast.error).toHaveBeenCalledWith('Please fill in: Unit number.')
    expect(api.create).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Unit number'), { target: { value: 'B2' } })
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'retail' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ property: 'p1', unit_number: 'B2', floor_size: null, unit_type: 'retail' }))
    expect(toast.success).toHaveBeenCalledWith('Unit added.')
  })

  it('leaves a blank non-nullable number out so the server default applies', async () => {
    const api = { list: vi.fn(() => ok([])), create: vi.fn(() => ok({ id: 't1' })) }
    renderTable(api, {
      label: 'tariff', params: {},
      fields: [
        { key: 'name', label: 'Name', required: true },
        { key: 'rate', label: 'Flat rate', type: 'number' },
      ],
      defaults: { rate: 0 },
    })
    fireEvent.click(await screen.findByText(/Add tariff/))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Water' } })
    fireEvent.change(screen.getByLabelText('Flat rate'), { target: { value: '' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ name: 'Water' }))
  })

  it('edits a row with its current values and shows server errors', async () => {
    const api = {
      list: vi.fn(() => ok([{ id: 'u1', unit_number: 'A1', floor_size: '120.00', unit_type: 'office' }])),
      update: vi.fn(() => Promise.reject(new Error('Unit numbers must be unique per property.'))),
      delete: vi.fn(),
    }
    renderTable(api)
    fireEvent.click(await screen.findByLabelText('Edit unit'))
    expect(screen.getByLabelText('Unit number')).toHaveValue('A1')
    fireEvent.change(screen.getByLabelText('Floor area'), { target: { value: '150' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('u1', expect.objectContaining({ floor_size: '150', unit_number: 'A1' })))
    expect(toast.error).toHaveBeenCalledWith('Unit numbers must be unique per property.')
  })

  it('hides edit when the records cannot be edited', async () => {
    const api = { list: vi.fn(() => ok([{ id: 'r1', unit_number: 'R1' }])), update: vi.fn(), delete: vi.fn() }
    renderTable(api, { canEdit: false })
    await screen.findByText('R1')
    expect(screen.queryByLabelText('Edit unit')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Delete unit')).toBeInTheDocument()
  })
})
