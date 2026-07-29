import { describe, expect, it } from 'vitest'
import { MockGDStudioClient } from '../src/mock-client'
import { createPluginRouter } from '../src/router'
import { MemoryStorage, requestJSON } from './test-helpers'

describe('mock GDStudio search contract', () => {
  it('enables all supported sources including Tencent', async () => {
    const storage = new MemoryStorage()
    const router = createPluginRouter({ storage, client: new MockGDStudioClient() })

    const initial = await requestJSON(router, 'GET', '/api/settings')
    expect(initial).toEqual({
      status: 200,
      body: { sources: { netease: true, kuwo: true, tencent: true } },
    })

    const updated = await requestJSON(router, 'PUT', '/api/settings', {
      sources: { netease: true, kuwo: false, tencent: true },
    })
    expect(updated.body.sources.kuwo).toBe(false)
    expect(updated.body.sources.tencent).toBe(true)

    const restoredRouter = createPluginRouter({ storage, client: new MockGDStudioClient() })
    const restored = await requestJSON(restoredRouter, 'GET', '/api/settings')
    expect(restored.body.sources.kuwo).toBe(false)
  })

  it('stores and validates a relative download template', async () => {
    const router = createPluginRouter({ storage: new MemoryStorage(), client: new MockGDStudioClient() })
    const initial = await requestJSON(router, 'GET', '/api/download-settings')
    expect(initial.body.path_template).toBe('downloads/{artist}-{album}/{title}')
    expect(initial.body.max_concurrency).toBe(2)
    const invalid = await requestJSON(router, 'PUT', '/api/download-settings', { path_template: '../outside/{title}' })
    expect(invalid.status).toBe(400)
    const invalidConcurrency = await requestJSON(router, 'PUT', '/api/download-settings', { path_template: 'music/{artist}/{title}', max_concurrency: 4 })
    expect(invalidConcurrency.status).toBe(400)
    const saved = await requestJSON(router, 'PUT', '/api/download-settings', { path_template: 'music/{artist}/{title}', max_concurrency: 3 })
    expect(saved.body.path_template).toBe('music/{artist}/{title}')
    expect(saved.body.max_concurrency).toBe(3)
  })

  it('returns grouped first pages with ten lightweight items per source', async () => {
    const router = createPluginRouter({ storage: new MemoryStorage(), client: new MockGDStudioClient() })
    const response = await requestJSON(router, 'POST', '/api/search', {
      keyword: '夜曲',
      source: 'all',
      page_size: 10,
    })

    expect(response.status).toBe(200)
    expect(response.body.groups.map((group: any) => group.source)).toEqual(['netease', 'kuwo', 'tencent'])
    for (const group of response.body.groups) {
      expect(group.page).toBe(1)
      expect(group.items).toHaveLength(10)
      expect(group.has_more).toBe(true)
      expect(Object.keys(group.items[0]).sort()).toEqual([
        'album', 'artist', 'cover_id', 'dedupe_key', 'duration', 'id', 'source', 'source_data', 'title',
      ])
    }
  })

  it('keeps independent source pages', async () => {
    const router = createPluginRouter({ storage: new MemoryStorage(), client: new MockGDStudioClient() })
    const response = await requestJSON(router, 'POST', '/api/search', {
      keyword: '晴天',
      source: 'all',
      pages: { netease: 2, kuwo: 1 },
      page_size: 10,
    })

    expect(response.body.groups.map((group: any) => [group.source, group.page, group.items[0].id])).toEqual([
      ['netease', 2, 'netease-11'],
      ['kuwo', 1, 'kuwo-1'],
      ['tencent', 1, 'tencent-1'],
    ])
  })

  it('isolates one source failure from other groups', async () => {
    const router = createPluginRouter({
      storage: new MemoryStorage(),
      client: new MockGDStudioClient(['kuwo']),
    })
    const response = await requestJSON(router, 'POST', '/api/search', {
      keyword: '稻香',
      source: 'all',
    })

    expect(response.status).toBe(200)
    expect(response.body.groups.find((group: any) => group.source === 'kuwo')).toMatchObject({
      items: [],
      has_more: false,
      error: '酷我模拟服务暂不可用',
    })
    expect(response.body.groups.find((group: any) => group.source === 'netease').items).toHaveLength(10)
    expect(response.body.groups.find((group: any) => group.source === 'tencent').items).toHaveLength(10)
  })
})
