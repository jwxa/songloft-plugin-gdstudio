import { describe, expect, it } from 'vitest'
import {
  GDSTUDIO_API_URL,
  GDStudioSearchClient,
} from '../src/gdstudio-client'
import type { HTTPRequestOptions, HTTPResponseData, HTTPTransport } from '../src/gdstudio-client'

class MockTransport implements HTTPTransport {
  readonly requests: Array<{ url: string; options: HTTPRequestOptions }> = []

  constructor(private readonly handler: (url: string, options: HTTPRequestOptions) => HTTPResponseData | Promise<HTTPResponseData>) {}

  async request(url: string, options: HTTPRequestOptions = {}): Promise<HTTPResponseData> {
    this.requests.push({ url, options })
    return await this.handler(url, options)
  }
}

describe('GDStudio lightweight HTTP client', () => {
  it('retries a failed search request exactly once', async () => {
    let attempts = 0
    const transport = new MockTransport(() => {
      attempts++
      if (attempts === 1) throw new Error('context deadline exceeded')
      return { status: 200, body: JSON.stringify([{ id: 'retry-track', url_id: 'retry-url', name: '重试成功', artist: ['歌手'] }]) }
    })
    const client = new GDStudioSearchClient(transport)

    const result = await client.search('netease', '重试', 1, 10)

    expect(attempts).toBe(2)
    expect(result.items[0].title).toBe('重试成功')
  })

  it('calls the public search API and maps only lightweight fields', async () => {
    const transport = new MockTransport(() => {
      return {
        status: 200,
        body: JSON.stringify([{
          id: 'track-1',
          url_id: 'url-1',
          lyric_id: 'lyric-1',
          pic_id: 'cover-1',
          source: 'netease',
          name: '夜曲',
          artist: ['周杰伦'],
          album: '十一月的萧邦',
          extra_data: { duration: 226 },
        }]),
      }
    })
    const client = new GDStudioSearchClient(transport)

    const result = await client.search('netease', '周杰伦 晴天', 2, 10)

    expect(transport.requests).toHaveLength(1)
    const requestURL = new URL(transport.requests[0].url)
    expect(`${requestURL.origin}${requestURL.pathname}`).toBe(GDSTUDIO_API_URL)
    expect(Object.fromEntries(requestURL.searchParams.entries())).toEqual({
      types: 'search',
      count: '10',
      pages: '2',
      name: '周杰伦 晴天',
      source: 'netease',
    })
    expect(transport.requests[0].options.method).toBe('GET')
    expect(transport.requests[0].options.headers?.['X-Fetch-Timeout-Ms']).toBe('10000')
    expect(result.items).toEqual([{
      id: 'track-1',
      source: 'netease',
      dedupe_key: 'gdstudio:netease:track-1',
      title: '夜曲',
      artist: '周杰伦',
      album: '十一月的萧邦',
      duration: 226,
      cover_id: 'cover-1',
      source_data: { root_source: 'netease', identifier: 'track-1', url_id: 'url-1' },
    }])
    expect(JSON.stringify(result)).not.toContain('lyric-1')
  })

  it('keeps identical identifiers separate across root sources', async () => {
    const transport = new MockTransport((url) => {
      const source = new URL(url).searchParams.get('source')
      return {
        status: 200,
        body: JSON.stringify([{ id: 'same-id', source, name: '同名歌曲', artist: ['歌手'] }]),
      }
    })
    const client = new GDStudioSearchClient(transport)

    const [netease, kuwo] = await Promise.all([
      client.search('netease', '同名歌曲', 1, 10),
      client.search('kuwo', '同名歌曲', 1, 10),
    ])

    expect(netease.items[0].dedupe_key).toBe('gdstudio:netease:same-id')
    expect(kuwo.items[0].dedupe_key).toBe('gdstudio:kuwo:same-id')
    expect(netease.items[0].dedupe_key).not.toBe(kuwo.items[0].dedupe_key)
  })
})
