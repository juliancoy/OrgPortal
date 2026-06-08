import QRCode from 'qrcode'

type EncodedQr = {
  modules: {
    size: number
    data: Uint8Array | boolean[]
  }
}

function encodeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;'
    if (char === '<') return '&lt;'
    if (char === '>') return '&gt;'
    if (char === '"') return '&quot;'
    return '&#39;'
  })
}

export function createQrSvg(payload: string, moduleSize = 8, margin = 4): string {
  const trimmed = payload.trim()
  if (!trimmed) throw new Error('QR payload is required')

  const qr = QRCode.create(trimmed, {
    errorCorrectionLevel: 'M',
  }) as EncodedQr
  const qrSize = qr.modules.size
  const size = (qrSize + margin * 2) * moduleSize
  const rects: string[] = []

  for (let y = 0; y < qrSize; y += 1) {
    for (let x = 0; x < qrSize; x += 1) {
      if (!qr.modules.data[y * qrSize + x]) continue
      rects.push(
        `<rect x="${(x + margin) * moduleSize}" y="${(y + margin) * moduleSize}" width="${moduleSize}" height="${moduleSize}" />`,
      )
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="QR code">`,
    `<title>${encodeXml(trimmed)}</title>`,
    `<rect width="${size}" height="${size}" fill="#fff"/>`,
    `<g fill="#000">${rects.join('')}</g>`,
    '</svg>',
  ].join('')
}
