export async function downloadNametag(element: HTMLElement, name: string, format: 'png' | 'jpg') {
  await document.fonts.ready
  await Promise.all(Array.from(element.querySelectorAll('img')).map(image => image.decode()))
  const { toCanvas } = await import('html-to-image')
  const canvas = await toCanvas(element, { canvasWidth: 1200, canvasHeight: 900, pixelRatio: 1, backgroundColor: '#ffffff' })
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Image export failed')), format === 'jpg' ? 'image/jpeg' : 'image/png', 0.95))
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `conference-nametag-${name.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'guest'}.${format}`
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
