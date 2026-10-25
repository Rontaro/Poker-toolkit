import type { HandId } from '@poker/core'

/**
 * What came back from the conversation, kept next to the hand it was about.
 *
 * The tool generates the question; the answer arrives by paste. Storing it here
 * is what turns a one-off chat into something searchable later — and what makes
 * the export to a notes vault possible.
 */
export interface HandNote {
  readonly handId: HandId
  readonly source: 'claude' | 'me'
  /** Markdown, as pasted. */
  readonly content: string
  readonly createdAt: Date
  readonly tags: readonly string[]
}

/** Renders notes as a markdown section, for export to an Obsidian vault. */
export function notesToMarkdown(notes: readonly HandNote[]): string {
  return notes
    .map((note) => {
      const tags = note.tags.length === 0 ? '' : `\ntags: ${note.tags.map((t) => `#${t}`).join(' ')}`
      const who = note.source === 'claude' ? 'Analisi' : 'Nota mia'
      return `#### ${who} — ${note.createdAt.toISOString().slice(0, 10)}${tags}\n\n${note.content}`
    })
    .join('\n\n')
}
