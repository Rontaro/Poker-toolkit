import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { get, httpTransport, post, setTransport, type Transport } from '../src/api.js'

describe('transport indirection', () => {
  let fakeTransport: Transport

  beforeEach(() => {
    fakeTransport = {
      get: vi.fn(async <T>() => ({ ok: true }) as T),
      post: vi.fn(async <T>() => ({ ok: true }) as T),
    }
    setTransport(fakeTransport)
  })

  it('routes get() through the active transport with the built query string', async () => {
    const result = await get('/hands', { gameType: 'cash', minSeats: '', maxSeats: '', minBb: '', maxBb: '', from: '', to: '' })

    expect(fakeTransport.get).toHaveBeenCalledWith('/hands', '?gameType=cash')
    expect(result).toEqual({ ok: true })
  })

  it('routes get() with no filters to an empty query string', async () => {
    await get('/hands')

    expect(fakeTransport.get).toHaveBeenCalledWith('/hands', '')
  })

  it('routes post() through the active transport with the body', async () => {
    const body = { foo: 'bar' }
    const result = await post('/study', body)

    expect(fakeTransport.post).toHaveBeenCalledWith('/study', body)
    expect(result).toEqual({ ok: true })
  })
})

describe('default httpTransport', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  beforeEach(() => {
    // Restore the real default transport: a prior test in this file swapped
    // it out with setTransport, and the module-level `activeTransport` is
    // shared across tests.
    setTransport(httpTransport)
  })

  it('get() calls fetch with the expected URL and parses JSON', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ hands: 3 }),
    }))
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await get<{ hands: number }>('/overview')

    expect(fetchMock).toHaveBeenCalledWith('/api/overview')
    expect(result).toEqual({ hands: 3 })
  })

  it('get() throws on a non-ok response', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch

    await expect(get('/overview')).rejects.toThrow('/overview: 500')
  })

  it('get() throws the server-provided error message, like post()', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'range non valido' }),
    })) as unknown as typeof fetch

    await expect(get('/hand/abc/equity?range=ZZ')).rejects.toThrow('range non valido')
  })

  it('falls back to path and status when the error body is not JSON', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError('Unexpected token <')
      },
    })) as unknown as typeof fetch

    await expect(post('/study', {})).rejects.toThrow('/study: 500')
  })

  it('post() sends JSON with the right method and headers, and parses the response', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ done: true }),
    }))
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await post('/study', { limit: 5 })

    expect(fetchMock).toHaveBeenCalledWith('/api/study', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 5 }),
    })
    expect(result).toEqual({ done: true })
  })

  it('post() throws the server-provided error message on a non-ok response', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'bad filters' }),
    })) as unknown as typeof fetch

    await expect(post('/study', {})).rejects.toThrow('bad filters')
  })
})
