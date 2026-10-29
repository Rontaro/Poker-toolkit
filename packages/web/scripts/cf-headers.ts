import { readFileSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { join } from 'node:path'

import type { Plugin } from 'vite'

/**
 * Cloudflare Pages' `_headers` file, read the way Pages reads it, so that
 * `vite preview` serves exactly the headers the deployed site will: the file
 * in `public/` is the only place the policy is written down.
 *
 * Format (https://developers.cloudflare.com/pages/configuration/headers/):
 * a line starting with `/` (or `https://`) opens a rule; the indented lines
 * after it are `Name: value` headers, or `! Name` to detach a header a broader
 * rule (or Pages itself) would add. `#` starts a comment. Every rule whose
 * pattern matches the request path applies, in file order, and a header set by
 * more than one of them has its values joined with `, `. In a pattern `*` is a
 * splat (matches anything, `/` included) and `:name` matches one path segment.
 */

export interface HeaderRule {
  readonly pattern: string
  /** Header names keep the case they were written in. */
  readonly set: readonly (readonly [name: string, value: string])[]
  readonly detach: readonly string[]
}

export function parseHeadersFile(text: string): HeaderRule[] {
  const rules: { pattern: string; set: [string, string][]; detach: string[] }[] = []
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const where = `_headers line ${index + 1}`

    if (line.startsWith('/') || /^https?:\/\//.test(line)) {
      if (/\s/.test(line)) throw new Error(`${where}: a path cannot contain spaces: "${line}"`)
      rules.push({ pattern: line, set: [], detach: [] })
      continue
    }

    const rule = rules.at(-1)
    if (rule === undefined) throw new Error(`${where}: a header before any path: "${line}"`)
    if (line.startsWith('!')) {
      rule.detach.push(line.slice(1).trim())
      continue
    }
    const colon = line.indexOf(':')
    if (colon <= 0) throw new Error(`${where}: expected "Name: value": "${line}"`)
    rule.set.push([line.slice(0, colon).trim(), line.slice(colon + 1).trim()])
  }
  return rules
}

function patternToRegExp(pattern: string): RegExp {
  let source = ''
  for (const piece of pattern.split(/(\*|:[A-Za-z]\w*)/)) {
    if (piece === '*') source += '.*'
    else if (/^:[A-Za-z]\w*$/.test(piece)) source += '[^/]+'
    else source += piece.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${source}$`)
}

export interface ResolvedHeaders {
  /** Lower-cased name → [name as written, value]. */
  readonly set: ReadonlyMap<string, readonly [string, string]>
  /** Lower-cased names to remove. */
  readonly detach: ReadonlySet<string>
}

/**
 * The headers Pages would send for `pathname`. Rules written with a host
 * (`https://…`) only apply on that host, so they never match here.
 */
export function headersFor(rules: readonly HeaderRule[], pathname: string): ResolvedHeaders {
  const set = new Map<string, [string, string]>()
  const detach = new Set<string>()
  for (const rule of rules) {
    if (!rule.pattern.startsWith('/') || !patternToRegExp(rule.pattern).test(pathname)) continue
    for (const [name, value] of rule.set) {
      const key = name.toLowerCase()
      const previous = set.get(key)
      set.set(key, previous === undefined ? [name, value] : [previous[0], `${previous[1]}, ${value}`])
    }
    for (const name of rule.detach) detach.add(name.toLowerCase())
  }
  for (const key of detach) set.delete(key)
  return { set, detach }
}

/** A Content-Security-Policy value as a map from directive name (lower case) to its sources. */
export function cspDirectives(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>()
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/)
    if (name !== undefined && name !== '') directives.set(name.toLowerCase(), sources)
  }
  return directives
}

/**
 * Makes `res` go out with `headers`, whatever the static file server put on
 * it: sirv (behind `vite preview`) passes its own `Cache-Control` straight to
 * `writeHead`, which would win over anything set before.
 */
function overrideOnWriteHead(res: ServerResponse, headers: ResolvedHeaders): void {
  const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => ServerResponse
  ;(res as { writeHead: (...args: unknown[]) => ServerResponse }).writeHead = (...args: unknown[]) => {
    const last = args.at(-1)
    if (last !== null && typeof last === 'object' && !Array.isArray(last)) {
      const given = last as Record<string, unknown>
      for (const key of Object.keys(given)) {
        const lower = key.toLowerCase()
        if (headers.set.has(lower) || headers.detach.has(lower)) delete given[key]
      }
    }
    for (const name of headers.detach) res.removeHeader(name)
    for (const [name, value] of headers.set.values()) res.setHeader(name, value)
    return writeHead(...args)
  }
}

/**
 * `vite preview` with the headers of `public/_headers`, re-read on every
 * request so an edit shows without a restart. Not applied to `vite` (dev): the
 * dev server injects inline scripts (React Refresh's preamble) and `<style>`
 * elements (CSS with HMR), which this policy rightly refuses.
 *
 * Like Pages, the file itself is not served.
 */
export function cloudflareHeaders(): Plugin {
  let file = ''
  return {
    name: 'poker:cloudflare-headers',
    configResolved(config) {
      file = join(config.publicDir, '_headers')
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url ?? '/', 'http://preview.invalid').pathname
        if (pathname === '/_headers') {
          res.statusCode = 404
          res.end()
          return
        }
        overrideOnWriteHead(res, headersFor(parseHeadersFile(readFileSync(file, 'utf8')), pathname))
        next()
      })
    },
  }
}
