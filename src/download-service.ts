import { LibraryService } from './library-service'
import { DEFAULT_DOWNLOAD_TEMPLATE, validatePathTemplate } from './settings'
import type { DownloadOutcome, DownloadTask, SearchTrack, SongLibrary } from './types'

export { DEFAULT_DOWNLOAD_TEMPLATE, validatePathTemplate }

export class DownloadService {
  constructor(private readonly library: LibraryService, private readonly songs: SongLibrary) {}

  async download(track: SearchTrack, template = DEFAULT_DOWNLOAD_TEMPLATE): Promise<DownloadOutcome> {
    const validTemplate = validatePathTemplate(template)
    const added = await this.library.addOrReuse(track)
    if (added.song.type === 'local') {
      return { status: 'already_downloaded', song: added.song, metadata: added.metadata }
    }
    const options = { path_template: validTemplate, embed_metadata: true }
    if (typeof this.songs.downloadStart === 'function' && typeof this.songs.downloadStatus === 'function') {
      const task = await this.songs.downloadStart(added.song.id, options)
      return { status: 'queued', song: added.song, metadata: added.metadata, task }
    }
    if (typeof this.songs.download !== 'function') throw new Error('当前 Songloft 不支持下载到本地')
    const result = await this.songs.download(added.song.id, options)
    if (result.error || result.status === 'failed') {
      return { status: 'failed', song: added.song, metadata: added.metadata, detail: result.error || '下载失败' }
    }
    return {
      status: 'completed',
      song: { ...added.song, type: 'local' },
      metadata: added.metadata,
      task: {
        id: `legacy-${added.song.id}`,
        song_id: added.song.id,
        status: 'completed',
        phase: 'completed',
        downloaded_bytes: 0,
        total_bytes: 0,
        path: result.path,
      },
    }
  }

  async status(taskID: string): Promise<DownloadTask> {
    if (!taskID) throw new Error('task id is required')
    if (typeof this.songs.downloadStatus !== 'function') throw new Error('当前 Songloft 不支持下载进度查询')
    return this.songs.downloadStatus(taskID)
  }
}
