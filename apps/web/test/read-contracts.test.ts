import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRecordings } from '../src/api/recordings'
import { getOutputs } from '../src/api/refinements'
import { recordingsListQuery } from '../src/lib/recording-query'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('read contracts API client', () => {
  it('builds query parameters for paginated recordings list', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [],
        page: 2,
        pageSize: 10,
        totalCount: 0,
        hasMore: false,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await getRecordings({
      page: 2,
      pageSize: 10,
      status: 'transcribed',
      q: '  roadmap  ',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/recordings?page=2&pageSize=10&status=transcribed&q=roadmap',
      undefined,
    )
    expect(result.page).toBe(2)
    expect(result.hasMore).toBe(false)
  })

  it('builds query parameters for paginated outputs list', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [],
        page: 3,
        pageSize: 20,
        totalCount: 45,
        hasMore: false,
        hasActiveJobs: true,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await getOutputs({
      page: 3,
      pageSize: 20,
      format: 'notes',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/outputs?page=3&pageSize=20&format=notes',
      undefined,
    )
    expect(result.hasActiveJobs).toBe(true)
    expect(result.totalCount).toBe(45)
  })

  it('normalizes recordingsListQuery keys and polls only when active items exist', () => {
    const defaultOpts = recordingsListQuery()
    const explicitOpts = recordingsListQuery({ page: 1, pageSize: 20, q: '   ' })
    expect(defaultOpts.queryKey).toEqual(explicitOpts.queryKey)

    const refetchInterval = defaultOpts.refetchInterval as (query: {
      state: { data?: { items: { status: string }[] } }
    }) => number | false

    expect(
      refetchInterval({ state: { data: { items: [{ status: 'transcribed' }] } } }),
    ).toBe(false)
    expect(
      refetchInterval({ state: { data: { items: [{ status: 'pending' }] } } }),
    ).toBe(3000)
    expect(
      refetchInterval({
        state: { data: { items: [{ status: 'transcribing' }] } },
      }),
    ).toBe(3000)
  })
})
