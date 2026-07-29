export const GDSTUDIO_HOST = 'music.gdstudio.xyz'
export const GDSTUDIO_PROTOCOL_VERSION = '2026.07.21'

export type MD5Hasher = (input: string) => string

export function encodeGDStudioPayload(value: string): string {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, character => {
    return `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  })
}

export function normalizeGDStudioVersion(version: string): string {
  return version
    .split('.')
    .map(part => part.length === 1 ? part.padStart(2, '0') : part)
    .join('')
}

export function makeGDStudioSignature(
  payload: string,
  serverTime: string | number,
  md5: MD5Hasher,
  host = GDSTUDIO_HOST,
  version = GDSTUDIO_PROTOCOL_VERSION,
): string {
  const timePrefix = String(serverTime).slice(0, 9)
  const signatureInput = `${timePrefix}|${host}|${normalizeGDStudioVersion(version)}|${payload}`
  return md5(signatureInput).slice(-8).toUpperCase()
}
