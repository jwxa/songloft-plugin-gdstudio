const SOURCE_IDS = ['netease', 'kuwo', 'tencent']
const SOURCE_LABELS = { netease: '网易云', kuwo: '酷我', tencent: '腾讯' }

export function createSearchApp(documentRef, pluginApi, request = globalThis.fetch) {
  const state = {
    keyword: '',
    filter: 'all',
    pages: { netease: 1, kuwo: 1, tencent: 1 },
    settings: { sources: { netease: true, kuwo: true, tencent: true } },
    groups: {},
    loading: false,
    preview: null,
    previewLoadingKey: '',
    library: {},
    adding: new Set(),
    downloading: new Set(),
    downloaded: new Set(),
    selected: new Set(),
    failedBatch: new Set(),
    downloadJobs: [],
    activeDownloads: 0,
    maxDownloadConcurrency: 2,
    capabilities: { preview: true, downloadMode: 'background', downloadProgress: true },
  }

  const element = selector => documentRef.querySelector(selector)

  async function init() {
    bindEvents()
    documentRef.body.classList.add('consent-open')
    await loadSettings()
    renderFilters()
    renderCapabilities()
  }

  function bindEvents() {
    const consentCheckbox = element('#consent-checkbox')
    const consentAccept = element('#consent-accept')
    consentCheckbox.addEventListener('change', () => {
      consentAccept.disabled = !consentCheckbox.checked
    })
    consentAccept.addEventListener('click', () => {
      if (!consentCheckbox.checked) return
      element('#consent-dialog').hidden = true
      documentRef.body.classList.remove('consent-open')
    })

    element('#search-form').addEventListener('submit', async event => {
      event.preventDefault()
      state.keyword = element('#keyword').value.trim()
      if (!state.keyword) return
      state.pages = { netease: 1, kuwo: 1, tencent: 1 }
      state.groups = {}
      await runSearch(state.filter)
    })

    documentRef.querySelectorAll('[data-source]').forEach(button => {
      button.addEventListener('click', async () => {
        if (button.disabled) return
        state.filter = button.dataset.source
        renderFilters()
        if (state.keyword) {
          state.pages = { netease: 1, kuwo: 1, tencent: 1 }
          state.groups = {}
          await runSearch(state.filter)
        }
      })
    })

    documentRef.querySelectorAll('[data-setting-source]').forEach(input => {
      input.addEventListener('change', async () => {
        const source = input.dataset.settingSource
        state.settings.sources[source] = input.checked
        state.settings = await pluginApi.apiPut('/api/settings', state.settings)
        if (state.filter !== 'all' && !state.settings.sources[state.filter]) {
          state.filter = 'all'
        }
        renderSettings()
        renderFilters()
      })
    })

    element('#preview-play').addEventListener('click', () => void playPreview())
    element('#preview-stop').addEventListener('click', () => stopPreview(true))
    element('#batch-add').addEventListener('click', () => void addSelected())
    element('#batch-download').addEventListener('click', () => queueDownloads(findSelectedTracks(state.selected)))
    element('#batch-retry').addEventListener('click', () => void retryFailed())
    element('#save-download-settings').addEventListener('click', () => void saveDownloadSettings())
    element('#preview-audio').addEventListener('error', () => {
      setStatus('试听播放失败，请停止后重试或选择其他歌曲。', true)
    })
    documentRef.querySelectorAll('[data-error-close]').forEach(button => {
      button.addEventListener('click', closeErrorDialog)
    })
    documentRef.defaultView?.addEventListener('pagehide', () => {
      void releasePreviewSession()
    })
  }

  async function loadSettings() {
    state.settings = await pluginApi.apiGet('/api/settings')
    const downloadSettings = await pluginApi.apiGet('/api/download-settings').catch(() => ({}))
    element('#download-template').value = downloadSettings.path_template || 'downloads/{artist}-{album}/{title}'
    state.maxDownloadConcurrency = Number(downloadSettings.max_concurrency) || 2
    element('#download-concurrency').value = String(state.maxDownloadConcurrency)
    const info = await pluginApi.apiGet('/api/info').catch(() => null)
    if (info) element('#plugin-info').textContent = `插件 ${info.plugin_version} · musicdl ${info.musicdl_version} · GDStudio 协议 ${info.protocol_version}`
    const capabilities = await pluginApi.apiGet('/api/capabilities').catch(() => null)
    if (capabilities?.download_mode) {
      state.capabilities.downloadMode = capabilities.download_mode
      state.capabilities.downloadProgress = !!capabilities.download_progress
    }
    renderSettings()
  }

  function renderCapabilities() {
    const messages = []
    if (!state.capabilities.preview) messages.push('当前 Songloft 不支持插件内试听，请先添加到曲库后手动返回主播放器播放。')
    if (state.capabilities.downloadMode === 'legacy') messages.push('当前 Songloft 使用兼容下载模式，下载期间不显示实时字节进度。')
    if (state.capabilities.downloadMode === 'unavailable') messages.push('当前 Songloft 不支持插件下载，下载按钮已隐藏。')
    const notice = element('#compatibility-notice')
    notice.textContent = messages.join(' ')
    notice.hidden = messages.length === 0
    element('#batch-download').hidden = state.capabilities.downloadMode === 'unavailable'
    element('#save-download-settings').hidden = state.capabilities.downloadMode === 'unavailable'
  }

  async function saveDownloadSettings() {
    try {
      const saved = await pluginApi.apiPut('/api/download-settings', {
        path_template: element('#download-template').value.trim(),
        max_concurrency: Number(element('#download-concurrency').value),
      })
      element('#download-template').value = saved.path_template
      state.maxDownloadConcurrency = saved.max_concurrency
      element('#download-concurrency').value = String(saved.max_concurrency)
      pumpDownloadQueue()
      setStatus('下载设置已保存。')
    } catch (error) {
      setStatus(`下载设置保存失败：${error.message || String(error)}`, true)
    }
  }

  async function runSearch(source) {
    setLoading(true)
    try {
      const response = await pluginApi.apiPost('/api/search', {
        keyword: state.keyword,
        source,
        pages: state.pages,
        page_size: 10,
      })
      for (const group of response.groups) {
        state.groups[group.source] = group
        state.pages[group.source] = group.page
      }
      renderResults()
      setStatus(response.groups.length === 0 ? '没有启用的搜索来源。' : '')
    } catch (error) {
      setStatus(`搜索失败：${error.message || String(error)}`, true)
    } finally {
      setLoading(false)
    }
  }

  async function loadMore(source) {
    setLoading(true)
    try {
      const nextPage = (state.pages[source] || 1) + 1
      const response = await pluginApi.apiPost('/api/search', {
        keyword: state.keyword,
        source,
        pages: { [source]: nextPage },
        page_size: 10,
      })
      const nextGroup = response.groups[0]
      const current = state.groups[source]
      state.groups[source] = {
        ...nextGroup,
        items: [...(current?.items || []), ...nextGroup.items],
      }
      state.pages[source] = nextPage
      renderResults()
    } catch (error) {
      setStatus(`加载更多失败：${error.message || String(error)}`, true)
    } finally {
      setLoading(false)
    }
  }

  function renderSettings() {
    documentRef.querySelectorAll('[data-setting-source]').forEach(input => {
      input.checked = Boolean(state.settings.sources[input.dataset.settingSource])
    })
  }

  function renderFilters() {
    documentRef.querySelectorAll('[data-source]').forEach(button => {
      const source = button.dataset.source
      button.classList.toggle('active', source === state.filter)
      button.disabled = source !== 'all' && !state.settings.sources[source]
      button.setAttribute('aria-pressed', String(source === state.filter))
    })
  }

  function renderResults() {
    const resultRoot = element('#results')
    const groups = state.filter === 'all'
      ? SOURCE_IDS.map(source => state.groups[source]).filter(Boolean)
      : [state.groups[state.filter]].filter(Boolean)

    resultRoot.innerHTML = groups.map(group => `
      <article class="source-group" data-result-source="${group.source}">
        <div class="group-header">
          <div>
            <h3>${escapeHTML(group.label)}</h3>
            <p class="group-summary">已加载 ${group.items.length} 首 · 第 ${group.page} 页</p>
          </div>
          <span class="source-badge">${escapeHTML(SOURCE_LABELS[group.source])}</span>
        </div>
        ${group.error
          ? `<div class="source-error"><p class="source-error-summary">${escapeHTML(friendlySearchError(group.error))}</p><button class="text-button" type="button" data-error-detail="${group.source}">查看详情</button></div>`
          : `<div class="track-list">${group.items.map(renderTrack).join('')}</div>`}
        ${group.has_more && !group.error
          ? `<button class="secondary-button" type="button" data-load-more="${group.source}">加载更多</button>`
          : ''}
      </article>
    `).join('')

    resultRoot.querySelectorAll('[data-load-more]').forEach(button => {
      button.addEventListener('click', () => loadMore(button.dataset.loadMore))
    })
    resultRoot.querySelectorAll('[data-error-detail]').forEach(button => {
      button.addEventListener('click', () => showErrorDialog(state.groups[button.dataset.errorDetail]))
    })
    resultRoot.querySelectorAll('[data-preview-source]').forEach(button => {
      button.addEventListener('click', () => {
        const group = state.groups[button.dataset.previewSource]
        const track = group?.items.find(item => item.id === button.dataset.previewId)
        if (track) void startPreview(track)
      })
    })
    resultRoot.querySelectorAll('[data-library-source]').forEach(button => {
      button.addEventListener('click', () => {
        const track = findTrack(button.dataset.librarySource, button.dataset.libraryId)
        if (track) void addOrPlay(track)
      })
    })
    resultRoot.querySelectorAll('[data-download-source]').forEach(button => {
      button.addEventListener('click', () => {
        const track = findTrack(button.dataset.downloadSource, button.dataset.downloadId)
        if (track) void downloadTrack(track)
      })
    })
    resultRoot.querySelectorAll('[data-select-source]').forEach(input => {
      input.checked = state.selected.has(input.dataset.selectKey)
      input.addEventListener('change', () => {
        if (input.checked) state.selected.add(input.dataset.selectKey)
        else state.selected.delete(input.dataset.selectKey)
        renderBatchToolbar()
      })
    })
    renderBatchToolbar()
  }

  function showErrorDialog(group) {
    if (!group?.error) return
    element('#error-dialog-title').textContent = `${SOURCE_LABELS[group.source] || group.label || '来源'}查询失败详情`
    element('#error-detail').textContent = group.error
    element('#error-dialog').hidden = false
  }

  function closeErrorDialog() {
    element('#error-dialog').hidden = true
  }

  function renderTrack(track) {
    const libraryEntry = state.library[track.dedupe_key]
    const librarySong = libraryEntry?.song || libraryEntry
    const metadataStatus = libraryEntry?.metadata?.status
    const isAdding = state.adding.has(track.dedupe_key)
    const isPreviewLoading = state.previewLoadingKey === track.dedupe_key
    return `
      <div class="track-row">
        <label class="track-select">
          <input type="checkbox" data-select-source="${track.source}" data-select-key="${escapeHTML(track.dedupe_key)}" aria-label="选择 ${escapeHTML(track.title)}">
          <span class="sr-only">选择</span>
        </label>
        <div class="track-copy">
          <div class="track-title">${escapeHTML(track.title)}</div>
          <div class="track-meta">${escapeHTML(track.artist)} · ${escapeHTML(track.album)}${librarySong ? ` · <span class="library-badge">已入库${metadataStatus ? ` · 元数据${metadataStatusLabel(metadataStatus)}` : ''}</span>` : ''}</div>
        </div>
        <div class="track-actions">
          <span class="track-duration">${formatDuration(track.duration)}</span>
          ${state.capabilities.preview ? `<button class="secondary-button${isPreviewLoading ? ' is-loading' : ''}" type="button" data-preview-source="${track.source}" data-preview-id="${escapeHTML(track.id)}" ${isPreviewLoading ? 'disabled aria-busy="true"' : 'aria-busy="false"'}>${isPreviewLoading ? '解析中…' : '试听'}</button>` : ''}
          <button class="primary-button library-button" type="button" data-library-source="${track.source}" data-library-id="${escapeHTML(track.id)}" ${isAdding ? 'disabled' : ''}>${isAdding ? '正在入库…' : librarySong ? '主播放器播放' : '添加到曲库'}</button>
          ${state.capabilities.downloadMode !== 'unavailable' ? `<button class="secondary-button download-button" type="button" data-download-source="${track.source}" data-download-id="${escapeHTML(track.id)}" ${state.downloading.has(track.dedupe_key) ? 'disabled' : ''}>${state.downloading.has(track.dedupe_key) ? '正在下载…' : state.downloaded.has(track.dedupe_key) ? '已下载' : '下载到本地'}</button>` : ''}
        </div>
      </div>
    `
  }

  function renderBatchToolbar() {
    element('#selection-count').textContent = String(state.selected.size)
    element('#batch-add').disabled = state.selected.size === 0 || state.adding.size > 0
    element('#batch-download').disabled = state.selected.size === 0
    element('#batch-retry').hidden = state.failedBatch.size === 0
  }

  function findSelectedTracks(keys) {
    const wanted = new Set(keys)
    return SOURCE_IDS.flatMap(source => state.groups[source]?.items || []).filter(track => wanted.has(track.dedupe_key))
  }

  async function addSelected() {
    const tracks = findSelectedTracks(state.selected)
    if (!tracks.length) return
    await addBatch(tracks)
  }

  async function retryFailed() {
    const tracks = findSelectedTracks(state.failedBatch)
    if (!tracks.length) return
    state.selected = new Set(state.failedBatch)
    await addBatch(tracks)
  }

  async function addBatch(tracks) {
    setStatus(`正在逐项添加 ${tracks.length} 首歌曲…`)
    try {
      const response = await pluginApi.apiPost('/api/library/batch', { tracks })
      state.failedBatch = new Set()
      for (const item of response.items || []) {
        if (item.song) state.library[item.dedupe_key] = { song: item.song, metadata: item.metadata }
        if (item.status === 'failed') state.failedBatch.add(item.dedupe_key)
      }
      state.selected = new Set(state.failedBatch)
      setStatus(state.failedBatch.size ? `批量完成：${tracks.length - state.failedBatch.size} 首成功，${state.failedBatch.size} 首失败，可仅重试失败项。` : `批量完成：${tracks.length} 首已添加或复用。`)
      renderResults()
    } catch (error) {
      setStatus(`批量添加失败：${error.message || String(error)}`, true)
    }
  }

  function findTrack(source, id) {
    return state.groups[source]?.items.find(item => item.id === id)
  }

  async function addOrPlay(track) {
    const existing = state.library[track.dedupe_key]
    if (existing) {
      await playLibrarySong(existing.song || existing, track)
      return
    }
    if (state.adding.has(track.dedupe_key)) return

    state.adding.add(track.dedupe_key)
    renderResults()
    setStatus(`正在将《${track.title}》添加到曲库…`)
    try {
      const result = await pluginApi.apiPost('/api/library', { track })
      state.library[track.dedupe_key] = result
      setStatus(`《${track.title}》已入库，元数据${metadataStatusLabel(result.metadata?.status)}。`)
      await playLibrarySong(result.song || result, track)
    } catch (error) {
      setStatus(`添加到曲库失败：${error.message || String(error)}`, true)
    } finally {
      state.adding.delete(track.dedupe_key)
      renderResults()
    }
  }

  async function playLibrarySong(song, track) {
    const hostAvailable = typeof pluginApi.host?.isAvailable === 'function' && pluginApi.host.isAvailable()
    if (!hostAvailable || typeof pluginApi.player?.setQueue !== 'function') {
      setStatus(`《${track.title}》已入库，可返回 Songloft 主界面播放。`)
      return
    }
    try {
      await stopPreview(false)
      await pluginApi.player.setQueue([song.id], { startIndex: 0 })
      if (typeof pluginApi.host?.openPlayer === 'function') await pluginApi.host.openPlayer()
      setStatus(`已交给 Songloft 主播放器播放《${track.title}》。`)
    } catch (error) {
      setStatus(`《${track.title}》已入库，但主播放器启动失败：${error.message || String(error)}`, true)
    }
  }

  async function downloadTrack(track) {
    queueDownloads([track])
  }

  function queueDownloads(tracks) {
    let added = 0
    for (const track of tracks) {
      if (state.downloading.has(track.dedupe_key) || state.downloaded.has(track.dedupe_key)) continue
      state.downloading.add(track.dedupe_key)
      state.downloadJobs.push({
        id: `${track.dedupe_key}:${Date.now()}:${state.downloadJobs.length}`,
        track,
        status: 'queued',
        phase: 'queued',
        downloadedBytes: 0,
        totalBytes: 0,
        error: '',
      })
      added++
    }
    if (added === 0) {
      setStatus('所选歌曲已在下载队列中或已下载。')
      return
    }
    state.selected.clear()
    setStatus(`已加入下载队列 ${added} 首，最大并发 ${state.maxDownloadConcurrency}。`)
    renderResults()
    renderDownloadQueue()
    pumpDownloadQueue()
  }

  function pumpDownloadQueue() {
    while (state.activeDownloads < state.maxDownloadConcurrency) {
      const job = state.downloadJobs.find(item => item.status === 'queued')
      if (!job) break
      state.activeDownloads++
      job.status = 'running'
      job.phase = 'preparing'
      renderDownloadQueue()
      void runDownloadJob(job).finally(() => {
        state.activeDownloads--
        state.downloading.delete(job.track.dedupe_key)
        renderResults()
        renderDownloadQueue()
        pumpDownloadQueue()
      })
    }
  }

  async function runDownloadJob(job) {
    try {
      const result = await pluginApi.apiPost('/api/download', { track: job.track })
      state.library[job.track.dedupe_key] = { song: result.song, metadata: result.metadata }
      if (result.status === 'failed') throw new Error(result.detail || '未知原因')
      if (result.status === 'already_downloaded') {
        job.status = 'completed'
        job.phase = 'completed'
        state.downloaded.add(job.track.dedupe_key)
        return
      }
      if (!result.task?.id) throw new Error('Songloft 未返回下载任务')
      job.taskId = result.task.id
      applyTaskSnapshot(job, result.task)
      while (job.status !== 'completed' && job.status !== 'failed') {
        const snapshot = await pluginApi.apiGet(`/api/download-status/${encodeURIComponent(job.taskId)}`)
        applyTaskSnapshot(job, snapshot)
        renderDownloadQueue()
        if (job.status === 'completed' || job.status === 'failed') break
        await wait(750)
      }
      if (job.status === 'failed') throw new Error(job.error || '下载任务失败')
      state.downloaded.add(job.track.dedupe_key)
      setStatus(`《${job.track.title}》已下载到曲库。`)
    } catch (error) {
      job.status = 'failed'
      job.phase = 'failed'
      job.error = error.message || String(error)
      setStatus(`下载《${job.track.title}》失败：${job.error}`, true)
    }
  }

  function applyTaskSnapshot(job, snapshot) {
    job.status = snapshot.status === 'queued' ? 'running' : snapshot.status
    job.phase = snapshot.phase
    job.downloadedBytes = Number(snapshot.downloaded_bytes) || 0
    job.totalBytes = Number(snapshot.total_bytes) || 0
    job.error = snapshot.error || ''
    job.path = snapshot.path || ''
  }

  function renderDownloadQueue() {
    const root = element('#download-queue')
    const list = element('#download-jobs')
    root.hidden = state.downloadJobs.length === 0
    element('#download-queue-summary').textContent = `${state.downloadJobs.filter(job => job.status === 'completed').length} 已完成 · ${state.activeDownloads} 进行中 · ${state.downloadJobs.filter(job => job.status === 'queued').length} 排队中`
    list.innerHTML = state.downloadJobs.map(job => {
      const percent = job.totalBytes > 0 ? Math.min(100, Math.round(job.downloadedBytes * 100 / job.totalBytes)) : 0
      const progress = job.totalBytes > 0
        ? `<progress max="100" value="${percent}">${percent}%</progress><span>${percent}% · ${formatBytes(job.downloadedBytes)} / ${formatBytes(job.totalBytes)}</span>`
        : `<progress>${escapeHTML(downloadPhaseLabel(job.phase))}</progress><span>${escapeHTML(downloadPhaseLabel(job.phase))}</span>`
      return `<article class="download-job download-job-${job.status}">
        <div class="download-job-copy"><strong>${escapeHTML(job.track.title)}</strong><span>${escapeHTML(job.track.artist)} · ${escapeHTML(downloadStatusLabel(job.status))}</span></div>
        <div class="download-progress">${progress}</div>
        ${job.error ? `<p class="error-message">${escapeHTML(job.error)}</p>` : ''}
      </article>`
    }).join('')
  }

  function metadataStatusLabel(status) {
    return { complete: '完整', partial: '部分缺失', failed: '补全失败' }[status] || '未补全'
  }

  function setLoading(loading) {
    state.loading = loading
    element('#search-button').disabled = loading
    if (loading) setStatus('正在搜索…')
  }

  function setStatus(message, isError = false) {
    const status = element('#status')
    status.textContent = message
    status.classList.toggle('error-message', isError)
  }

  async function startPreview(track) {
    await stopPreview(false)
    state.previewLoadingKey = track.dedupe_key
    renderResults()
    const player = element('#preview-player')
    element('#preview-title').textContent = `${track.title} — ${track.artist}`
    element('#preview-meta').textContent = '正在解析最高可用音质…'
    player.hidden = false
    setStatus(`正在解析《${track.title}》试听音源…`)
    try {
      const session = await requestHostJSON('/plugin-preview-sessions/gdstudio', {
        method: 'POST',
        body: JSON.stringify({ source_data: track.source_data }),
      })
      state.preview = { session, track }
      const audio = element('#preview-audio')
      element('#preview-meta').textContent = formatAudioQuality(session.audio)
      player.hidden = false
      audio.src = session.stream_url
      audio.load()
      if (requiresExplicitPreviewGesture()) {
        showPreviewPlayPrompt(track)
      } else {
        await playPreview(true)
      }
    } catch (error) {
      await releasePreviewSession()
      element('#preview-player').hidden = true
      const detail = error.message || String(error)
      if (detail.includes('HTTP 404') || detail.includes('404 page not found')) {
        state.capabilities.preview = false
        renderCapabilities()
        setStatus('当前 Songloft 不支持插件内试听，请添加到曲库后播放。', true)
      } else {
        setStatus(`无法开始试听：${detail}`, true)
      }
    } finally {
      if (state.previewLoadingKey === track.dedupe_key) state.previewLoadingKey = ''
      renderResults()
    }
  }

  async function stopPreview(showStatus) {
    const audio = element('#preview-audio')
    const playButton = element('#preview-play')
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    playButton.hidden = true
    playButton.disabled = false
    await releasePreviewSession()
    element('#preview-player').hidden = true
    if (showStatus) setStatus('试听已停止。')
  }

  async function playPreview(allowGestureFallback = false) {
    const preview = state.preview
    if (!preview) return false
    const playButton = element('#preview-play')
    playButton.disabled = true
    try {
      await element('#preview-audio').play()
      playButton.hidden = true
      setStatus(`正在试听《${preview.track.title}》`)
      return true
    } catch (error) {
      playButton.hidden = false
      if (allowGestureFallback) {
        setStatus(`音源已就绪，请点击播放试听《${preview.track.title}》。`)
      } else {
        setStatus(`试听播放失败：${error.message || String(error)}`, true)
      }
      return false
    } finally {
      playButton.disabled = false
    }
  }

  function showPreviewPlayPrompt(track) {
    element('#preview-play').hidden = false
    setStatus(`音源已就绪，请点击播放试听《${track.title}》。`)
  }

  function requiresExplicitPreviewGesture() {
    const userAgent = documentRef.defaultView?.navigator?.userAgent || ''
    return /Android|iPhone|iPad|iPod/i.test(userAgent)
  }

  async function releasePreviewSession() {
    const preview = state.preview
    state.preview = null
    if (!preview?.session?.stream_url || typeof request !== 'function') return
    const token = pluginApi.getAuthToken?.()
    try {
      await request(preview.session.stream_url, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        keepalive: true,
      })
    } catch {
      // 主动释放失败时由服务端 TTL 兜底。
    }
  }

  async function requestHostJSON(path, options) {
    if (typeof request !== 'function') throw new Error('宿主请求能力不可用')
    const token = pluginApi.getAuthToken?.()
    const response = await request(hostAPIURL(documentRef, path), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options?.headers || {}),
      },
    })
    const text = await response.text()
    let body = null
    if (text) {
      try { body = JSON.parse(text) } catch { body = null }
    }
    if (!response.ok) throw new Error(body?.detail || body?.error || `HTTP ${response.status}`)
    return body
  }

  return { init, runSearch, loadMore, startPreview, stopPreview, addOrPlay, queueDownloads, state }
}

function hostAPIURL(documentRef, path) {
  const marker = '/api/v1/jsplugin/'
  const pathname = documentRef.location?.pathname || ''
  const markerIndex = pathname.indexOf(marker)
  const basePath = markerIndex >= 0 ? pathname.slice(0, markerIndex) : ''
  return `${basePath}/api/v1${path}`
}

export function formatDuration(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0))
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

export function formatAudioQuality(audio = {}) {
  const format = String(audio.format || '未知格式').toUpperCase()
  if (['FLAC', 'APE', 'ALAC', 'WAV', 'AIFF'].includes(format)) return `${format} · 无损`
  const bitrate = Number(audio.bitrate || audio.quality) || 0
  return `${format}${bitrate ? ` · ${bitrate} kbps` : ''}`
}

export function friendlySearchError(error) {
  const detail = String(error || '').toLowerCase()
  if (detail.includes('deadline exceeded') || detail.includes('timeout') || detail.includes('timed out')) return '请求超时，请稍后重试。'
  if (detail.includes('429') || detail.includes('too many requests')) return '请求过于频繁，请稍后再试。'
  if (/http 5\d\d/.test(detail) || detail.includes('bad gateway') || detail.includes('service unavailable')) return '上游服务暂时不可用，请稍后重试。'
  if (detail.includes('no such host') || detail.includes('connection refused') || detail.includes('network')) return '网络连接失败，请检查 Songloft 服务端网络。'
  return '该来源查询失败，请稍后重试。'
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function downloadPhaseLabel(phase) {
  return { queued: '等待宿主任务', preparing: '准备音源', downloading: '正在下载', finalizing: '写入曲库', completed: '已完成', failed: '失败' }[phase] || '处理中'
}

function downloadStatusLabel(status) {
  return { queued: '排队中', running: '下载中', completed: '已完成', failed: '失败' }[status] || status
}

export function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

if (typeof document !== 'undefined' && globalThis.SongloftPlugin) {
  document.addEventListener('DOMContentLoaded', () => {
    createSearchApp(document, globalThis.SongloftPlugin).init()
  })
}
