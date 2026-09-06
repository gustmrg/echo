import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { it } from 'node:test'
import { WhisperCppEngine, type WhisperCppOptions } from '../src/transcription/whisper-cpp/engine.js'
import { runProcess } from '../src/transcription/whisper-cpp/process.js'
import { createTranscriber } from '../src/transcription/index.js'
import { WhisperCppTranscriber } from '../src/transcription/whisper-cpp-transcriber.js'

const signal = new AbortController().signal
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'echo-test-whisper-'))
  const modelPath = join(directory, 'model with spaces.bin')
  await writeFile(modelPath, 'model')
  const options: WhisperCppOptions = { modelPath, binaryPath: 'whisper-cli', ffmpegPath: 'ffmpeg',
    language: 'pt', threads: 2, useGpu: false }
  return { directory, options }
}

for (const failure of [false, true]) {
  it(`normalizes audio, uses explicit output, and cleans files after ${failure ? 'failure' : 'success'}`, async (t) => {
    const { directory, options } = await fixture()
    t.after(() => rm(directory, { recursive: true, force: true }))
    const input = join(directory, 'input $(not-a-command).webm')
    let workDirectory = ''
    let calls = 0
    const engine = new WhisperCppEngine(options, async (executable, args, receivedSignal) => {
      assert.equal(receivedSignal, signal)
      calls++
      if (executable === 'ffmpeg') {
        assert.equal(args[args.indexOf('-i') + 1], input)
        assert.equal(args[args.indexOf('-ar') + 1], '16000')
        assert.equal(args[args.indexOf('-ac') + 1], '1')
        workDirectory = dirname(args.at(-1)!)
        await writeFile(args.at(-1)!, 'wav')
      } else {
        assert.equal(executable, 'whisper-cli')
        assert.equal(args[args.indexOf('--model') + 1], options.modelPath)
        assert.equal(args[args.indexOf('--language') + 1], 'pt')
        assert.ok(args.includes('--no-gpu'))
        assert.ok(!args.includes('--translate'))
        if (failure) throw new Error('inference failed')
        await writeFile(`${args[args.indexOf('--output-file') + 1]}.txt`, ' Olá mundo.\n')
      }
    })
    if (failure) await assert.rejects(engine.transcribeFile(input, signal), /inference failed/)
    else assert.equal(await engine.transcribeFile(input, signal), 'Olá mundo.')
    assert.equal(calls, 2)
    await assert.rejects(access(workDirectory))
  })
}

it('rejects missing models before launching any process', async () => {
  const engine = new WhisperCppEngine({ modelPath: '/missing/echo-model', binaryPath: 'x', ffmpegPath: 'x',
    language: 'auto', threads: 1, useGpu: false }, async () => assert.fail('must not launch'))
  await assert.rejects(engine.transcribeFile('/input', signal), /ENOENT/)
})

it('rejects empty output and cleans the conversion directory', async (t) => {
  const { directory, options } = await fixture()
  t.after(() => rm(directory, { recursive: true, force: true }))
  let workDirectory = ''
  const engine = new WhisperCppEngine(options, async (_executable, args) => {
    if (args.includes('--output-file')) {
      const output = args[args.indexOf('--output-file') + 1]!
      workDirectory = dirname(output)
      await writeFile(`${output}.txt`, ' \n')
    }
  })
  await assert.rejects(engine.transcribeFile('/input', signal), /did not include text/)
  await assert.rejects(access(workDirectory))
})

it('runs processes without shell expansion and reports startup/nonzero failures', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'echo-process-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const output = join(directory, 'literal.txt')
  await runProcess(process.execPath, ['-e', 'require("fs").writeFileSync(process.argv[1], process.argv[2])',
    output, '$(echo injected); spaces'], signal)
  assert.equal(await readFile(output, 'utf8'), '$(echo injected); spaces')
  await assert.rejects(runProcess('/missing/echo-executable', [], signal), /ENOENT/)
  await assert.rejects(runProcess(process.execPath, ['-e', 'process.stderr.write("failure");process.exit(2)'], signal), /Process failed \(2\): failure/)
})

it('waits for a child that ignores SIGTERM to exit before cancellation resolves', { timeout: 10000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'echo-cancel-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const ready = join(directory, 'ready')
  const controller = new AbortController()
  const pending = runProcess(process.execPath, ['-e',
    'process.on("SIGTERM",()=>{});require("fs").writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},100)', ready], controller.signal)
  const rejected = assert.rejects(pending, (error: unknown) => error === controller.signal.reason)
  t.after(() => controller.abort())
  for (let i = 0; ; i++) {
    try { await access(ready); break } catch {
      if (i > 200) throw new Error('child did not start')
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  const pid = Number(await readFile(ready, 'utf8'))
  controller.abort()
  await rejected
  assert.throws(() => process.kill(pid, 0), /ESRCH/)
})

it('selects the whisper.cpp adapter', () => {
  assert.ok(createTranscriber({ provider: 'whisper-cpp', modelPath: '/m', binaryPath: 'whisper-cli',
    ffmpegPath: 'ffmpeg', language: 'auto', threads: 4, useGpu: false }) instanceof WhisperCppTranscriber)
})
