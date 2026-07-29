import { AVAILABLE_SOURCE_IDS, SOURCE_IDS, SOURCE_LABELS } from './types'
import type {
  GDStudioClient,
  SearchRequest,
  SearchResponse,
  SourceId,
  SourceSearchGroup,
} from './types'
import type { SettingsService } from './settings'

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 50

export class SearchService {
  constructor(
    private readonly client: GDStudioClient,
    private readonly settings: SettingsService,
  ) {}

  async search(request: SearchRequest): Promise<SearchResponse> {
    const keyword = request.keyword.trim()
    if (!keyword) {
      throw new SearchInputError('keyword is required')
    }

    const filter = request.source ?? 'all'
    if (filter !== 'all' && !SOURCE_IDS.includes(filter)) {
      throw new SearchInputError('source is invalid')
    }
    if (filter !== 'all' && !(AVAILABLE_SOURCE_IDS as readonly string[]).includes(filter)) {
      throw new SearchInputError(`${SOURCE_LABELS[filter]}来源暂不可用：GDStudio 当前公开 API 不再接受该来源`)
    }

    const pageSize = normalizePositiveInteger(request.page_size, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const settings = await this.settings.get()
    const sources = filter === 'all'
      ? AVAILABLE_SOURCE_IDS.filter(source => settings.sources[source])
      : [filter]

    if (filter !== 'all' && !settings.sources[filter]) {
      throw new SearchInputError(`${SOURCE_LABELS[filter]}来源已停用`)
    }

    const groups = await Promise.all(sources.map(async source => {
      const page = normalizePositiveInteger(request.pages?.[source], 1)
      return this.searchSource(source, keyword, page, pageSize)
    }))

    return {
      keyword,
      page_size: pageSize,
      groups,
    }
  }

  private async searchSource(source: SourceId, keyword: string, page: number, pageSize: number): Promise<SourceSearchGroup> {
    try {
      const result = await this.client.search(source, keyword, page, pageSize)
      return {
        source,
        label: SOURCE_LABELS[source],
        page,
        has_more: result.hasMore,
        items: result.items,
      }
    } catch (error) {
      return {
        source,
        label: SOURCE_LABELS[source],
        page,
        has_more: false,
        items: [],
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

export class SearchInputError extends Error {}

function normalizePositiveInteger(value: unknown, fallback: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return fallback
  }
  return Math.min(value, maximum)
}
