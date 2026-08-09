// ─────────────────────────────────────────────────────────────────────────
// Push-to-talk capture for cook mode (stream O) — the OTHER half of the
// voice layer, on the same honesty contract as useWakeLock and useSpeech.
//
// One tap, one listen, one FINAL transcript, then silence. Deliberately not
// continuous: recognition on Chrome is server-side, an open mic in a kitchen
// is a false-trigger machine (the brief bans wake words by name), and
// one-shot keeps the mic's lifetime exactly as long as the user's intent.
// Interim results are never surfaced — the grammar matches finals only.
//
// `denied` is STICKY. A user who refused the mic gets one inline explanation
// and no re-prompt loop; browsers escalate repeated getUserMedia-style
// prompts into permanent blocks, and a nagging surface earns one.
//
// TS's dom lib has no SpeechRecognition types; the minimal ambient shape
// below covers exactly what this hook touches, prefixed constructor included
// (Chrome and Safari ship webkitSpeechRecognition; Firefox ships neither —
// the affordance is hidden there, not disabled).
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'

interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}

interface RecognitionLike {
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: RecognitionResultEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  abort: () => void
}

type RecognitionCtor = new () => RecognitionLike

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export type PushToTalkState = 'idle' | 'listening' | 'denied'

export interface PushToTalkApi {
  supported: boolean
  state: PushToTalkState
  /** Begin one listen. No-op while listening, after denial, or unsupported. */
  start: () => void
  /** Abort the current listen without delivering a transcript. */
  stop: () => void
}

export function usePushToTalk(onFinal: (transcript: string) => void): PushToTalkApi {
  const ctor = recognitionCtor()
  const [state, setState] = useState<PushToTalkState>('idle')
  const recRef = useRef<RecognitionLike | null>(null)
  // The latest closure, always — a transcript must dispatch against the
  // step the cook is ON, not the one rendered when the mic opened.
  const onFinalRef = useRef(onFinal)
  onFinalRef.current = onFinal

  const stop = useCallback(() => {
    recRef.current?.abort()
    recRef.current = null
    setState((s) => (s === 'denied' ? 'denied' : 'idle'))
  }, [])

  const start = useCallback(() => {
    if (!ctor || recRef.current || state === 'denied') return
    const rec = new ctor()
    rec.continuous = false
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript
      if (transcript) onFinalRef.current(transcript)
    }
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setState('denied')
      }
    }
    rec.onend = () => {
      recRef.current = null
      setState((s) => (s === 'denied' ? 'denied' : 'idle'))
    }
    recRef.current = rec
    setState('listening')
    rec.start()
  }, [ctor, state])

  useEffect(() => () => recRef.current?.abort(), [])

  return { supported: ctor !== null, state, start, stop }
}
