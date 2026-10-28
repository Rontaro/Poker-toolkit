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
 * The transport is the only thing a future web/Worker-backed app needs to
 * swap. Views never see this interface -- they only ever call `get`/`post`
 * below, unchanged. `query` is the already-built query string, either empty
 * or starting with `?`, to keep `httpTransport` a one-to-one match of what
 * `get`/`post` did before this indirection existed.
 */
export interface Transport {
  get<T>(path: string, query: string): Promise<T>
  post<T>(path: string, body: unknown): Promise<T>
}

const httpTransport: Transport = {
  async get<T>(path: string, query: string): Promise<T> {
    const response = await fetch(`/api${path}${query}`)
    if (!response.ok) throw new Error(`${path}: ${response.status}`)
    return (await response.json()) as T
  },
  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const detail = (await response.json().catch(() => ({}))) as { error?: string }
      throw new Error(detail.error ?? `${path}: ${response.status}`)
    }
    return (await response.json()) as T
  },
}

let activeTransport: Transport = httpTransport

/** Lets a consumer (e.g. the future web Worker-backed app) swap the fetch
 * transport for its own, without any view needing to know which is active. */
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
