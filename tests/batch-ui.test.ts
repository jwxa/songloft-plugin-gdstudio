import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import { createSearchApp } from '../static/js/app.js'

const html = readFileSync(resolve('static/index.html'), 'utf8')

describe('batch library UI', () => {
  it('selects across sources and retries only failed items', async () => {
    const window = new Window({ settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true } })
    window.document.write(html)
    let batchCalls = 0
    const api = {
      apiGet: vi.fn(async () => ({ sources: { netease: true, kuwo: true, tencent: true } })),
      apiPut: vi.fn(async (_path: string, value: any) => value),
      apiPost: vi.fn(async (path: string, body: any) => {
        if (path === '/api/library/batch') {
          batchCalls += 1
          return { items: body.tracks.map((track: any, index: number) => index === 1 && batchCalls === 1
            ? { dedupe_key: track.dedupe_key, status: 'failed', detail: '创建失败' }
            : { dedupe_key: track.dedupe_key, status: 'success', song: { id: index + 1, title: track.title }, metadata: { status: 'partial' } }) }
        }
        return { keyword: body.keyword, page_size: 10, groups: ['netease', 'kuwo'].map((source, index) => ({ source, label: source, page: 1, has_more: false, items: [{ id: `${source}-1`, source, dedupe_key: `gdstudio:${source}:${source}-1`, title: `${body.keyword}-${index}`, artist: '歌手', album: '专辑', duration: 1, cover_id: '', source_data: { root_source: source, identifier: '1', url_id: 'u' } }] })) }
      }),
    }
    const app = createSearchApp(window.document, api)
    await app.init()
    const keyword = window.document.querySelector('#keyword') as any
    keyword.value = '测试'
    window.document.querySelector('#search-form')?.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
    await flushTasks()
    const checkboxes = [...window.document.querySelectorAll('[data-select-source]')] as any[]
    checkboxes.forEach(input => { input.checked = true; input.dispatchEvent(new window.Event('change', { bubbles: true })) })
    expect(window.document.querySelector('#selection-count')?.textContent).toBe('2')
    ;(window.document.querySelector('#batch-add') as any).click()
    await flushTasks()
    expect((window.document.querySelector('#batch-retry') as any)?.hidden).toBe(false)
    ;(window.document.querySelector('#batch-retry') as any).click()
    await flushTasks()
    expect(batchCalls).toBe(2)
    expect((window.document.querySelector('#batch-retry') as any)?.hidden).toBe(true)
  })
})

async function flushTasks() {
  await new Promise(resolvePromise => setTimeout(resolvePromise, 0))
  await new Promise(resolvePromise => setTimeout(resolvePromise, 0))
}
