import type { GDStudioMetadataEnricher, GDStudioSourceData, LibraryAddResult, MetadataEnrichment, SearchTrack, SongLibrary } from './types'

export class LibraryService {
  constructor(
    private readonly songs: SongLibrary,
    private readonly enricher?: GDStudioMetadataEnricher,
  ) {}

  async addOrReuse(track: SearchTrack): Promise<LibraryAddResult> {
    const metadata = await this.enrichWithoutBlocking(track)
    const input = {
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album,
      sourceData: JSON.stringify(persistentSourceData(track, metadata)),
      dedupKey: track.dedupe_key,
      ...(track.duration ? { duration: track.duration } : {}),
      ...(metadata.cover_url ? { coverUrl: metadata.cover_url } : {}),
      ...(metadata.lyric ? { lyric: metadata.lyric, lyricSource: 'scraped' } : {}),
    }
    const created = await this.songs.create([input])
    if (!created[0]) {
      throw new Error('Songloft 未返回已入库歌曲')
    }
    return { song: created[0], metadata }
  }

  private async enrichWithoutBlocking(track: SearchTrack): Promise<MetadataEnrichment> {
    if (!this.enricher) return failedMetadata(track, 'metadata enricher unavailable')
    try {
      return await this.enricher.enrichMetadata(track)
    } catch (error) {
      return failedMetadata(track, error instanceof Error ? error.message : String(error))
    }
  }
}

export function persistentSourceData(track: SearchTrack, metadata?: MetadataEnrichment): GDStudioSourceData {
  return {
    root_source: track.source_data.root_source,
    identifier: track.source_data.identifier,
    url_id: track.source_data.url_id,
    title: metadata?.title || track.title,
    artist: metadata?.artist || track.artist,
    album: metadata?.album || track.album,
    duration: track.duration,
    metadata_status: metadata?.status,
    metadata_missing: metadata?.missing,
    metadata_errors: metadata?.errors,
  }
}

function failedMetadata(track: SearchTrack, reason: string): MetadataEnrichment {
  return {
    title: track.title,
    artist: track.artist,
    album: track.album,
    cover_url: '',
    lyric: '',
    status: 'failed',
    missing: ['cover', 'lyric', ...(!track.album ? ['album'] : [])],
    errors: [`metadata:${reason}`],
  }
}
