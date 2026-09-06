import assert from 'node:assert/strict'
import { it } from 'node:test'
import { ChatRefiner, type OutputFormat } from '../src/refinement/refiner.js'

const config = { apiKey: 'test', baseUrl: 'http://provider.test/v1', model: 'configured-model', provider: 'openrouter' }
for (const format of ['notes', 'blog', 'interview', 'news'] satisfies OutputFormat[]) {
  it(`refines ${format} with source text, grounding instructions, and generation metadata`, async () => {
    const refiner = new ChatRefiner(config, async (url, init) => {
      assert.equal(url, 'http://provider.test/v1/chat/completions')
      const body = JSON.parse(String(init?.body))
      assert.equal(body.messages[1].content, 'Reviewed text')
      assert.match(body.messages[0].content, /Do not invent/)
      assert.equal(body.model, config.model)
      return Response.json({ model: 'actual-model', choices: [{ finish_reason: 'stop', message: { content: '# Output' } }] })
    })
    assert.deepEqual(await refiner.refine('Reviewed text', format, new AbortController().signal), {
      content: '# Output', model: 'actual-model', provider: 'openrouter', promptVersion: '1',
    })
  })
}
it('rejects truncated outputs and provider errors', async () => {
  for (const response of [
    Response.json({ choices: [{ finish_reason: 'length', message: { content: 'partial' } }] }),
    new Response('private provider error', { status: 429 }),
    Response.json({ choices: [] }),
  ]) {
    const refiner = new ChatRefiner(config, async () => response)
    await assert.rejects(refiner.refine('text', 'notes', new AbortController().signal))
  }
})

it('uses local chat without an authorization header and preserves provider metadata', async () => {
  const refiner = new ChatRefiner({ ...config, provider: 'local', apiKey: '' }, async (_url, init) => {
    assert.equal(new Headers(init?.headers).has('authorization'), false)
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'Local notes' } }] })
  })
  const result = await refiner.refine('source', 'notes', new AbortController().signal)
  assert.equal(result.provider, 'local')
  assert.equal(result.content, 'Local notes')
})
