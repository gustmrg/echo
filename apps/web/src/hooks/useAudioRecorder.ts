import { useState, useRef, useEffect, useCallback } from 'react'

type RecorderState = 'idle' | 'recording' | 'paused'

const LEVEL_BARS = 24

export interface UseAudioRecorderReturn {
  state: RecorderState
  elapsedSeconds: number
  /** Normalized mic input levels (0–1), one per bar, live while recording. */
  levels: number[]
  start: () => Promise<void>
  pause: () => void
  resume: () => void
  stop: () => Promise<Blob>
  discard: () => void
}

const SILENCE = new Array<number>(LEVEL_BARS).fill(0)

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [levels, setLevels] = useState<number[]>(SILENCE)

  const chunks = useRef<Blob[]>([])
  const finalization = useRef<Promise<Blob> | null>(null)
  const starting = useRef(false)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const audioCtx = useRef<AudioContext | null>(null)
  const analyser = useRef<AnalyserNode | null>(null)
  const raf = useRef<number | null>(null)

  const stopLevelLoop = useCallback(() => {
    if (raf.current !== null) {
      cancelAnimationFrame(raf.current)
      raf.current = null
    }
    setLevels(SILENCE)
  }, [])

  const teardownAudioGraph = useCallback(() => {
    stopLevelLoop()
    analyser.current = null
    if (audioCtx.current) {
      audioCtx.current.close().catch(() => {})
      audioCtx.current = null
    }
  }, [stopLevelLoop])

  // Release mic, timer, and audio graph on unmount regardless of state
  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current)
      stream.current?.getTracks().forEach(t => t.stop())
      teardownAudioGraph()
    }
  }, [teardownAudioGraph])

  function startTimer() {
    timer.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000)
  }

  function stopTimer() {
    if (timer.current) {
      clearInterval(timer.current)
      timer.current = null
    }
  }

  function stopTracks() {
    stream.current?.getTracks().forEach(t => t.stop())
    stream.current = null
  }

  function startLevelLoop() {
    const node = analyser.current
    if (!node) return
    const data = new Uint8Array(node.frequencyBinCount)
    const tick = () => {
      node.getByteFrequencyData(data)
      const next: number[] = []
      const step = Math.floor(data.length / LEVEL_BARS)
      for (let i = 0; i < LEVEL_BARS; i++) {
        // Average a slice of the spectrum and normalize to 0–1
        let sum = 0
        for (let j = 0; j < step; j++) sum += data[i * step + j]
        next.push(Math.min(1, sum / step / 180))
      }
      setLevels(next)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }

  async function start() {
    if (starting.current || recorder.current) return
    starting.current = true
    finalization.current = null
    try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.current = s

    // Input-level metering (not connected to destination — analysis only)
    audioCtx.current = new AudioContext()
    analyser.current = audioCtx.current.createAnalyser()
    analyser.current.fftSize = 128
    analyser.current.smoothingTimeConstant = 0.75
    audioCtx.current.createMediaStreamSource(s).connect(analyser.current)

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : undefined

    const mr = new MediaRecorder(s, mimeType ? { mimeType } : undefined)
    recorder.current = mr
    chunks.current = []

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data)
    }

    mr.start(100)
    setState('recording')
    startTimer()
    startLevelLoop()
    } catch (error) {
      stopTracks()
      teardownAudioGraph()
      recorder.current = null
      throw error
    } finally { starting.current = false }
  }

  function pause() {
    recorder.current?.pause()
    stopTimer()
    stopLevelLoop()
    setState('paused')
  }

  function resume() {
    recorder.current?.resume()
    startTimer()
    startLevelLoop()
    setState('recording')
  }

  function stop(): Promise<Blob> {
    if (finalization.current) return finalization.current
    finalization.current = new Promise((resolve) => {
      const mr = recorder.current
      teardownAudioGraph()
      if (!mr || mr.state === 'inactive') {
        resolve(new Blob(chunks.current))
        return
      }
      mr.onstop = () => {
        const blob = new Blob(chunks.current, { type: mr.mimeType })
        stopTracks()
        recorder.current = null
        setState('idle')
        setElapsedSeconds(0)
        resolve(blob)
      }
      stopTimer()
      mr.stop()
    })
    return finalization.current
  }

  function discard() {
    const mr = recorder.current
    teardownAudioGraph()
    if (mr && mr.state !== 'inactive') {
      mr.onstop = null
      mr.stop()
    }
    stopTimer()
    stopTracks()
    recorder.current = null
    chunks.current = []
    finalization.current = null
    setState('idle')
    setElapsedSeconds(0)
  }

  return { state, elapsedSeconds, levels, start, pause, resume, stop, discard }
}
