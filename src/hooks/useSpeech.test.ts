import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { installSpeechStubs, removeSpeechApis, type SpeechStubs } from '@/test/speech'
import { useSpeech } from './useSpeech'

describe('useSpeech', () => {
  let stubs: SpeechStubs
  beforeEach(() => {
    stubs = installSpeechStubs()
  })

  it('reports unsupported and does nothing when the API is absent', () => {
    removeSpeechApis()
    const { result } = renderHook(() => useSpeech())
    expect(result.current.supported).toBe(false)
    act(() => result.current.speak('hello'))
    expect(result.current.speaking).toBe(false)
  })

  it('speaks: cancels the global queue first, then queues one utterance', () => {
    const { result } = renderHook(() => useSpeech())
    expect(result.current.supported).toBe(true)
    act(() => result.current.speak('step one'))
    expect(stubs.synth.cancelCount).toBe(1) // replace, never stack
    expect(stubs.spoken.map((u) => u.text)).toEqual(['step one'])
    expect(result.current.speaking).toBe(true)
  })

  it('drops speaking when the utterance ends', () => {
    const { result } = renderHook(() => useSpeech())
    act(() => result.current.speak('step one'))
    act(() => stubs.spoken[0].onend?.())
    expect(result.current.speaking).toBe(false)
  })

  it('cancel() clears the queue and the state', () => {
    const { result } = renderHook(() => useSpeech())
    act(() => result.current.speak('step one'))
    act(() => result.current.cancel())
    expect(result.current.speaking).toBe(false)
    expect(stubs.synth.cancelCount).toBe(2) // one from speak, one from cancel
  })

  it('cancels the GLOBAL queue on unmount — speechSynthesis outlives the component', () => {
    const { result, unmount } = renderHook(() => useSpeech())
    act(() => result.current.speak('step one'))
    unmount()
    expect(stubs.synth.cancelCount).toBe(2)
  })
})
