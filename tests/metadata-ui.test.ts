import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import { createSearchApp } from '../static/js/app.js'

const html = readFileSync(resolve('static/index.html'), 'utf8')

describe('metadata status UI', () => {
  it.each([
    ['complete', '元数据完整'],
    ['partial', '元数据部分缺失'],
    ['failed', '元数据补全失败'],
  ] as const)('shows %s status and keeps the song playable', async (status, label) => {
    const window = new Window({
      url: 'https://songloft.test/api/v1/jsplugin/gdstudio/',
      settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true },
    })
    window.document.write(html)
    const player = vi.fn(async () => undefined)
    const api = {
      host: { isAvailable: () => true },
      player: { setQueue: player },
      apiGet: vi.fn(async () => ({ sources: { netease: true, kuwo: true, tencent: true } })),
      apiPut: vi.fn(async (_path: string, settings: any) => settings),
      apiPost: vi.fn(async (path: string, body: any) => path === '/api/library'
        ? { song: { id: 10, type: 'remote', title: body.track.title }, metadata: { status, missing: [], errors: [] } }
        : response(body.keyword)),
    }
    const app = createSearchApp(window.document, api)
    await app.init()
    const keyword = window.document.querySelector('#keyword') as any
    keyword.value = '晴天'
    window.document.querySelector('#search-form')?.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
    await flushTasks()
    ;(window.document.querySelector('[data-library-id]') as any).click()
    await flushTasks()

    expect(window.document.querySelector('.library-badge')?.textContent).toContain(label)
    expect(player).toHaveBeenCalledWith([10], { startIndex: 0 })
  })
})

function response(keyword: string) {
  return { keyword, page_size: 10, groups: [{
    source: 'netease', label: '网易云', page: 1, has_more: false,
    items: [{ id: 'track-1', source: 'netease', dedupe_key: 'gdstudio:netease:track-1', title: keyword, artist: '周杰伦', album: '叶惠美', duration: 269, cover_id: '', source_data: { root_source: 'netease', identifier: 'track-1', url_id: 'url-1' } }],
  }] }
}

async function flushTasks() {
  await new Promise(resolvePromise => setTimeout(resolvePromise, 0))
  await new Promise(resolvePromise => setTimeout(resolvePromise, 0))
}
