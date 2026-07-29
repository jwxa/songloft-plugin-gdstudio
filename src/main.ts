/// <reference types="@songloft/plugin-sdk" />

import type { HTTPRequest, HTTPResponse } from '@songloft/plugin-sdk'
import { FetchHTTPTransport, GDStudioSearchClient } from './gdstudio-client'
import { createPluginRouter } from './router'

const router = createPluginRouter({
  storage: songloft.storage,
  client: new GDStudioSearchClient(new FetchHTTPTransport()),
  songs: songloft.songs,
})

async function onInit(): Promise<void> {
  songloft.log.info('GDStudio plugin initialized')
}

async function onDeinit(): Promise<void> {
  songloft.log.info('GDStudio plugin deinitialized')
}

async function onHTTPRequest(request: HTTPRequest): Promise<HTTPResponse> {
  return await router.handle(request)
}

globalThis.onInit = onInit
globalThis.onDeinit = onDeinit
globalThis.onHTTPRequest = onHTTPRequest
