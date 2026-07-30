import { createRouter, jsonResponse } from '@songloft/plugin-sdk'
import type { HTTPRequest, Router } from '@songloft/plugin-sdk'
import { LibraryService } from './library-service'
import { BatchLibraryService } from './batch-library-service'
import { DownloadService } from './download-service'
import { SearchInputError, SearchService } from './search-service'
import { DEFAULT_DOWNLOAD_CONCURRENCY, DEFAULT_DOWNLOAD_TEMPLATE, SettingsService, validateDownloadConcurrency, validatePathTemplate } from './settings'
import { GDSTUDIO_CLIENT_INFO, SOURCE_UNAVAILABLE_MESSAGE } from './gdstudio-client'
import type { GDStudioAudioResolver, GDStudioClient, GDStudioMetadataEnricher, GDStudioSourceData, HostCapabilities, PluginStorage, SearchRequest, SearchTrack, SongLibrary } from './types'

export interface PluginDependencies {
  storage: PluginStorage
  client: GDStudioClient & Partial<GDStudioAudioResolver & GDStudioMetadataEnricher>
  songs?: SongLibrary
}

export function createPluginRouter(dependencies: PluginDependencies): Router {
  const router = createRouter()
  const settings = new SettingsService(dependencies.storage)
  const search = new SearchService(dependencies.client, settings)
  const library = dependencies.songs ? new LibraryService(dependencies.songs, dependencies.client.enrichMetadata ? dependencies.client as GDStudioMetadataEnricher : undefined) : null
  const batchLibrary = library ? new BatchLibraryService(library) : null
  const downloads = library && dependencies.songs ? new DownloadService(library, dependencies.songs) : null

  router.get('/api/settings', async () => {
    return jsonResponse(await settings.get())
  })

  router.get('/api/info', async () => jsonResponse(GDSTUDIO_CLIENT_INFO))

  router.get('/api/capabilities', async () => {
    const capabilities: HostCapabilities = {
      download_mode: dependencies.songs
        ? typeof dependencies.songs.downloadStart === 'function' && typeof dependencies.songs.downloadStatus === 'function'
          ? 'background'
          : typeof dependencies.songs.download === 'function'
            ? 'legacy'
            : 'unavailable'
        : 'unavailable',
      download_progress: !!dependencies.songs && typeof dependencies.songs.downloadStart === 'function' && typeof dependencies.songs.downloadStatus === 'function',
    }
    return jsonResponse(capabilities)
  })

  router.put('/api/settings', async request => {
    try {
      return jsonResponse(await settings.save(parseJSONBody(request)))
    } catch (error) {
      return jsonResponse({ error: 'invalid settings', detail: errorMessage(error) }, 400)
    }
  })

  router.get('/api/download-settings', async () => {
    const stored = await dependencies.storage.get('download_path_template')
    const concurrency = await dependencies.storage.get('download_max_concurrency')
    return jsonResponse({
      path_template: typeof stored === 'string' ? stored : DEFAULT_DOWNLOAD_TEMPLATE,
      max_concurrency: Number.isInteger(concurrency) ? concurrency : DEFAULT_DOWNLOAD_CONCURRENCY,
    })
  })

  router.put('/api/download-settings', async request => {
    try {
      const body = parseJSONBody(request) as { path_template?: unknown; max_concurrency?: unknown }
      const template = validatePathTemplate(body.path_template)
      const maxConcurrency = validateDownloadConcurrency(body.max_concurrency)
      await dependencies.storage.set('download_path_template', template)
      await dependencies.storage.set('download_max_concurrency', maxConcurrency)
      return jsonResponse({ path_template: template, max_concurrency: maxConcurrency })
    } catch (error) {
      return jsonResponse({ error: 'invalid download settings', detail: errorMessage(error) }, 400)
    }
  })

  router.post('/api/search', async request => {
    try {
      const body = parseJSONBody(request) as SearchRequest
      return jsonResponse(await search.search(body))
    } catch (error) {
      if (error instanceof SearchInputError || error instanceof SyntaxError) {
        return jsonResponse({ error: 'invalid search request', detail: errorMessage(error) }, 400)
      }
      return jsonResponse({ error: 'search failed', detail: errorMessage(error) }, 500)
    }
  })

  router.post('/api/music/url', async request => {
    try {
      if (typeof dependencies.client.resolveAudio !== 'function') {
        return jsonResponse({ error: 'audio resolver unavailable' }, 503)
      }
      const body = parseJSONBody(request) as { source_data?: GDStudioSourceData }
      if (!body.source_data) {
        return jsonResponse({ error: 'source_data is required' }, 400)
      }
      return jsonResponse(await dependencies.client.resolveAudio(body.source_data))
    } catch (error) {
      return jsonResponse({ error: 'audio resolution failed', detail: errorMessage(error) }, 404)
    }
  })

  router.post('/api/library', async request => {
    try {
      if (!library) {
        return jsonResponse({ error: 'song library unavailable' }, 503)
      }
      const body = parseJSONBody(request) as { track?: SearchTrack }
      if (!body.track) {
        return jsonResponse({ error: 'track is required' }, 400)
      }
      await ensurePlayable(dependencies.client, body.track)
      return jsonResponse(await library.addOrReuse(body.track))
    } catch (error) {
      if (error instanceof SourceUnavailableError) {
        return jsonResponse({ error: 'source unavailable', detail: error.message }, 422)
      }
      return jsonResponse({ error: 'library write failed', detail: errorMessage(error) }, 500)
    }
  })

  router.post('/api/library/batch', async request => {
    try {
      if (!batchLibrary) return jsonResponse({ error: 'song library unavailable' }, 503)
      const body = parseJSONBody(request) as { tracks?: SearchTrack[] }
      if (!Array.isArray(body.tracks) || body.tracks.length === 0) return jsonResponse({ error: 'tracks is required' }, 400)
      return jsonResponse({ items: await batchLibrary.addMany(body.tracks) })
    } catch (error) {
      return jsonResponse({ error: 'batch library write failed', detail: errorMessage(error) }, 500)
    }
  })

  router.post('/api/download', async request => {
    try {
      if (!downloads) return jsonResponse({ error: 'download unavailable' }, 503)
      const body = parseJSONBody(request) as { track?: SearchTrack }
      if (!body.track) return jsonResponse({ error: 'track is required' }, 400)
      await ensurePlayable(dependencies.client, body.track)
      const template = await dependencies.storage.get('download_path_template')
      return jsonResponse(await downloads.download(body.track, typeof template === 'string' ? template : DEFAULT_DOWNLOAD_TEMPLATE))
    } catch (error) {
      if (error instanceof SourceUnavailableError) {
        return jsonResponse({ error: 'source unavailable', detail: error.message }, 422)
      }
      return jsonResponse({ error: 'download failed', detail: errorMessage(error) }, 500)
    }
  })

  router.get('/api/download-status/:id', async (_request, params) => {
    try {
      if (!downloads) return jsonResponse({ error: 'download unavailable' }, 503)
      return jsonResponse(await downloads.status(params.id))
    } catch (error) {
      return jsonResponse({ error: 'download status failed', detail: errorMessage(error) }, 404)
    }
  })

  return router
}

class SourceUnavailableError extends Error {}

async function ensurePlayable(client: PluginDependencies['client'], track: SearchTrack): Promise<void> {
  const resolveAudio = client.resolveAudio
  if (typeof resolveAudio !== 'function') {
    throw new SourceUnavailableError(SOURCE_UNAVAILABLE_MESSAGE)
  }
  try {
    await resolveAudio.call(client, track.source_data)
  } catch {
    throw new SourceUnavailableError(SOURCE_UNAVAILABLE_MESSAGE)
  }
}

function parseJSONBody(request: HTTPRequest): unknown {
  if (!request.body) {
    return {}
  }
  const body = typeof request.body === 'string'
    ? request.body
    : new TextDecoder().decode(request.body)
  return JSON.parse(body)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
