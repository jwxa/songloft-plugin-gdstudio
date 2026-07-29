import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import { createSearchApp } from '../static/js/app.js'

const html = readFileSync(resolve('static/index.html'), 'utf8')
const css = readFileSync(resolve('static/css/style.css'), 'utf8')

describe.each([1280, 390])('search page at %ipx', viewportWidth => {
  it('supports search, source filtering, pagination and settings', async () => {
    const window = new Window({
      url: 'https://songloft.test/api/v1/jsplugin/gdstudio/',
      settings: {
        disableCSSFileLoading: true,
        disableJavaScriptFileLoading: true,
      },
    })
    Object.defineProperty(window, 'innerWidth', { value: viewportWidth, configurable: true })
    window.document.write(html)

    const api = createFakeAPI()
    const app = createSearchApp(window.document, api)
    await app.init()

    expect((window.document.querySelector('[data-source="tencent"]') as any).disabled).toBe(false)
    expect((window.document.querySelector('[data-setting-source="tencent"]') as any).disabled).toBe(false)

    const keyword = window.document.querySelector('#keyword') as any
    keyword.value = '夜曲'
    window.document.querySelector('#search-form')?.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
    await flushTasks()

    expect(window.document.querySelectorAll('[data-result-source]')).toHaveLength(3)
    expect(window.document.querySelector('[data-result-source="netease"] .track-title')?.textContent).toContain('夜曲')

    const loadMore = window.document.querySelector('[data-load-more="netease"]') as any
    loadMore.click()
    await flushTasks()
    expect(api.apiPost).toHaveBeenLastCalledWith('/api/search', expect.objectContaining({
      source: 'netease',
      pages: { netease: 2 },
    }))
    expect(window.document.querySelectorAll('[data-result-source="netease"] .track-row')).toHaveLength(20)

    const kuwoSetting = window.document.querySelector('[data-setting-source="kuwo"]') as any
    kuwoSetting.checked = false
    kuwoSetting.dispatchEvent(new window.Event('change', { bubbles: true }) as any)
    await flushTasks()
    expect(api.apiPut).toHaveBeenCalled()
    expect((window.document.querySelector('[data-source="kuwo"]') as any).disabled).toBe(true)
  })
})

it('contains a narrow-screen layout breakpoint', () => {
  expect(css).toContain('@media (max-width: 600px)')
  expect(css).toContain('grid-template-columns: repeat(2')
})

it('shows a clear personal-research and no-distribution notice', () => {
  expect(html).toContain('仅供个人研究 · 禁止传播')
  expect(html).toContain('仅处理你已获合法授权的内容')
  expect(html).not.toContain('仅限非商业使用</span>')
})

it('requires checking the usage notice before entering the page', async () => {
  const window = new Window({ url: 'https://songloft.test/api/v1/jsplugin/gdstudio/', settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true } })
  window.document.write(html)
  const app = createSearchApp(window.document, createFakeAPI())
  await app.init()

  const dialog = window.document.querySelector('#consent-dialog') as any
  const checkbox = window.document.querySelector('#consent-checkbox') as any
  const accept = window.document.querySelector('#consent-accept') as any
  expect(dialog.hidden).toBe(false)
  expect(accept.disabled).toBe(true)
  accept.click()
  expect(dialog.hidden).toBe(false)
  checkbox.checked = true
  checkbox.dispatchEvent(new window.Event('change', { bubbles: true }) as any)
  expect(accept.disabled).toBe(false)
  accept.click()
  expect(dialog.hidden).toBe(true)
})

it('only uses Songloft theme container variables that exist in common.css', () => {
  expect(css).toContain('var(--md-surface-1')
  expect(css).toContain('var(--md-primary-container')
  expect(css).toContain('var(--md-on-primary-container')
  expect(css).not.toContain('var(--md-surface-container')
  expect(css).not.toContain('var(--md-secondary-container')
  expect(css).not.toContain('var(--md-on-secondary-container')
  expect(css).not.toContain('var(--md-tertiary-container')
  expect(css).not.toContain('var(--md-on-tertiary-container')
})

it('keeps song titles left aligned in the flexible content column', () => {
  expect(css).toMatch(/\.track-copy\s*\{[^}]*flex:\s*1 1 0;[^}]*text-align:\s*left;/s)
})

it('shows a friendly search error and reveals technical details only in a dialog', async () => {
  const window = new Window({ url: 'https://songloft.test/api/v1/jsplugin/gdstudio/', settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true } })
  window.document.write(html)
  const detail = 'Get "https://music-api.gdstudio.xyz/api.php?types=search": context deadline exceeded'
  const api = createFakeAPI()
  api.apiPost.mockResolvedValueOnce({ keyword: '可不可以', page_size: 10, groups: [{ source: 'netease', label: '网易云', page: 1, has_more: false, items: [], error: detail }] } as any)
  const app = createSearchApp(window.document, api)
  await app.init()
  app.state.keyword = '可不可以'
  await app.runSearch('netease')

  expect(window.document.querySelector('.source-error-summary')?.textContent).toContain('请求超时，请稍后重试')
  expect(window.document.querySelector('#results')?.textContent).not.toContain('context deadline exceeded')
  ;(window.document.querySelector('[data-error-detail="netease"]') as any).click()
  expect((window.document.querySelector('#error-dialog') as any).hidden).toBe(false)
  expect(window.document.querySelector('#error-detail')?.textContent).toContain(detail)
})

function createFakeAPI() {
  let settings = { sources: { netease: true, kuwo: true, tencent: true } }
  return {
    apiGet: vi.fn(async () => structuredClone(settings)),
    apiPut: vi.fn(async (_path: string, next: typeof settings) => {
      settings = structuredClone(next)
      return structuredClone(settings)
    }),
    apiPost: vi.fn(async (_path: string, request: any) => {
      const sources = request.source === 'all' ? ['netease', 'kuwo', 'tencent'] : [request.source]
      return {
        keyword: request.keyword,
        page_size: 10,
        groups: sources.map((source: string) => {
          const page = request.pages?.[source] ?? 1
          return {
            source,
            label: source,
            page,
            has_more: page < 2,
            items: Array.from({ length: 10 }, (_, index) => ({
              id: `${source}-${page}-${index}`,
              source,
              dedupe_key: `gdstudio:${source}:${source}-${page}-${index}`,
              title: `${request.keyword}-${page}-${index}`,
              artist: '歌手',
              album: '专辑',
              duration: 200,
              cover_id: '',
              source_data: { root_source: source, identifier: `${source}-${page}-${index}`, url_id: `${source}-url-${page}-${index}` },
            })),
          }
        }),
      }
    }),
  }
}

async function flushTasks() {
  await new Promise(resolvePromise => setTimeout(resolvePromise, 0))
  await new Promise(resolvePromise => setTimeout(resolvePromise, 0))
}
