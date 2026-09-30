import { describe, it, expect, vi, beforeEach } from 'vitest'
import api, { downloadPrivateFile } from './api'

describe('downloadPrivateFile', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.URL.createObjectURL = vi.fn(() => 'blob:fake')
    window.URL.revokeObjectURL = vi.fn()
  })

  it('fetches through the authenticated client and saves under the server filename', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      data: new Blob(['x']),
      headers: { 'content-disposition': "attachment; filename*=UTF-8''passport%20copy.pdf" },
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    let savedAs
    const appendChild = document.body.appendChild.bind(document.body)
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      savedAs = node.getAttribute('download')
      return appendChild(node)
    })

    await downloadPrivateFile('/api/v1/documents/42/download/', 'fallback')

    // Relative to the API base, so the bearer token interceptor applies.
    expect(get).toHaveBeenCalledWith('documents/42/download/', { responseType: 'blob' })
    expect(savedAs).toBe('passport copy.pdf')
    expect(click).toHaveBeenCalled()
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake')
  })

  it('falls back to the given name without a content-disposition header', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: new Blob(['x']), headers: {} })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    let savedAs
    const appendChild = document.body.appendChild.bind(document.body)
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      savedAs = node.getAttribute('download')
      return appendChild(node)
    })
    await downloadPrivateFile('/api/v1/crm/contact-documents/7/download/', 'ID copy')
    expect(savedAs).toBe('ID copy')
  })
})
