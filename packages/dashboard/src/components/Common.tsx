import { useEffect, useState, type ReactNode } from 'react'

import { get, type Filters } from '../api.js'

/** Loads once per filter change and hands the view its data or an empty state. */
export function useResource<T>(path: string, filters: Filters): {
  data: T | undefined
  error: string | undefined
} {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    setData(undefined)
    setError(undefined)

    get<T>(path, filters)
      .then((value) => {
        if (!cancelled) setData(value)
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message)
      })

    return () => {
      cancelled = true
    }
  }, [path, JSON.stringify(filters)])

  return { data, error }
}

export function Empty({ children }: { children: ReactNode }): JSX.Element {
  return <div className="empty">{children}</div>
}

export function NoHands(): JSX.Element {
  return (
    <Empty>
      <h3>Nessuna mano in archivio</h3>
      <p>
        Importa le hand history con <code>pnpm ingest</code>, oppure lascia{' '}
        <code>pnpm watch</code> in ascolto mentre giochi.
      </p>
    </Empty>
  )
}

export function Panel({
  title,
  meta,
  children,
}: {
  title: string
  meta?: string | undefined
  children: ReactNode
}): JSX.Element {
  return (
    <section className="panel">
      <header>
        <h3>{title}</h3>
        {meta !== undefined && <span>{meta}</span>}
      </header>
      {children}
    </section>
  )
}

export function Figure({
  label,
  value,
  unit,
  tone,
  note,
}: {
  label: string
  value: string
  unit?: string | undefined
  tone?: string | undefined
  note?: string | undefined
}): JSX.Element {
  return (
    <div className="figure">
      <dt>{label}</dt>
      <dd className={tone}>
        {value}
        {unit !== undefined && <span className="unit">{unit}</span>}
      </dd>
      {note !== undefined && <small>{note}</small>}
    </div>
  )
}

/**
 * A word with its explanation attached.
 *
 * Poker statistics are almost all acronyms, and an acronym the reader cannot
 * expand is decoration. Rather than a glossary they have to go and find, every
 * term carries its own definition wherever it appears.
 */
export function Term({
  children,
  explain,
}: {
  children: ReactNode
  explain: string | undefined
}): JSX.Element {
  if (explain === undefined || explain === '') return <>{children}</>
  return (
    <span className="term" tabIndex={0}>
      {children}
      <span className="bubble">{explain}</span>
    </span>
  )
}
