import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { DialogHost, confirmDialog, alertDialog, promptDialog } from './Dialogs'

describe('application dialogs', () => {
  it('resolves a confirmation with the button chosen', async () => {
    render(<DialogHost />)
    let result
    act(() => { confirmDialog({ title: 'Delete it?', confirmLabel: 'Delete' }).then((r) => { result = r }) })
    expect(await screen.findByText('Delete it?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(result).toBe(true))

    act(() => { confirmDialog('Sure?').then((r) => { result = r }) })
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(result).toBe(false))
  })

  it('returns the entered value from a prompt, or null when cancelled', async () => {
    render(<DialogHost />)
    let result
    act(() => { promptDialog({ title: 'Name', label: 'Report name', defaultValue: 'Arrears' }).then((r) => { result = r }) })
    const input = await screen.findByLabelText('Report name')
    expect(input).toHaveValue('Arrears')
    fireEvent.change(input, { target: { value: 'Arrears by property' } })
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(result).toBe('Arrears by property'))

    act(() => { promptDialog({ title: 'Reason' }).then((r) => { result = r }) })
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(result).toBeNull())
  })

  it('shows dialogs one at a time', async () => {
    render(<DialogHost />)
    act(() => {
      alertDialog({ title: 'First' })
      alertDialog({ title: 'Second' })
    })
    expect(await screen.findByText('First')).toBeInTheDocument()
    expect(screen.queryByText('Second')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(await screen.findByText('Second')).toBeInTheDocument()
  })
})
