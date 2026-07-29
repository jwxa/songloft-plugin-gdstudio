import { LibraryService } from './library-service'
import type { BatchLibraryItem, LibraryAddResult, SearchTrack } from './types'

interface LibraryWriter {
  addOrReuse(track: SearchTrack): Promise<LibraryAddResult>
}

export class BatchLibraryService {
  constructor(private readonly library: LibraryWriter) {}

  async addMany(tracks: SearchTrack[]): Promise<BatchLibraryItem[]> {
    const seen = new Set<string>()
    const results: BatchLibraryItem[] = []
    for (const track of tracks) {
      if (seen.has(track.dedupe_key)) {
        results.push({ dedupe_key: track.dedupe_key, status: 'existing', detail: '本批次已处理相同来源歌曲' })
        continue
      }
      seen.add(track.dedupe_key)
      try {
        const result = await this.library.addOrReuse(track)
        results.push({ dedupe_key: track.dedupe_key, status: 'success', song: result.song, metadata: result.metadata })
      } catch (error) {
        results.push({ dedupe_key: track.dedupe_key, status: 'failed', detail: error instanceof Error ? error.message : String(error) })
      }
    }
    return results
  }
}
