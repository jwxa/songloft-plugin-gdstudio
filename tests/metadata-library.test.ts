import { describe, expect, it } from 'vitest'
import { LibraryService } from '../src/library-service'
import type { GDStudioMetadataEnricher, LibrarySong, SearchTrack, SongLibrary } from '../src/types'

const track: SearchTrack = {
  id: 'track-1', source: 'netease', dedupe_key: 'gdstudio:netease:track-1',
  title: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269, cover_id: 'cover-1',
  source_data: { root_source: 'netease', identifier: 'track-1', url_id: 'url-1' },
}

class RecordingSongs implements SongLibrary {
  inputs: Parameters<SongLibrary['create']>[0] = []

  async create(inputs: Parameters<SongLibrary['create']>[0]): Promise<LibrarySong[]> {
    this.inputs = inputs
    return [{ id: 9, type: 'remote', title: inputs[0].title, artist: inputs[0].artist || '', album: inputs[0].album || '' }]
  }

  async download(): Promise<{ path: string; status: string }> {
    return { path: '', status: 'ok' }
  }
}

describe('metadata-aware library writes', () => {
  it('writes enriched values through existing Songloft fields', async () => {
    const songs = new RecordingSongs()
    const enricher: GDStudioMetadataEnricher = {
      enrichMetadata: async () => ({
        title: '晴天', artist: '周杰伦', album: '叶惠美',
        cover_url: 'https://example.test/cover.jpg', lyric: '[00:00.00]故事的小黄花',
        status: 'complete', missing: [], errors: [],
      }),
    }

    const result = await new LibraryService(songs, enricher).addOrReuse(track)

    expect(result.metadata.status).toBe('complete')
    expect(songs.inputs[0]).toMatchObject({
      coverUrl: 'https://example.test/cover.jpg',
      lyric: '[00:00.00]故事的小黄花',
      lyricSource: 'scraped',
    })
  })

  it.each(['upstream error', 'timeout'])('still creates the core song after %s', async message => {
    const songs = new RecordingSongs()
    const enricher: GDStudioMetadataEnricher = {
      enrichMetadata: async () => { throw new Error(message) },
    }

    const result = await new LibraryService(songs, enricher).addOrReuse(track)

    expect(result.song.id).toBe(9)
    expect(result.metadata.status).toBe('failed')
    expect(songs.inputs).toHaveLength(1)
    expect(songs.inputs[0]).not.toHaveProperty('coverUrl')
    expect(songs.inputs[0]).not.toHaveProperty('lyric')
    expect(JSON.parse(songs.inputs[0].sourceData || '{}').metadata_errors[0]).toContain(message)
  })
})
