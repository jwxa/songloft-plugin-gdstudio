import { describe, expect, it } from 'vitest'
import { GDStudioSearchClient, TENCENT_API_URL } from '../src/gdstudio-client'
import type { HTTPRequestOptions, HTTPResponseData, HTTPTransport } from '../src/gdstudio-client'

class TencentTransport implements HTTPTransport {
  readonly requests: string[] = []

  async request(url: string, _options: HTTPRequestOptions = {}): Promise<HTTPResponseData> {
    this.requests.push(url)
    const params = new URL(url).searchParams
    if (params.get('msg')) {
      return { status: 200, body: JSON.stringify([
        { song_title: '晴天', singer_name: '周杰伦', song_mid: '0039MnYb0qxYhV' },
      ]) }
    }
    return { status: 200, body: JSON.stringify({
      song_name: '晴天', singer_name: '周杰伦', album_name: '叶惠美', duration: '00:04:29',
      album_pic: 'https://img.example/cover.jpg', song_play_url_sq: 'http://stream.qqmusic.qq.com/song.flac',
      kbps_sq: 872, song_play_url: 'http://stream.qqmusic.qq.com/song.m4a', kbps: 192,
    }) }
  }
}

describe('Tencent QQ source', () => {
  it('searches by keyword and resolves the highest available quality by song_mid', async () => {
    const transport = new TencentTransport()
    const client = new GDStudioSearchClient(transport)

    const page = await client.search('tencent', '周杰伦 晴天', 1, 10)
    expect(page.items[0]).toMatchObject({
      id: '0039MnYb0qxYhV', source: 'tencent', title: '晴天', artist: '周杰伦',
      source_data: { root_source: 'tencent', identifier: '0039MnYb0qxYhV', url_id: '0039MnYb0qxYhV' },
    })

    const audio = await client.resolveAudio(page.items[0].source_data)
    expect(audio).toMatchObject({ url: 'http://stream.qqmusic.qq.com/song.flac', format: 'flac', bitrate: 872 })
    expect(transport.requests.every(url => url.startsWith(TENCENT_API_URL))).toBe(true)
  })
})
