import {afterEach, describe, expect, it, vi} from 'vitest'
import {compressUploadImage} from './compressUploadImage'

afterEach(() => vi.unstubAllGlobals())

describe('optional upload image compression', () => {
  const photo = new File(['original photo'], 'photo.jpg', {type: 'image/jpeg'})

  it('retains the original when bitmap decoding is unavailable or rejects the photo', async () => {
    vi.stubGlobal('createImageBitmap', undefined)
    expect(await compressUploadImage(photo)).toBe(photo)
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('Decode failed')))
    expect(await compressUploadImage(photo)).toBe(photo)
  })

  it.each(['no canvas context', 'encoding failure', 'larger result', 'smaller result'])('handles %s without losing the photo', async scenario => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({width: 4000, height: 2000, close}))
    const drawImage = vi.fn()
    const canvas = {
      width: 0, height: 0,
      getContext: () => scenario === 'no canvas context' ? null : {drawImage},
      toBlob: (callback: (blob: Blob) => void) => {
        if (scenario === 'encoding failure') throw new Error('Encoder failed')
        callback(new Blob([scenario === 'larger result' ? 'x'.repeat(100) : 'x'], {type: 'image/webp'}))
      },
    }
    vi.stubGlobal('document', {createElement: () => canvas})
    const result = await compressUploadImage(photo)
    if (scenario === 'smaller result') {
      expect(result.type).toBe('image/webp')
      expect(result.name).toBe('photo.webp')
      expect(canvas.width).toBe(2048)
      expect(canvas.height).toBe(1024)
    } else expect(result).toBe(photo)
    expect(close).toHaveBeenCalledOnce()
  })

  it('preserves potentially animated images without bitmap decoding', async () => {
    const decode = vi.fn()
    vi.stubGlobal('createImageBitmap', decode)
    for (const type of ['image/gif', 'image/webp']) {
      const file = new File(['animation'], 'animated', {type})
      expect(await compressUploadImage(file)).toBe(file)
    }
    expect(decode).not.toHaveBeenCalled()
  })
})
