import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import { createSearchApp } from '../static/js/app.js'
import { SOURCE_UNAVAILABLE_MESSAGE } from '../src/gdstudio-client'

const html = readFileSync(resolve('static/index.html'), 'utf8')

describe('preview mini player', () => {
  it('shows an immediate loading state while resolving audio', async () => {
    const window = createWindow()
    const audio = window.document.querySelector('#preview-audio') as any
    audio.play = vi.fn(async () => undefined)
    audio.pause = vi.fn()
    audio.load = vi.fn()

    let resolveRequest: ((response: any) => void) | undefined
    const pendingResponse = new Promise(resolve => { resolveRequest = resolve })
    const pluginApi = createAPI(async (_path: string, body: any) => searchResponse(body.keyword))
    const request = vi.fn(async () => pendingResponse)
    const app = createSearchApp(window.document, pluginApi, request as any)
    await app.init()
    await search(window, '夜曲')

    ;(window.document.querySelector('[data-preview-id]') as any).click()
    await flushTasks()

    const loadingButton = window.document.querySelector('[data-preview-id]') as any
    expect(loadingButton.disabled).toBe(true)
    expect(loadingButton.getAttribute('aria-busy')).toBe('true')
    expect(loadingButton.textContent).toContain('解析中')
    expect((window.document.querySelector('#preview-player') as any).hidden).toBe(false)
    expect(window.document.querySelector('#preview-meta')?.textContent).toContain('正在解析最高可用音质')

    resolveRequest?.(jsonResponse({
      token: 'token-loading',
      stream_url: '/api/v1/plugin-previews/token-loading',
      audio: { format: 'mp3', bitrate: 320, quality: 320 },
    }, 201))
    await flushTasks()

    expect((window.document.querySelector('[data-preview-id]') as any).disabled).toBe(false)
    expect(window.document.querySelector('[data-preview-id]')?.textContent).toBe('试听')
  })

  it('labels lossless audio without presenting an upstream nominal value as exact bitrate', async () => {
    const window = createWindow()
    const audio = window.document.querySelector('#preview-audio') as any
    audio.play = vi.fn(async () => undefined)
    audio.pause = vi.fn()
    audio.load = vi.fn()
    const pluginApi = createAPI(async (_path: string, body: any) => searchResponse(body.keyword))
    const request = vi.fn(async () => jsonResponse({
      token: 'token-lossless',
      stream_url: '/api/v1/plugin-previews/token-lossless',
      audio: { format: 'flac', bitrate: 2000, quality: 2000 },
    }, 201))
    const app = createSearchApp(window.document, pluginApi, request as any)
    await app.init()
    await search(window, '夜曲')

    ;(window.document.querySelector('[data-preview-id]') as any).click()
    await flushTasks()

    expect(window.document.querySelector('#preview-meta')?.textContent).toBe('FLAC · 无损')
    expect(window.document.querySelector('#preview-meta')?.textContent).not.toContain('2000 kbps')
  })

  it('plays from a click and releases on switch and stop', async () => {
    const window = createWindow()
    const audio = window.document.querySelector('#preview-audio') as any
    audio.play = vi.fn(async () => undefined)
    audio.pause = vi.fn()
    audio.load = vi.fn()

    const pluginApi = createAPI(async (_path: string, body: any) => searchResponse(body.keyword))
    let previewIndex = 0
    const request = vi.fn(async (url: string, options: any) => {
      if (url.endsWith('/api/v1/plugin-preview-sessions/gdstudio')) {
        previewIndex += 1
        return jsonResponse({
          token: `token-${previewIndex}`,
          stream_url: `/api/v1/plugin-previews/token-${previewIndex}`,
          audio: { format: 'mp3', bitrate: 320, quality: 320 },
        }, 201)
      }
      return jsonResponse({}, 200)
    })
    const app = createSearchApp(window.document, pluginApi, request as any)
    await app.init()
    await search(window, '夜曲')

    const buttons = window.document.querySelectorAll('[data-preview-id]')
    ;(buttons[0] as any).click()
    await flushTasks()
    expect(request).toHaveBeenCalledWith('/api/v1/plugin-preview-sessions/gdstudio', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer jwt-token' }),
    }))
    expect(audio.play).toHaveBeenCalledTimes(1)
    expect(audio.src).toContain('/api/v1/plugin-previews/token-1')
    expect(audio.controls).toBe(true)
    expect(window.document.querySelector('#preview-meta')?.textContent).toContain('320 kbps')

    ;(buttons[1] as any).click()
    await flushTasks()
    expect(request).toHaveBeenCalledWith('/api/v1/plugin-previews/token-1', expect.objectContaining({
      method: 'DELETE', headers: { Authorization: 'Bearer jwt-token' },
    }))
    expect(audio.play).toHaveBeenCalledTimes(2)

    ;(window.document.querySelector('#preview-stop') as any).click()
    await flushTasks()
    expect(request).toHaveBeenCalledWith('/api/v1/plugin-previews/token-2', expect.objectContaining({ method: 'DELETE' }))
    expect((window.document.querySelector('#preview-player') as any).hidden).toBe(true)
  })

  it('waits for an explicit Android user gesture after resolving audio', async () => {
    const window = createWindow('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 SongloftWebView')
    const audio = window.document.querySelector('#preview-audio') as any
    audio.play = vi.fn(async () => undefined)
    audio.pause = vi.fn()
    audio.load = vi.fn()

    const pluginApi = createAPI(async (_path: string, body: any) => searchResponse(body.keyword))
    const request = vi.fn(async () => jsonResponse({
      token: 'token-android',
      stream_url: '/api/v1/plugin-previews/token-android',
      audio: { format: 'mp3', bitrate: 320, quality: 320 },
    }, 201))
    const app = createSearchApp(window.document, pluginApi, request as any)
    await app.init()
    await search(window, '夜曲')

    ;(window.document.querySelector('[data-preview-id]') as any).click()
    await flushTasks()

    const playButton = window.document.querySelector('#preview-play') as any
    expect(audio.play).not.toHaveBeenCalled()
    expect(playButton.hidden).toBe(false)
    expect(window.document.querySelector('#status')?.textContent).toContain('点击播放')

    playButton.click()
    await flushTasks()

    expect(audio.play).toHaveBeenCalledTimes(1)
    expect(playButton.hidden).toBe(true)
    expect(window.document.querySelector('#status')?.textContent).toContain('正在试听')
  })

  it('falls back to an explicit play button when desktop autoplay is blocked', async () => {
    const window = createWindow()
    const audio = window.document.querySelector('#preview-audio') as any
    audio.play = vi.fn()
      .mockRejectedValueOnce(new Error('NotAllowedError'))
      .mockResolvedValueOnce(undefined)
    audio.pause = vi.fn()
    audio.load = vi.fn()

    const pluginApi = createAPI(async (_path: string, body: any) => searchResponse(body.keyword))
    const request = vi.fn(async () => jsonResponse({
      token: 'token-desktop',
      stream_url: '/api/v1/plugin-previews/token-desktop',
      audio: { format: 'mp3', bitrate: 320, quality: 320 },
    }, 201))
    const app = createSearchApp(window.document, pluginApi, request as any)
    await app.init()
    await search(window, '夜曲')

    ;(window.document.querySelector('[data-preview-id]') as any).click()
    await flushTasks()

    const playButton = window.document.querySelector('#preview-play') as any
    expect(audio.play).toHaveBeenCalledTimes(1)
    expect(playButton.hidden).toBe(false)
    expect(window.document.querySelector('#status')?.textContent).toContain('点击播放')
    expect(request).not.toHaveBeenCalledWith('/api/v1/plugin-previews/token-desktop', expect.anything())

    playButton.click()
    await flushTasks()

    expect(audio.play).toHaveBeenCalledTimes(2)
    expect(playButton.hidden).toBe(true)
    expect(window.document.querySelector('#status')?.textContent).toContain('正在试听')
  })

  it('shows a clear resolution error', async () => {
    const window = createWindow()
    const audio = window.document.querySelector('#preview-audio') as any
    audio.pause = vi.fn()
    audio.load = vi.fn()
    const pluginApi = createAPI(async (_path: string, body: any) => searchResponse(body.keyword))
    const request = vi.fn(async (url: string) => url.endsWith('/api/v1/plugin-preview-sessions/gdstudio')
      ? jsonResponse({ error: '插件解析试听音源失败', detail: SOURCE_UNAVAILABLE_MESSAGE }, 502)
      : jsonResponse({}, 200))
    const app = createSearchApp(window.document, pluginApi, request as any)
    await app.init()
    await search(window, '夜曲')
    ;(window.document.querySelector('[data-preview-id]') as any).click()
    await flushTasks()
    expect(window.document.querySelector('#status')?.textContent).toContain(SOURCE_UNAVAILABLE_MESSAGE)
  })

  it('hides preview controls when the host preview API is unavailable', async () => {
    const window = createWindow()
    const audio = window.document.querySelector('#preview-audio') as any
    audio.pause = vi.fn()
    audio.load = vi.fn()
    const pluginApi = createAPI(async (_path: string, body: any) => searchResponse(body.keyword))
    const request = vi.fn(async () => jsonResponse(null, 404))
    const app = createSearchApp(window.document, pluginApi, request as any)
    await app.init()
    await search(window, '夜曲')

    ;(window.document.querySelector('[data-preview-id]') as any).click()
    await flushTasks()

    expect(window.document.querySelector('[data-preview-id]')).toBeNull()
    expect(window.document.querySelector('#compatibility-notice')?.textContent).toContain('不支持插件内试听')
    expect(window.document.querySelector('#status')?.textContent).toContain('添加到曲库后播放')
  })
})

function createWindow(userAgent?: string) {
  const window = new Window({
    url: 'https://songloft.test/api/v1/jsplugin/gdstudio/',
    settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true },
  })
  if (userAgent) {
    Object.defineProperty(window.navigator, 'userAgent', { value: userAgent })
  }
  window.document.write(html)
  return window
}

function jsonResponse(body: unknown, status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  }
}

function createAPI(handler: (path: string, body: any) => Promise<any>) {
  return {
    getAuthToken: vi.fn(() => 'jwt-token'),
    apiGet: vi.fn(async () => ({ sources: { netease: true, kuwo: true, tencent: true } })),
    apiPut: vi.fn(async (_path: string, settings: any) => settings),
    apiPost: vi.fn(handler),
  }
}

async function search(window: Window, keywordValue: string) {
  const keyword = window.document.querySelector('#keyword') as any
  keyword.value = keywordValue
  window.document.querySelector('#search-form')?.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  await flushTasks()
}

function searchResponse(keyword: string) {
  return {
    keyword, page_size: 10,
    groups: [{
      source: 'netease', label: '网易云', page: 1, has_more: false,
      items: [1, 2].map(index => ({
        id: `track-${index}`, source: 'netease', dedupe_key: `gdstudio:netease:track-${index}`,
        title: `${keyword}-${index}`, artist: '歌手', album: '专辑', duration: 200, cover_id: '',
        source_data: { root_source: 'netease', identifier: `track-${index}`, url_id: `url-${index}` },
      })),
    }],
  }
}

async function flushTasks() {
  await new Promise(resolvePromise => setTimeout(resolvePromise, 0))
  await new Promise(resolvePromise => setTimeout(resolvePromise, 0))
}
