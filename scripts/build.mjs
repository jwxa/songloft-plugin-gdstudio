import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { buildPlugin, computeCanonicalZipHash, validatePlugin } from '@songloft/plugin-builder'
import JSZip from 'jszip'

const projectDir = process.cwd()
const temporaryOutDir = mkdtempSync(join(tmpdir(), 'songloft-gdstudio-build-'))
const result = await buildPlugin({ cwd: projectDir, outDir: temporaryOutDir })
const buildDir = join(temporaryOutDir, '_build')

copyFileSync(join(projectDir, 'LICENSE'), join(buildDir, 'LICENSE'))
copyFileSync(join(projectDir, 'NOTICE'), join(buildDir, 'NOTICE'))

const manifestPath = join(buildDir, 'plugin.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
manifest.zipHash = computeCanonicalZipHash(buildDir)
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
await writeZip(buildDir, result.zipPath)

const validation = await validatePlugin(buildDir)

if (!validation.valid) {
  for (const error of validation.errors) {
    console.error(`${error.field}: ${error.message}`)
  }
  process.exit(1)
}

const distDir = resolve(projectDir, 'dist')
mkdirSync(distDir, { recursive: true })
copyFileSync(result.zipPath, join(distDir, basename(result.zipPath)))
copyFileSync(join(temporaryOutDir, '_build', 'plugin.json'), join(distDir, 'plugin.json'))

console.log(`clean artifact copied to ${join(distDir, basename(result.zipPath))}`)

async function writeZip(directory, outputPath) {
  const zip = new JSZip()
  addDirectory(zip, directory, '')
  const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  writeFileSync(outputPath, content)
}

function addDirectory(zip, directory, prefix) {
  for (const name of readdirSync(directory)) {
    const absolutePath = join(directory, name)
    const zipPath = prefix ? `${prefix}/${name}` : name
    if (statSync(absolutePath).isDirectory()) {
      addDirectory(zip, absolutePath, zipPath)
    } else {
      zip.file(zipPath, readFileSync(absolutePath))
    }
  }
}
