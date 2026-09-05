import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const root = await mkdtemp(join(tmpdir(), 'echo-e2e-'))
const workerRequire = createRequire(resolve('../worker-ts/package.json'))
const { connect } = workerRequire('amqplib')
const { S3Client, CreateBucketCommand, ListObjectsV2Command, DeleteObjectsCommand, DeleteBucketCommand } = workerRequire('@aws-sdk/client-s3')
const suffix = randomUUID()
const bucket = `echo-e2e-${suffix}`
const jobQueue = `echo.e2e.${suffix}.jobs`
const resultQueue = `echo.e2e.${suffix}.results`
const rabbitUrl = process.env.ECHO_TEST_RABBITMQ_URL || 'amqp://echo:echo-dev-only@127.0.0.1:5672'
const endpoint = process.env.ECHO_TEST_S3_ENDPOINT || 'http://127.0.0.1:8333'
const storageEnv = { AWS_ACCESS_KEY_ID: 'echo-dev', AWS_SECRET_ACCESS_KEY: 'echo-dev-secret', AWS_REGION: 'us-east-1' }
const s3 = new S3Client({ endpoint, region: 'us-east-1', forcePathStyle: true,
  credentials: { accessKeyId: storageEnv.AWS_ACCESS_KEY_ID, secretAccessKey: storageEnv.AWS_SECRET_ACCESS_KEY } })
await s3.send(new CreateBucketCommand({ Bucket: bucket }))
const broker = await connect(rabbitUrl)
broker.on('error', () => {})
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
    if (Buffer.from(input.input_audio.data, 'base64').at(-1) === 2 && failedCalls++ < 6) {
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
  try {
    const channel = await broker.createChannel()
    for (const queue of [jobQueue, resultQueue, `${jobQueue}.invalid`, `${resultQueue}.invalid`]) await channel.deleteQueue(queue)
    await broker.close()
    const objects = await s3.send(new ListObjectsV2Command({ Bucket: bucket }))
    if (objects.Contents?.length) await s3.send(new DeleteObjectsCommand({ Bucket: bucket,
      Delete: { Objects: objects.Contents.map(({ Key }) => ({ Key })) } }))
    await s3.send(new DeleteBucketCommand({ Bucket: bucket }))
  } catch (error) { console.error('Test resource cleanup failed', error) }
  s3.destroy()
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
  ...storageEnv, Storage__Provider: 'S3', Storage__S3__BucketName: bucket,
  Storage__S3__Endpoint: endpoint, Storage__S3__ForcePathStyle: 'true',
  RabbitMQ__Url: rabbitUrl, RabbitMQ__JobQueue: jobQueue, RabbitMQ__ResultQueue: resultQueue,
  RabbitMQ__PollIntervalMs: '100',
})
let ready = false
for (let n = 0; n < 100; n++) {
  try { if ((await fetch('http://127.0.0.1:5191/api/recordings')).ok) { ready = true; break } } catch { /* Starting. */ }
  await delay(100)
}
if (!ready) await stop(1)
run(process.execPath, ['--import', 'tsx', 'src/main.ts'], resolve('../worker-ts'), {
  ...storageEnv, NODE_ENV: 'test', STORAGE_PROVIDER: 's3', S3_BUCKET: bucket,
  S3_ENDPOINT: endpoint, S3_FORCE_PATH_STYLE: 'true',
  RABBITMQ_URL: rabbitUrl, RABBITMQ_JOB_QUEUE: jobQueue, RABBITMQ_RESULT_QUEUE: resultQueue,
  TRANSCRIPTION_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'local-test-only',
  OPENROUTER_BASE_URL: 'http://127.0.0.1:5192', REFINEMENT_BASE_URL: 'http://127.0.0.1:5192',
  RABBITMQ_RETRY_MS: '100', JOB_TIMEOUT_MS: '10000',
})
// Readiness includes the migration-complete API and started worker.
createServer((_, res) => res.end('ready')).listen(5193, '127.0.0.1')
