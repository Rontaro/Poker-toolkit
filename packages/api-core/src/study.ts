import type { HandId } from '@poker/core'
import { ALL_SELECTORS, PRESETS, analyse, buildPrompt } from '@poker/prompt-builder'
import { ALL_RULES } from '@poker/rules'
import type { HandFilter, HandStore } from '@poker/store'

import { fail, ok, type ApiResult } from './errors.js'
import { load } from './load.js'

export interface StudyOptions {
  readonly selectors: readonly { id: string; label: string; description: string }[]
  readonly presets: readonly { id: string; label: string }[]
  readonly rules: readonly { id: string; label: string }[]
}

/** From `GET /api/study/options`: the choices the study tab offers, with no
 * store access needed. */
export function getStudyOptions(): StudyOptions {
  return {
    selectors: ALL_SELECTORS.map((selector) => ({
      id: selector.id,
      label: selector.label,
      description: selector.description,
    })),
    presets: PRESETS.map((preset) => ({ id: preset.id, label: preset.label })),
    rules: ALL_RULES.map((rule) => ({ id: rule.id, label: rule.label })),
  }
}

export interface RunStudyParams {
  /** Used unless `handIds` is given and non-empty. */
  readonly filter: HandFilter
  readonly selector?: string
  readonly preset?: string
  readonly limit?: number
  readonly leakId?: string
  readonly handIds?: readonly HandId[]
}

export interface StudyResult {
  readonly text: string
  readonly characters: number
  readonly hands: readonly { readonly id: HandId; readonly netBB: number; readonly leaks: string[] }[]
}

/**
 * From `POST /api/study`: builds the prompt the player pastes into a chat.
 *
 * A filter (or an explicit hand id list) matching no hands is the one
 * expected failure here -- the original route's 400 -- and comes back as an
 * `ApiResult` error. An unknown selector or preset id still throws, exactly
 * as `buildPrompt` always has: the original route never handled that case
 * either, and nothing here changes that.
 */
export async function runStudy(store: HandStore, params: RunStudyParams): Promise<ApiResult<StudyResult>> {
  const hands =
    params.handIds !== undefined && params.handIds.length > 0
      ? await load(store, { handIds: params.handIds })
      : await load(store, params.filter)

  if (hands.length === 0) return fail(400, 'nessuna mano per questo filtro')

  const sample = await analyse(hands)
  const built = await buildPrompt({
    sample,
    selector: params.selector ?? 'biggest-losses',
    preset: params.preset ?? 'full',
    ...(params.limit === undefined ? {} : { limit: params.limit }),
    ...(params.leakId === undefined ? {} : { leakId: params.leakId }),
  })

  return ok({
    text: built.text,
    characters: built.characters,
    hands: built.hands.map((hand) => ({
      id: hand.context.hand.id,
      netBB: Number(hand.context.heroNetBB().toFixed(2)),
      leaks: [...new Set(hand.leaks.map((leak) => leak.ruleId))],
    })),
  })
}
