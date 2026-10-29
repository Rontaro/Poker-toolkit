import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build, parseAst, type Plugin } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { cspDirectives, headersFor, parseHeadersFile } from '../scripts/cf-headers.js'

/**
 * The privacy page promises that the hands never leave the browser. This is
 * the safety net under that promise: it builds the site for real (the same
 * `vite build`, same config, into a temporary folder, so a missing or stale
 * `dist/` can never make it pass) and fails if the result could reach
 * anything but its own origin, or carries code that only makes sense on a
 * server.
 *
 * What it checks, and how:
 *
 * 1. **Server-only modules.** Vite does not leave `import 'node:fs'` in a
 *    browser bundle: it swaps the module for an empty one and only warns, so
 *    the import is gone from the output. The build therefore runs with a
 *    plugin, in the page's build and in the Worker's, that records every
 *    import specifier any module asks for; a Node built-in (`node:*` or a bare
 *    `fs`, `path`, …), `chokidar` or `express` fails the test, with the module
 *    that asked for it. The emitted code is also searched (by syntax tree) for
 *    `import`/`export … from`, `import()` and `require()` of the same names.
 *    Conservative on purpose: an import inside a branch the bundler later
 *    drops still counts.
 *
 * 2. **Network calls to another host.** Every emitted JavaScript file — entry,
 *    chunks, the Worker and the sqlite-wasm helpers — is parsed with Rollup's
 *    parser (`parseAst`), so comments and licence banners never count. Then:
 *    - a call that opens a connection — `fetch()`, `importScripts()`,
 *      `XMLHttpRequest#open(method, url)`, `new Request/Worker/SharedWorker()`,
 *      `import()` — fails when its URL argument is statically an absolute URL
 *      on another host: a string, the head of a template or of a `+`
 *      concatenation, or `new URL(…)` built from one;
 *    - `new WebSocket()`, `new EventSource()` and `sendBeacon()` fail whatever
 *      their argument: a static site has no endpoint for them;
 *    - every absolute `http(s)://`/`ws(s)://` URL written anywhere in a string
 *      or template must be on `KNOWN_URLS` below, each entry with the reason it
 *      is harmless (XML namespaces, error-message links, links the user
 *      clicks). That is what catches the indirect case, a URL stored in a
 *      variable and passed to `fetch` later, which point 2's first check
 *      cannot follow.
 *
 * 3. **The HTML**: `index.html` may not load anything from another host
 *    (`<script src>`, `<link href>`, `<img src>`, …), nor carry inline scripts
 *    or styles, which the CSP would refuse anyway. `<meta>` URLs (Open Graph)
 *    are for crawlers and are not checked.
 *
 * 4. **The policy itself**: `public/_headers` must give `/*` (pages and the
 *    Worker script alike) a CSP with exactly `connect-src 'self'`, and the
 *    build must ship that file unchanged.
 *
 * Limits: this is a safety net, not a proof. A URL assembled at run time from
 * pieces that are not a URL on their own (`'ht' + 'tps://' + host`), or read
 * from somewhere, gets past points 1–2. That is what the CSP is for: whatever
 * the code tries, the browser refuses connections to other origins. This test
 * makes sure the code does not try, and that the CSP stays in place.
 */

const here = dirname(fileURLToPath(import.meta.url))
const WEB = join(here, '..')

/** Where the site is served: an absolute URL here is not "another host". */
const SITE_HOST = 'poker.rontaro.com'

/** Absolute URLs allowed to appear in string literals of the bundle. An entry
 * ending in `/` matches any URL that starts with it; any other must match
 * exactly. */
const KNOWN_URLS: readonly { readonly url: string; readonly why: string }[] = [
  { url: 'http://www.w3.org/1999/xlink', why: 'XML namespace name (React DOM, createElementNS): an identifier, never fetched' },
  { url: 'http://www.w3.org/2000/svg', why: 'XML namespace name (React DOM, Recharts): an identifier, never fetched' },
  { url: 'http://www.w3.org/XML/1998/namespace', why: 'XML namespace name (React DOM): an identifier, never fetched' },
  { url: 'http://www.w3.org/1998/Math/MathML', why: 'XML namespace name (React DOM): an identifier, never fetched' },
  { url: 'https://react.dev/errors/', why: "text of React's production error messages" },
  { url: 'http://fb.me/use-check-prop-types', why: "text of prop-types' warning (bundled with Recharts)" },
  { url: 'https://sqlite.org/wasm/doc/', why: "text of sqlite-wasm's error messages" },
  { url: 'https://github.com/Rontaro/Poker-toolkit', why: "the footer's link to the source: a navigation the user chooses, not a connection" },
  { url: 'https://www.rontaro.com', why: "the footer's link to the author: a navigation the user chooses, not a connection" },
  { url: 'http://worker.invalid', why: "base for URL parsing in worker/client.ts; `.invalid` can never resolve (RFC 2606)" },
]

const SERVER_PACKAGES = /^(chokidar|express)(\/|$)/
const NODE_BUILTINS = new Set(builtinModules.filter((name) => !name.startsWith('_')))

/** Why `specifier` has no place in a browser bundle, if it has none. */
function forbiddenModule(specifier: string): string | undefined {
  if (specifier.startsWith('node:')) return 'a Node built-in'
  if (NODE_BUILTINS.has(specifier) || NODE_BUILTINS.has(specifier.split('/')[0] ?? '')) return 'a Node built-in'
  if (SERVER_PACKAGES.test(specifier)) return 'a server-side package'
  return undefined
}

/** An absolute (or protocol-relative) URL on a host other than the site's. */
function isExternalUrl(url: string): boolean {
  const absolute = /^(?:(?:https?|wss?|ftp):)?\/\/([^/?#\s]*)/i.exec(url.trim())
  if (absolute === null) return false
  return (absolute[1] ?? '').toLowerCase() !== SITE_HOST
}

function isKnownUrl(url: string): boolean {
  return KNOWN_URLS.some((known) => (known.url.endsWith('/') ? url.startsWith(known.url) : url === known.url))
}

// --- A minimal ESTree walk -------------------------------------------------

interface AstNode {
  readonly type: string
  readonly start: number
  readonly end: number
  readonly [key: string]: unknown
}

function isNode(value: unknown): value is AstNode {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string'
}

function walk(node: unknown, visit: (node: AstNode) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (!isNode(node)) return
  visit(node)
  for (const key of Object.keys(node)) {
    const value = node[key]
    if (typeof value === 'object' && value !== null) walk(value, visit)
  }
}

function child(node: AstNode, key: string): AstNode | undefined {
  const value = node[key]
  return isNode(value) ? value : undefined
}

function children(node: AstNode, key: string): AstNode[] {
  const value = node[key]
  return Array.isArray(value) ? value.filter(isNode) : []
}

function stringValue(node: AstNode | undefined): string | undefined {
  return node?.type === 'Literal' && typeof node['value'] === 'string' ? node['value'] : undefined
}

/** `fetch` for `fetch`, `self.fetch`, `x["fetch"]`; `undefined` otherwise. */
function calleeName(callee: AstNode | undefined): string | undefined {
  if (callee === undefined) return undefined
  if (callee.type === 'Identifier') return callee['name'] as string
  if (callee.type === 'MemberExpression') {
    const property = child(callee, 'property')
    if (property === undefined) return undefined
    return callee['computed'] === true ? stringValue(property) : (property['name'] as string | undefined)
  }
  return undefined
}

/** What a URL argument is known to start with, read off the syntax alone. */
function staticPrefix(node: AstNode | undefined): string | undefined {
  if (node === undefined) return undefined
  switch (node.type) {
    case 'Literal':
      return stringValue(node)
    case 'TemplateLiteral': {
      const first = children(node, 'quasis')[0]
      const value = first?.['value'] as { cooked?: string; raw: string } | undefined
      return value?.cooked ?? value?.raw
    }
    case 'BinaryExpression':
      return node['operator'] === '+' ? staticPrefix(child(node, 'left')) : undefined
    case 'NewExpression': {
      if (calleeName(child(node, 'callee')) !== 'URL') return undefined
      const [input, base] = children(node, 'arguments')
      const own = staticPrefix(input)
      if (own !== undefined && isExternalUrl(own)) return own
      const from = staticPrefix(base)
      return from !== undefined && isExternalUrl(from) ? from : own
    }
    default:
      return undefined
  }
}

const HTTP_METHOD = /^(GET|HEAD|POST|PUT|DELETE|PATCH|OPTIONS)$/i

/** The arguments of `node` that are URLs it connects to, and whether any use
 * of it at all is a finding. */
function networkSink(node: AstNode): { readonly name: string; readonly urls: AstNode[]; readonly always?: true } | undefined {
  const args = children(node, 'arguments')
  if (node.type === 'CallExpression') {
    const name = calleeName(child(node, 'callee'))
    if (name === 'fetch') return { name, urls: args.slice(0, 1) }
    if (name === 'importScripts') return { name, urls: args }
    if (name === 'sendBeacon') return { name, urls: args.slice(0, 1), always: true }
    if (name === 'open' && args.length >= 2 && HTTP_METHOD.test(stringValue(args[0]) ?? '')) {
      return { name: 'XMLHttpRequest#open', urls: args.slice(1, 2) }
    }
    return undefined
  }
  if (node.type === 'NewExpression') {
    const name = calleeName(child(node, 'callee'))
    if (name === 'WebSocket' || name === 'EventSource') return { name: `new ${name}`, urls: args.slice(0, 1), always: true }
    if (name === 'Request' || name === 'Worker' || name === 'SharedWorker') return { name: `new ${name}`, urls: args.slice(0, 1) }
    return undefined
  }
  if (node.type === 'ImportExpression') {
    const source = child(node, 'source')
    return { name: 'import()', urls: source === undefined ? [] : [source] }
  }
  return undefined
}

/** Specifiers this module imports, re-exports or requires, as written. */
function moduleSpecifier(node: AstNode): string | undefined {
  switch (node.type) {
    case 'ImportDeclaration':
    case 'ExportNamedDeclaration':
    case 'ExportAllDeclaration':
    case 'ImportExpression':
      return stringValue(child(node, 'source'))
    case 'CallExpression': {
      const callee = child(node, 'callee')
      return callee?.type === 'Identifier' && callee['name'] === 'require'
        ? stringValue(children(node, 'arguments')[0])
        : undefined
    }
    default:
      return undefined
  }
}

/** Everything wrong with one emitted JavaScript file. */
function scanScript(file: string, code: string): string[] {
  const findings: string[] = []
  const at = (node: AstNode, message: string): void => {
    const snippet = code.slice(node.start, Math.min(node.end, node.start + 120)).replace(/\s+/g, ' ')
    findings.push(`${file} @${node.start}: ${message} -- ${snippet}`)
  }

  walk(parseAst(code), (node) => {
    const specifier = moduleSpecifier(node)
    if (specifier !== undefined) {
      const why = forbiddenModule(specifier)
      if (why !== undefined) at(node, `imports "${specifier}", ${why}`)
    }

    const sink = networkSink(node)
    if (sink !== undefined) {
      if (sink.always === true) at(node, `${sink.name}: a static site has nothing to talk to over it`)
      for (const argument of sink.urls) {
        const url = staticPrefix(argument)
        if (url !== undefined && isExternalUrl(url)) at(node, `${sink.name} to another host: ${url}`)
      }
    }

    let text: string | undefined
    if (node.type === 'Literal') text = stringValue(node)
    else if (node.type === 'TemplateElement') {
      const value = node['value'] as { cooked?: string; raw: string }
      text = value.cooked ?? value.raw
    }
    if (text !== undefined) {
      for (const [url] of text.matchAll(/\b(?:https?|wss?):\/\/[^\s"'`<>()\\]+/gi)) {
        if (isExternalUrl(url) && !isKnownUrl(url)) {
          at(node, `an absolute URL that is not on KNOWN_URLS: ${url} (if it is harmless, add it there with the reason)`)
        }
      }
    }
  })
  return findings
}

/** Everything in `index.html` that loads from another host or would trip the CSP. */
function scanHtml(file: string, html: string): string[] {
  const findings: string[] = []
  for (const [tag, name] of html.matchAll(/<(script|link|img|iframe|frame|source|video|audio|embed|object|track|input|image|use)\b[^>]*>/gi)) {
    const attributes = [...tag.matchAll(/\s(src|href|srcset|data|poster|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)]
    for (const [, attribute, ...values] of attributes) {
      const value = values.find((candidate) => candidate !== undefined) ?? ''
      const urls = attribute?.toLowerCase() === 'srcset' ? value.split(',').map((part) => part.trim().split(/\s+/)[0] ?? '') : [value]
      for (const url of urls) {
        if (isExternalUrl(url)) findings.push(`${file}: <${name}> loads from another host: ${url}`)
      }
    }
    if (name?.toLowerCase() === 'script' && !/\ssrc\s*=/i.test(tag)) {
      findings.push(`${file}: an inline <script>, which script-src 'self' refuses`)
    }
  }
  if (/<style\b/i.test(html)) findings.push(`${file}: an inline <style>, which style-src 'self' refuses`)
  if (/<[a-z][^>]*\sstyle\s*=/i.test(html)) findings.push(`${file}: a style="" attribute, which style-src 'self' refuses`)
  return findings
}

// --- The build -------------------------------------------------------------

interface Requested {
  readonly build: 'page' | 'worker'
  readonly specifier: string
  readonly importer: string | undefined
}

function recordImports(build: Requested['build'], into: Requested[]): Plugin {
  return {
    name: 'bundle-isolation:record-imports',
    enforce: 'pre',
    resolveId(specifier, importer) {
      into.push({ build, specifier, importer: importer === undefined ? undefined : relative(WEB, importer) })
      return null
    },
  }
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

let outDir = ''
const requested: Requested[] = []
let emitted: string[] = []

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), 'poker-web-isolation-'))
  // Vitest runs with NODE_ENV=test, and Vite takes an explicit NODE_ENV over
  // its mode: without this it would build React's development bundle, not the
  // one that ships.
  const nodeEnv = process.env['NODE_ENV']
  process.env['NODE_ENV'] = 'production'
  try {
    await build({
      root: WEB,
      configFile: join(WEB, 'vite.config.ts'),
      mode: 'production',
      logLevel: 'error',
      build: { outDir, emptyOutDir: true },
      plugins: [recordImports('page', requested)],
      worker: { plugins: () => [recordImports('worker', requested)] },
    })
  } finally {
    process.env['NODE_ENV'] = nodeEnv
  }
  emitted = filesUnder(outDir).map((path) => relative(outDir, path).replace(/\\/g, '/'))
}, 180_000)

afterAll(() => {
  if (outDir !== '') rmSync(outDir, { recursive: true, force: true })
})

describe('the web bundle', () => {
  it('was actually built, Worker included, so the checks below cannot pass on nothing', () => {
    expect(emitted).toContain('index.html')
    expect(emitted.some((file) => /^assets\/poker-worker-[\w-]+\.js$/.test(file))).toBe(true)
    expect(requested.some((entry) => entry.build === 'worker')).toBe(true)
  })

  it('never asks for a Node built-in, chokidar or express, in the page or in the Worker', () => {
    const findings = requested.flatMap(({ build, specifier, importer }) => {
      const why = forbiddenModule(specifier)
      return why === undefined ? [] : [`${build}: "${specifier}" (${why}) imported by ${importer ?? '(entry)'}`]
    })
    expect(findings).toEqual([])
  })

  it('emits no JavaScript that imports server modules or connects to another host', () => {
    const scripts = emitted.filter((file) => /\.m?js$/.test(file))
    expect(scripts.length).toBeGreaterThan(5)
    const findings = scripts.flatMap((file) => scanScript(file, readFileSync(join(outDir, file), 'utf8')))
    expect(findings).toEqual([])
  })

  it('emits an index.html that loads nothing from another host and nothing inline', () => {
    expect(scanHtml('index.html', readFileSync(join(outDir, 'index.html'), 'utf8'))).toEqual([])
  })

  it("ships public/_headers unchanged, with connect-src 'self' for every page and the Worker", () => {
    const source = readFileSync(join(WEB, 'public', '_headers'), 'utf8')
    expect(readFileSync(join(outDir, '_headers'), 'utf8')).toBe(source)

    const rules = parseHeadersFile(source)
    expect(rules.some((rule) => rule.pattern === '/*')).toBe(true)
    for (const path of ['/', '/app', '/assets/poker-worker.js']) {
      const policy = headersFor(rules, path).set.get('content-security-policy')?.[1]
      expect(policy, `no Content-Security-Policy for ${path}`).toBeDefined()
      expect(cspDirectives(policy ?? '').get('connect-src'), `connect-src for ${path}`).toEqual(["'self'"])
    }
  })
})
