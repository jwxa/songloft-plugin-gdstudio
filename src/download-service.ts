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
    if (typeof this.songs.downloadStart !== 'function') throw new Error('当前 Songloft 不支持后台下载任务')
    const task = await this.songs.downloadStart(added.song.id, { path_template: validTemplate, embed_metadata: true })
    return { status: 'queued', song: added.song, metadata: added.metadata, task }
  }

  async status(taskID: string): Promise<DownloadTask> {
    if (!taskID) throw new Error('task id is required')
    if (typeof this.songs.downloadStatus !== 'function') throw new Error('当前 Songloft 不支持下载进度查询')
    return this.songs.downloadStatus(taskID)
  }
}
