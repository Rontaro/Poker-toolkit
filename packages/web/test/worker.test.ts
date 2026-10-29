import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

import { BrowserHandStore } from '@poker/store/browser'

import { WorkerClient, type WorkerLike } from '../src/worker/client.js'
import { createWorkerHandler, type WorkerDeps } from '../src/worker/handler.js'
import type { UploadedFile, WorkerRequest, WorkerResponse } from '../src/worker/protocol.js'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(here, '..', '..', 'adapters', 'pokerstars', '__fixtures__', 'pokerstars')

function fixture(name: string, ...path: string[]): UploadedFile {
  const bytes = readFileSync(join(FIXTURES, ...path))
  // A fresh ArrayBuffer of exactly the file, as `File.arrayBuffer()` gives.
  return { name, bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
}

function text(name: string, content: string): UploadedFile {
  return { name, bytes: new TextEncoder().encode(content).buffer as ArrayBuffer }
}

const SESSION = ['en', 'cash', 'nl2-6max-session.txt'] as const

/** The handler wired to an in-memory store, collecting what it posts. */
function worker(overrides: Partial<WorkerDeps> = {}): {
  send: (request: WorkerRequest) => Promise<void>
  posted: WorkerResponse[]
  final: (id: number) => WorkerResponse
  deps: WorkerDeps
} {
  const posted: WorkerResponse[] = []
  const deps: WorkerDeps = {
    openStore: () => BrowserHandStore.create(),
    deleteData: vi.fn(async () => undefined),
    logError: () => undefined,
    ...overrides,
  }
  const send = createWorkerHandler(deps, (response) => posted.push(response))
  const final = (id: number): WorkerResponse => {
    const found = posted.filter((response) => response.id === id && response.kind !== 'progress')
    expect(found).toHaveLength(1)
    return found[0]!
  }
  return { send, posted, final, deps }
}

describe('ingest in the Worker', () => {
  it('imports a real session file, reports progress, and counts the hands', async () => {
    const { send, posted, final } = worker()
    await send({ id: 1, kind: 'ingest', files: [fixture('session.txt', ...SESSION)] })

    expect(final(1)).toMatchObject({
      kind: 'ingested',
      summary: {
        files: 1,
        handsImported: 52,
        handsAlreadyPresent: 0,
        handsQuarantined: 0,
        unrecognisedFiles: [],
        errors: [],
      },
      status: { handCount: 52, persistent: false },
    })

    const progress = posted.flatMap((response) => (response.kind === 'progress' ? [response.progress] : []))
    expect(progress.length).toBeGreaterThanOrEqual(2)
    expect(progress[0]).toMatchObject({ filesDone: 0, filesTotal: 1, currentFile: 'session.txt', handsDone: 0 })
    expect(progress.at(-1)).toMatchObject({ filesDone: 1, handsDone: 52 })
    expect(progress.at(-1)?.bytesDone).toBe(progress.at(-1)?.bytesTotal)
  })

  it('counts a second upload of the same file as already present', async () => {
    const { send, final } = worker()
    await send({ id: 1, kind: 'ingest', files: [fixture('session.txt', ...SESSION)] })
    await send({ id: 2, kind: 'ingest', files: [fixture('again.txt', ...SESSION)] })

    expect(final(2)).toMatchObject({
      summary: { handsImported: 0, handsAlreadyPresent: 52 },
      status: { handCount: 52 },
    })
  })

  it('stores the same hand in two languages once', async () => {
    const { send, final } = worker()
    await send({
      id: 1,
      kind: 'ingest',
      files: [
        fixture('en.txt', 'en', 'cash', 'showdown-mucked-cards.txt'),
        fixture('it.txt', 'it', 'cash', 'showdown-mucked-cards.txt'),
      ],
    })
    expect(final(1)).toMatchObject({
      summary: { files: 2, handsImported: 1, handsAlreadyPresent: 1 },
      status: { handCount: 1 },
    })
  })

  it('quarantines a hand whose arithmetic does not add up, lists files it does not know', async () => {
    const original = readFileSync(join(FIXTURES, 'en', 'cash', 'fold-preflop-no-showdown.txt'), 'utf8')
    const broken = original.replace('Total pot €0.29', 'Total pot €0.39')
    expect(broken).not.toBe(original)

    const { send, final } = worker()
    await send({
      id: 1,
      kind: 'ingest',
      files: [text('broken.txt', broken), text('notes.txt', 'just some text, not a hand history')],
    })
    expect(final(1)).toMatchObject({
      summary: { handsImported: 0, handsQuarantined: 1, unrecognisedFiles: ['notes.txt'], errors: [] },
      status: { handCount: 0 },
    })
  })

  it('keeps going past a file that fails, and says which one', async () => {
    const store = await BrowserHandStore.create()
    const realUpsert = store.upsert.bind(store)
    let calls = 0
    store.upsert = async (hands) => {
      calls += 1
      if (calls === 1) throw new Error('disco pieno')
      return realUpsert(hands)
    }

    const { send, final } = worker({ openStore: async () => store })
    await send({
      id: 1,
      kind: 'ingest',
      files: [fixture('first.txt', ...SESSION), fixture('second.txt', 'en', 'synthetic', 'heads-up.txt')],
    })
    const response = final(1)
    expect(response).toMatchObject({
      summary: {
        errors: [{ file: 'first.txt', message: 'Non sono riuscito a importare questo file: disco pieno' }],
      },
    })
    expect(response.kind === 'ingested' && response.summary.handsImported).toBeGreaterThan(0)
  })
})

describe('ingest in the Worker: re-uploads', () => {
  it('counts a hand quarantined by an earlier upload as already present, not again', async () => {
    const original = readFileSync(join(FIXTURES, 'en', 'cash', 'fold-preflop-no-showdown.txt'), 'utf8')
    const broken = text('broken.txt', original.replace('Total pot €0.29', 'Total pot €0.39'))
    const { send, final } = worker()

    await send({ id: 1, kind: 'ingest', files: [broken] })
    expect(final(1)).toMatchObject({ summary: { handsQuarantined: 1, handsAlreadyPresent: 0 } })

    await send({ id: 2, kind: 'ingest', files: [text('broken.txt', original.replace('Total pot €0.29', 'Total pot €0.39'))] })
    expect(final(2)).toMatchObject({ summary: { handsQuarantined: 0, handsAlreadyPresent: 1 } })
  })
})

describe('API requests in the Worker', () => {
  it('answers through dispatch, with the body as it would arrive over JSON', async () => {
    const { send, final } = worker()
    await send({ id: 1, kind: 'ingest', files: [fixture('session.txt', ...SESSION)] })

    await send({ id: 2, kind: 'api', request: { method: 'GET', path: '/overview', query: {} } })
    expect(final(2)).toMatchObject({ kind: 'api', status: 200, body: { empty: false, hands: 52 } })

    // A note carries a Date: Express sends it as an ISO string, so must this.
    await send({
      id: 3,
      kind: 'api',
      request: { method: 'POST', path: '/notes', query: {}, body: { handId: 'h1', source: 'me', content: 'rivedere' } },
    })
    await send({ id: 4, kind: 'api', request: { method: 'GET', path: '/notes', query: { q: 'rivedere' } } })
    const notes = final(4)
    expect(notes.kind === 'api' && (notes.body as { createdAt: unknown }[])[0]?.createdAt).toEqual(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    )
  })

  it('passes 400/404 answers through with their {error}', async () => {
    const { send, final } = worker()
    await send({ id: 1, kind: 'api', request: { method: 'GET', path: '/nowhere', query: {} } })
    expect(final(1)).toEqual({ id: 1, kind: 'api', status: 404, body: { error: 'route non trovata' } })
  })

  it('answers a thrown exception with a 500 and keeps serving', async () => {
    const store = await BrowserHandStore.create()
    store.query = () => {
      throw new Error('bug')
    }
    const logError = vi.fn()
    const { send, final } = worker({ openStore: async () => store, logError })

    await send({ id: 1, kind: 'api', request: { method: 'GET', path: '/statistics', query: {} } })
    expect(final(1)).toEqual({ id: 1, kind: 'api', status: 500, body: undefined })
    expect(logError).toHaveBeenCalled()

    await send({ id: 2, kind: 'api', request: { method: 'GET', path: '/study/options', query: {} } })
    expect(final(2)).toMatchObject({ kind: 'api', status: 200 })
  })

  it('answers every request with an error when the store cannot be opened', async () => {
    const { send, final } = worker({ openStore: async () => Promise.reject(new Error('wasm mancante')) })
    await send({ id: 1, kind: 'status' })
    expect(final(1)).toMatchObject({ kind: 'error', message: expect.stringContaining('wasm mancante') })
    await send({ id: 2, kind: 'api', request: { method: 'GET', path: '/overview', query: {} } })
    expect(final(2)).toMatchObject({ kind: 'error' })
  })
})

describe('wipe', () => {
  it('closes the store before deleting, then reopens an empty one', async () => {
    const order: string[] = []
    let opened = 0
    const deps: Partial<WorkerDeps> = {
      openStore: async () => {
        opened += 1
        const store = await BrowserHandStore.create()
        const close = store.close.bind(store)
        store.close = () => {
          order.push('close')
          close()
        }
        return store
      },
      deleteData: async () => {
        order.push('delete')
      },
    }
    const { send, final } = worker(deps)
    await send({ id: 1, kind: 'ingest', files: [fixture('session.txt', ...SESSION)] })
    await send({ id: 2, kind: 'wipe' })

    expect(order).toEqual(['close', 'delete'])
    expect(opened).toBe(2)
    expect(final(2)).toMatchObject({ kind: 'wiped', status: { handCount: 0 } })
  })

  it('reports a delete that failed, and keeps working', async () => {
    const { send, final } = worker({
      deleteData: async () => {
        throw new Error('Non riesco ad accedere ai dati salvati: chiudi le altre schede di questo sito e riprova.')
      },
    })
    await send({ id: 1, kind: 'wipe' })
    expect(final(1)).toMatchObject({ kind: 'error', message: expect.stringContaining('chiudi le altre schede') })

    await send({ id: 2, kind: 'status' })
    expect(final(2)).toMatchObject({ kind: 'status', status: { handCount: 0 } })
  })
})

describe('wipe as the way out of an archive that will not open', () => {
  it('deletes and reopens when the first open failed', async () => {
    let attempts = 0
    const deleteData = vi.fn(async () => undefined)
    const { send, final } = worker({
      openStore: async () => {
        attempts += 1
        if (attempts === 1) throw new Error('schema version 9 is newer than this build')
        return BrowserHandStore.create()
      },
      deleteData,
    })

    await send({ id: 1, kind: 'status' })
    expect(final(1)).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('schema version 9 is newer than this build'),
    })

    await send({ id: 2, kind: 'wipe' })
    expect(deleteData).toHaveBeenCalledOnce()
    expect(final(2)).toMatchObject({ kind: 'wiped', status: { handCount: 0 } })

    await send({ id: 3, kind: 'status' })
    expect(final(3)).toMatchObject({ kind: 'status', status: { handCount: 0 } })
  })
})

describe('wipe while another tab holds the saved data', () => {
  it('says the hands of this tab are gone and the saved ones are not', async () => {
    const { send, final } = worker({
      // In memory, as openPersistent() leaves it when the pool is locked.
      openStore: () => BrowserHandStore.create(),
      deleteData: async () => {
        throw new Error('Non riesco ad accedere ai dati salvati: chiudi le altre schede di questo sito e riprova.')
      },
    })
    await send({ id: 1, kind: 'ingest', files: [fixture('session.txt', ...SESSION)] })
    await send({ id: 2, kind: 'wipe' })

    expect(final(2)).toMatchObject({
      kind: 'error',
      message: expect.stringMatching(/^Le mani di questa scheda sono state cancellate\. .*chiudi le altre schede/),
    })
    await send({ id: 3, kind: 'status' })
    expect(final(3)).toMatchObject({ status: { handCount: 0 } })
  })
})

describe('the request queue', () => {
  it('keeps serving after an answer, and its error report, could not be posted', async () => {
    const posted: WorkerResponse[] = []
    let failures = 0
    const send = createWorkerHandler(
      { openStore: () => BrowserHandStore.create(), deleteData: async () => undefined, logError: () => undefined },
      (response) => {
        if (failures > 0) {
          failures -= 1
          throw new Error('DataCloneError')
        }
        posted.push(response)
      },
    )

    // The answer fails to post, the error report then goes through.
    failures = 1
    await send({ id: 1, kind: 'status' })
    expect(posted).toEqual([{ id: 1, kind: 'error', message: 'DataCloneError' }])

    // Both fail: that request's promise rejects, but the queue goes on.
    failures = 2
    await expect(send({ id: 2, kind: 'status' })).rejects.toThrow('DataCloneError')
    await send({ id: 3, kind: 'status' })
    expect(posted.at(-1)).toMatchObject({ id: 3, kind: 'status', status: { handCount: 0 } })
  })
})

/** Page and Worker joined back to back, as `postMessage` would join them. */
describe('client and Worker together', () => {
  function connected(): WorkerClient {
    let deliver: (response: WorkerResponse) => void = () => undefined
    const send = createWorkerHandler(
      { openStore: () => BrowserHandStore.create(), deleteData: async () => undefined, logError: () => undefined },
      (response) => queueMicrotask(() => deliver(response)),
    )
    const fake: WorkerLike = {
      postMessage: (message) => void send(structuredClone(message)),
      addEventListener: (type: string, listener: (event: never) => void) => {
        if (type === 'message') deliver = (response) => listener({ data: structuredClone(response) } as never)
      },
    }
    return new WorkerClient(fake)
  }

  it('serves the views through the transport, errors included', async () => {
    const client = connected()
    const { summary } = await client.ingest([fixture('session.txt', ...SESSION)])
    expect(summary.handsImported).toBe(52)

    const overview = await client.transport.get<{ hands: number }>('/overview', '?gameType=cash')
    expect(overview.hands).toBe(52)

    // What the Leaks view sends: the query on the path, the range encoded.
    await expect(
      client.transport.get(`/hand/does-not-exist/equity?range=${encodeURIComponent('22+, AKs')}`, ''),
    ).rejects.toThrow('mano non trovata')
    await expect(client.transport.get('/hand/x/equity?range=ZZZ', '')).rejects.toThrow(
      '"ZZZ" is not a valid pair, hand shape, range, or explicit combo',
    )

    expect(await client.status()).toMatchObject({ handCount: 52, persistent: false })
    expect(await client.wipe()).toMatchObject({ handCount: 0 })
  })
})
