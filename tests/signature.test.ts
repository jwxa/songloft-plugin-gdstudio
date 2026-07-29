import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { encodeGDStudioPayload, makeGDStudioSignature, normalizeGDStudioVersion } from '../src/signature'

const md5 = (input: string) => createHash('md5').update(input, 'utf8').digest('hex')

describe('GDStudio signature reference vectors from musicdl 2.13.3', () => {
  it.each([
    {
      input: '周杰伦 晴天',
      serverTime: '1785067200',
      encoded: '%E5%91%A8%E6%9D%B0%E4%BC%A6%20%E6%99%B4%E5%A4%A9',
      signature: '1EFBD2E0',
    },
    {
      input: '0039MnYb0qxYhV',
      serverTime: '1785067200123',
      encoded: '0039MnYb0qxYhV',
      signature: 'BEF735C8',
    },
    {
      input: "A!'()* 中文",
      serverTime: '1712345678',
      encoded: 'A%21%27%28%29%2A%20%E4%B8%AD%E6%96%87',
      signature: 'A491C055',
    },
  ])('matches $input', vector => {
    const encoded = encodeGDStudioPayload(vector.input)
    expect(encoded).toBe(vector.encoded)
    expect(makeGDStudioSignature(encoded, vector.serverTime, md5)).toBe(vector.signature)
  })

  it('normalizes protocol versions like the reference client', () => {
    expect(normalizeGDStudioVersion('2026.7.2')).toBe('20260702')
    expect(normalizeGDStudioVersion('2026.07.21')).toBe('20260721')
  })
})
