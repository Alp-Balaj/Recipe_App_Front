// ─────────────────────────────────────────────────────────────────────────
// Speech output for cook mode (stream O), on useWakeLock's honesty contract:
// `supported` is whether the API actually exists, `speaking` is whether an
// utterance of OURS is actually in flight, and a browser without the API
// gets silence and `false` — never a throwing affordance.
//
// speechSynthesis queues GLOBALLY and outlives any component, so this hook
// is strict about ownership: speak() replaces the queue rather than joining
// it (a cook who tapped Next twice wants the current step, not a backlog),
// and unmount cancels globally. On iOS the engine is silent until first
// triggered by a user gesture — callers start speech from interactions,
// never mount effects, which StrictMode double-invokes anyway.
// Voice choice is left to the engine: getVoices() loads async and the
// default voice is the one thing every platform ships working.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'

export interface SpeechApi {
  supported: boolean
  speaking: boolean
  /** Replace anything queued with this text. Safe no-op when unsupported. */
  speak: (text: string) => void
  /** Silence everything, including utterances queued by a previous render. */
  cancel: () => void
}

export function useSpeech(): SpeechApi {
  const supported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance === 'function'
  const [speaking, setSpeaking] = useState(false)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  const speak = useCallback(
    (text: string) => {
      if (!supported || !text) return
      window.speechSynthesis.cancel()
      const utterance = new window.SpeechSynthesisUtterance(text)
      utteranceRef.current = utterance
      utterance.onend = () => {
        if (utteranceRef.current !== utterance) return
        setSpeaking(false)
      }
      utterance.onerror = () => {
        if (utteranceRef.current !== utterance) return
        setSpeaking(false)
      }
      setSpeaking(true)
      window.speechSynthesis.speak(utterance)
    },
    [supported],
  )

  const cancel = useCallback(() => {
    if (!supported) return
    utteranceRef.current = null
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [supported])

  useEffect(() => {
    if (!supported) return
    return () => {
      utteranceRef.current = null
      window.speechSynthesis.cancel()
    }
  }, [supported])

  return { supported, speaking, speak, cancel }
}
