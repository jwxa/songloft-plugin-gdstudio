import { describe, expect, it } from 'vitest'
import { LibraryService } from '../src/library-service'
import type { GDStudioMetadataEnricher, LibrarySong, SearchTrack, SongLibrary } from '../src/types'

const track: SearchTrack = {
  id: '0039MnYb0qxYhV',
  source: 'netease',
  dedupe_key: 'gdstudio:netease:0039MnYb0qxYhV',
  title: '晴天',
  artist: '周杰伦',
  album: '叶惠美',
  duration: 269,
  cover_id: 'cover-id',
  source_data: {
    root_source: 'netease',
    identifier: '0039MnYb0qxYhV',
    url_id: '0039MnYb0qxYhV',
  },
}

class DeduplicatingSongs implements SongLibrary {
  readonly inputs: Parameters<SongLibrary['create']>[0][] = []
  private readonly songs = new Map<string, LibrarySong>()

  async create(inputs: Parameters<SongLibrary['create']>[0]): Promise<LibrarySong[]> {
    this.inputs.push(inputs)
    return inputs.map(input => {
      const key = input.dedupKey || ''
      const existing = this.songs.get(key)
      if (existing) return existing
      const song: LibrarySong = {
        id: this.songs.size + 1,
        type: 'remote',
        title: input.title,
        artist: input.artist || '',
        album: input.album || '',
        plugin_entry_path: 'gdstudio',
        source_data: input.sourceData,
        dedup_key: key,
      }
      this.songs.set(key, song)
      return song
    })
  }

  async download(): Promise<{ path: string; status: string }> {
    return { path: '', status: 'ok' }
  }
}

describe('LibraryService', () => {
  it('creates once and reuses the stable dedup identity', async () => {
    const songs = new DeduplicatingSongs()
    const service = new LibraryService(songs, completeEnricher())

    const first = await service.addOrReuse(track)
    const second = await service.addOrReuse(track)

    expect(first.song.id).toBe(1)
    expect(second.song.id).toBe(first.song.id)
    expect(songs.inputs).toHaveLength(2)
    expect(songs.inputs[0][0].dedupKey).toBe(track.dedupe_key)
  })

  it('persists only stable source metadata without resolved URLs', async () => {
    const songs = new DeduplicatingSongs()
    const service = new LibraryService(songs, completeEnricher())

    await service.addOrReuse(track)

    const sourceData = JSON.parse(songs.inputs[0][0].sourceData || '{}')
    expect(sourceData).toEqual({
      root_source: 'netease',
      identifier: '0039MnYb0qxYhV',
      url_id: '0039MnYb0qxYhV',
      title: '晴天',
      artist: '周杰伦',
      album: '叶惠美',
      duration: 269,
      metadata_status: 'complete',
      metadata_missing: [],
      metadata_errors: [],
    })
    expect(JSON.stringify(sourceData)).not.toContain('http')
    expect(songs.inputs[0][0]).not.toHaveProperty('url')
  })
})

function completeEnricher(): GDStudioMetadataEnricher {
  return {
    enrichMetadata: async input => ({
      title: input.title,
      artist: input.artist,
      album: input.album,
      cover_url: 'https://example.test/cover.jpg',
      lyric: '[00:00.00]歌词',
      status: 'complete',
      missing: [],
      errors: [],
    }),
  }
}
