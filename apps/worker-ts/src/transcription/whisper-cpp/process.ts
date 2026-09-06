import { spawn } from 'node:child_process'

/** Waits for process exit, including after cancellation, before callers remove files. */
export async function runProcess(executable: string, args: readonly string[], signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [...args], { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let failure: Error | undefined
    let killTimer: ReturnType<typeof setTimeout> | undefined
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4096) })
    child.on('error', (error) => { failure = error })
    const abort = () => {
      child.kill('SIGTERM')
      killTimer = setTimeout(() => { child.kill('SIGKILL') }, 2000)
      killTimer.unref()
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    child.once('close', (code, exitSignal) => {
      signal.removeEventListener('abort', abort)
      if (killTimer) clearTimeout(killTimer)
      if (signal.aborted) reject(signal.reason)
      else if (failure) reject(failure)
      else if (code !== 0) reject(new Error(`Process failed (${code ?? exitSignal}): ${stderr.trim()}`))
      else resolve()
    })
  })
}
