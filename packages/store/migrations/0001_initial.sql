-- Hands are stored as one JSON blob per row (round-trips the whole `Hand`
-- exactly) with the fields every query in this package actually filters or
-- aggregates on promoted to real, indexed columns. Re-deriving those columns
-- from the blob at query time would mean a full scan for every filter; this
-- way SQLite's own indexes do the work.
--
-- `session_id` is deliberately not derived from anything in `data`: sessions
-- are a storage-level concept (see sessions.ts) computed from played_at
-- ordering per hero, and can change as out-of-order hands arrive, so it is
-- recomputed and written after the row exists rather than at parse time.
CREATE TABLE hands (
  id              TEXT PRIMARY KEY,
  site            TEXT NOT NULL,
  -- NULL when the source file didn't identify an owning player; such hands
  -- can still be queried/stored, they just never join a session.
  hero            TEXT,
  game_type       TEXT NOT NULL,
  variant         TEXT NOT NULL,
  -- `table.maxSeats`, not the count of seats actually dealt in: 6-max and
  -- 9-max are never averaged together regardless of how many players showed.
  table_size      INTEGER NOT NULL,
  stakes_bb       INTEGER NOT NULL,
  stakes_currency TEXT NOT NULL,
  played_at       INTEGER NOT NULL,
  played_at_local TEXT NOT NULL,
  session_id      TEXT,
  hero_dealt_in   INTEGER NOT NULL DEFAULT 0,
  hero_net        INTEGER,
  data            TEXT NOT NULL
) STRICT;

CREATE INDEX idx_hands_played_at   ON hands(played_at);
CREATE INDEX idx_hands_hero        ON hands(hero);
CREATE INDEX idx_hands_site        ON hands(site);
CREATE INDEX idx_hands_game_type   ON hands(game_type);
CREATE INDEX idx_hands_variant     ON hands(variant);
CREATE INDEX idx_hands_table_size  ON hands(table_size);
CREATE INDEX idx_hands_stakes_bb   ON hands(stakes_bb);
CREATE INDEX idx_hands_session_id  ON hands(session_id);

-- One row per distinct broken hand text. `hash` (sha256 of the raw text) is
-- the dedup key: the same malformed hand showing up again in a re-ingested
-- file must not pile up a second quarantine row.
CREATE TABLE quarantine (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  hash        TEXT NOT NULL UNIQUE,
  raw         TEXT NOT NULL,
  source_path TEXT NOT NULL,
  issues      TEXT NOT NULL,
  created_at  INTEGER NOT NULL
) STRICT;

-- Lets an incremental ingest skip a file whose size/mtime/hash haven't
-- changed since the last run, without re-reading and re-parsing it.
CREATE TABLE ingested_files (
  path         TEXT PRIMARY KEY,
  size         INTEGER NOT NULL,
  mtime        INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  ingested_at  INTEGER NOT NULL
) STRICT;

-- Tags are kept as a JSON array rather than a join table: "full-text-ish"
-- search only needs a LIKE over the quoted tag text (see sqlite-store.ts),
-- and a join table earns its keep only once tag search needs to be exact or
-- fast at a scale LIKE can't cover, which isn't the case here.
CREATE TABLE hand_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  hand_id    TEXT NOT NULL REFERENCES hands(id),
  source     TEXT NOT NULL CHECK (source IN ('claude', 'me')),
  content    TEXT NOT NULL,
  tags       TEXT NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX idx_hand_notes_hand_id ON hand_notes(hand_id);
