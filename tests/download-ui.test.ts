import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import { createSearchApp } from '../static/js/app.js'

const html = readFileSync(resolve('static/index.html'), 'utf8')

describe('download UI', () => {
  it('persists queue settings and renders task progress errors', async () => {
    const window = createWindow()
    const track = createTrack('1')
    const api = {
      apiGet: vi.fn(async (path: string) => {
        if (path === '/api/download-settings') return { path_template: 'downloads/{artist}/{title}', max_concurrency: 2 }
        if (path === '/api/download-status/task-1') return { id: 'task-1', status: 'failed', phase: 'failed', downloaded_bytes: 50, total_bytes: 100, error: '磁盘空间不足' }
        return { sources: { netease: true, kuwo: true, tencent: true } }
      }),
      apiPut: vi.fn(async (_path: string, body: any) => body),
      apiPost: vi.fn(async (path: string, body: any) => path === '/api/download'
        ? { status: 'queued', song: { id: 1, type: 'remote' }, metadata: { status: 'complete' }, task: { id: 'task-1', status: 'queued', phase: 'queued', downloaded_bytes: 0, total_bytes: 0 } }
        : searchResponse(body.keyword, [track])),
    }
    const app = createSearchApp(window.document, api)
    await app.init()
    expect((window.document.querySelector('#download-template') as any).value).toBe('downloads/{artist}/{title}')
    ;(window.document.querySelector('#download-concurrency') as any).value = '3'
    ;(window.document.querySelector('#save-download-settings') as any).click()
    await flushTasks()
    expect(api.apiPut).toHaveBeenCalledWith('/api/download-settings', { path_template: 'downloads/{artist}/{title}', max_concurrency: 3 })

    app.queueDownloads([track])
    await flushTasks()
    expect(window.document.querySelector('#download-queue')?.hasAttribute('hidden')).toBe(false)
    expect((window.document.querySelector('.download-progress progress') as any).value).toBe(50)
    expect(window.document.querySelector('#download-jobs')?.textContent).toContain('磁盘空间不足')
  })

  it('queues batch downloads and starts at most two concurrently', async () => {
    const window = createWindow()
    const tracks = [createTrack('1'), createTrack('2'), createTrack('3')]
    const pending = new Map<string, ReturnType<typeof deferred<any>>>()
    const started: string[] = []
    const api = {
      apiGet: vi.fn(async (path: string) => {
        if (path === '/api/download-settings') return { path_template: 'downloads/{artist}/{title}', max_concurrency: 2 }
        if (path.startsWith('/api/download-status/')) {
          const id = path.split('/').pop() || ''
          const task = deferred<any>()
          pending.set(id, task)
          return task.promise
        }
        return { sources: { netease: true, kuwo: true, tencent: true } }
      }),
      apiPut: vi.fn(async (_path: string, body: any) => body),
      apiPost: vi.fn(async (path: string, body: any) => {
        if (path !== '/api/download') return searchResponse(body.keyword, tracks)
        const id = `task-${body.track.id}`
        started.push(id)
        return { status: 'queued', song: { id: Number(body.track.id), type: 'remote' }, metadata: { status: 'complete' }, task: { id, status: 'queued', phase: 'queued', downloaded_bytes: 0, total_bytes: 0 } }
      }),
    }
    const app = createSearchApp(window.document, api)
    await app.init()
    app.queueDownloads(tracks)
    await flushTasks()
    expect(started).toEqual(['task-1', 'task-2'])

    pending.get('task-1')?.resolve({ id: 'task-1', status: 'completed', phase: 'completed', downloaded_bytes: 100, total_bytes: 100 })
    await flushTasks()
    expect(started).toEqual(['task-1', 'task-2', 'task-3'])
  })
})

function createWindow() {
  const window = new Window({
    url: 'https://songloft.test/api/v1/jsplugin/gdstudio/',
    settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true },
  })
  window.document.write(html)
  return window
}

function createTrack(id: string) {
  return {
    id,
    source: 'netease',
    dedupe_key: `gdstudio:netease:${id}`,
    title: `歌曲 ${id}`,
    artist: '歌手',
    album: '专辑',
    duration: 1,
    cover_id: '',
    source_data: { root_source: 'netease', identifier: id, url_id: `url-${id}` },
  }
}

function searchResponse(keyword: string, tracks: any[]) {
  return { keyword, page_size: 10, groups: [{ source: 'netease', label: '网易云', page: 1, has_more: false, items: tracks }] }
}

function deferred<T>() {
  let resolvePromise!: (value: T) => void
  const promise = new Promise<T>(resolve => { resolvePromise = resolve })
  return { promise, resolve: resolvePromise }
}

async function flushTasks() {
  await new Promise(resolvePromise => setTimeout(resolvePromise, 0))
  await new Promise(resolvePromise => setTimeout(resolvePromise, 0))
}
