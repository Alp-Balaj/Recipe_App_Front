// ─────────────────────────────────────────────────────────────────────────
// Real cook-mode timers (stream M).
//
// ── WHY WALL-CLOCK AND NOT A TICK COUNTER ─────────────────────────────────
// The obvious implementation — setInterval(1000) decrementing a number — is
// wrong in exactly the situation cook mode is FOR. A phone propped against a
// bowl locks its screen, backgrounds the tab, or throttles its timers, and a
// tick counter then measures how often the browser felt like calling us rather
// than how long the onion has been in the pan. Every timer here stores an
// ABSOLUTE end time (Date.now() + remaining) and the interval only re-renders;
// what it renders is a subtraction against the clock. Come back to a
// backgrounded tab after five minutes and the number is right, because it was
// never being counted in the first place.
//
// ── WHY TIMERS OUTLIVE THE STEP THAT STARTED THEM ─────────────────────────
// Because cooking does. You start the rice and move on to the sauce; a timer
// that stopped when you pressed Next would be a timer for a way of cooking
// nobody uses. So they live in one map keyed by step index, they keep running
// while you read other steps, and the surface can show what is still going.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'

export interface CookTimer {
  /** Seconds left, floored, never below zero. */
  remaining: number
  /** The step's full duration, so a progress bar has a denominator. */
  total: number
  running: boolean
  /** True once it has reached zero — the alarm state, until it is dismissed. */
  done: boolean
}

interface TimerState {
  total: number
  /** Absolute epoch ms at which this timer hits zero. Null while paused. */
  endsAt: number | null
  /** Seconds left while paused. Ignored while running. */
  paused: number
  done: boolean
}

export interface CookTimersApi {
  timers: Readonly<Record<number, CookTimer>>
  /** Start (or restart from full) the timer for a step. */
  start: (stepIndex: number, durationSeconds: number) => void
  /** Pause a running timer, keeping what is left of it. */
  pause: (stepIndex: number) => void
  /** Resume a paused one. */
  resume: (stepIndex: number) => void
  /** Drop it entirely — also how an alarm is dismissed. */
  reset: (stepIndex: number) => void
  /** Step indexes with a timer that is running or ringing, in step order. */
  activeSteps: number[]
  /** True while at least one timer is at zero and undismissed. */
  ringing: boolean
}

function project(state: TimerState, now: number): CookTimer {
  if (state.endsAt === null) {
    return { remaining: state.paused, total: state.total, running: false, done: state.done }
  }
  const remaining = Math.max(0, Math.ceil((state.endsAt - now) / 1000))
  return { remaining, total: state.total, running: remaining > 0, done: remaining === 0 }
}

/**
 * The alarm. Deliberately built from what a browser gives you with no assets
 * and no permission prompt: a short two-tone beep through the Web Audio API,
 * plus a vibration where the platform has one. Both are best-effort — Safari
 * refuses an AudioContext outside a user gesture and every desktop browser
 * ignores vibrate — and both are wrapped, because a timer that THROWS when it
 * finishes is worse than one that finishes quietly.
 */
function sound(): void {
  try {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (Ctor) {
      const ctx = new Ctor()
      const now = ctx.currentTime
      for (const [at, freq] of [[0, 880], [0.28, 1174]] as const) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = freq
        osc.connect(gain)
        gain.connect(ctx.destination)
        gain.gain.setValueAtTime(0.0001, now + at)
        gain.gain.exponentialRampToValueAtTime(0.22, now + at + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.24)
        osc.start(now + at)
        osc.stop(now + at + 0.26)
      }
      setTimeout(() => void ctx.close().catch(() => {}), 1200)
    }
  } catch {
    // No audio. The visual alarm state is the real notification anyway.
  }

  try {
    navigator.vibrate?.([200, 90, 200])
  } catch {
    // Not every platform has a motor, and none of them owe us one.
  }
}

export function useCookTimers(): CookTimersApi {
  const [states, setStates] = useState<Record<number, TimerState>>({})
  const [now, setNow] = useState(() => Date.now())
  // Which steps have already sounded, so the alarm fires ONCE per run rather
  // than on every re-render after zero.
  const alarmed = useRef<Set<number>>(new Set())

  const anyRunning = Object.values(states).some((s) => s.endsAt !== null && !s.done)

  // One interval for every timer. It exists only to re-render — the numbers are
  // all derived from Date.now() — so it stops as soon as nothing is running.
  useEffect(() => {
    if (!anyRunning) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [anyRunning])

  // Returning to a backgrounded tab: re-read the clock immediately rather than
  // waiting up to 250 ms, so the first paint after unlock is already correct.
  useEffect(() => {
    const onVisible = () => setNow(Date.now())
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Promote reached-zero timers to done, and ring once each.
  useEffect(() => {
    const finished = Object.entries(states).filter(
      ([, s]) => s.endsAt !== null && !s.done && s.endsAt <= now,
    )
    if (finished.length === 0) return

    for (const [key] of finished) {
      const index = Number(key)
      if (!alarmed.current.has(index)) {
        alarmed.current.add(index)
        sound()
      }
    }

    setStates((prev) => {
      const next = { ...prev }
      for (const [key] of finished) {
        const index = Number(key)
        const state = next[index]
        if (state) next[index] = { ...state, endsAt: state.endsAt, paused: 0, done: true }
      }
      return next
    })
  }, [now, states])

  const start = useCallback((stepIndex: number, durationSeconds: number) => {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return
    alarmed.current.delete(stepIndex)
    setStates((prev) => ({
      ...prev,
      [stepIndex]: {
        total: durationSeconds,
        endsAt: Date.now() + durationSeconds * 1000,
        paused: durationSeconds,
        done: false,
      },
    }))
    setNow(Date.now())
  }, [])

  const pause = useCallback((stepIndex: number) => {
    setStates((prev) => {
      const state = prev[stepIndex]
      if (!state || state.endsAt === null) return prev
      const remaining = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000))
      return { ...prev, [stepIndex]: { ...state, endsAt: null, paused: remaining } }
    })
  }, [])

  const resume = useCallback((stepIndex: number) => {
    setStates((prev) => {
      const state = prev[stepIndex]
      if (!state || state.endsAt !== null || state.paused <= 0) return prev
      return { ...prev, [stepIndex]: { ...state, endsAt: Date.now() + state.paused * 1000 } }
    })
    setNow(Date.now())
  }, [])

  const reset = useCallback((stepIndex: number) => {
    alarmed.current.delete(stepIndex)
    setStates((prev) => {
      if (!(stepIndex in prev)) return prev
      const next = { ...prev }
      delete next[stepIndex]
      return next
    })
  }, [])

  const timers: Record<number, CookTimer> = {}
  for (const [key, state] of Object.entries(states)) {
    timers[Number(key)] = project(state, now)
  }

  const activeSteps = Object.keys(timers)
    .map(Number)
    .filter((i) => timers[i].running || timers[i].done)
    .sort((a, b) => a - b)

  return {
    timers,
    start,
    pause,
    resume,
    reset,
    activeSteps,
    ringing: activeSteps.some((i) => timers[i].done),
  }
}

/** Seconds → "8:00" / "1:04:00". The cook-mode clock face, not J's prose form. */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`
}
