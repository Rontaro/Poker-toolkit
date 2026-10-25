/**
 * Parsing never throws. A hand history file is user data written by a program
 * we do not control, and one malformed hand must not stop an import: the
 * caller gets a result it can quarantine and carry on.
 */

export type IssueSeverity = 'error' | 'warning'

export interface ParseIssue {
  readonly severity: IssueSeverity
  /** Machine-readable, for grouping quarantined hands: `unknown-action`. */
  readonly code: string
  readonly message: string
  /** 1-based line number within the hand text, when known. */
  readonly line?: number
  /** The offending line, trimmed. */
  readonly text?: string
}

export interface ParseSuccess<T> {
  readonly ok: true
  readonly value: T
  readonly warnings: readonly ParseIssue[]
}

export interface ParseFailure {
  readonly ok: false
  readonly errors: readonly ParseIssue[]
  readonly warnings: readonly ParseIssue[]
  /** The input that could not be parsed, so it can go straight to quarantine. */
  readonly raw: string
}

export type ParseResult<T> = ParseSuccess<T> | ParseFailure

export function ok<T>(value: T, warnings: readonly ParseIssue[] = []): ParseSuccess<T> {
  return { ok: true, value, warnings }
}

export function fail(
  raw: string,
  errors: readonly ParseIssue[],
  warnings: readonly ParseIssue[] = [],
): ParseFailure {
  return { ok: false, errors, warnings, raw }
}

export function issue(
  severity: IssueSeverity,
  code: string,
  message: string,
  extra: { line?: number; text?: string } = {},
): ParseIssue {
  const base = { severity, code, message }
  const withLine = extra.line === undefined ? base : { ...base, line: extra.line }
  return extra.text === undefined ? withLine : { ...withLine, text: extra.text.trim() }
}

export function error(
  code: string,
  message: string,
  extra: { line?: number; text?: string } = {},
): ParseIssue {
  return issue('error', code, message, extra)
}

export function warning(
  code: string,
  message: string,
  extra: { line?: number; text?: string } = {},
): ParseIssue {
  return issue('warning', code, message, extra)
}

/** Collects issues while a parse runs. */
export class IssueLog {
  readonly #issues: ParseIssue[] = []

  add(item: ParseIssue): void {
    this.#issues.push(item)
  }

  warn(code: string, message: string, extra: { line?: number; text?: string } = {}): void {
    this.add(warning(code, message, extra))
  }

  fail(code: string, message: string, extra: { line?: number; text?: string } = {}): void {
    this.add(error(code, message, extra))
  }

  get errors(): ParseIssue[] {
    return this.#issues.filter((i) => i.severity === 'error')
  }

  get warnings(): ParseIssue[] {
    return this.#issues.filter((i) => i.severity === 'warning')
  }

  get hasErrors(): boolean {
    return this.#issues.some((i) => i.severity === 'error')
  }
}
