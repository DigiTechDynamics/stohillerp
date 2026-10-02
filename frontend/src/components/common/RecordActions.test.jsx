import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/services/api', () => ({ apiErrorMessage: (e, fallback) => e?.message || fallback }))

import RecordActions from './RecordActions'
import { toast } from 'react-hot-toast'

function renderActions(props) {
  const client = new QueryClient()
  return render(<QueryClientProvider client={client}><RecordActions label="invoice" {...props} /></QueryClientProvider>)
}

describe('RecordActions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('edits and deletes an unlocked record after confirmation', async () => {
    const onEdit = vi.fn()
    const deleteFn = vi.fn(() => Promise.resolve({}))
    const onDeleted = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderActions({ record: { id: 'r1', edit_lock: null, delete_lock: null }, onEdit, deleteFn, onDeleted })

    fireEvent.click(screen.getByLabelText('Edit invoice'))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }))

    fireEvent.click(screen.getByLabelText('Delete invoice'))
    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => expect(deleteFn).toHaveBeenCalledWith('r1'))
    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
    expect(toast.success).toHaveBeenCalledWith('Invoice deleted.')
  })

  it('explains a locked action instead of doing it', () => {
    const onEdit = vi.fn()
    const deleteFn = vi.fn()
    const reason = 'Posted invoices cannot be deleted. Raise a credit note instead.'
    renderActions({ record: { id: 'r2', edit_lock: 'Posted invoices cannot be edited.', delete_lock: reason }, onEdit, deleteFn })

    const del = screen.getByLabelText('Delete invoice')
    expect(del).toHaveAttribute('title', reason)
    fireEvent.click(del)
    expect(toast.error).toHaveBeenCalledWith(reason)
    expect(deleteFn).not.toHaveBeenCalled()

    fireEvent.click(screen.getByLabelText('Edit invoice'))
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('does nothing when the user cancels the confirmation', () => {
    const deleteFn = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderActions({ record: { id: 'r3' }, deleteFn })
    fireEvent.click(screen.getByLabelText('Delete invoice'))
    expect(deleteFn).not.toHaveBeenCalled()
  })

  it('shows the server message when a delete is refused', async () => {
    const deleteFn = vi.fn(() => Promise.reject(new Error('This record cannot be deleted because it is used by 2 invoices.')))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderActions({ record: { id: 'r4' }, deleteFn })
    fireEvent.click(screen.getByLabelText('Delete invoice'))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('This record cannot be deleted because it is used by 2 invoices.'))
  })
})
