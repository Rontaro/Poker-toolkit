import { afterEach, describe, expect, it, vi } from 'vitest'

import { httpTransport, type Transport } from '@poker/ui'

import { toApiRequest, WorkerClient, type WorkerLike } from '../src/worker/client.js'
import type { WorkerRequest, WorkerResponse } from '../src/worker/protocol.js'

/** A Worker that records what it is sent and answers only when told to. */
class FakeWorker implements WorkerLike {
  readonly sent: { message: WorkerRequest; transfer: Transferable[] }[] = []
  readonly #listeners = new Map<string, ((event: never) => void)[]>()

  postMessage(message: WorkerRequest, transfer: Transferable[]): void {
    this.sent.push({ message, transfer })
  }

  addEventListener(type: string, listener: (event: never) => void): void {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener])
  }

  reply(response: WorkerResponse): void {
    for (const listener of this.#listeners.get('message') ?? []) listener({ data: response } as never)
  }

  crash(message: string): void {
    for (const listener of this.#listeners.get('error') ?? []) listener({ message } as never)
  }

  last(): WorkerRequest {
    const entry = this.sent.at(-1)
    if (entry === undefined) throw new Error('nothing sent')
    return entry.message
  }
}

function setup(): { worker: FakeWorker; client: WorkerClient } {
  const worker = new FakeWorker()
  return { worker, client: new WorkerClient(worker) }
}

describe('toApiRequest', () => {
  it('keeps the path percent-encoded and splits off the query, as Express would see it', () => {
    expect(toApiRequest('GET', '/hand/a%2Fb/equity?range=22%2B%2C%20AKs')).toEqual({
      method: 'GET',
      path: '/hand/a%2Fb/equity',
      query: { range: '22+, AKs' },
    })
  })

  it('reads the query string `get()` builds from the filters', () => {
    expect(toApiRequest('GET', '/overview?gameType=cash&minSeats=6')).toEqual({
      method: 'GET',
      path: '/overview',
      query: { gameType: 'cash', minSeats: '6' },
    })
    expect(toApiRequest('GET', '/overview')).toEqual({ method: 'GET', path: '/overview', query: {} })
  })

  it('drops what Express parses into an array or an object, as the server does', () => {
    expect(toApiRequest('GET', '/notes?q=a&q=b&tag[x]=1&ok=yes').query).toEqual({ ok: 'yes' })
  })

  it('sends a POST body through JSON, `{}` when there is none', () => {
    const at = new Date('2026-09-05T00:00:04Z')
    expect(toApiRequest('POST', '/study', { at, skip: undefined }).body).toEqual({ at: at.toISOString() })
    expect(toApiRequest('POST', '/study', undefined).body).toEqual({})
  })
})

describe('WorkerClient', () => {
  it('matches each answer to its request by id, whatever the order', async () => {
    const { worker, client } = setup()

    const first = client.transport.get<{ n: number }>('/overview', '')
    const second = client.transport.get<{ n: number }>('/statistics', '?gameType=cash')
    const [a, b] = worker.sent.map((entry) => entry.message)
    expect(a?.id).not.toBe(b?.id)
    expect(b).toMatchObject({
      kind: 'api',
      request: { method: 'GET', path: '/statistics', query: { gameType: 'cash' } },
    })

    worker.reply({ id: b!.id, kind: 'api', status: 200, body: { n: 2 } })
    worker.reply({ id: a!.id, kind: 'api', status: 200, body: { n: 1 } })

    await expect(first).resolves.toEqual({ n: 1 })
    await expect(second).resolves.toEqual({ n: 2 })
  })

  it('posts the body and resolves with what the Worker answered', async () => {
    const { worker, client } = setup()
    const pending = client.transport.post('/study', { limit: 5 })
    expect(worker.last()).toMatchObject({ kind: 'api', request: { method: 'POST', path: '/study', body: { limit: 5 } } })
    worker.reply({ id: worker.last().id, kind: 'api', status: 200, body: { done: true } })
    await expect(pending).resolves.toEqual({ done: true })
  })

  it('reports progress to the caller of ingest and transfers the bytes', async () => {
    const { worker, client } = setup()
    const onProgress = vi.fn()
    const bytes = new TextEncoder().encode('hello').buffer
    const pending = client.ingest([{ name: 'a.txt', bytes }], onProgress)
    await vi.waitFor(() => expect(worker.sent).toHaveLength(1))

    const { message, transfer } = worker.sent[0]!
    expect(message).toMatchObject({ kind: 'ingest', files: [{ name: 'a.txt' }] })
    expect(transfer).toEqual([bytes])

    const progress = { filesTotal: 1, filesDone: 0, handsDone: 3, bytesDone: 2, bytesTotal: 5 }
    worker.reply({ id: message.id, kind: 'progress', progress })
    expect(onProgress).toHaveBeenCalledWith(progress)

    const summary = {
      files: 1,
      handsImported: 3,
      handsAlreadyPresent: 0,
      handsQuarantined: 0,
      unrecognisedFiles: [],
      errors: [],
    }
    const status = { handCount: 3, persistent: true }
    worker.reply({ id: message.id, kind: 'ingested', summary, status })
    await expect(pending).resolves.toEqual({ summary, status })
  })

  it('reads File objects into bytes before sending them', async () => {
    const { worker, client } = setup()
    void client.ingest([new File(['abc'], 'x.txt')])
    await vi.waitFor(() => expect(worker.sent).toHaveLength(1))
    const message = worker.last()
    expect(message.kind === 'ingest' && message.files[0]?.bytes.byteLength).toBe(3)
  })

  it('rejects with the message of an `error` answer', async () => {
    const { worker, client } = setup()
    const pending = client.wipe()
    worker.reply({ id: worker.last().id, kind: 'error', message: 'chiudi le altre schede' })
    await expect(pending).rejects.toThrow('chiudi le altre schede')
  })

  it('fails everything in flight, and everything after, once the Worker dies', async () => {
    const { worker, client } = setup()
    const pending = client.status()
    worker.crash('boom')
    await expect(pending).rejects.toThrow(/si è fermato: boom/)
    await expect(client.status()).rejects.toThrow(/si è fermato/)
  })
})

/**
 * The views only ever see `Error.message`, so the Worker's transport must
 * reject exactly where and how `httpTransport` does: same status rule, same
 * message, for every shape of failure the server can produce.
 */
describe('error semantics match httpTransport', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  type Answer = { status: number; body: unknown }

  /** Express's answer, as `fetch` would deliver it to httpTransport. */
  function viaHttp(answer: Answer): Transport {
    globalThis.fetch = vi.fn(async () => ({
      ok: answer.status >= 200 && answer.status <= 299,
      status: answer.status,
      json: async () => {
        if (answer.body === undefined) throw new SyntaxError('Unexpected token < in JSON')
        return answer.body
      },
    })) as unknown as typeof fetch
    return httpTransport
  }

  /** The same answer, from the Worker. */
  function viaWorker(answer: Answer): Transport {
    const worker = new FakeWorker()
    const client = new WorkerClient(worker)
    const original = worker.postMessage.bind(worker)
    worker.postMessage = (message, transfer) => {
      original(message, transfer)
      queueMicrotask(() => worker.reply({ id: message.id, kind: 'api', ...answer }))
    }
    return client.transport
  }

  async function outcome(transport: Transport, method: 'get' | 'post', path: string): Promise<string> {
    try {
      const value = method === 'get' ? await transport.get(path, '') : await transport.post(path, {})
      return `ok ${JSON.stringify(value)}`
    } catch (cause) {
      return `error ${(cause as Error).message}`
    }
  }

  const cases: [string, Answer][] = [
    ['a 200', { status: 200, body: { hands: 3 } }],
    ['a 400 with {error}', { status: 400, body: { error: 'range non valido' } }],
    ['a 404 for an unknown route', { status: 404, body: { error: 'route non trovata' } }],
    ['a 404 without {error}', { status: 404, body: { nope: true } }],
    ['a 500 whose body is not JSON', { status: 500, body: undefined }],
  ]

  for (const [label, answer] of cases) {
    for (const method of ['get', 'post'] as const) {
      it(`${method}: ${label}`, async () => {
        const expected = await outcome(viaHttp(answer), method, '/hand/x/equity')
        const actual = await outcome(viaWorker(answer), method, '/hand/x/equity')
        expect(actual).toBe(expected)
      })
    }
  }
})
