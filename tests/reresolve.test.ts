import { describe, expect, it } from 'vitest'
import { GDSTUDIO_API_URL, GDStudioSearchClient, SOURCE_UNAVAILABLE_MESSAGE } from '../src/gdstudio-client'
import type { HTTPRequestOptions, HTTPResponseData, HTTPTransport } from '../src/gdstudio-client'

class ExpiredURLService implements HTTPTransport {
  readonly sources: string[] = []
  readonly urlIDs: string[] = []

  async request(url: string, _options: HTTPRequestOptions = {}): Promise<HTTPResponseData> {
    if (!url.startsWith(`${GDSTUDIO_API_URL}?`)) throw new Error(`unexpected URL ${url}`)
    const form = new URL(url).searchParams
    const source = form.get('source') || ''
    this.sources.push(source)
    if (form.get('types') === 'search') {
      return {
        status: 200,
        body: JSON.stringify([{
          id: 'replacement-identity',
          source,
          name: '晴天',
          artist: ['周杰伦'],
          album: '叶惠美',
          extra_data: { duration: 269 },
          url_id: 'fresh-url-id',
        }]),
      }
    }

    const urlID = form.get('id') || ''
    this.urlIDs.push(urlID)
    if (urlID === 'fresh-url-id') {
      return { status: 200, body: JSON.stringify({ url: '/audio/fresh.flac', size: 100, br: 999 }) }
    }
    return { status: 200, body: JSON.stringify({ url: '', size: 0, br: -1 }) }
  }
}

describe('same-source audio re-resolution', () => {
  it('searches and retries only inside the persisted root source', async () => {
    const service = new ExpiredURLService()
    const client = new GDStudioSearchClient(service)

    const audio = await client.resolveAudio({
      root_source: 'netease',
      identifier: 'stable-original-id',
      url_id: 'expired-url-id',
      title: '晴天',
      artist: '周杰伦',
      duration: 269,
    })

    expect(audio.url).toBe('https://music-api.gdstudio.xyz/audio/fresh.flac')
    expect(service.sources.length).toBeGreaterThan(0)
    expect(new Set(service.sources)).toEqual(new Set(['netease']))
    expect(service.urlIDs).toContain('expired-url-id')
    expect(service.urlIDs).toContain('fresh-url-id')
  })

  it('does not accept a mismatched same-source search result', async () => {
    const service = new ExpiredURLService()
    const client = new GDStudioSearchClient(service)

    await expect(client.resolveAudio({
      root_source: 'tencent',
      identifier: 'stable-original-id',
      url_id: 'expired-url-id',
      title: '另一首歌',
      artist: '另一位歌手',
      duration: 100,
    })).rejects.toThrow(SOURCE_UNAVAILABLE_MESSAGE)

    expect(service.sources).toHaveLength(0)
    expect(service.urlIDs).not.toContain('fresh-url-id')
  })
})
