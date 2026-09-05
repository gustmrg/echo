import { describe, expect, it } from 'vitest'
import { TranscriptSession } from '../src/lib/transcript-session'

describe('TranscriptSession', () => {
  it('joins in-flight saves and flushes newer edits before navigation finishes', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const calls: [string, number][] = []
    const session = new TranscriptSession('original', 1, async (text, revision) => {
      calls.push([text, revision])
      if (calls.length === 1) await gate
      return revision + 1
    })
    session.text = 'first edit'
    const save = session.flush()
    session.text = 'last edit'
    expect(session.flush()).toBe(save)
    release()
    await save
    expect(calls).toEqual([['first edit', 1], ['last edit', 2]])
    expect(session.dirty).toBe(false)
    expect(session.revision).toBe(3)
  })
  it('retains text and revision after failure and retries the same save', async () => {
    let fail = true
    const session = new TranscriptSession('original', 4, async (_, revision) => {
      if (fail) throw new Error('offline')
      return revision + 1
    })
    session.text = 'unsaved'
    await expect(session.flush()).rejects.toThrow('offline')
    expect(session.text).toBe('unsaved')
    expect(session.revision).toBe(4)
    fail = false
    await session.flush()
    expect(session.dirty).toBe(false)
  })
})
