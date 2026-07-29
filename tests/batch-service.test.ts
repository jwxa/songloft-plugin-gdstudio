import { describe, expect, it } from 'vitest'
import { BatchLibraryService } from '../src/batch-library-service'
import type { LibraryAddResult, LibrarySong, MetadataEnrichment, SearchTrack } from '../src/types'

const metadata: MetadataEnrichment = { title: '歌', artist: '人', album: '碟', cover_url: '', lyric: '', status: 'partial', missing: ['cover'], errors: [] }
const tracks: SearchTrack[] = [
  { id: '1', source: 'netease', dedupe_key: 'gdstudio:netease:1', title: '一', artist: '甲', album: '', duration: 1, cover_id: '', source_data: { root_source: 'netease', identifier: '1', url_id: 'u1' } },
  { id: '2', source: 'kuwo', dedupe_key: 'gdstudio:kuwo:2', title: '二', artist: '乙', album: '', duration: 2, cover_id: '', source_data: { root_source: 'kuwo', identifier: '2', url_id: 'u2' } },
]

describe('BatchLibraryService', () => {
  it('isolates failures and reports duplicate selections', async () => {
    const calls: string[] = []
    const library = { addOrReuse: async (track: SearchTrack): Promise<LibraryAddResult> => {
      calls.push(track.dedupe_key)
      if (track.id === '2') throw new Error('create failed')
      return { song: { id: 1, type: 'remote', title: track.title, artist: track.artist, album: track.album } as LibrarySong, metadata }
    }}
    const result = await new BatchLibraryService(library).addMany([tracks[0], tracks[1], tracks[0]])

    expect(result.map(item => item.status)).toEqual(['success', 'failed', 'existing'])
    expect(result[1].detail).toContain('create failed')
    expect(calls).toEqual(['gdstudio:netease:1', 'gdstudio:kuwo:2'])
  })
})
