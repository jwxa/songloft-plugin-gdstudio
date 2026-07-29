import type { HTTPRequest, HTTPResponse, Router } from '@songloft/plugin-sdk'
import type { PluginStorage } from '../src/types'

export class MemoryStorage implements PluginStorage {
  readonly values = new Map<string, unknown>()

  async get(key: string): Promise<unknown> {
    return this.values.get(key) ?? null
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value))
  }
}

export async function requestJSON(router: Router, method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const request: HTTPRequest = {
    method,
    path,
    headers: {},
    query: '',
    body: body === undefined ? null : new TextEncoder().encode(JSON.stringify(body)),
  }
  const response = await router.handle(request) as HTTPResponse
  return {
    status: response.statusCode ?? 200,
    body: response.body ? JSON.parse(String(response.body)) : null,
  }
}
