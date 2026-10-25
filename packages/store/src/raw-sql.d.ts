// Vite/Vitest's `?raw` import suffix loads a file's contents as a plain
// string at build time. `tsc` has no native notion of this -- it needs this
// ambient module declaration to typecheck `import x from '...sql?raw'`
// (see browser-hand-store.ts). It is purely a type-checking shim: the suffix
// still isn't a real module specifier to `node`, which is why the files that
// use it are excluded from this package's `tsc` build (see tsconfig.json).
declare module '*.sql?raw' {
  const content: string
  export default content
}
