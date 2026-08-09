// ─────────────────────────────────────────────────────────────────────────
// Controllable fakes for the two Web Speech APIs (stream O). jsdom has
// neither; setup.ts installs no-op baselines so components render, and tests
// that ASSERT on speech re-install these richer fakes via installSpeechStubs.
// ─────────────────────────────────────────────────────────────────────────

export class StubUtterance {
  text: string
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(text: string) {
    this.text = text
  }
}

export class StubSpeechRecognition {
  static created: StubSpeechRecognition[] = []
  continuous = false
  interimResults = false
  maxAlternatives = 1
  started = false
  aborted = false
  onresult: ((e: { results: { transcript: string }[][] }) => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  onend: (() => void) | null = null

  constructor() {
    StubSpeechRecognition.created.push(this)
  }
  start() {
    this.started = true
  }
  stop() {
    this.onend?.()
  }
  abort() {
    this.aborted = true
    this.onend?.()
  }
  /** Deliver a FINAL transcript, then end — the shape the hook listens for. */
  emitFinal(transcript: string) {
    this.onresult?.({ results: [[{ transcript }]] })
    this.onend?.()
  }
  emitError(error: string) {
    this.onerror?.({ error })
    this.onend?.()
  }
}

export interface SpeechStubs {
  synth: { speak: (u: StubUtterance) => void; cancel: () => void; cancelCount: number }
  /** Every utterance passed to speak(), in order. Fire spoken[i].onend?.() to finish one. */
  spoken: StubUtterance[]
  /** Every recognition instance constructed, in order. */
  recognitions: StubSpeechRecognition[]
}

/** Install fresh fakes on window. Call in beforeEach of any speech test. */
export function installSpeechStubs(): SpeechStubs {
  const spoken: StubUtterance[] = []
  const synth = {
    cancelCount: 0,
    speak: (u: StubUtterance) => {
      spoken.push(u)
    },
    cancel: () => {
      synth.cancelCount += 1
    },
    getVoices: () => [] as unknown[],
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  StubSpeechRecognition.created = []
  const w = window as unknown as Record<string, unknown>
  w.speechSynthesis = synth
  w.SpeechSynthesisUtterance = StubUtterance
  w.SpeechRecognition = StubSpeechRecognition
  delete w.webkitSpeechRecognition
  return { synth, spoken, recognitions: StubSpeechRecognition.created }
}

/** Remove both APIs — for capability-absence tests (affordances must be HIDDEN). */
export function removeSpeechApis(): void {
  const w = window as unknown as Record<string, unknown>
  delete w.speechSynthesis
  delete w.SpeechSynthesisUtterance
  delete w.SpeechRecognition
  delete w.webkitSpeechRecognition
}
