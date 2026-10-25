/**
 * PokerStars writes hand histories as UTF-8 with a BOM on current clients, but
 * older files and some localised installs are windows-1252. Guessing wrong
 * turns `è` into `Ã¨` and quietly breaks every Italian token, so we detect
 * rather than assume.
 */

export type DetectedEncoding = 'utf-8-bom' | 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252'

export interface DecodedText {
  readonly text: string
  readonly encoding: DetectedEncoding
}

function hasBom(bytes: Uint8Array, ...prefix: number[]): boolean {
  return prefix.every((byte, i) => bytes[i] === byte)
}

export function decodeText(bytes: Uint8Array): DecodedText {
  if (hasBom(bytes, 0xef, 0xbb, 0xbf)) {
    return { text: decode(bytes.subarray(3), 'utf-8'), encoding: 'utf-8-bom' }
  }
  if (hasBom(bytes, 0xff, 0xfe)) {
    return { text: decode(bytes.subarray(2), 'utf-16le'), encoding: 'utf-16le' }
  }
  if (hasBom(bytes, 0xfe, 0xff)) {
    return { text: decode(bytes.subarray(2), 'utf-16be'), encoding: 'utf-16be' }
  }

  // No BOM: try strict UTF-8, and treat a decode failure as the legacy
  // single-byte encoding the Windows client used to write.
  try {
    return { text: decodeStrict(bytes, 'utf-8'), encoding: 'utf-8' }
  } catch {
    return { text: decode(bytes, 'windows-1252'), encoding: 'windows-1252' }
  }
}

function decode(bytes: Uint8Array, encoding: string): string {
  return new TextDecoder(encoding).decode(bytes)
}

function decodeStrict(bytes: Uint8Array, encoding: string): string {
  return new TextDecoder(encoding, { fatal: true }).decode(bytes)
}

/** Normalises line endings and strips a stray BOM left inside the text. */
export function normaliseNewlines(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
}
