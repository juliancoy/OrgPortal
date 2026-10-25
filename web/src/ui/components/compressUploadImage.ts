/** Reduce still-image uploads locally, retaining alpha and keeping the smaller file. */
export async function compressUploadImage(file: File): Promise<File> {
  // GIF and WebP may be animated; do not flatten their frames through canvas.
  if (!['image/jpeg', 'image/png'].includes(file.type)) return file
  const image = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 2048 / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Unable to prepare this image. Please try another image.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    // WebP preserves transparency; the default canvas remains transparent.
    const compressed = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.85))
    if (!compressed || compressed.type !== 'image/webp' || compressed.size >= file.size) return file
    return new File([compressed], file.name.replace(/\.[^.]+$/, '') + '.webp', {type: 'image/webp', lastModified: file.lastModified})
  } finally {
    image.close()
  }
}
