# CLAUDE.md — poker-toolkit

Post-session analysis of PokerStars hand histories. Ingests hand history files,
computes statistics, detects recurring leaks, and assembles a prompt to paste
into a chat for the qualitative half of the analysis.

> **Nothing here calls a model or any external service.** The tool prepares the
> package and stops. No HUD, no real-time reading, no API keys. That is the
> design, not a limitation of it — and it is what keeps the tool on the right
> side of the site's rules, which permit post-session analysis of your own
> exported hands and forbid real-time assistance.

Two ways to run it, same packages underneath:

- **Local**: CLI, `watch`, and the dashboard (Express over `node:sqlite`).
- **Web**: `packages/web`, public at https://poker.rontaro.com. Everything runs
  in the browser — the store is sqlite-wasm on OPFS inside a Web Worker, and
  there is no server. The rule above holds there too, enforced twice: the CSP
  in `public/_headers` has `connect-src 'self'`, and
  `test/bundle-isolation.test.ts` builds the site and fails on any Node module
  or any URL on another host in the bundle.

The site is Italian only; the plan for English is in the vault,
`Projects/poker-toolkit/plans/2026-10-29-english-version.md`.

## Run it

```bash
pnpm install
pnpm ingest                 # one pass over the client's folders, deduplicated
pnpm watch                  # then stays listening while you play
pnpm study --selector biggest-losses --limit 5 --preset full --clipboard
pnpm report --since 7d --out <path>
pnpm test                   # 589 tests
pnpm -r typecheck && pnpm -r build
```

Or just double-click `avvia.bat` (`pnpm start` does the same): it imports,
starts both servers, opens the browser, and shuts everything down on exit.

Dashboard by hand needs two processes:

```bash
pnpm --filter @poker/dashboard dev:api     # port 5181, reads the store
pnpm --filter @poker/dashboard dev:web     # port 5180, proxies /api
```

`dev` runs both through concurrently — do not combine it with `dev:api`, it
would bind 5181 twice and concurrently kills the whole group on the failure.

Database defaults to `~/.poker-toolkit/hands.db`; override with `--db` or, for
the API, `POKER_DB`.

The web site:

```bash
pnpm --filter @poker/web dev            # port 5190, no CSP (see Gotchas)
pnpm --filter @poker/web build          # into packages/web/dist
pnpm --filter @poker/web preview        # port 5191, dist with public/_headers applied
pnpm --filter @poker/web demo:generate  # rewrites src/demo/sample-hands.txt
```

Routes: `/` landing, `/privacy`, `/allenamento` (the trainer alone), `/app`
(the analysis app; `?demo=1` for the sample hands), anything else not found.
Each is its own chunk, chosen in `src/main.tsx`.

Eight tabs: Panoramica, Statistiche, Leak, Andamento, Studio, Equity,
Allenamento, Come si usa. The last one is the glossary and the workflow — every
acronym in the tool also carries its own definition on hover, sourced from the metric's own
`description` field rather than from a copy in the UI.

The eight views live in `packages/ui`, shared by the dashboard and the web app:
`AppShell` is the frame, and every request goes through a `Transport`
(`setTransport`) — HTTP to Express in the dashboard, `postMessage` to the
Worker on the web.

Allenamento is the drill game, and the only part of the tool that looks forward
instead of back: it deals a spot, asks for the one number the spot turns on —
outs, equity, the price the pot is making — and then shows the working, card by
card. Eleven levels and an endless mode that pulls towards whatever you keep
getting wrong. It runs entirely in the browser on `@poker/trainer`, and its
progress lives in `localStorage`: the API over the store is read-only by design,
and a game score has no business in the hand database. On the web, "Cancella
tutti i dati" deletes it too (`clearTrainingProgress`), in every open tab.

## Deploy (web only)

Cloudflare Pages project linked to GitHub `Rontaro/Poker-toolkit`: build
`pnpm --filter @poker/web build`, output `packages/web/dist`, env
`NODE_VERSION=24`, `PNPM_VERSION=9.15.4`. **Every push to `main` publishes the
site** — work on a branch. No header is set in the Cloudflare dashboard:
all of them, CSP included, live in `packages/web/public/_headers`.

## Dependency direction

Always toward the centre. `core` imports nothing.

```
core ← adapters/pokerstars ← ingest
  ↑         ↑                  ↑
  ├── store ┘                  │
  ├── metrics ← rules ← timeline
  │              ↑        ↑
  ├── equity     └ prompt-builder
  │     ↑                │
  ├── trainer            │
  └─────┴────────────────┴── cli, api-core

trainer  ← ui ← dashboard, web
api-core ← dashboard (Express), web (Worker)
```

- `api-core`: the routes as pure functions plus `dispatch()`, the one route
  table that Express and the Worker both call.
- `store` has two entries: `.` (Node, `node:sqlite`) and `./browser`
  (sqlite-wasm, `BrowserHandStore`, OPFS, `deleteBrowserData`).
- `@poker/ingest/parse` is the pure parse step (no `fs`, no watcher), for the
  Worker.
- `web` imports only the browser entries; `bundle-isolation.test.ts` fails if
  a Node built-in, `chokidar` or `express` reaches the bundle.

If `core` ever imports `chokidar`, `express` or a driver, the design is wrong.

## Non-negotiables

- **Money is never a float.** `Chips` is a branded integer, `CHIP_SCALE` = 10000
  units per currency unit. The only float is `Money.ratio()`, which returns
  dimensionless analysis output, never a balance.
- **Everything is normalised to big blinds** for analysis, so cash and
  tournaments are comparable.
- **Positions are derived from the button**, never from a table of seat numbers.
  Seats are not contiguous and players sit out.
- **The parser never throws.** It returns a `ParseResult`; an unreadable hand is
  quarantined and the import continues.
- **The parser checks its own arithmetic** against the site's reported total pot
  and rake. A mismatch is an error, not a warning: that is what stops a
  mistranslated token from producing silently wrong statistics.
- **Thresholds and reference ranges live in JSON**, never in code:
  `packages/metrics/profiles/*.json` and `packages/rules/config/default.json`.

## Gotchas

- **`node:sqlite`, not `better-sqlite3`.** `better-sqlite3` publishes no prebuilt
  binary for Node 24 and this machine has no C++ toolchain, so it cannot be
  installed. Node's built-in is the same idea with nothing to compile, but is
  still marked experimental (hence the warning on every run). It is loaded via
  `createRequire` in `packages/store/src/driver.ts` because Vite resolves
  `node:` imports by stripping the prefix, and there is no bare `sqlite`
  builtin. Swapping drivers back is a change to that one file.
- **Timestamps are not zero-padded after midnight.** PokerStars writes
  `2026/09/05 0:00:04`. Every date field accepts one or two digits.
- **Stakes are not at the end of the header line.** The `.it` client appends
  `[ADM ID: …]` after them.
- **`potAt('preflop')` is zero**: blinds are actions inside the preflop street,
  not something that happened before it. Use `deadMoneyBB()` for the pot the
  first player actually faced.
- **VPIP is preflop only.** `heroPutMoneyInVoluntarily(street)` takes the street
  as a required argument for exactly this reason.
- **`all: unset` clears `box-sizing`** — the dashboard re-declares it for every
  control that uses the reset.
- **Vite listens on `::1` only**, Express binds dual-stack. A readiness check
  that dials `127.0.0.1` reports Vite as down while it is serving happily;
  `avvia.ps1` polls `Get-NetTCPConnection` instead.
- **`tsx watch` exits when stdin closes.** Launched detached it binds the port,
  prints its ready line, and dies a second later, which looks exactly like a
  healthy start. `dev:api` is for editing the server; `serve` is for running it,
  and that is what `avvia.ps1` uses.
- **`Start-Process -ArgumentList` re-quotes any argument containing spaces**,
  which mangles quotes embedded inside it. `cmd /c "app > \"file\" 2>&1"` dies
  instantly without ever creating the file, so the only evidence left is a stale
  log from a previous run — evidence that actively lies. Use Start-Process's own
  `-RedirectStandardOutput`/`-RedirectStandardError`, and delete the log before
  each start so a stale one can never be mistaken for a fresh one.
- **A `window` keydown listener added while the key is still bubbling gets that
  same keypress.** React flushes the effect that binds it before the event has
  finished travelling, so in the trainer one Enter both answered the question
  and skipped its explanation. Enter is left to whatever has the focus.
- **The trainer computes in the browser, so its spots are bounded by that.** A
  flop enumerates 990 runouts in five milliseconds; two exact preflop hands
  enumerate 1.7 million and take five seconds, which is not a game. Preflop
  drills are therefore hand-versus-range and sampled, seeded so the same spot
  always answers the same way.
- Hand ids are content hashes, not site ids, and are **language-independent**:
  the same hand exported in Italian and in English stores as one row.

Web:

- **OPFS through the "opfs-sahpool" VFS**, not "opfs": no `SharedArrayBuffer`,
  so no COOP/COEP headers. The price is one connection per pool: a second tab
  cannot open the archive, runs in memory and says why.
  `preserveOnInitFailure: true` is load-bearing — without it a failed init
  deletes the pool's directory, i.e. every stored hand.
- **`*.sql?raw` imports break plain `tsc` output**, so `browser-hand-store.ts`
  and `browser.ts` are excluded from `packages/store/tsconfig.json`; Vite and
  Vitest compile and test them directly.
- **`ApiResponse.body` is not serialised yet.** Express runs it through JSON;
  the Worker must too (`overJson` in `worker/handler.ts`), or `Date`s and
  `undefined` fields reach the page in shapes Express could never send.
- **`dispatch()` wants the raw, still percent-encoded path**: it decodes path
  parameters itself, as Express does, so a decoded path is decoded twice.
- **`vite dev` does not apply the CSP; `vite preview` does** (through
  `scripts/cf-headers.ts`, which reads `_headers` the way Pages does). Dev
  injects inline scripts and styles the policy refuses, so check anything
  CSP-related on `preview`.
- **Tailwind is for the public pages only**: preflight off, `content` limited
  to `src/pages`, and the config path named in `postcss.config.js`, because
  Tailwind looks for it in the working directory — a build started elsewhere
  (repo root, the isolation test) silently gets no utilities.
- **`assetsInlineLimit: 0`**: `font-src 'self'` refuses `data:` fonts, and
  Vite would inline the smallest font subsets.
- **`src/demo/sample-hands.txt` is `-text` in `.gitattributes`**: CRLF and a
  BOM like the client writes, held byte for byte to its generator by a test,
  which `core.autocrlf=true` would otherwise break.
- **React 19 has no global `JSX` namespace**: `import type { JSX } from 'react'`.

## Adding things

- **A site**: a package implementing `SiteAdapter`. Nothing existing changes.
- **A language**: a file in `packages/adapters/pokerstars/src/locales/`. It
  contains only strings with `{placeholders}` — no regex. The shared conformance
  suite validates it automatically.
- **A metric**: a definition in `packages/metrics/src/definitions/` plus a line
  in the registry. Most are two predicates via `frequency()`.
- **A rule**: a definition in `packages/rules/src/definitions/`, a line in the
  registry, and a block in `config/default.json`.
- **A selector or preset**: an entry in `packages/prompt-builder/src/`.
- **A drill**: a definition in `packages/trainer/src/drills/` plus a line in the
  registry. It generates a spot with the answer already computed and the working
  attached; the level that uses it is a block in `config/curriculum.json`.
- **An API route**: a function in `packages/api-core/src/` and a line in the
  route table in `dispatch.ts`. Express and the Worker both pick it up.
- **A view**: `packages/ui/src/views/`, requests through the `Transport`,
  never `fetch`.

## Fixtures

`packages/adapters/pokerstars/__fixtures__/` — see the README there. Real hands
are English (the `.it` client is set to English); the Italian ones are
translations and cannot confirm the Italian wording. Tokens that no file on disk
could confirm are marked `UNVERIFIED` in `locales/it.ts`.

The repository is public: in the real fixtures every screen name (hero's and
the other players') is replaced with a pseudonym. Keep it so for any new real
hand.

## Known gaps

Dead blinds (`posts small & big blinds`), run-it-twice, Zoom and TournSummary
are unimplemented or unproven. `min-bet` covers bets only; min-raises are not
detected. The views have almost no UI tests (only the transport and the
trainer's reset). `filterFromQuery` passes `minBb`/`maxBb` through without
scaling by `CHIP_SCALE`: latent, since no view sends them yet.

## Vault

Docs live at `rontaro-brain/Projects/poker-toolkit/`. When this file changes,
mirror it into `technical-reference.md` there.
