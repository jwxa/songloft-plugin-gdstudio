import { AVAILABLE_SOURCE_IDS, SOURCE_IDS } from './types'
import type { PluginSettings, PluginStorage, SourceId } from './types'

const SETTINGS_KEY = 'settings'

export const DEFAULT_SETTINGS: PluginSettings = {
  sources: {
    netease: true,
    kuwo: true,
    tencent: true,
  },
}

export const DEFAULT_DOWNLOAD_TEMPLATE = 'downloads/{artist}-{album}/{title}'
export const DEFAULT_DOWNLOAD_CONCURRENCY = 2

export function validatePathTemplate(input: unknown): string {
  if (typeof input !== 'string') throw new Error('path_template 必须是字符串')
  const template = input.trim()
  if (!template || template.length > 240) throw new Error('path_template 不能为空且长度不能超过 240')
  if (template.startsWith('/') || template.startsWith('\\') || /^[A-Za-z]:/.test(template)) throw new Error('path_template 必须是相对路径')
  if (template.includes('\\') || template.split('/').some(part => part === '..' || part === '')) throw new Error('path_template 含有非法路径段')
  return template
}

export function validateDownloadConcurrency(input: unknown): number {
  const value = Number(input)
  if (!Number.isInteger(value) || value < 1 || value > 3) throw new Error('max_concurrency 必须是 1 到 3 的整数')
  return value
}

export class SettingsService {
  constructor(private readonly storage: PluginStorage) {}

  async get(): Promise<PluginSettings> {
    const stored = await this.storage.get(SETTINGS_KEY)
    return normalizeSettings(stored)
  }

  async save(input: unknown): Promise<PluginSettings> {
    const settings = normalizeSettings(input)
    await this.storage.set(SETTINGS_KEY, settings)
    return settings
  }
}

export function normalizeSettings(input: unknown): PluginSettings {
  const inputSources = isRecord(input) && isRecord(input.sources) ? input.sources : {}
  const sources = { ...DEFAULT_SETTINGS.sources }

  for (const source of SOURCE_IDS) {
    if (typeof inputSources[source] === 'boolean') {
      sources[source] = inputSources[source]
    }
  }

  for (const source of SOURCE_IDS) {
    if (!(AVAILABLE_SOURCE_IDS as readonly string[]).includes(source)) sources[source] = false
  }

  return { sources: sources as Record<SourceId, boolean> }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
