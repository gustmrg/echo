import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const root = await mkdtemp(join(tmpdir(), 'echo-e2e-'))
const children = []
let stopping = false
let failedCalls = 0
const provider = createServer(async (req, res) => {
  let body = ''
  for await (const chunk of req) body += chunk
  res.setHeader('Content-Type', 'application/json')
  if (req.url === '/audio/transcriptions') {
    await delay(200)
    const input = JSON.parse(body)
    if (Buffer.from(input.input_audio.data, 'base64').at(-1) === 2 && failedCalls++ < 3) {
      res.statusCode = 503
      res.end(JSON.stringify({ error: 'temporary test outage' }))
      return
    }
    res.end(JSON.stringify({ text: 'A useful original transcript.' }))
  } else if (req.url === '/chat/completions') {
    const request = JSON.parse(body)
    res.end(JSON.stringify({ model: 'test-model', choices: [{ finish_reason: 'stop', message: { content: `# Saved output\n\n${request.messages[1].content}` } }] }))
  } else { res.statusCode = 404; res.end('{}') }
})
await new Promise(resolve => provider.listen(5192, '127.0.0.1', resolve))
async function stop(code = 0) {
  if (stopping) return
  stopping = true
  await Promise.all(children.map(child => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve()
    child.once('exit', resolve)
    child.kill('SIGTERM')
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
    timer.unref()
  })))
  provider.close()
  await rm(root, { recursive: true, force: true })
  process.exit(code)
}
function run(command, args, cwd, env) {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' })
  children.push(child)
  child.on('error', error => { console.error(error); void stop(1) })
  child.on('exit', () => { if (!stopping) void stop(1) })
}
process.on('SIGTERM', () => void stop())
process.on('SIGINT', () => void stop())
run('dotnet', ['Echo.API/bin/Debug/net10.0/Echo.API.dll'], resolve('../api'), {
  ASPNETCORE_ENVIRONMENT: 'Testing', ASPNETCORE_URLS: 'http://127.0.0.1:5191',
  ConnectionStrings__DefaultConnection: `Data Source=${join(root, 'echo.db')}`,
  Storage__Provider: 'Local', Storage__Local__RootPath: join(root, 'files'),
})
let ready = false
for (let n = 0; n < 100; n++) {
  try { if ((await fetch('http://127.0.0.1:5191/api/recordings')).ok) { ready = true; break } } catch { /* Starting. */ }
  await delay(100)
}
if (!ready) await stop(1)
run(process.execPath, ['--import', 'tsx', 'src/main.ts'], resolve('../worker-ts'), {
  NODE_ENV: 'test', DB_PATH: join(root, 'echo.db'), STORAGE_PROVIDER: 'local', STORAGE_LOCAL_ROOT: join(root, 'files'),
  TRANSCRIPTION_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'local-test-only',
  OPENROUTER_BASE_URL: 'http://127.0.0.1:5192', REFINEMENT_BASE_URL: 'http://127.0.0.1:5192',
  POLL_INTERVAL_MS: '100', JOB_TIMEOUT_MS: '10000', PROCESSING_LEASE_MS: '30000',
})
// Readiness includes the migration-complete API and started worker.
createServer((_, res) => res.end('ready')).listen(5193, '127.0.0.1')
