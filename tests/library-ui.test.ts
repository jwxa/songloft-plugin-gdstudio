import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import { createSearchApp } from '../static/js/app.js'

const html = readFileSync(resolve('static/index.html'), 'utf8')

describe('library UI and host player', () => {
  it('keeps preview separate, adds explicitly, then starts the main player', async () => {
    const window = createWindow()
    stubAudio(window)
    const setQueue = vi.fn(async () => undefined)
    const openPlayer = vi.fn(async () => undefined)
    const api = createAPI({
      host: { isAvailable: () => true, openPlayer },
      player: { setQueue },
    })
    const app = createSearchApp(window.document, api)
    await app.init()
    await search(window)

    expect(window.document.querySelector('[data-preview-id]')?.textContent).toBe('试听')
    expect(window.document.querySelector('[data-library-id]')?.textContent).toBe('添加到曲库')
    ;(window.document.querySelector('[data-library-id]') as any).click()
    await flushTasks()

    expect(api.apiPost).toHaveBeenCalledWith('/api/library', { track: expect.objectContaining({ dedupe_key: 'gdstudio:netease:track-1' }) })
    expect(setQueue).toHaveBeenCalledWith([42], { startIndex: 0 })
    expect(openPlayer).toHaveBeenCalledTimes(1)
    expect(window.document.querySelector('.library-badge')?.textContent).toContain('已入库 · 元数据完整')
    expect(window.document.querySelector('[data-library-id]')?.textContent).toBe('主播放器播放')
  })

  it('keeps the song added when the host player bridge is unavailable', async () => {
    const window = createWindow()
    stubAudio(window)
    const api = createAPI({ host: { isAvailable: () => false } })
    const app = createSearchApp(window.document, api)
    await app.init()
    await search(window)

    ;(window.document.querySelector('[data-library-id]') as any).click()
    await flushTasks()

    expect(window.document.querySelector('.library-badge')?.textContent).toContain('已入库 · 元数据完整')
    expect(window.document.querySelector('#status')?.textContent).toContain('可返回 Songloft 主界面播放')
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

function stubAudio(window: Window) {
  const audio = window.document.querySelector('#preview-audio') as any
  audio.pause = vi.fn()
  audio.load = vi.fn()
}

function createAPI(bridges: Record<string, unknown>) {
  return {
    ...bridges,
    apiGet: vi.fn(async () => ({ sources: { netease: true, kuwo: true, tencent: true } })),
    apiPut: vi.fn(async (_path: string, settings: any) => settings),
    apiPost: vi.fn(async (path: string, request: any) => {
      if (path === '/api/library') {
        return {
          song: { id: 42, type: 'remote', title: request.track.title, artist: request.track.artist, album: request.track.album },
          metadata: { status: 'complete', missing: [], errors: [] },
        }
      }
      return searchResponse(request.keyword)
    }),
  }
}

async function search(window: Window) {
  const keyword = window.document.querySelector('#keyword') as any
  keyword.value = '晴天'
  window.document.querySelector('#search-form')?.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  await flushTasks()
}

function searchResponse(keyword: string) {
  return {
    keyword,
    page_size: 10,
    groups: [{
      source: 'netease',
      label: '网易云',
      page: 1,
      has_more: false,
      items: [{
        id: 'track-1',
        source: 'netease',
        dedupe_key: 'gdstudio:netease:track-1',
        title: keyword,
        artist: '周杰伦',
        album: '叶惠美',
        duration: 269,
        cover_id: '',
        source_data: { root_source: 'netease', identifier: 'track-1', url_id: 'url-1' },
      }],
    }],
  }
}

async function flushTasks() {
  await new Promise(resolvePromise => setTimeout(resolvePromise, 0))
  await new Promise(resolvePromise => setTimeout(resolvePromise, 0))
}
