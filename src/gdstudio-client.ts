import type { GDStudioAudioResolver, GDStudioClient, GDStudioMetadataEnricher, GDStudioSourceData, MetadataEnrichment, ResolvedAudio, SearchTrack, SourceId, SourceSearchPage } from './types'
import { SOURCE_IDS } from './types'

export const GDSTUDIO_BASE_URL = 'https://music-api.gdstudio.xyz/'
export const GDSTUDIO_API_URL = `${GDSTUDIO_BASE_URL}api.php`
export const KUWO_FALLBACK_API_URL = 'https://kw-api.cenguigui.cn/'
export const TENCENT_API_URL = 'https://tang.api.s01s.cn/music_open_api.php'
export const GDSTUDIO_API_VERSION = '2026.07.21'
export const SOURCE_UNAVAILABLE_MESSAGE = '当前来源没有可播放链接，请尝试其他歌曲或手动选择其他来源'

const SEARCH_TIMEOUT_MS = '10000'
const PLAYER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
export const GDSTUDIO_QUALITY_ORDER = [999, 740, 320, 192, 128] as const

export interface HTTPRequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
}

export interface HTTPResponseData {
  status: number
  body: string
}

export interface HTTPTransport {
  request(url: string, options?: HTTPRequestOptions): Promise<HTTPResponseData>
}

export class FetchHTTPTransport implements HTTPTransport {
  async request(url: string, options: HTTPRequestOptions = {}): Promise<HTTPResponseData> {
    const response = await fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
    })
    return {
      status: response.status,
      body: await response.text(),
    }
  }
}

export class GDStudioSearchClient implements GDStudioClient, GDStudioAudioResolver, GDStudioMetadataEnricher {
  private readonly searchLimiter = new AsyncSemaphore(2)
  private readonly resolveLimiter = new AsyncSemaphore(4)
  constructor(private readonly transport: HTTPTransport) {}

  async search(source: SourceId, keyword: string, page: number, pageSize: number): Promise<SourceSearchPage> {
    const release = await this.searchLimiter.acquire()
    let payload: unknown[]
    try { payload = await this.requestSearchWithRetry(source, keyword, page, pageSize) } finally { release() }
    const offset = source === 'tencent' ? (page - 1) * pageSize : 0
    const items = payload
      .slice(offset, offset + pageSize)
      .map(item => mapSearchTrack(item, source))
      .filter((item): item is SearchTrack => item !== null)

    return {
      items,
      hasMore: source === 'tencent' ? payload.length > offset + pageSize : payload.length >= pageSize,
    }
  }

  async enrichMetadata(track: SearchTrack): Promise<MetadataEnrichment> {
    const errors: string[] = []
    const missing: string[] = []
    let title = track.title
    let artist = track.artist
    let album = track.album
    let coverID = track.cover_id
    let lyricID = ''
    let detailEnhanced = false

    try {
      const payload = await this.requestSearch(track.source, [track.title, track.artist].filter(Boolean).join(' '), 1, 20)
      const detail = payload.find(item => isRecord(item) && stringValue(item.id) === track.source_data.identifier)
      if (isRecord(detail)) {
        title = stringValue(detail.name) || title
        artist = artistValue(detail.artist) || artist
        album = stringValue(detail.album) || album
        coverID = stringValue(detail.pic_id) || coverID
        lyricID = stringValue(detail.lyric_id)
        detailEnhanced = true
      } else {
        errors.push('details:not_found')
      }
    } catch (error) {
      errors.push(`details:${errorMessage(error)}`)
    }

    let coverURL = ''
    if (coverID) {
      try {
        coverURL = await this.resolveCover(track.source, coverID)
        if (!coverURL) missing.push('cover')
      } catch (error) {
        errors.push(`cover:${errorMessage(error)}`)
      }
    } else {
      missing.push('cover')
    }

    let lyric = ''
    if (lyricID) {
      try {
        lyric = await this.resolveLyric(track.source, lyricID)
        if (!lyric) missing.push('lyric')
      } catch (error) {
        errors.push(`lyric:${errorMessage(error)}`)
      }
    } else {
      missing.push('lyric')
    }
    if (!album) missing.push('album')

    const usefulEnhancements = Number(detailEnhanced) + Number(Boolean(coverURL)) + Number(Boolean(lyric))
    return {
      title,
      artist,
      album,
      cover_url: coverURL,
      lyric,
      status: errors.length === 0 && missing.length === 0 ? 'complete' : usefulEnhancements === 0 && errors.length > 0 ? 'failed' : 'partial',
      missing: unique(missing),
      errors,
    }
  }

  private async requestSearch(source: SourceId, keyword: string, page: number, pageSize: number): Promise<unknown[]> {
    if (source === 'tencent') return await this.requestTencentSearch(keyword)
    const response = await this.requestAPI({
      types: 'search',
      count: String(pageSize),
      pages: String(page),
      name: keyword,
      source,
    })

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`GDStudio search HTTP ${response.status}`)
    }

    const payload = JSON.parse(response.body)
    if (!Array.isArray(payload)) {
      throw new Error('GDStudio search response is not an array')
    }
    return payload
  }

  private async requestSearchWithRetry(source: SourceId, keyword: string, page: number, pageSize: number): Promise<unknown[]> {
    try {
      return await this.requestSearch(source, keyword, page, pageSize)
    } catch {
      return await this.requestSearch(source, keyword, page, pageSize)
    }
  }

  async resolveAudio(sourceData: GDStudioSourceData): Promise<ResolvedAudio> {
    const release = await this.resolveLimiter.acquire()
    try {
      return await this.resolveAudioLimited(sourceData)
    } finally {
      release()
    }
  }

  private async resolveAudioLimited(sourceData: GDStudioSourceData): Promise<ResolvedAudio> {
    if (!isSourceId(sourceData.root_source) || !sourceData.url_id) {
      throw new Error('invalid GDStudio source_data')
    }

    if (sourceData.root_source === 'tencent') {
      const tencentAudio = await this.resolveTencentAudio(sourceData.url_id)
      if (tencentAudio) return tencentAudio
      throw new Error(SOURCE_UNAVAILABLE_MESSAGE)
    }

    const direct = await this.resolveAudioByID(sourceData.root_source, sourceData.url_id)
    if (direct) return direct

    if (sourceData.root_source === 'kuwo') {
      const fallback = await this.resolveKuwoFallback(sourceData.url_id)
      if (fallback) return fallback
    }

    const replacement = await this.findSameSourceReplacement(sourceData)
    if (replacement) {
      const resolved = await this.resolveAudioByID(sourceData.root_source, replacement.source_data.url_id)
      if (resolved) return resolved
      if (sourceData.root_source === 'kuwo') {
        const fallback = await this.resolveKuwoFallback(replacement.source_data.url_id)
        if (fallback) return fallback
      }
    }

    throw new Error(SOURCE_UNAVAILABLE_MESSAGE)
  }

  private async resolveAudioByID(source: SourceId, urlID: string): Promise<ResolvedAudio | null> {
    for (const quality of GDSTUDIO_QUALITY_ORDER) {
      try {
        const response = await this.requestAPI({ types: 'url', id: urlID, source, br: String(quality) })
        if (response.status < 200 || response.status >= 300) {
          continue
        }
        const payload = JSON.parse(response.body)
        if (!isRecord(payload) || !payload.url || payload.size === 0 || payload.size === '0' || payload.br === -1 || payload.br === '-1') {
          continue
        }
        const audioURL = new URL(String(payload.url), GDSTUDIO_BASE_URL).toString()
        const bitrate = positiveNumber(payload.br) || quality
        return {
          url: audioURL,
          headers: audioHeaders(),
          format: audioFormat(payload, audioURL),
          bitrate,
          quality,
        }
      } catch {
        continue
      }
    }
    return null
  }

  private async resolveKuwoFallback(urlID: string): Promise<ResolvedAudio | null> {
    try {
      const query = [
        ['id', urlID],
        ['type', 'song'],
        ['level', 'zp'],
        ['format', 'json'],
      ].map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')
      const response = await this.transport.request(`${KUWO_FALLBACK_API_URL}?${query}`, {
        method: 'GET',
        headers: apiHeaders(),
      })
      if (response.status < 200 || response.status >= 300) return null

      const payload = JSON.parse(response.body)
      const data = isRecord(payload) && isRecord(payload.data) ? payload.data : null
      if (!data || positiveNumber(payload.code) !== 200 || !data.url) return null

      const audioURL = new URL(String(data.url)).toString()
      const bitrate = positiveNumber(data.bitrate)
      return {
        url: audioURL,
        headers: audioHeaders('https://kuwo.cn/'),
        format: audioFormat(data, audioURL),
        bitrate,
        quality: bitrate || 999,
      }
    } catch {
      return null
    }
  }

  private async requestTencentSearch(keyword: string): Promise<unknown[]> {
    const response = await this.transport.request(`${TENCENT_API_URL}?msg=${encodeURIComponent(keyword)}&type=json`, {
      method: 'GET', headers: apiHeaders(),
    })
    if (response.status < 200 || response.status >= 300) throw new Error(`Tencent search HTTP ${response.status}`)
    const payload = JSON.parse(response.body)
    if (!Array.isArray(payload)) throw new Error('Tencent search response is not an array')
    return payload.map(item => isRecord(item) ? {
      id: item.song_mid, url_id: item.song_mid, source: 'tencent', name: item.song_title,
      artist: item.singer_name, album: '',
    } : item)
  }

  private async resolveTencentAudio(songMID: string): Promise<ResolvedAudio | null> {
    try {
      const response = await this.transport.request(`${TENCENT_API_URL}?mid=${encodeURIComponent(songMID)}`, {
        method: 'GET', headers: apiHeaders(),
      })
      if (response.status < 200 || response.status >= 300) return null
      const payload = JSON.parse(response.body)
      if (!isRecord(payload)) return null
      const candidates = [
        ['song_play_url_sq', 'kbps_sq'], ['song_play_url_pq', 'kbps_pq'],
        ['song_play_url_accom', 'kbps_accom'], ['song_play_url_hq', 'kbps_hq'],
        ['song_play_url', 'kbps'], ['song_play_url_standard', 'kbps_standard'], ['song_play_url_fq', 'kbps_fq'],
      ] as const
      for (const [urlKey, bitrateKey] of candidates) {
        const url = stringValue(payload[urlKey])
        if (!url.startsWith('http')) continue
        const bitrate = positiveNumber(payload[bitrateKey])
        return { url: new URL(url).toString(), headers: audioHeaders('https://y.qq.com/'), format: audioFormat(payload, url), bitrate, quality: bitrate || 999 }
      }
      return null
    } catch {
      return null
    }
  }

  private async findSameSourceReplacement(sourceData: GDStudioSourceData): Promise<SearchTrack | null> {
    if (!sourceData.title) return null
    try {
      const query = [sourceData.title, sourceData.artist].filter(Boolean).join(' ')
      const page = await this.search(sourceData.root_source, query, 1, 20)
      return page.items
        .filter(item => item.source === sourceData.root_source)
        .map(item => ({ item, score: replacementScore(sourceData, item) }))
        .filter(candidate => candidate.score >= 100)
        .sort((left, right) => right.score - left.score)[0]?.item || null
    } catch {
      return null
    }
  }

  private async resolveCover(source: SourceId, coverID: string): Promise<string> {
    if (source === 'kuwo') {
      const path = coverID.startsWith('120/') ? `300/${coverID.slice(4)}` : coverID
      return new URL(path, 'http://img1.kwcdn.kuwo.cn/star/albumcover/').toString()
    }
    const payload = await this.requestMetadata('pic', source, coverID, { size: '300' })
    const url = stringValue(payload.url)
    return url ? new URL(url, GDSTUDIO_BASE_URL).toString() : ''
  }

  private async resolveLyric(source: SourceId, lyricID: string): Promise<string> {
    const payload = await this.requestMetadata('lyric', source, lyricID)
    const lyric = stringValue(payload.lyric || payload.lrc).trim()
    if (!lyric || ['NULL', 'null', 'None', 'none'].includes(lyric) || lyric.includes('歌词获取失败')) return ''
    return lyric
  }

  private async requestMetadata(type: 'pic' | 'lyric', source: SourceId, identifier: string, extra: Record<string, string> = {}): Promise<Record<string, unknown>> {
    const response = await this.requestAPI({ types: type, id: identifier, source, ...extra })
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`GDStudio ${type} HTTP ${response.status}`)
    }
    const payload = JSON.parse(response.body)
    if (!isRecord(payload)) throw new Error(`GDStudio ${type} response is not an object`)
    return payload
  }

  private async requestAPI(params: Record<string, string>): Promise<HTTPResponseData> {
    const query = Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&')
    return await this.transport.request(`${GDSTUDIO_API_URL}?${query}`, {
      method: 'GET',
      headers: apiHeaders(),
    })
  }
}

function replacementScore(sourceData: GDStudioSourceData, candidate: SearchTrack): number {
  if (normalizeText(sourceData.title) !== normalizeText(candidate.title)) return 0

  let score = 100
  const expectedArtist = normalizeText(sourceData.artist)
  const candidateArtist = normalizeText(candidate.artist)
  if (expectedArtist) {
    if (expectedArtist === candidateArtist) score += 20
    else if (expectedArtist.includes(candidateArtist) || candidateArtist.includes(expectedArtist)) score += 10
    else return 0
  }

  const expectedDuration = positiveNumber(sourceData.duration)
  const candidateDuration = positiveNumber(candidate.duration)
  if (expectedDuration && candidateDuration) {
    const difference = Math.abs(expectedDuration - candidateDuration)
    if (difference <= 3) score += 10
    else if (difference <= 8) score += 5
    else return 0
  }
  return score
}

function normalizeText(value: unknown): string {
  return stringValue(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function apiHeaders(): Record<string, string> {
  return {
    'Accept': 'application/json',
    'X-Fetch-Timeout-Ms': SEARCH_TIMEOUT_MS,
  }
}

function audioHeaders(referer = ''): Record<string, string> {
  return {
    'User-Agent': PLAYER_USER_AGENT,
    ...(referer ? { Referer: referer } : {}),
  }
}

function mapSearchTrack(input: unknown, fallbackSource: SourceId): SearchTrack | null {
  if (!isRecord(input) || input.id === undefined || input.id === null) {
    return null
  }

  const identifier = String(input.id)
  if (!identifier) {
    return null
  }

  const source = isSourceId(input.source) ? input.source : fallbackSource
  return {
    id: identifier,
    source,
    dedupe_key: `gdstudio:${source}:${identifier}`,
    title: stringValue(input.name),
    artist: artistValue(input.artist),
    album: stringValue(input.album),
    duration: durationValue(input.extra_data),
    cover_id: stringValue(input.pic_id),
    source_data: {
      root_source: source,
      identifier,
      url_id: stringValue(input.url_id),
    },
  }
}

function positiveNumber(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function audioFormat(payload: Record<string, unknown>, audioURL: string): string {
  const declared = stringValue(payload.format || payload.type || payload.ext).replace(/^\./, '').toLowerCase()
  if (declared) return declared
  try {
    const fileName = new URL(audioURL).pathname.split('/').pop() || ''
    return fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() || '' : ''
  } catch {
    return ''
  }
}

function isSourceId(value: unknown): value is SourceId {
  return typeof value === 'string' && SOURCE_IDS.includes(value as SourceId)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

function artistValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(stringValue).filter(Boolean).join(', ')
  }
  return stringValue(value)
}

function durationValue(extraData: unknown): number {
  if (!isRecord(extraData)) {
    return 0
  }
  const duration = Number(extraData.duration)
  return Number.isFinite(duration) && duration > 0 ? duration : 0
}

export const GDSTUDIO_CLIENT_INFO = {
  plugin_version: '0.2.9',
  musicdl_version: '2.13.4',
  protocol_version: `public-api-${GDSTUDIO_API_VERSION}`,
}

class AsyncSemaphore {
  private available: number
  private readonly waiters: Array<() => void> = []

  constructor(limit: number) { this.available = limit }

  acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available--
      return Promise.resolve(() => this.release())
    }
    return new Promise(resolve => this.waiters.push(() => {
      this.available--
      resolve(() => this.release())
    }))
  }

  private release() {
    this.available++
    const next = this.waiters.shift()
    if (next) next()
  }
}
