import type { HandId } from '@poker/core'
import type { HandNote, HandStore, NoteSource } from '@poker/store'

/** From `GET /api/notes`: substring/tag search over saved notes. */
export async function searchNotes(store: HandStore, query: string): Promise<readonly HandNote[]> {
  return store.searchNotes(query)
}

export interface NewNote {
  readonly handId: HandId
  readonly source: NoteSource
  readonly content: string
  readonly tags?: readonly string[]
}

/** From `POST /api/notes`: records a note against a hand. */
export async function createNote(store: HandStore, note: NewNote): Promise<void> {
  await store.insertNote({
    handId: note.handId,
    source: note.source,
    content: note.content,
    tags: note.tags ?? [],
    createdAt: new Date(),
  })
}
