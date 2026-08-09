// ─────────────────────────────────────────────────────────────────────────
// Cook mode — the cooking assistant (stream M).
//
// Stream J left the overlay in RecipeDetailPage deliberately minimal: a step
// carousel with Prev/Next, carrying the typed fields through and nothing more.
// This is the rebuild, and it lives in its own module because a real cook mode
// is a surface, not a helper — RecipeDetailPage keeps the entry point and the
// diff a reviewer reads stays the thing that changed.
//
// ── THE WEIGHT IS UI, NOT AI ──────────────────────────────────────────────
// Four of the five features here never touch a model: real wall-clock timers,
// a screen wake lock, type sized for a phone across the counter, and serving
// scaling done as ARITHMETIC (`@/lib/servingScale`, decision D17). The
// assistant is one bounded call about one recipe. That ordering is the
// feature: everything a cook depends on mid-recipe works whether or not a
// provider is reachable, and the one thing that needs the network is the one
// thing they can carry on without.
//
// ── DECISION D18, SETTLED: WHAT COOK MODE DOES WITH NO NETWORK ────────────
// Settled against the code rather than aspirationally. There is no service
// worker and no persisted query cache in this app, so a cold start offline
// never reaches the SPA at all — "offline-capable cook mode" would be a claim
// the build cannot support. What is real, and what actually happens in a
// kitchen, is the MID-SESSION loss: the page loaded, then the phone dropped
// Wi-Fi behind a fridge.
//
// So cook mode is offline-TOLERANT, and the rule is: never block, never
// unmount, never lose state on a network failure.
//
//   1. The recipe is SNAPSHOTTED when the overlay opens (see `frozen` below).
//      After that, cook mode issues no reads at all — steps, ingredients,
//      timers and scaling are pure client state. It also means an edit landing
//      mid-cook cannot renumber the method under someone's hands.
//   2. A failed assistant turn reports itself inline and keeps the question in
//      the box. The session continues; timers keep running.
//   3. "Finished cooking" is the one write, and a failure holds the finish
//      panel open with a Retry rather than closing over it. Losing the cook a
//      person just logged, silently, because a radio was off, is the one
//      failure this surface must not have.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import Modal from '@/components/ui/Modal'
import type { RecipeIngredient, RecipeResponse, RecipeStep } from '@/api/types'
import { formatQuantity, formatTemperature } from '@/api/vocabulary'
import {
  askCookAssistant,
  COOK_HISTORY_MAX_ITEMS,
  COOK_QUESTION_MAX_LENGTH,
  type CookHistoryItem,
} from '@/api/cookAssistant'
import { isQuotaError } from '@/api/generation'
import { useCookTimers, formatClock } from '@/hooks/useCookTimers'
import { useWakeLock } from '@/hooks/useWakeLock'
import { useSocialMutations } from '@/hooks/useSocialMutations'
import { useSpeech } from '@/hooks/useSpeech'
import { usePushToTalk, type PushToTalkState } from '@/hooks/usePushToTalk'
import { composeSpokenStep, matchCommand, speakClock, type VoiceCommand } from '@/lib/cookVoice'
import {
  MAX_SERVINGS,
  MIN_SERVINGS,
  formatFactor,
  scaleFactor,
  scaleIngredients,
} from '@/lib/servingScale'

interface CookModeProps {
  recipe: RecipeResponse
  /** The caller's own rating, so the finish panel opens showing what it knows. */
  myRating: number | null
  onRate: (value: number | null) => void
  /** The page's guest gate — cook mode reads fine as a guest, writing does not. */
  requireAuth: () => boolean
  onExit: () => void
}

/** One turn of the session-scoped exchange, plus whether it was a refusal. */
interface Turn extends CookHistoryItem {
  refused?: boolean
}

export default function CookMode({ recipe, myRating, onRate, requireAuth, onExit }: CookModeProps) {
  // D18 point 1: the recipe as it was when cooking started. Everything below
  // reads from this, never from the live query — no refetch, no cache
  // invalidation and no edit by another tab can change the method in front of
  // somebody following it.
  const [frozen] = useState(recipe)

  const steps = useMemo(
    () => [...frozen.steps].sort((a, b) => a.stepNumber - b.stepNumber),
    [frozen.steps],
  )

  const [index, setIndex] = useState(0)
  const [servings, setServings] = useState(frozen.servings)
  const [finishing, setFinishing] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)

  const timers = useCookTimers()
  const wakeLockHeld = useWakeLock(true)

  // ── Voice (stream O) ─────────────────────────────────────────────────────
  // The audio arbiter lives HERE, not in the hooks: half-duplex (stop the mic
  // before speaking — the mic must not hear the app), the timer alarm
  // interrupts speech and never the reverse, and every utterance dies with
  // the state that queued it (step change, sheet close, unmount).
  const speech = useSpeech()
  const [readAloud, setReadAloud] = useState(false)
  const spokenIndexRef = useRef(index)

  // The cook-and-rate write lives HERE, not in the finish panel, and the reason
  // is a bug the browser pass found rather than a preference. Firing a mutation
  // from a panel's mount effect works in tests and breaks in a dev browser:
  // StrictMode double-invokes mount effects, so the request goes out under the
  // first observer, the cleanup tears that observer down, and the remount gets a
  // fresh one that never hears the result — the write lands on the server and
  // the UI sits on "idle" forever, which is exactly the silent loss D18 forbids.
  // A write belongs to the interaction that asked for it, so it is fired from
  // the button and owned by a component that nothing remounts.
  const { logCooked } = useSocialMutations()
  const logCook = () => {
    // A guest gets the sign-in gate rather than a silent no-op — they did just
    // cook the thing.
    if (requireAuth()) logCooked.mutate({ recipeId: frozen.id })
  }

  const factor = scaleFactor(frozen.servings, servings)
  const scaled = useMemo(
    () => scaleIngredients(frozen.ingredients, frozen.servings, servings),
    [frozen.ingredients, frozen.servings, servings],
  )

  const step = steps[index]
  const last = index === steps.length - 1

  // One pipeline for every transcript, both mic buttons: grammar first — a
  // match acts immediately and costs nothing; a non-match lands in the
  // assistant's DRAFT and the user taps send. A misheard phrase must never
  // become a paid model call by itself (the scanner's confirm-then-write
  // shape, applied to spend).
  const [voiceDraft, setVoiceDraft] = useState<{ text: string; id: number } | null>(null)
  const voiceDraftSeq = useRef(0)

  const runCommand = (command: VoiceCommand) => {
    if (!step) return
    switch (command) {
      case 'next':
        // Boundary no-ops get a spoken confirmation — the one case where the
        // action is not visible on screen (nothing moves).
        if (last) say('That was the last step.')
        else setIndex((n) => Math.min(steps.length - 1, n + 1))
        break
      case 'back':
        if (index === 0) say("You're on the first step.")
        else setIndex((n) => Math.max(0, n - 1))
        break
      case 'repeat':
        say(spokenStep()) // an explicit ask — speaks even with the toggle off
        break
      case 'startTimer': {
        const duration = step.durationSeconds ?? 0
        if (duration > 0) timers.start(index, duration)
        else say('This step has no timer.')
        break
      }
      case 'pauseTimer': {
        // The one moment a cook most needs "stop timer" is while the alarm is
        // RINGING — and pause() preserves `done`, so it would do nothing.
        // Ringing dismisses (reset, the same action the ✓ Done chip takes);
        // running goes silent (pause, visibly); anything else has nothing to
        // stop.
        const timer = timers.timers[index]
        if (timer?.done) timers.reset(index)
        else if (timer?.running) timers.pause(index)
        else say('No timer is running on this step.')
        break
      }
      case 'howLong': {
        const timer = timers.timers[index]
        if (timer && !timer.done) say(speakClock(timer.remaining))
        else say('No timer is running on this step.')
        break
      }
    }
  }

  const handleTranscript = (raw: string) => {
    const command = matchCommand(raw)
    if (command) {
      runCommand(command)
      return
    }
    voiceDraftSeq.current += 1
    setVoiceDraft({ text: raw, id: voiceDraftSeq.current })
    setAssistantOpen(true)
  }

  const ptt = usePushToTalk(handleTranscript)

  // Half-duplex, listening half: the mic must not hear the app, so a tap
  // silences any speech BEFORE recognition opens. Never auto-resumed after
  // speech — the next listen is the next tap.
  const onMic = () => {
    if (ptt.state === 'listening') {
      ptt.stop()
      return
    }
    speech.cancel()
    ptt.start()
  }

  const spokenStep = useCallback(() => {
    if (!step) return ''
    const used = referencedIngredients(step, scaled)
    return composeSpokenStep({ description: step.description, used, factor, servings })
  }, [step, scaled, factor, servings])

  // Half-duplex, speaking half: recognition is stopped before any utterance.
  // say() is the ONE door to speech output so the rule cannot be forgotten at
  // a call site. Depends on ptt.stop (referentially stable from the hook)
  // rather than closing over the whole ptt object, so this never pins a
  // stale mic reference from an earlier render.
  const say = useCallback(
    (text: string) => {
      ptt.stop()
      speech.speak(text)
    },
    [ptt.stop, speech.speak],
  )

  // Read the step on arrival while the toggle is on; kill leftovers when it is
  // off. spokenIndexRef stops the toggle's own tap-speech (a user gesture,
  // which iOS requires for first audio) from being repeated here, and never
  // starts speech on mount (ref is seeded with the initial index).
  useEffect(() => {
    if (!step) return
    if (spokenIndexRef.current === index) return
    spokenIndexRef.current = index
    if (readAloud) say(spokenStep())
    else speech.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, readAloud, step, say, spokenStep, speech.cancel])

  // The alarm outranks speech: a ringing timer is the one sound a cook must
  // not miss, and the two-tone beep should never fight a paragraph of prose.
  useEffect(() => {
    if (timers.ringing) speech.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timers.ringing, speech.cancel])

  // Arrow keys move through the method. Modal traps Tab for focus, so the
  // arrows are what is left for a laptop propped on a counter — and they are
  // ignored while typing, or the assistant's input would swallow every press.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (e.key === 'ArrowRight') setIndex((n) => Math.min(steps.length - 1, n + 1))
      if (e.key === 'ArrowLeft') setIndex((n) => Math.max(0, n - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [steps.length])

  if (!step) {
    // A recipe with no steps never offers "Start cooking", so this is only
    // reachable through a hand-built state. Exit rather than crash.
    return null
  }

  const used = referencedIngredients(step, scaled)

  return (
    <Modal variant="full" label="Cook mode" onClose={onExit}>
      <Header
        index={index}
        count={steps.length}
        title={frozen.title}
        wakeLockHeld={wakeLockHeld}
        onExit={onExit}
        readAloudSupported={speech.supported}
        readAloud={readAloud}
        onToggleReadAloud={() => {
          if (readAloud) {
            setReadAloud(false)
            speech.cancel()
          } else {
            setReadAloud(true)
            spokenIndexRef.current = index
            say(spokenStep()) // from the gesture — iOS unlocks audio here
          }
        }}
      />

      <ServingsRow
        servings={servings}
        baseServings={frozen.servings}
        factor={factor}
        onChange={setServings}
      />

      <TimerRail timers={timers} steps={steps} currentIndex={index} onGoTo={setIndex} />

      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 6 }} className="scroll">
        <StepFacts step={step} timers={timers} index={index} />

        {/* The step's own words, at the size this whole surface exists for.
            NOT rewritten when the servings change — decision D17. */}
        <div style={{ fontSize: 27, fontWeight: 700, lineHeight: 1.32, letterSpacing: '-0.01em' }}>
          {step.description}
        </div>

        {used.length > 0 && <UsedIngredients lines={used} scaled={factor !== 1} />}

        {factor !== 1 && (
          // The honesty D17 owes: quantities are computed, prose is the
          // author's. In a recipe written before stream J — or imported by
          // stream L — a number can appear in both places and disagree, and
          // the reader is told which one to believe rather than left to
          // discover it.
          <div
            style={{
              marginTop: 20,
              fontSize: 13.5,
              lineHeight: 1.5,
              color: 'var(--muted)',
              borderLeft: '2px solid var(--border)',
              paddingLeft: 12,
            }}
          >
            Quantities are scaled to {servings} serving{servings === 1 ? '' : 's'}. The written
            instructions are the author's own words and are left as they are — where a number
            inside a step disagrees with the amounts above, the amounts above are the ones to
            follow. Times and temperatures are unchanged.
          </div>
        )}
      </div>

      <Footer
        last={last}
        atStart={index === 0}
        onPrev={() => setIndex((n) => Math.max(0, n - 1))}
        onNext={() => setIndex((n) => Math.min(steps.length - 1, n + 1))}
        onFinish={() => {
          setFinishing(true)
          logCook()
        }}
        onAsk={() => setAssistantOpen(true)}
        micSupported={ptt.supported}
        micState={ptt.state}
        onMic={onMic}
      />

      {assistantOpen && (
        <AssistantSheet
          recipe={frozen}
          servings={servings}
          requireAuth={requireAuth}
          voiceDraft={voiceDraft}
          micSupported={ptt.supported}
          micState={ptt.state}
          onMic={onMic}
          onAnswer={(answer, refused) => {
            if (!readAloud) return
            say(refused ? `The assistant declined this one. ${answer}` : answer)
          }}
          onClose={() => {
            speech.cancel() // utterances die with the sheet that queued them
            // The sheet unmounts on close; without this, the NEXT hand-opened
            // sheet would remount its voiceDraft effect against this same
            // stale transcript (already sent, or never sent) and clobber a
            // blank draft with old words.
            setVoiceDraft(null)
            setAssistantOpen(false)
          }}
        />
      )}

      {finishing && (
        <FinishPanel
          title={frozen.title}
          myRating={myRating}
          // Read off the mutation itself rather than mirrored into local state:
          // a panel that has to be right about whether a write landed should not
          // be able to disagree with the write about it.
          logged={logCooked.isSuccess}
          failed={logCooked.isError}
          pending={logCooked.isPending}
          requireAuth={requireAuth}
          onRate={onRate}
          onRetry={logCook}
          onBack={() => setFinishing(false)}
          onDone={onExit}
        />
      )}
    </Modal>
  )
}

// ── Header ──────────────────────────────────────────────────────────────────

function Header({
  index,
  count,
  title,
  wakeLockHeld,
  onExit,
  readAloudSupported,
  readAloud,
  onToggleReadAloud,
}: {
  index: number
  count: number
  title: string
  wakeLockHeld: boolean
  onExit: () => void
  readAloudSupported: boolean
  readAloud: boolean
  onToggleReadAloud: () => void
}) {
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>
            Step {index + 1} of {count}
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Exists iff speechSynthesis does — the wake-lock badge's honesty
              rule. Hidden, not disabled, on browsers without the API. */}
          {readAloudSupported && (
            <button
              onClick={onToggleReadAloud}
              aria-label={readAloud ? 'Stop reading aloud' : 'Read steps aloud'}
              aria-pressed={readAloud}
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: readAloud ? 'var(--accent)' : 'var(--surface2)',
                color: readAloud ? 'var(--accent-ink)' : 'var(--text)',
                border: 'none',
                fontSize: 16,
                cursor: 'pointer',
              }}
            >
              🔊
            </button>
          )}
          {/* Shown only when a lock is actually HELD. A badge that claimed to
              keep the screen awake on a browser without the API would be worse
              than saying nothing — the promise is what people rely on. */}
          {wakeLockHeld && (
            <span
              title="The screen will stay awake while you cook"
              style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.04em' }}
            >
              ◉ SCREEN ON
            </span>
          )}
          <button
            onClick={onExit}
            aria-label="Exit cooking mode"
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: 'var(--surface2)',
              color: 'var(--text)',
              border: 'none',
              fontSize: 18,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Progress through the method — the one thing a glance from across the
          kitchen should always answer. */}
      <div style={{ display: 'flex', gap: 3, marginTop: 12 }}>
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background: i <= index ? 'var(--accent)' : 'var(--surface2)',
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Servings ────────────────────────────────────────────────────────────────

function ServingsRow({
  servings,
  baseServings,
  factor,
  onChange,
}: {
  servings: number
  baseServings: number
  factor: number
  onChange: (n: number) => void
}) {
  const clamp = (n: number) => Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, n))

  return (
    <div
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginTop: 14,
        padding: '8px 10px',
        background: 'var(--surface2)',
        borderRadius: 14,
      }}
    >
      <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700, flex: 1 }}>
        Cooking for
      </span>
      <button
        onClick={() => onChange(clamp(servings - 1))}
        disabled={servings <= MIN_SERVINGS}
        aria-label="One fewer serving"
        style={servingButton(servings <= MIN_SERVINGS)}
      >
        −
      </button>
      <span
        aria-live="polite"
        style={{ fontSize: 17, fontWeight: 800, minWidth: 62, textAlign: 'center' }}
      >
        {servings}
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }}>
          {' '}
          serving{servings === 1 ? '' : 's'}
        </span>
      </span>
      <button
        onClick={() => onChange(clamp(servings + 1))}
        disabled={servings >= MAX_SERVINGS}
        aria-label="One more serving"
        style={servingButton(servings >= MAX_SERVINGS)}
      >
        +
      </button>
      {factor !== 1 && (
        <button
          onClick={() => onChange(baseServings)}
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: 'var(--accent)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0 2px',
          }}
        >
          {formatFactor(factor)} · reset
        </button>
      )}
    </div>
  )
}

function servingButton(disabled: boolean) {
  return {
    width: 34,
    height: 34,
    borderRadius: '50%',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    fontSize: 19,
    fontWeight: 700,
    lineHeight: 1,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1,
  } as const
}

// ── Timers ──────────────────────────────────────────────────────────────────

/**
 * The current step's duration, as a control rather than a label. This is the
 * difference between stream J's step (which SAYS twelve minutes) and cook mode
 * (which counts them), and it is the reason DurationSeconds was worth typing.
 */
function StepFacts({
  step,
  timers,
  index,
}: {
  step: RecipeStep
  timers: ReturnType<typeof useCookTimers>
  index: number
}) {
  const duration = step.durationSeconds ?? 0
  const timer = timers.timers[index]

  if (duration <= 0 && !step.temperature) return null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16 }}>
      {duration > 0 && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            borderRadius: 14,
            background: timer?.done ? 'var(--accent)' : 'var(--surface2)',
            color: timer?.done ? 'var(--accent-ink)' : 'var(--text)',
          }}
        >
          <span style={{ fontSize: 21, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {formatClock(timer ? timer.remaining : duration)}
          </span>
          {!timer && (
            <button onClick={() => timers.start(index, duration)} style={timerButton()}>
              ▷ Start
            </button>
          )}
          {timer && timer.running && (
            <button onClick={() => timers.pause(index)} style={timerButton()}>
              ⏸ Pause
            </button>
          )}
          {timer && !timer.running && !timer.done && (
            <button onClick={() => timers.resume(index)} style={timerButton()}>
              ▷ Resume
            </button>
          )}
          {timer && timer.done && (
            <button onClick={() => timers.reset(index)} style={timerButton(true)}>
              ✓ Done
            </button>
          )}
          {timer && !timer.done && (
            <button onClick={() => timers.reset(index)} aria-label="Reset timer" style={timerButton()}>
              ↺
            </button>
          )}
        </div>
      )}

      {step.temperature && (
        // Never scaled — see servingScale.ts. An oven does not get hotter for
        // more people.
        <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--accent)' }}>
          ◈ {formatTemperature(step.temperature)}
        </span>
      )}
    </div>
  )
}

function timerButton(inverted = false) {
  return {
    background: inverted ? 'rgba(0,0,0,.18)' : 'var(--surface)',
    color: 'inherit',
    border: inverted ? 'none' : '1px solid var(--border)',
    borderRadius: 10,
    padding: '6px 10px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  } as const
}

/**
 * Timers belonging to OTHER steps. The rail is why timers outlive their step:
 * you start the rice, walk on to the sauce, and the rice is still visible and
 * one tap away.
 */
function TimerRail({
  timers,
  steps,
  currentIndex,
  onGoTo,
}: {
  timers: ReturnType<typeof useCookTimers>
  steps: RecipeStep[]
  currentIndex: number
  onGoTo: (index: number) => void
}) {
  const others = timers.activeSteps.filter((i) => i !== currentIndex)
  if (others.length === 0) return null

  return (
    <div style={{ flexShrink: 0, display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
      {others.map((i) => {
        const timer = timers.timers[i]
        return (
          <button
            key={i}
            onClick={() => onGoTo(i)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              borderRadius: 999,
              padding: '5px 11px',
              border: '1px solid var(--border)',
              background: timer.done ? 'var(--accent)' : 'var(--surface2)',
              color: timer.done ? 'var(--accent-ink)' : 'var(--text)',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <span style={{ opacity: 0.75 }}>Step {(steps[i]?.stepNumber ?? i + 1)}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {timer.done ? 'ready' : formatClock(timer.remaining)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Ingredients ─────────────────────────────────────────────────────────────

/**
 * The lines a step consumes, resolved through decision D16's indexes — against
 * the SCALED copy, which is where scaling becomes visible without anything
 * having rewritten a word of the method.
 *
 * Out-of-range indexes are dropped rather than rendered as holes: both
 * validators reject them on write, but a recipe written before stream J can
 * still hold one, and a step is worth reading with a chip missing.
 */
function referencedIngredients(step: RecipeStep, all: readonly RecipeIngredient[]) {
  return (step.ingredientIndexes ?? []).map((i) => all[i]).filter((ing): ing is RecipeIngredient => ing != null)
}

function UsedIngredients({ lines, scaled }: { lines: RecipeIngredient[]; scaled: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 22 }}>
      <div style={{ fontSize: 11.5, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>
        For this step{scaled ? ' · scaled' : ''}
      </div>
      {lines.map((ing, i) => (
        <div key={i} style={{ fontSize: 19, lineHeight: 1.35 }}>
          <span style={{ fontWeight: 800 }}>{formatQuantity(ing.quantity, ing.unit)}</span>{' '}
          <span style={{ color: 'var(--muted)' }}>{ing.name}</span>
        </div>
      ))}
    </div>
  )
}

// ── Footer ──────────────────────────────────────────────────────────────────

function Footer({
  last,
  atStart,
  onPrev,
  onNext,
  onFinish,
  onAsk,
  micSupported,
  micState,
  onMic,
}: {
  last: boolean
  atStart: boolean
  onPrev: () => void
  onNext: () => void
  onFinish: () => void
  onAsk: () => void
  micSupported: boolean
  micState: PushToTalkState
  onMic: () => void
}) {
  return (
    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <button
          onClick={onAsk}
          style={{
            alignSelf: 'flex-start',
            background: 'none',
            border: 'none',
            color: 'var(--accent)',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            padding: '2px 0',
          }}
        >
          ✻ Ask about this recipe
        </button>
        {micSupported && micState !== 'denied' && (
          <button
            onClick={onMic}
            aria-label="Voice input"
            aria-pressed={micState === 'listening'}
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: micState === 'listening' ? 'var(--accent)' : 'var(--surface2)',
              color: micState === 'listening' ? 'var(--accent-ink)' : 'var(--text)',
              border: 'none',
              fontSize: 16,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            🎤
          </button>
        )}
        {micSupported && micState === 'denied' && (
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            Microphone access is off — voice input unavailable.
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <Button
          onClick={onPrev}
          disabled={atStart}
          className="flex-1 rounded-2xl text-base font-bold py-4 h-auto"
          style={{ background: 'var(--surface2)', color: 'var(--text)', opacity: atStart ? 0.5 : 1 }}
        >
          ← Prev
        </Button>
        <Button
          onClick={last ? onFinish : onNext}
          className="flex-1 rounded-2xl text-base font-bold py-4 h-auto"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          {last ? 'Finished cooking' : 'Next →'}
        </Button>
      </div>
    </div>
  )
}

// ── The assistant ───────────────────────────────────────────────────────────

/**
 * One bounded exchange about one recipe, held entirely in this component's
 * state (decision D14). Closing cook mode discards it, which is the design.
 *
 * A refusal is rendered as a refusal — the `refused` flag off the wire, not a
 * guess from the prose — because the point of a bounded assistant is that its
 * boundary is visible.
 */
function AssistantSheet({
  recipe,
  servings,
  requireAuth,
  voiceDraft,
  micSupported,
  micState,
  onMic,
  onAnswer,
  onClose,
}: {
  recipe: RecipeResponse
  servings: number
  requireAuth: () => boolean
  voiceDraft: { text: string; id: number } | null
  micSupported: boolean
  micState: PushToTalkState
  onMic: () => void
  onAnswer: (answer: string, refused: boolean) => void
  onClose: () => void
}) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [callsRemaining, setCallsRemaining] = useState<number | null>(null)
  const [trimmedNote, setTrimmedNote] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Optional call, not just an optional ref: jsdom has no scrollIntoView, and
    // an assistant that throws while scrolling would take cook mode down with it.
    endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [turns, pending])

  // A transcript is a DRAFT, not a send — the user confirms spend, and the
  // visible text is where recognition errors get fixed. Truncation to the
  // backend's limit happens HERE, said out loud inline, never silently at
  // send time. Keyed on voiceDraft.id so the same words twice still land.
  useEffect(() => {
    if (!voiceDraft) return
    setDraft(voiceDraft.text.slice(0, COOK_QUESTION_MAX_LENGTH))
    setTrimmedNote(voiceDraft.text.length > COOK_QUESTION_MAX_LENGTH)
    inputRef.current?.focus()
  }, [voiceDraft])

  const send = async () => {
    const question = draft.trim()
    if (!question || pending) return
    // Guest access: cook mode itself reads fine without an account, but this
    // spends someone's daily allowance, so it needs one.
    if (!requireAuth()) return

    setPending(true)
    setError(null)
    // The question joins the transcript immediately; on failure it is REMOVED
    // again and put back in the box, so a retry is one tap and the transcript
    // never shows a question that was never asked (D18 point 2).
    setTurns((prev) => [...prev, { role: 'user', content: question }])
    setDraft('')
    setTrimmedNote(false)

    try {
      const result = await askCookAssistant(recipe.id, {
        question,
        // Only the trailing window the backend accepts. Sending more is a 400,
        // and the surface should not be able to talk itself into one.
        history: turns.slice(-COOK_HISTORY_MAX_ITEMS).map(({ role, content }) => ({ role, content })),
        servings,
      })
      setTurns((prev) => [...prev, { role: 'assistant', content: result.answer, refused: result.refused }])
      setCallsRemaining(result.budget.callsRemaining)
      onAnswer(result.answer, result.refused)
    } catch (err) {
      setTurns((prev) => prev.slice(0, -1))
      setDraft(question)
      setError(
        isQuotaError(err)
          ? "That's today's AI allowance used up. It resets at midnight UTC — everything else in cook mode still works."
          : 'Could not reach the assistant. Your timers and the recipe are unaffected — try again in a moment.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        top: '18%',
        background: 'var(--bg)',
        borderTop: '1px solid var(--border)',
        borderRadius: '20px 20px 0 0',
        boxShadow: 'var(--cardsh)',
        display: 'flex',
        flexDirection: 'column',
        padding: '14px 18px 18px',
        zIndex: 2,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Ask about this recipe</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {/* Said out loud, because a boundary nobody is told about reads as
                a defect the first time it refuses something. */}
            Only this recipe — substitutions, technique, what a step means.
            {callsRemaining !== null && ` · ${callsRemaining} left today`}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close the assistant"
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: 'var(--surface2)',
            color: 'var(--text)',
            border: 'none',
            fontSize: 16,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>

      {/* role="log": answers arrive after the fact and a screen reader should
          be told without stealing focus from the input. */}
      <div
        role="log"
        aria-label="Cook mode conversation"
        className="scroll"
        style={{ flex: 1, overflowY: 'auto', margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {turns.length === 0 && !pending && (
          <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.55 }}>
            Ask anything about {recipe.title} — “can I swap the butter?”, “how do I know it's
            done?”, “what does folding mean here?”. Answers use this recipe's own ingredients
            and steps, and your dietary restrictions.
          </div>
        )}

        {turns.map((turn, i) => (
          <div
            key={i}
            data-testid="cook-turn"
            // The refusal is on the element as well as in its styling, so a
            // browser probe can assert the BOUNDARY rather than a font-style.
            data-refused={turn.refused ? 'true' : undefined}
            style={{
              alignSelf: turn.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '86%',
              padding: '10px 13px',
              borderRadius: 16,
              fontSize: 15,
              lineHeight: 1.5,
              background:
                turn.role === 'user'
                  ? 'var(--accent)'
                  : turn.refused
                    ? 'transparent'
                    : 'var(--surface2)',
              color: turn.role === 'user' ? 'var(--accent-ink)' : 'var(--text)',
              // A refusal is drawn as a refusal: outlined and muted rather than
              // dressed as an answer, so the boundary is legible at a glance.
              border: turn.refused ? '1px dashed var(--border)' : 'none',
              fontStyle: turn.refused ? 'italic' : 'normal',
              opacity: turn.refused ? 0.85 : 1,
            }}
          >
            {turn.content}
          </div>
        ))}

        {pending && (
          <div style={{ alignSelf: 'flex-start', fontSize: 14, color: 'var(--muted)' }}>Thinking…</div>
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <div
          role="alert"
          style={{
            flexShrink: 0,
            fontSize: 13,
            lineHeight: 1.45,
            color: 'var(--muted)',
            borderLeft: '2px solid var(--border)',
            paddingLeft: 10,
            marginBottom: 10,
          }}
        >
          {error}
        </div>
      )}

      {trimmedNote && (
        <div style={{ flexShrink: 0, fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}>
          Heard more than {COOK_QUESTION_MAX_LENGTH} characters — trimmed to fit.
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
        style={{ flexShrink: 0, display: 'flex', gap: 8 }}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={COOK_QUESTION_MAX_LENGTH}
          placeholder="Ask about this recipe…"
          aria-label="Ask about this recipe"
          style={{
            flex: 1,
            minWidth: 0,
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '11px 13px',
            fontSize: 15,
            color: 'var(--text)',
            outline: 'none',
          }}
        />
        {micSupported && micState !== 'denied' && (
          <button
            type="button"
            onClick={onMic}
            aria-label="Voice input"
            aria-pressed={micState === 'listening'}
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: micState === 'listening' ? 'var(--accent)' : 'var(--surface2)',
              color: micState === 'listening' ? 'var(--accent-ink)' : 'var(--text)',
              border: 'none',
              fontSize: 16,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            🎤
          </button>
        )}
        {micSupported && micState === 'denied' && (
          <span style={{ fontSize: 12.5, color: 'var(--muted)', alignSelf: 'center', flexShrink: 0 }}>
            Microphone access is off — voice input unavailable.
          </span>
        )}
        <Button
          type="submit"
          disabled={pending || draft.trim().length === 0}
          className="rounded-2xl font-bold px-5 h-auto"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          Ask
        </Button>
      </form>
    </div>
  )
}

// ── Finishing ───────────────────────────────────────────────────────────────

/**
 * "Finished cooking" closes into the cook-and-rate action that already exists
 * — POST /recipes/{id}/cooked, then the rating — rather than inventing a
 * completion of its own. That loop is what makes cook mode worth anything to
 * anyone but the person cooking: the cook count feeds the recipe picker's
 * "what you've cooked before", and the rating is what awards the author.
 *
 * D18 point 3: a failed write holds this panel open with a Retry. Losing a
 * cook somebody just logged, silently, because a radio was off is the one
 * failure this surface must not have.
 */
function FinishPanel({
  title,
  myRating,
  logged,
  failed,
  pending,
  requireAuth,
  onRate,
  onRetry,
  onBack,
  onDone,
}: {
  title: string
  myRating: number | null
  logged: boolean
  failed: boolean
  pending: boolean
  requireAuth: () => boolean
  onRate: (value: number | null) => void
  onRetry: () => void
  onBack: () => void
  onDone: () => void
}) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '54px 22px 22px',
        zIndex: 3,
      }}
    >
      <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.015em' }}>
        You cooked {title}.
      </div>

      <div style={{ fontSize: 15, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
        {failed
          ? "Couldn't log it just now — your connection dropped somewhere. Nothing is lost; try again."
          : logged
            ? 'Logged. How did it go?'
            : 'How did it go?'}
      </div>

      <div style={{ display: 'flex', gap: 4, marginTop: 22 }} role="group" aria-label="Rate this recipe">
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = myRating !== null && star <= myRating
          return (
            <button
              key={star}
              onClick={() => {
                if (!requireAuth()) return
                onRate(myRating === star ? null : star)
              }}
              aria-pressed={filled}
              aria-label={myRating === star ? `Remove your ${star}-star rating` : `Rate ${star} out of 5`}
              style={{
                background: 'none',
                border: 'none',
                padding: '2px 4px',
                fontSize: 38,
                lineHeight: 1,
                cursor: 'pointer',
                color: filled ? 'var(--accent)' : 'var(--muted)',
              }}
            >
              {filled ? '★' : '☆'}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
        <Button
          onClick={onBack}
          className="flex-1 rounded-2xl text-base font-bold py-4 h-auto"
          style={{ background: 'var(--surface2)', color: 'var(--text)' }}
        >
          ← Back to steps
        </Button>
        <Button
          onClick={failed ? onRetry : onDone}
          disabled={pending}
          className="flex-1 rounded-2xl text-base font-bold py-4 h-auto"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          {failed ? 'Try again' : 'Done'}
        </Button>
      </div>
    </div>
  )
}
