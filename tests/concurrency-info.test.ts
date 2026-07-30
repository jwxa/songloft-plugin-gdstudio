import { describe, expect, it } from 'vitest'
import { createPluginRouter } from '../src/router'
import { MockGDStudioClient } from '../src/mock-client'
import { MemoryStorage, requestJSON } from './test-helpers'

describe('version and concurrency contract', () => {
  it('exposes observable client versions', async () => {
    const response = await requestJSON(createPluginRouter({ storage: new MemoryStorage(), client: new MockGDStudioClient() }), 'GET', '/api/info')
    expect(response.body).toMatchObject({ plugin_version: '0.2.9', musicdl_version: '2.13.4', protocol_version: 'public-api-2026.07.21' })
  })
})
