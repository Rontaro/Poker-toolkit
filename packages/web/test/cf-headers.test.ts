import { describe, expect, it } from 'vitest'

import { cspDirectives, headersFor, parseHeadersFile } from '../scripts/cf-headers.js'

const FILE = [
  '# a comment, and a blank line after it',
  '',
  '/*',
  '  Content-Security-Policy: default-src \'self\'; connect-src \'self\'',
  '  X-Frame-Options: DENY',
  '  Link: </a.css>; rel=preload',
  '',
  '/assets/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '  Link: </b.css>; rel=preload',
  '',
  '/embed/:page',
  '  ! X-Frame-Options',
  '',
  'https://other.example/*',
  '  X-Only-There: yes',
].join('\r\n')

/** `name → value` for the headers Pages would send on `path`. */
function sent(path: string): Record<string, string> {
  const { set } = headersFor(parseHeadersFile(FILE), path)
  return Object.fromEntries([...set.values()])
}

describe('parseHeadersFile', () => {
  it('reads rules, headers and detaches, skipping comments and blank lines', () => {
    expect(parseHeadersFile(FILE)).toEqual([
      {
        pattern: '/*',
        set: [
          ['Content-Security-Policy', "default-src 'self'; connect-src 'self'"],
          ['X-Frame-Options', 'DENY'],
          ['Link', '</a.css>; rel=preload'],
        ],
        detach: [],
      },
      {
        pattern: '/assets/*',
        set: [
          ['Cache-Control', 'public, max-age=31536000, immutable'],
          ['Link', '</b.css>; rel=preload'],
        ],
        detach: [],
      },
      { pattern: '/embed/:page', set: [], detach: ['X-Frame-Options'] },
      { pattern: 'https://other.example/*', set: [['X-Only-There', 'yes']], detach: [] },
    ])
  })

  it('refuses a header before any path, a line that is not a header, and a path with spaces', () => {
    expect(() => parseHeadersFile('  X-Frame-Options: DENY')).toThrow(/line 1: a header before any path/)
    expect(() => parseHeadersFile('/*\n  not a header')).toThrow(/line 2: expected "Name: value"/)
    expect(() => parseHeadersFile('/a b')).toThrow(/line 1: a path cannot contain spaces/)
  })
})

describe('headersFor', () => {
  it('applies /* to every path, and only /* outside /assets/', () => {
    expect(sent('/')).toEqual({
      'Content-Security-Policy': "default-src 'self'; connect-src 'self'",
      'X-Frame-Options': 'DENY',
      Link: '</a.css>; rel=preload',
    })
    expect(sent('/app')).toEqual(sent('/'))
  })

  it('adds /assets/* on top of /*, joining a header both set with ", "', () => {
    expect(sent('/assets/poker-worker-abc.js')).toEqual({
      'Content-Security-Policy': "default-src 'self'; connect-src 'self'",
      'X-Frame-Options': 'DENY',
      Link: '</a.css>; rel=preload, </b.css>; rel=preload',
      'Cache-Control': 'public, max-age=31536000, immutable',
    })
  })

  it('lets "! Name" detach a header a broader rule set, on the paths its own pattern matches', () => {
    const resolved = headersFor(parseHeadersFile(FILE), '/embed/one')
    expect(resolved.set.has('x-frame-options')).toBe(false)
    expect(resolved.detach.has('x-frame-options')).toBe(true)
    expect(resolved.set.has('content-security-policy')).toBe(true)
    // `:page` is one segment: a deeper path is not that rule's.
    expect(sent('/embed/one/two')['X-Frame-Options']).toBe('DENY')
  })

  it('never applies a rule written for a host', () => {
    expect(sent('/anything')['X-Only-There']).toBeUndefined()
  })

  it('matches header names without regard to case when joining', () => {
    const rules = parseHeadersFile('/*\n  vary: Accept\n/x\n  Vary: Origin')
    expect(headersFor(rules, '/x').set.get('vary')).toEqual(['vary', 'Accept, Origin'])
  })
})

describe('cspDirectives', () => {
  it('splits a policy into lower-cased directives and their sources', () => {
    const directives = cspDirectives("Default-Src 'self'; connect-src 'self' ;; img-src 'self' data:")
    expect(directives.get('default-src')).toEqual(["'self'"])
    expect(directives.get('connect-src')).toEqual(["'self'"])
    expect(directives.get('img-src')).toEqual(["'self'", 'data:'])
    expect(directives.size).toBe(3)
  })
})
