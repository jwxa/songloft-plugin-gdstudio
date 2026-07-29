import { describe, expect, it } from 'vitest'
import { createPluginRouter } from '../src/router'
import type { GDStudioSourceData, SearchTrack, SongLibrary } from '../src/types'
import { MemoryStorage, requestJSON } from './test-helpers'

const track: SearchTrack = {
  id: '462034691',
  source: 'kuwo',
  dedupe_key: 'gdstudio:kuwo:462034691',
  title: 'So Cynical (Badum)',
  artist: 'LE SSERAFIM',
  album: 'HOT',
  duration: 0,
  cover_id: '',
  source_data: { root_source: 'kuwo', identifier: '462034691', url_id: '462034691' },
}

class RecordingSongs implements SongLibrary {
  createCalls = 0
  downloadCalls = 0

  async create(): Promise<any[]> {
    this.createCalls += 1
    return [{ id: 1, type: 'remote', title: track.title, artist: track.artist, album: track.album }]
  }

  async download(): Promise<{ path: string; status: string }> {
    this.downloadCalls += 1
    return { path: '', status: 'ok' }
  }
}

class UnavailableClient {
  async search(): Promise<{ items: SearchTrack[]; hasMore: boolean }> {
    return { items: [], hasMore: false }
  }

  async resolveAudio(_sourceData: GDStudioSourceData): Promise<never> {
    throw new Error('没有可用的试听音质')
  }
}

describe('single-track playability validation', () => {
  it.each(['/api/library', '/api/download'])('rejects %s before writing an unavailable song', async path => {
    const songs = new RecordingSongs()
    const router = createPluginRouter({ storage: new MemoryStorage(), client: new UnavailableClient(), songs })

    const response = await requestJSON(router, 'POST', path, { track })

    expect(response.status).toBe(422)
    expect(response.body).toEqual({
      error: 'source unavailable',
      detail: '当前来源没有可播放链接，请尝试其他歌曲或手动选择其他来源',
    })
    expect(songs.createCalls).toBe(0)
    expect(songs.downloadCalls).toBe(0)
  })
})
