export const SOURCE_IDS = ['netease', 'kuwo', 'tencent'] as const
export const AVAILABLE_SOURCE_IDS = ['netease', 'kuwo', 'tencent'] as const

export type SourceId = (typeof SOURCE_IDS)[number]
export type SourceFilter = SourceId | 'all'

export const SOURCE_LABELS: Record<SourceId, string> = {
  netease: '网易云',
  kuwo: '酷我',
  tencent: '腾讯',
}

export interface PluginSettings {
  sources: Record<SourceId, boolean>
}

export interface PluginInfo {
  plugin_version: string
  musicdl_version: string
  protocol_version: string
}

export interface SearchTrack {
  id: string
  source: SourceId
  dedupe_key: string
  title: string
  artist: string
  album: string
  duration: number
  cover_id: string
  source_data: GDStudioSourceData
}

export interface GDStudioSourceData {
  root_source: SourceId
  identifier: string
  url_id: string
  title?: string
  artist?: string
  album?: string
  duration?: number
  metadata_status?: MetadataStatus
  metadata_missing?: string[]
  metadata_errors?: string[]
}

export type MetadataStatus = 'complete' | 'partial' | 'failed'

export interface MetadataEnrichment {
  title: string
  artist: string
  album: string
  cover_url: string
  lyric: string
  status: MetadataStatus
  missing: string[]
  errors: string[]
}

export interface GDStudioMetadataEnricher {
  enrichMetadata(track: SearchTrack): Promise<MetadataEnrichment>
}

export interface LibrarySong {
  id: number
  type: 'local' | 'remote' | 'radio'
  title: string
  artist: string
  album: string
  plugin_entry_path?: string
  source_data?: string
  dedup_key?: string
}

export interface SongLibrary {
  create(songs: Array<{
    title: string
    artist?: string
    album?: string
    coverUrl?: string
    duration?: number
    sourceData?: string
    dedupKey?: string
    lyric?: string
    lyricSource?: string
  }>): Promise<LibrarySong[]>
  download(songId: number, options?: { path_template?: string; embed_metadata?: boolean }): Promise<{ path: string; status: string; error?: string }>
  downloadStart?(songId: number, options?: { path_template?: string; embed_metadata?: boolean }): Promise<DownloadTask>
  downloadStatus?(taskId: string): Promise<DownloadTask>
}

export interface DownloadOutcome {
  status: 'queued' | 'completed' | 'already_downloaded' | 'failed'
  song: LibrarySong
  metadata?: MetadataEnrichment
  task?: DownloadTask
  detail?: string
}

export interface HostCapabilities {
  download_mode: 'background' | 'legacy' | 'unavailable'
  download_progress: boolean
}

export interface DownloadTask {
  id: string
  song_id: number
  status: 'queued' | 'running' | 'completed' | 'failed'
  phase: 'queued' | 'preparing' | 'downloading' | 'finalizing' | 'completed' | 'failed'
  downloaded_bytes: number
  total_bytes: number
  path?: string
  error?: string
}

export interface LibraryAddResult {
  song: LibrarySong
  metadata: MetadataEnrichment
}

export type BatchItemStatus = 'success' | 'existing' | 'failed'

export interface BatchLibraryItem {
  dedupe_key: string
  status: BatchItemStatus
  song?: LibrarySong
  metadata?: MetadataEnrichment
  detail?: string
}

export interface ResolvedAudio {
  url: string
  headers: Record<string, string>
  format: string
  bitrate: number
  quality: number
}

export interface GDStudioAudioResolver {
  resolveAudio(sourceData: GDStudioSourceData): Promise<ResolvedAudio>
}

export interface SourceSearchPage {
  items: SearchTrack[]
  hasMore: boolean
}

export interface SourceSearchGroup {
  source: SourceId
  label: string
  page: number
  has_more: boolean
  items: SearchTrack[]
  error?: string
}

export interface SearchRequest {
  keyword: string
  source?: SourceFilter
  pages?: Partial<Record<SourceId, number>>
  page_size?: number
}

export interface SearchResponse {
  keyword: string
  page_size: number
  groups: SourceSearchGroup[]
}

export interface GDStudioClient {
  search(source: SourceId, keyword: string, page: number, pageSize: number): Promise<SourceSearchPage>
}

export interface PluginStorage {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
}
