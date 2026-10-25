#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'

import type { Hand, HandId } from '@poker/core'
import { ingest, watch } from '@poker/ingest'
import { analyse, buildPrompt, ALL_SELECTORS, PRESETS } from '@poker/prompt-builder'
import { SqliteHandStore, type HandFilter } from '@poker/store'

import { buildReport } from './report.js'

const DEFAULT_DB = join(homedir(), '.poker-toolkit', 'hands.db')

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2)

  switch (command) {
    case 'ingest':
      return await runIngest(rest)
    case 'watch':
      return await runWatch(rest)
    case 'study':
      return await runStudy(rest)
    case 'report':
      return await runReport(rest)
    case undefined:
    case 'help':
    case '--help':
      printHelp()
      return 0
    default:
      process.stderr.write(`Comando sconosciuto: ${command}\n\n`)
      printHelp()
      return 1
  }
}

function printHelp(): void {
  process.stdout.write(`poker — analisi post-sessione delle tue hand history

  poker ingest [--db <file>] [--path <cartella>]... [--force]
      Scansione una tantum delle cartelle del client, con deduplica.

  poker watch [--db <file>] [--path <cartella>]...
      Come ingest, poi resta in ascolto e importa le mani nuove.

  poker study [--selector <id>] [--limit <n>] [--preset <id>] [--leak <id>]
              [--hands <id,id>] [--seed <n>] [--clipboard] [--out <file>]
      Genera il prompt da incollare in chat.

      selector: ${ALL_SELECTORS.map((s) => s.id).join(', ')}
      preset:   ${PRESETS.map((p) => p.id).join(', ')}

  poker report [--since 7d] [--format md] [--out <file>]
      Riepilogo markdown per il vault.

  Opzioni comuni: --db <file> (default ${DEFAULT_DB})
                  --from <YYYY-MM-DD>, --to <YYYY-MM-DD>
`)
}

function openStore(path: string | undefined): SqliteHandStore {
  const file = path ?? DEFAULT_DB
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  return new SqliteHandStore(file)
}

async function runIngest(argv: readonly string[]): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      db: { type: 'string' },
      path: { type: 'string', multiple: true },
      force: { type: 'boolean' },
    },
  })

  const store = openStore(values.db)
  try {
    const result = await ingest({
      store,
      ...(values.path === undefined ? {} : { paths: values.path }),
      ...(values.force === undefined ? {} : { force: values.force }),
      onProgress: (event) => {
        if (event.kind === 'file-done') {
          process.stdout.write(
            `  ${event.path}: ${event.parsed} mani` +
              (event.quarantined > 0 ? `, ${event.quarantined} in quarantena` : '') +
              '\n',
          )
        }
      },
    })

    process.stdout.write(
      `\n${result.handsParsed} mani da ${result.filesRead} file ` +
        `(${result.filesSkipped} invariati, ${result.handsQuarantined} in quarantena)\n`,
    )
    if (result.filesUnrecognised.length > 0) {
      process.stdout.write(`${result.filesUnrecognised.length} file non riconosciuti\n`)
    }
    return 0
  } finally {
    store.close()
  }
}

async function runWatch(argv: readonly string[]): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: { db: { type: 'string' }, path: { type: 'string', multiple: true } },
  })

  const store = openStore(values.db)
  const watcher = watch({
    store,
    ...(values.path === undefined ? {} : { paths: values.path }),
    onProgress: (event) => {
      if (event.kind === 'file-done' && event.parsed > 0) {
        process.stdout.write(`  ${new Date().toISOString().slice(11, 19)} ${event.path}: ${event.parsed} mani\n`)
      }
    },
    onError: (error) => process.stderr.write(`errore: ${error.message}\n`),
  })

  await watcher.ready
  process.stdout.write('In ascolto. Ctrl-C per uscire.\n')

  await new Promise<void>((resolve) => {
    const stop = (): void => {
      void watcher.close().then(() => {
        store.close()
        resolve()
      })
    }
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
  })
  return 0
}

function filterFrom(values: Record<string, unknown>): HandFilter {
  const from = typeof values['from'] === 'string' ? new Date(values['from']) : undefined
  const to = typeof values['to'] === 'string' ? new Date(values['to']) : undefined
  return {
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
  }
}

async function collect(store: SqliteHandStore, filter: HandFilter): Promise<Hand[]> {
  const hands: Hand[] = []
  for await (const hand of store.query(filter)) hands.push(hand)
  return hands
}

async function runStudy(argv: readonly string[]): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      db: { type: 'string' },
      selector: { type: 'string' },
      limit: { type: 'string' },
      preset: { type: 'string' },
      leak: { type: 'string' },
      hands: { type: 'string' },
      seed: { type: 'string' },
      clipboard: { type: 'boolean' },
      out: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
    },
  })

  const store = openStore(values.db)
  try {
    const explicit = values.hands?.split(',').map((id) => id.trim()) as HandId[] | undefined
    const filter: HandFilter = {
      ...filterFrom(values as Record<string, unknown>),
      ...(explicit === undefined ? {} : { handIds: explicit }),
    }

    const hands = await collect(store, filter)
    if (hands.length === 0) {
      process.stderr.write('Nessuna mano nel database per questo filtro. Hai lanciato `poker ingest`?\n')
      return 1
    }

    const sample = await analyse(hands)
    const built = await buildPrompt({
      sample,
      // Explicit hand ids mean the caller already chose; take them in order.
      selector: explicit === undefined ? (values.selector ?? 'biggest-losses') : 'random-sample',
      preset: values.preset ?? 'full',
      ...(values.limit === undefined
        ? explicit === undefined
          ? {}
          : { limit: explicit.length }
        : { limit: Number(values.limit) }),
      ...(values.leak === undefined ? {} : { leakId: values.leak }),
      ...(values.seed === undefined ? {} : { seed: Number(values.seed) }),
    })

    if (values.out !== undefined) {
      mkdirSync(dirname(values.out), { recursive: true })
      writeFileSync(values.out, built.text, 'utf-8')
      process.stdout.write(`Scritto in ${values.out} (${built.characters} caratteri)\n`)
    }

    if (values.clipboard === true) {
      const { default: clipboard } = await import('clipboardy')
      await clipboard.write(built.text)
      process.stdout.write(
        `Prompt negli appunti: ${built.hands.length} mani, ${built.characters} caratteri.\n`,
      )
      return 0
    }

    if (values.out === undefined) process.stdout.write(`${built.text}\n`)
    return 0
  } finally {
    store.close()
  }
}

/** `7d`, `24h`, `2w`, or a plain date. */
function parseSince(value: string): Date | undefined {
  const relative = /^(\d+)([hdw])$/.exec(value.trim())
  if (relative !== null) {
    const amount = Number(relative[1])
    const unit = relative[2]
    const hours = unit === 'h' ? amount : unit === 'd' ? amount * 24 : amount * 24 * 7
    return new Date(Date.now() - hours * 3_600_000)
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

async function runReport(argv: readonly string[]): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      db: { type: 'string' },
      since: { type: 'string' },
      format: { type: 'string' },
      out: { type: 'string' },
    },
  })

  if (values.format !== undefined && values.format !== 'md') {
    process.stderr.write(`Formato non supportato: ${values.format}. Solo "md".\n`)
    return 1
  }

  const since = values.since === undefined ? undefined : parseSince(values.since)
  if (values.since !== undefined && since === undefined) {
    process.stderr.write(`Non capisco --since ${values.since}. Usa 7d, 24h, 2w o una data.\n`)
    return 1
  }

  const store = openStore(values.db)
  try {
    const hands = await collect(store, since === undefined ? {} : { from: since })
    const markdown = await buildReport({
      hands,
      ...(since === undefined ? {} : { since }),
      title: `Report poker — ${new Date().toISOString().slice(0, 10)}`,
    })

    if (values.out === undefined) {
      process.stdout.write(markdown)
    } else {
      mkdirSync(dirname(values.out), { recursive: true })
      writeFileSync(values.out, markdown, 'utf-8')
      process.stdout.write(`Scritto in ${values.out}\n`)
    }
    return 0
  } finally {
    store.close()
  }
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error: unknown) => {
    process.stderr.write(`${(error as Error).message}\n`)
    process.exitCode = 1
  })
