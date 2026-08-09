import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { installSpeechStubs, removeSpeechApis, type SpeechStubs } from '@/test/speech'
import { usePushToTalk } from './usePushToTalk'

describe('usePushToTalk', () => {
  let stubs: SpeechStubs
  beforeEach(() => {
    stubs = installSpeechStubs()
  })

  it('reports unsupported when neither prefixed nor unprefixed API exists', () => {
    removeSpeechApis()
    const { result } = renderHook(() => usePushToTalk(() => {}))
    expect(result.current.supported).toBe(false)
  })

  it('supports the webkit prefix alone (Chrome, Safari)', () => {
    const w = window as unknown as Record<string, unknown>
    w.webkitSpeechRecognition = w.SpeechRecognition
    delete w.SpeechRecognition
    const { result } = renderHook(() => usePushToTalk(() => {}))
    expect(result.current.supported).toBe(true)
  })

  it('start() listens one-shot, final-only; a final transcript reaches onFinal and ends', () => {
    const onFinal = vi.fn()
    const { result } = renderHook(() => usePushToTalk(onFinal))
    act(() => result.current.start())
    expect(result.current.state).toBe('listening')
    const rec = stubs.recognitions[0]
    expect(rec.started).toBe(true)
    expect(rec.continuous).toBe(false)
    expect(rec.interimResults).toBe(false)
    act(() => rec.emitFinal('next step'))
    expect(onFinal).toHaveBeenCalledWith('next step')
    expect(result.current.state).toBe('idle')
  })

  it('always calls the LATEST onFinal closure', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { result, rerender } = renderHook(({ cb }) => usePushToTalk(cb), {
      initialProps: { cb: first },
    })
    act(() => result.current.start())
    rerender({ cb: second })
    act(() => stubs.recognitions[0].emitFinal('back'))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('back')
  })

  it('a permission denial is sticky', () => {
    const { result } = renderHook(() => usePushToTalk(() => {}))
    act(() => result.current.start())
    act(() => stubs.recognitions[0].emitError('not-allowed'))
    expect(result.current.state).toBe('denied')
    act(() => result.current.start()) // no re-prompt loop
    expect(stubs.recognitions).toHaveLength(1)
  })

  it('stop() aborts, and unmount aborts a live session', () => {
    const { result, unmount } = renderHook(() => usePushToTalk(() => {}))
    act(() => result.current.start())
    act(() => result.current.stop())
    expect(stubs.recognitions[0].aborted).toBe(true)
    act(() => result.current.start())
    unmount()
    expect(stubs.recognitions[1].aborted).toBe(true)
  })
})
