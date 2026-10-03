import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import api, { downloadPrivateFile, signOut } from './api'
import { useAuthStore } from '@/stores/authStore'

describe('token handling', () => {
  const originalAdapter = api.defaults.adapter
  afterEach(() => {
    api.defaults.adapter = originalAdapter
    vi.restoreAllMocks()
    useAuthStore.getState().logout()
  })

  it('keeps tokens out of localStorage', () => {
    useAuthStore.getState().setAuth({ id: 1, first_name: 'A' }, 'access-1')
    const stored = window.localStorage.getItem('stohill-auth') || ''
    expect(stored).not.toContain('access-1')
    expect(stored).not.toMatch(/refreshToken|accessToken/)
  })

  it('after a reload, refreshes from the cookie on a 401 and retries with the new token', async () => {
    useAuthStore.setState({ user: { id: 1 }, isAuthenticated: true, accessToken: null })
    const seen = []
    api.defaults.adapter = async (config) => {
      seen.push(config.headers.Authorization || null)
      if (!config.headers.Authorization) {
        const error = new Error('401')
        error.config = config
        error.response = { status: 401, data: {} }
        throw error
      }
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config }
    }
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access: 'fresh-access' } })

    const res = await api.get('core/me/')
    expect(res.data.ok).toBe(true)
    expect(post).toHaveBeenCalledWith(expect.stringMatching(/auth\/refresh\/$/), {},
      expect.objectContaining({ withCredentials: true, headers: { 'X-Requested-With': 'XMLHttpRequest' } }))
    expect(seen).toEqual([null, 'Bearer fresh-access'])
    expect(useAuthStore.getState().accessToken).toBe('fresh-access')
  })

  it('signs out locally even when the server call fails', async () => {
    useAuthStore.getState().setAuth({ id: 1 }, 'a')
    api.defaults.adapter = async () => { throw new Error('offline') }
    await signOut()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})

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
