// ─────────────────────────────────────────────────────────────────────────
// The voice layer's deterministic core (stream O): the command grammar and
// the spoken form of a step. Pure functions — no Web Speech objects here —
// so the interesting rules are testable without a DOM.
//
// ── THE GRAMMAR IS CLOSED ─────────────────────────────────────────────────
// Every command maps to a handler cook mode already has; a spoken phrase
// that needs new logic is out of grammar by definition. Matching is
// whole-phrase against a fixed list, never substring: "is the next bit
// hard" is a question for the assistant, not a navigation command, and a
// matcher that fires on fragments turns kitchen chatter into page turns.
//
// ── D17, SPOKEN (see servingScale.ts for the settled decision) ────────────
// Scaling multiplies ingredient quantities ONLY; prose stays verbatim. On
// screen that is survivable because the authoritative number sits on a chip
// beside the prose. Read aloud there is no chip — so the spoken step is the
// prose plus the step's scaled lines appended, and when a factor is active
// the voice says in as many words that the spoken quantities win. That
// sentence is the same price the screen already pays.
// ─────────────────────────────────────────────────────────────────────────

import type { RecipeIngredient } from '@/api/types'

export type VoiceCommand = 'next' | 'back' | 'repeat' | 'startTimer' | 'pauseTimer' | 'howLong'

const PHRASES: Record<VoiceCommand, readonly string[]> = {
  next: ['next', 'next step', 'go next', 'go forward'],
  back: ['back', 'go back', 'previous', 'previous step'],
  repeat: ['repeat', 'repeat that', 'say that again', 'read that again', 'again'],
  startTimer: ['start timer', 'start the timer', 'timer'],
  pauseTimer: ['pause timer', 'pause the timer', 'stop timer', 'stop the timer'],
  howLong: ['how long left', 'how long', 'how much time is left', 'how much longer', 'time left'],
}

/** Lowercase, strip punctuation, collapse whitespace. */
function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Whole-phrase match against the fixed grammar, or null → assistant draft. */
export function matchCommand(transcript: string): VoiceCommand | null {
  const heard = normalize(transcript)
  if (!heard) return null
  for (const command of Object.keys(PHRASES) as VoiceCommand[]) {
    if (PHRASES[command].includes(heard)) return command
  }
  return null
}

/**
 * formatClock's semantics (floor, never negative) in spoken words —
 * "8:00" reads fine on a chip and terribly through a speaker.
 */
export function speakClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`)
  if (m > 0) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`)
  if (s > 0 || parts.length === 0) parts.push(`${s} ${s === 1 ? 'second' : 'seconds'}`)
  return parts.join(' ')
}

// Full words for the ear where the screen can abbreviate. Piece is spoken as
// bare "2 egg" — clumsy but honest; pluralizing arbitrary ingredient names is
// a guessing game this module refuses to play.
const UNIT_WORDS: Record<Exclude<RecipeIngredient['unit'], 'Piece' | 'ToTaste'>, [string, string]> = {
  Gram: ['gram', 'grams'],
  Kilogram: ['kilogram', 'kilograms'],
  Ounce: ['ounce', 'ounces'],
  Pound: ['pound', 'pounds'],
  Millilitre: ['millilitre', 'millilitres'],
  Litre: ['litre', 'litres'],
  Teaspoon: ['teaspoon', 'teaspoons'],
  Tablespoon: ['tablespoon', 'tablespoons'],
  Cup: ['cup', 'cups'],
  FluidOunce: ['fluid ounce', 'fluid ounces'],
  Clove: ['clove', 'cloves'],
  Slice: ['slice', 'slices'],
  Can: ['can', 'cans'],
  Package: ['package', 'packages'],
  Bunch: ['bunch', 'bunches'],
  Pinch: ['pinch', 'pinches'],
  Dash: ['dash', 'dashes'],
  Splash: ['splash', 'splashes'],
  Handful: ['handful', 'handfuls'],
}

/** One scaled line for the ear: "400 grams flour", "2 egg", "salt, to taste". */
export function spokenIngredient(i: RecipeIngredient): string {
  if (i.unit === 'ToTaste') return `${i.name}, to taste`
  if (i.unit === 'Piece') return `${i.quantity} ${i.name}`
  const [one, many] = UNIT_WORDS[i.unit]
  return `${i.quantity} ${i.quantity === 1 ? one : many} ${i.name}`
}

/**
 * The spoken form of a step: prose verbatim, the step's scaled lines
 * appended, and — when a factor is active — the sentence that does the job
 * the on-screen chip cannot do out loud.
 */
export function composeSpokenStep(opts: {
  description: string
  /** Already scaled, already filtered to this step (referencedIngredients). */
  used: readonly RecipeIngredient[]
  factor: number
  servings: number
}): string {
  const parts: string[] = [opts.description.trim()]
  if (opts.used.length > 0) {
    parts.push(`Using: ${opts.used.map(spokenIngredient).join(', ')}.`)
  }
  if (opts.factor !== 1) {
    parts.push(
      `Quantities are scaled to ${opts.servings} serving${opts.servings === 1 ? '' : 's'} — ` +
        'where a number in the step disagrees, the spoken amounts are the ones to follow.',
    )
  }
  return parts.join(' ')
}
