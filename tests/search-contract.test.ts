import { describe, expect, it } from 'vitest'
import { GDStudioSearchClient } from '../src/gdstudio-client'
import type { HTTPRequestOptions, HTTPResponseData, HTTPTransport } from '../src/gdstudio-client'
import { createPluginRouter } from '../src/router'
import { MemoryStorage, requestJSON } from './test-helpers'

class SimulatedGDStudioService implements HTTPTransport {
  readonly forms: URLSearchParams[] = []

  async request(url: string, _options: HTTPRequestOptions = {}): Promise<HTTPResponseData> {
    const form = new URL(url).searchParams
    this.forms.push(form)
    if (form.get('msg')) {
      return { status: 200, body: JSON.stringify([{ song_mid: 'tencent-mid', song_title: '同名歌曲', singer_name: '同名歌手' }]) }
    }
    const source = form.get('source')
    if (source === 'kuwo') {
      return { status: 504, body: 'gateway timeout' }
    }

    return {
      status: 200,
      body: JSON.stringify([{
        id: 'same-name-id',
        source,
        name: '同名歌曲',
        artist: ['同名歌手'],
        album: '同名专辑',
        pic_id: `${source}-cover`,
        extra_data: { duration: 210 },
        url_id: `${source}-url-id`,
        lyric_id: `${source}-lyric-id`,
      }]),
    }
  }
}

describe('real client search contract with simulated GDStudio service', () => {
  it('isolates source errors and preserves source-scoped identities', async () => {
    const service = new SimulatedGDStudioService()
    const client = new GDStudioSearchClient(service)
    const router = createPluginRouter({ storage: new MemoryStorage(), client })

    const response = await requestJSON(router, 'POST', '/api/search', {
      keyword: '同名歌曲',
      source: 'all',
      page_size: 10,
    })

    expect(response.status).toBe(200)
    expect(response.body.groups).toHaveLength(3)
    expect(response.body.groups.find((group: any) => group.source === 'kuwo')).toMatchObject({
      items: [],
      has_more: false,
      error: 'GDStudio search HTTP 504',
    })

    const netease = response.body.groups.find((group: any) => group.source === 'netease').items[0]
    expect(netease.dedupe_key).toBe('gdstudio:netease:same-name-id')
    expect(Object.keys(netease).sort()).toEqual([
      'album', 'artist', 'cover_id', 'dedupe_key', 'duration', 'id', 'source', 'source_data', 'title',
    ])
    expect(JSON.stringify(response.body)).not.toContain('https://')
    expect(JSON.stringify(response.body)).not.toContain('lyric-id')

    expect(service.forms).toHaveLength(4)
    expect(service.forms.filter(form => form.get('source') === 'kuwo')).toHaveLength(2)
    for (const form of service.forms.filter(form => !form.get('msg'))) {
      expect(form.get('types')).toBe('search')
      expect(form.get('count')).toBe('10')
      expect(form.has('br')).toBe(false)
    }
  })
})
