import { describe, expect, it } from 'vitest'
import { DownloadService } from '../src/download-service'
import { LibraryService } from '../src/library-service'
import type { GDStudioMetadataEnricher, LibrarySong, SearchTrack, SongLibrary } from '../src/types'

const track: SearchTrack = { id: '1', source: 'netease', dedupe_key: 'gdstudio:netease:1', title: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269, cover_id: '', source_data: { root_source: 'netease', identifier: '1', url_id: 'u1' } }
const metadata: GDStudioMetadataEnricher = { enrichMetadata: async input => ({ title: input.title, artist: input.artist, album: input.album, cover_url: '', lyric: '', status: 'partial', missing: ['cover', 'lyric'], errors: [] }) }

class FakeSongs implements SongLibrary {
  song: LibrarySong = { id: 7, type: 'remote', title: track.title, artist: track.artist, album: track.album }
  options: any
  async create(): Promise<LibrarySong[]> { return [this.song] }
  async download(id: number, options: any) { this.options = { id, ...options }; return { path: 'downloads/file.mp3', status: 'ok' } }
  async downloadStart(id: number, options: any) {
    this.options = { id, ...options }
    return { id: 'task-1', song_id: id, status: 'queued' as const, phase: 'queued' as const, downloaded_bytes: 0, total_bytes: 0 }
  }
  async downloadStatus(id: string) {
    return { id, song_id: 7, status: 'completed' as const, phase: 'completed' as const, downloaded_bytes: 100, total_bytes: 100, path: 'downloads/file.mp3' }
  }
}

describe('DownloadService', () => {
  it('downloads with the original format contract and no transcode options', async () => {
    const songs = new FakeSongs()
    const result = await new DownloadService(new LibraryService(songs, metadata), songs).download(track)
    expect(result.status).toBe('queued')
    expect(result.task?.id).toBe('task-1')
    expect(songs.options).toEqual({ id: 7, path_template: 'downloads/{artist}-{album}/{title}', embed_metadata: true })
    expect(songs.options).not.toHaveProperty('format')
    expect(songs.options).not.toHaveProperty('quality')
  })

  it('short-circuits an already local song', async () => {
    const songs = new FakeSongs()
    songs.song = { ...songs.song, type: 'local' }
    const result = await new DownloadService(new LibraryService(songs, metadata), songs).download(track)
    expect(result.status).toBe('already_downloaded')
    expect(songs.options).toBeUndefined()
  })

  it('returns task progress snapshots', async () => {
    const songs = new FakeSongs()
    const result = await new DownloadService(new LibraryService(songs, metadata), songs).status('task-1')
    expect(result).toMatchObject({ id: 'task-1', status: 'completed', downloaded_bytes: 100, total_bytes: 100 })
  })
})
