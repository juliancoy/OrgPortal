import type { BrandColor } from '../../../../shared/brandPalette'

type BrandGuide = { name: string; tagline: string; colors: BrandColor[]; url: string; guidance?: string[] }
type TextBlock = { lines: string[]; font: string; lineHeight: number; y: number }
const WIDTH = 1200
const MARGIN = 72
const CONTENT_WIDTH = WIDTH - MARGIN * 2
const INK = '#082F35'
const PAPER = '#F4F5F0'

function wrapText(context: CanvasRenderingContext2D, text: string): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    if (context.measureText(line ? `${line} ${word}` : word).width <= CONTENT_WIDTH) {
      line = line ? `${line} ${word}` : word
      continue
    }
    if (line) { lines.push(line); line = '' }
    // Long unbroken labels and URLs must fit too; never shrink or clip text.
    for (const character of Array.from(word)) {
      if (line && context.measureText(line + character).width > CONTENT_WIDTH) {
        lines.push(line)
        line = ''
      }
      line += character
    }
  }
  if (line) lines.push(line)
  return lines
}

export function renderBrandGuideCard(guide: BrandGuide): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Your browser could not create the style-guide image.')
  let y = MARGIN
  const blocks: TextBlock[] = []
  function text(value: string, font: string, lineHeight: number, gap = 0) {
    context!.font = font
    const block = { lines: wrapText(context!, value), font, lineHeight, y }
    blocks.push(block)
    y += block.lines.length * lineHeight + gap
  }
  text(guide.name, '700 84px Arial, sans-serif', 100, 12)
  text('COLOR STYLE GUIDE', '700 24px Arial, sans-serif', 34, 12)
  text(guide.tagline, '30px Arial, sans-serif', 44, 48)
  const swatches = guide.colors.map(color => {
    const top = y
    y += 220 + 24
    text(color.label, '700 42px Arial, sans-serif', 54, 4)
    text(color.value.toUpperCase(), '32px monospace', 46, 4)
    text(color.description || '', '28px Arial, sans-serif', 40, 44)
    return { color: color.value, top }
  })
  if (guide.guidance?.length) {
    text('ACCESSIBLE COLOR PAIRINGS', '700 30px Arial, sans-serif', 44, 20)
    for (const line of guide.guidance) text(line, '24px Arial, sans-serif', 36, 14)
  }
  const footerTop = y
  text(guide.url, '24px Arial, sans-serif', 34)
  canvas.height = Math.max(1800, Math.ceil(y + MARGIN))
  // Resizing clears canvas state. Paint from the measured layout afterwards.
  context.fillStyle = PAPER
  context.fillRect(0, 0, WIDTH, canvas.height)
  for (const swatch of swatches) {
    context.fillStyle = swatch.color
    context.fillRect(MARGIN, swatch.top, CONTENT_WIDTH, 220)
    context.strokeStyle = INK
    context.lineWidth = 2
    context.strokeRect(MARGIN + 1, swatch.top + 1, CONTENT_WIDTH - 2, 218)
  }
  context.fillStyle = INK
  context.textBaseline = 'top'
  for (const block of blocks) {
    context.font = block.font
    const top = block.y === footerTop ? canvas.height - MARGIN - block.lines.length * block.lineHeight : block.y
    block.lines.forEach((line, index) => context.fillText(line, MARGIN, top + index * block.lineHeight))
  }
  return canvas
}

export async function downloadBrandGuide(guide: BrandGuide) {
  await document.fonts.ready
  const canvas = renderBrandGuideCard(guide)
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    value => value ? resolve(value) : reject(new Error('Could not export the style guide. Please try again.')), 'image/png',
  ))
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${guide.name.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'brand'}-color-style-guide.png`
  document.body.append(link)
  try { link.click() } finally {
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
