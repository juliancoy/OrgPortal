import { validateRequest, type Network } from './api'
import { units } from './wallet'

// Read payment details only. Never navigate to or fetch a QR's destination.
export function readPaymentRequest(value: string, network: Network) {
  if (value.length > 4096) throw new Error('Payment request is too long.')
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('Paste a complete QCash payment link.') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('Invalid QCash payment link.')
  const p = url.searchParams
  if (!['QCash', 'PQT'].includes(p.get('currency') || '')) throw new Error('This is not a QCash payment request.')
  const error = validateRequest(url.search, network)
  if (error) throw new Error(error)
  if (!p.has('to') || !p.has('chain')) throw new Error('Payment request needs a recipient and network.')
  const amount = p.get('amount')
  if (amount !== null) units(amount)
  return { recipient: p.get('to')!, amount }
}

export async function readPaymentQr(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Choose a PNG, JPEG or WebP QR image smaller than 5 MB.')
  const bitmap = await createImageBitmap(file)
  try {
    if (bitmap.width * bitmap.height > 16000000) throw new Error('QR image is too large. Crop it to the QR code.')
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Unable to read QR image in this browser.')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    const { default: jsQR } = await import('jsqr')
    const result = jsQR(pixels.data, pixels.width, pixels.height)
    if (!result) throw new Error('No QR code found. Try a clearer image or paste the payment link.')
    return result.data
  } finally { bitmap.close() }
}
