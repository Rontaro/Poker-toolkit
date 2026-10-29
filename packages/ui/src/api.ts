/** Types shared with the server, and the fetches that use them. */

export interface Filters {
  gameType: string
  minSeats: string
  maxSeats: string
  minBb: string
  maxBb: string
  from: string
  to: string
}

export const EMPTY_FILTERS: Filters = {
  gameType: '',
  minSeats: '',
  maxSeats: '',
  minBb: '',
  maxBb: '',
  from: '',
  to: '',
}

export type Verdict = 'below' | 'within' | 'above' | 'unknown'

export interface Metric {
  id: string
  label: string
  description: string
  unit: string
  value: number | null
  sampleSize: number
  verdict: Verdict
}

export interface LeakSummary {
  ruleId: string
  label: string
  why: string
  count: number
  totalCostBB: number
  handsSeen: number
}

export interface LeakEvent {
  ruleId: string
  handId: string
  street: string
  costBB: number
  confidence: number
  message: string
  playedAt: string | null
  position: string | null
  netBB: number
}

export interface BankrollPoint {
  index: number
  cumulativeBB: number
  rollingBB100: number | null
  playedAt?: string
}

export function toQuery(filters: Filters): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '') params.set(key, value)
  }
  return params.toString()
}

/**
 * The transport is the only thing the web (Worker-backed) app swaps. Views
 * never see this interface -- they only ever call `get`/`post` below.
 * `query` is the already-built query string, either empty or starting with
 * `?`. A `path` may carry its own query string too
 * (`/hand/abc/equity?range=...`): a transport must treat `path + query` as
 * the URL after `/api`, exactly as `fetch` does.
 *
 * Errors: any non-2xx answer rejects with `Error(body.error)` when the body
 * is JSON carrying an `error` string, else `Error('<path>: <status>')`. Every
 * transport has to keep that contract, since views show the message as is.
 */
export interface Transport {
  get<T>(path: string, query: string): Promise<T>
  post<T>(path: string, body: unknown): Promise<T>
}

/** The rejection every transport produces for a non-2xx answer. */
export function transportError(path: string, status: number, body: unknown): Error {
  const detail = body as { error?: unknown } | null | undefined
  const message = typeof detail?.error === 'string' ? detail.error : undefined
  return new Error(message ?? `${path}: ${status}`)
}

async function failure(path: string, response: Response): Promise<Error> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    // Not JSON (Express's own 500 page), or no body at all.
    body = undefined
  }
  return transportError(path, response.status, body)
}

/** The default: `fetch` against the local Express API, through Vite's proxy. */
export const httpTransport: Transport = {
  async get<T>(path: string, query: string): Promise<T> {
    const response = await fetch(`/api${path}${query}`)
    if (!response.ok) throw await failure(path, response)
    return (await response.json()) as T
  },
  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw await failure(path, response)
    return (await response.json()) as T
  },
}

let activeTransport: Transport = httpTransport

/** Lets a consumer (the web app's Worker) swap the fetch transport for its
 * own, without any view needing to know which is active. */
export function setTransport(transport: Transport): void {
  activeTransport = transport
}

export async function get<T>(path: string, filters?: Filters): Promise<T> {
  const query = filters === undefined ? '' : `?${toQuery(filters)}`
  return activeTransport.get<T>(path, query)
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  return activeTransport.post<T>(path, body)
}

/** Formats a number the way the tables want it: fixed, or a dash. */
export function fixed(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? '—' : value.toFixed(digits)
}

export function signClass(value: number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return value > 0 ? 'pos' : value < 0 ? 'neg' : ''
}
