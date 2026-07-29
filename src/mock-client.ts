import { SOURCE_LABELS } from './types'
import type { GDStudioClient, SearchTrack, SourceId, SourceSearchPage } from './types'

const MOCK_TRACK_COUNT = 27

export class MockGDStudioClient implements GDStudioClient {
  private readonly failedSources: Set<SourceId>

  constructor(failedSources: SourceId[] = []) {
    this.failedSources = new Set(failedSources)
  }

  async search(source: SourceId, keyword: string, page: number, pageSize: number): Promise<SourceSearchPage> {
    if (this.failedSources.has(source)) {
      throw new Error(`${SOURCE_LABELS[source]}模拟服务暂不可用`)
    }

    const start = (page - 1) * pageSize
    const end = Math.min(start + pageSize, MOCK_TRACK_COUNT)
    const items: SearchTrack[] = []
    for (let index = start; index < end; index += 1) {
      const sequence = index + 1
      items.push({
        id: `${source}-${sequence}`,
        source,
        dedupe_key: `gdstudio:${source}:${source}-${sequence}`,
        title: `${keyword} · ${SOURCE_LABELS[source]}版本 ${sequence}`,
        artist: `模拟歌手 ${(sequence % 5) + 1}`,
        album: `模拟专辑 ${(sequence % 3) + 1}`,
        duration: 180 + sequence,
        cover_id: `${source}-cover-${sequence}`,
        source_data: {
          root_source: source,
          identifier: `${source}-${sequence}`,
          url_id: `${source}-url-${sequence}`,
        },
      })
    }

    return {
      items,
      hasMore: end < MOCK_TRACK_COUNT,
    }
  }
}
