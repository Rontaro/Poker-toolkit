# Parser fixtures

Organised as `pokerstars/<language>/<category>/<case>.txt`. Every file is UTF-8
with a BOM and CRLF line endings, exactly as the PokerStars client writes them.

## `pokerstars/en/cash/`

Real hands, exported by the PokerStars.it client running in **English**, from a
NL2 6-max session played on 2026-09-04. `nl2-6max-session.txt` is the whole
file (52 hands) and is used for the bulk parse test; the other files are single
hands pulled out of it for focused assertions.

Screen names (hero's and the other players') have been replaced with
pseudonyms before this repository went public. Everything else — hand id,
table name, timestamps, stakes, actions, amounts — is the real captured
session; only the names are fictional.

## `pokerstars/it/cash/`

The same hands, mechanically translated into the format documented for the
Italian client. They are **derived**, not captured: no Italian hand history was
available on disk. They exercise the locale mechanism end to end and prove that
a hand parses identically in either language, but they cannot confirm the
Italian wording itself. Replace them with a real Italian export when there is
one, and check the tokens marked `UNVERIFIED` in `src/locales/it.ts`.

## `pokerstars/en/synthetic/` and `pokerstars/en/tournament/`

Hand-written, for situations the real session never produced: side pots, split
pots, heads-up, and a tournament with antes. They follow the published
PokerStars layout and are arithmetically consistent, so the parser's pot
cross-check validates them, but they are not captured output either.

## Situations still uncovered

No fixture yet exists for a dead blind (`posts small & big blinds`), a player
joining mid-hand, run-it-twice, or a `windows-1252` file. The first three are
implemented but unproven; encoding detection is tested from bytes built in the
test itself rather than from a file on disk.
