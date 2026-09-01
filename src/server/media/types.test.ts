import { describe, expect, it } from 'vitest'

import { altFromFilename, sniffMediaMime } from './types'

describe('media types', () => {
  it('sniffs jpeg/png/gif/webp magic', () => {
    expect(sniffMediaMime(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe(
      'image/jpeg',
    )
    expect(
      sniffMediaMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])),
    ).toBe('image/png')
    expect(
      sniffMediaMime(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])),
    ).toBe('image/gif')
    const webp = new Uint8Array(12)
    webp.set([0x52, 0x49, 0x46, 0x46], 0)
    webp.set([0x57, 0x45, 0x42, 0x50], 8)
    expect(sniffMediaMime(webp)).toBe('image/webp')
    expect(sniffMediaMime(new Uint8Array([0x00, 0x01]))).toBeNull()
  })

  it('builds alt text from a filename', () => {
    expect(altFromFilename('Screenshot 2026-09-01.png')).toBe(
      'Screenshot 2026-09-01',
    )
    expect(altFromFilename('')).toBe('图片')
  })
})
