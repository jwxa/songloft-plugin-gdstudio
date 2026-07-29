import { describe, expect, it } from 'vitest'
import { GDSTUDIO_API_URL, GDSTUDIO_QUALITY_ORDER, GDStudioSearchClient, KUWO_FALLBACK_API_URL } from '../src/gdstudio-client'
import type { HTTPRequestOptions, HTTPResponseData, HTTPTransport } from '../src/gdstudio-client'
import { createPluginRouter } from '../src/router'
import { MemoryStorage, requestJSON } from './test-helpers'

class QualityService implements HTTPTransport {
  readonly qualities: number[] = []

  async request(url: string, _options: HTTPRequestOptions = {}): Promise<HTTPResponseData> {
    if (!url.startsWith(`${GDSTUDIO_API_URL}?`)) throw new Error(`unexpected URL ${url}`)
    const quality = Number(new URL(url).searchParams.get('br'))
    this.qualities.push(quality)
    if (quality > 320) return { status: 200, body: JSON.stringify({ url: '', size: 0, br: -1 }) }
    return { status: 200, body: JSON.stringify({ url: '/audio/track.mp3', size: 12345, br: 320 }) }
  }
}

class KuwoFallbackService implements HTTPTransport {
  readonly requests: string[] = []

  async request(url: string, _options: HTTPRequestOptions = {}): Promise<HTTPResponseData> {
    this.requests.push(url)
    if (url.startsWith(`${GDSTUDIO_API_URL}?`)) {
      const type = new URL(url).searchParams.get('types')
      if (type === 'url') return { status: 200, body: JSON.stringify({ url: '', size: 0, br: -1 }) }
      return { status: 200, body: '[]' }
    }
    if (url.startsWith(`${KUWO_FALLBACK_API_URL}?`)) {
      return {
        status: 200,
        body: JSON.stringify({
          code: 200,
          data: {
            rid: '462034691',
            url: 'https://kw-er.kuwo.cn/audio/track.flac',
            bitrate: 2000,
            size: '32.68 MB',
            level: { requested: 'zp', actual: 'zp' },
          },
        }),
      }
    }
    throw new Error(`unexpected URL ${url}`)
  }
}

describe('GDStudio /api/music/url', () => {
  it('falls back in quality order and returns safe playback metadata', async () => {
    const service = new QualityService()
    const client = new GDStudioSearchClient(service)
    const router = createPluginRouter({ storage: new MemoryStorage(), client })
    const response = await requestJSON(router, 'POST', '/api/music/url', {
      source_data: { root_source: 'netease', identifier: 'track-1', url_id: 'url-1' },
    })

    expect(response.status).toBe(200)
    expect(service.qualities).toEqual(GDSTUDIO_QUALITY_ORDER.slice(0, 3))
    expect(response.body).toEqual({
      url: 'https://music-api.gdstudio.xyz/audio/track.mp3',
      headers: expect.objectContaining({ 'User-Agent': expect.any(String) }),
      format: 'mp3',
      bitrate: 320,
      quality: 320,
    })
  })

  it('uses the musicsquare Kuwo resolver only after GDStudio has no URL', async () => {
    const service = new KuwoFallbackService()
    const client = new GDStudioSearchClient(service)
    const router = createPluginRouter({ storage: new MemoryStorage(), client })
    const response = await requestJSON(router, 'POST', '/api/music/url', {
      source_data: { root_source: 'kuwo', identifier: '462034691', url_id: '462034691' },
    })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      url: 'https://kw-er.kuwo.cn/audio/track.flac',
      headers: expect.objectContaining({ 'User-Agent': expect.any(String), Referer: 'https://kuwo.cn/' }),
      format: 'flac',
      bitrate: 2000,
      quality: 2000,
    })
    expect(service.requests.filter(url => url.startsWith(`${GDSTUDIO_API_URL}?`))).toHaveLength(GDSTUDIO_QUALITY_ORDER.length)
    expect(service.requests.some(url => url.startsWith(`${KUWO_FALLBACK_API_URL}?`) && new URL(url).searchParams.get('level') === 'zp')).toBe(true)
  })
})
