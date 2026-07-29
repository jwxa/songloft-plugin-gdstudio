import { describe, expect, it } from 'vitest'
import { GDSTUDIO_API_URL, GDStudioSearchClient } from '../src/gdstudio-client'
import type { HTTPRequestOptions, HTTPResponseData, HTTPTransport } from '../src/gdstudio-client'
import type { SearchTrack } from '../src/types'

const track: SearchTrack = {
  id: 'track-1',
  source: 'netease',
  dedupe_key: 'gdstudio:netease:track-1',
  title: '旧标题',
  artist: '旧歌手',
  album: '',
  duration: 200,
  cover_id: 'cover-1',
  source_data: { root_source: 'netease', identifier: 'track-1', url_id: 'url-1' },
}

class MetadataService implements HTTPTransport {
  readonly sources: string[] = []

  constructor(private readonly missing: 'none' | 'cover' | 'lyric' = 'none') {}

  async request(url: string, _options: HTTPRequestOptions = {}): Promise<HTTPResponseData> {
    if (!url.startsWith(`${GDSTUDIO_API_URL}?`)) throw new Error(`unexpected URL ${url}`)
    const form = new URL(url).searchParams
    this.sources.push(form.get('source') || '')
    if (form.get('types') === 'search') {
      return { status: 200, body: JSON.stringify([{
        id: 'track-1', source: 'netease', name: '新标题', artist: ['新歌手'], album: '新专辑',
        pic_id: this.missing === 'cover' ? '' : 'cover-2', lyric_id: this.missing === 'lyric' ? '' : 'lyric-2',
        url_id: 'url-2', extra_data: { duration: 200 },
      }]) }
    }
    if (form.get('types') === 'pic') return { status: 200, body: JSON.stringify({ url: '/covers/cover-2.jpg' }) }
    if (form.get('types') === 'lyric') return { status: 200, body: JSON.stringify({ lyric: '[00:00.00]歌词' }) }
    throw new Error('unexpected request')
  }
}

describe('GDStudio metadata enrichment', () => {
  it('loads canonical metadata, cover and lyric only from the original source', async () => {
    const service = new MetadataService()
    const client = new GDStudioSearchClient(service)

    const result = await client.enrichMetadata(track)

    expect(result).toEqual({
      title: '新标题', artist: '新歌手', album: '新专辑',
      cover_url: 'https://music-api.gdstudio.xyz/covers/cover-2.jpg',
      lyric: '[00:00.00]歌词', status: 'complete', missing: [], errors: [],
    })
    expect(new Set(service.sources)).toEqual(new Set(['netease']))
  })

  it.each([
    ['cover', 'cover'],
    ['lyric', 'lyric'],
  ] as const)('reports a missing %s as partial without discarding other metadata', async (missingMode, missingField) => {
    const client = new GDStudioSearchClient(new MetadataService(missingMode))

    const result = await client.enrichMetadata({ ...track, cover_id: missingMode === 'cover' ? '' : track.cover_id })

    expect(result.status).toBe('partial')
    expect(result.missing).toContain(missingField)
    expect(result.title).toBe('新标题')
  })
})
