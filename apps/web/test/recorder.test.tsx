import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAudioRecorder } from '../src/hooks/useAudioRecorder'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('joins repeated stop calls and waits for the final audio chunk', async () => {
  const stopTrack = vi.fn()
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: stopTrack }] }) } })
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('AudioContext', class {
    createAnalyser() { return { frequencyBinCount: 64 } }
    createMediaStreamSource() { return { connect: vi.fn() } }
    close() { return Promise.resolve() }
  })
  let instance!: FakeRecorder
  class FakeRecorder {
    static isTypeSupported() { return true }
    state = 'inactive'
    mimeType = 'audio/webm'
    ondataavailable?: (event: { data: Blob }) => void
    onstop?: () => void
    // The test drives MediaRecorder events after stop() returns.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    constructor() { instance = this }
    start() { this.state = 'recording' }
    stop() { this.state = 'inactive' }
  }
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  const { result } = renderHook(() => useAudioRecorder())
  await act(() => result.current.start())
  let first!: Promise<Blob>
  let second!: Promise<Blob>
  act(() => { first = result.current.stop(); second = result.current.stop() })
  expect(first).toBe(second)
  await act(async () => {
    instance.ondataavailable?.({ data: new Blob(['final chunk']) })
    instance.onstop?.()
    const blob = await first
    expect(blob.size).toBe(11)
    expect(blob.type).toBe('audio/webm')
  })
  expect(stopTrack).toHaveBeenCalledOnce()
})
