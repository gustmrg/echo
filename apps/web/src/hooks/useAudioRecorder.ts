import { useState, useRef, useEffect } from 'react'

type RecorderState = 'idle' | 'recording' | 'paused'

export interface UseAudioRecorderReturn {
  state: RecorderState
  elapsedSeconds: number
  start: () => Promise<void>
  pause: () => void
  resume: () => void
  stop: () => Promise<Blob>
  discard: () => void
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const chunks = useRef<Blob[]>([])
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Release mic and timer on unmount regardless of state
  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current)
      stream.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

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

  async function start() {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.current = s

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
  }

  function pause() {
    recorder.current?.pause()
    stopTimer()
    setState('paused')
  }

  function resume() {
    recorder.current?.resume()
    startTimer()
    setState('recording')
  }

  function stop(): Promise<Blob> {
    return new Promise((resolve) => {
      const mr = recorder.current
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
  }

  function discard() {
    const mr = recorder.current
    if (mr && mr.state !== 'inactive') {
      mr.onstop = null
      mr.stop()
    }
    stopTimer()
    stopTracks()
    recorder.current = null
    chunks.current = []
    setState('idle')
    setElapsedSeconds(0)
  }

  return { state, elapsedSeconds, start, pause, resume, stop, discard }
}
