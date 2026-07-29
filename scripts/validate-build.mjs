import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateManifest } from '@songloft/plugin-builder'

const zipPath = resolve('dist/gdstudio.jsplugin.zip')
const manifestPath = resolve('dist/plugin.json')

if (!existsSync(manifestPath)) {
  console.error(`missing built manifest: ${manifestPath}`)
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const errors = validateManifest(manifest)

if (!manifest.entryHash || !manifest.zipHash) {
  errors.push({ field: 'hash', message: 'entryHash and zipHash are required' })
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`${error.field}: ${error.message}`)
  }
  process.exit(1)
}

if (!existsSync(zipPath)) {
  console.error(`missing build artifact: ${zipPath}`)
  process.exit(1)
}

console.log('plugin manifest and package artifact: ok')
