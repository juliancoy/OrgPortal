export const elementLabels = { background: 'Background image', logo: 'Logo', brand: 'Organization name', tagline: 'Tagline', title: 'Title', date: 'Date', time: 'Time', location: 'Location', description: 'Description', qr: 'RSVP QR code', invitation: 'Join us', website: 'Website' }
export type ElementId = keyof typeof elementLabels
export type ElementLayout = { hidden?: boolean; shadow?: boolean; shadowOpacity?: number; shadowBlur?: number; shadowDistance?: number; shadowSpread?: number; text?: string; scale?: number; x?: number; y?: number }
export const shadowDefaults = { shadowOpacity: 1, shadowBlur: 2, shadowDistance: 5, shadowSpread: 1.5 }
export type PosterSettings = {
  format: 'letter' | 'letter-4up' | 'postcard' | 'social'; theme: 'light' | 'dark'
  background: 'solid' | 'city' | 'gradient' | 'lifetech' | 'gallery'; mediaId: string
  includeEvents: boolean; link: string; zoom: number; offsetX: number; offsetY: number; opacity: number; dimming: number; edgeBlur: boolean; imageFit: 'original' | 'contain' | 'cover'
  elements: Partial<Record<ElementId, ElementLayout>>; selectedElement: ElementId | null
  animation: 'none' | 'slow-zoom'; animationDuration: number; animationZoom: number
}
export const defaults: PosterSettings = { includeEvents: false, format: 'letter', theme: 'light', background: 'gradient', mediaId: '', link: 'portal', zoom: 1, offsetX: 0, offsetY: 0, opacity: 1, dimming: .66, edgeBlur: false, imageFit: 'original', elements: {description:{hidden:true,shadow:false,scale:1,x:0,y:0}}, selectedElement: null, animation: 'none', animationDuration: 20, animationZoom: 12 }
const bound = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
export function parseSettings(raw: string | null): PosterSettings {
  try {
    const v = JSON.parse(raw || '{}')
    if (v?.version !== 1) return { ...defaults }
    const s = { ...defaults }
    if (['letter', 'letter-4up', 'postcard', 'social'].includes(v.format)) s.format = v.format
    if (['light', 'dark'].includes(v.theme)) s.theme = v.theme
    if (['solid', 'city', 'gradient', 'lifetech', 'gallery'].includes(v.background)) s.background = v.background
    if (typeof v.mediaId === 'string' && v.mediaId.length <= 1024) s.mediaId = v.mediaId
    if (Object.hasOwn(elementLabels, v.selectedElement)) s.selectedElement = v.selectedElement
    if (typeof v.link === 'string' && v.link.length <= 2048) s.link = v.link
    s.zoom = bound(v.zoom, 1, .25, 3); s.offsetX = bound(v.offsetX, 0, -100, 100); s.offsetY = bound(v.offsetY, 0, -100, 100); s.opacity = bound(v.opacity, 1, 0, 1)
    s.includeEvents = v.includeEvents === true
    s.edgeBlur = v.edgeBlur === true
    if (['original', 'contain', 'cover'].includes(v.imageFit)) s.imageFit = v.imageFit
    s.dimming = bound(v.dimming, .66, 0, 1)
    if (v.animation === 'slow-zoom') s.animation = v.animation
    s.animationDuration = bound(v.animationDuration, 20, 8, 60)
    s.animationZoom = bound(v.animationZoom, 12, 5, 30)
    s.elements = {description:{hidden:true,shadow:false,scale:1,x:0,y:0}}
    for (const id of Object.keys(elementLabels) as ElementId[]) {
      const item = v.elements?.[id]
      if (item && typeof item === 'object') s.elements[id] = { hidden: item.hidden === true, shadow: item.shadow === true, ...Object.fromEntries(Object.entries(shadowDefaults).filter(([key]) => Object.hasOwn(item, key)).map(([key, fallback]) => [key, bound(item[key], fallback, 0, key === 'shadowOpacity' ? 1 : key === 'shadowSpread' ? 12 : 30)])), ...(typeof item.text === 'string' ? { text: item.text.slice(0, 4000) } : {}), scale: bound(item.scale, 1, .25, 3), x: bound(item.x, 0, -100, 100), y: bound(item.y, 0, -100, 100) }
    }
    return s
  } catch { return { ...defaults } }
}

// Only the renderer's inert SVG vocabulary may enter the live preview DOM.
// Raster data images and local fragment references never execute or fetch code.
export function parsePosterSvg(source: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('Invalid poster')
  const tags = new Set(['svg', 'g', 'defs', 'use', 'rect', 'image', 'text', 'tspan', 'path', 'title', 'desc', 'linearGradient', 'stop'])
  const attrs = new Set(['xmlns', 'width', 'height', 'viewBox', 'role', 'aria-label', 'aria-labelledby', 'font-family', 'letter-spacing', 'id', 'transform', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'fill', 'opacity', 'overflow', 'preserveAspectRatio', 'href', 'font-size', 'font-weight', 'text-anchor', 'd', 'stroke', 'stroke-width', 'offset', 'stop-color', 'data-poster-element', 'data-poster-background', 'data-poster-dimming', 'data-width', 'data-height'])
  for (const node of [doc.documentElement, ...doc.documentElement.querySelectorAll('*')]) {
    if (!tags.has(node.localName) || node.namespaceURI !== 'http://www.w3.org/2000/svg') { node.remove(); continue }
    for (const attr of [...node.attributes]) {
      const safeHref = attr.name !== 'href' || /^#[\w-]+$/.test(attr.value) || (node.localName === 'image' && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(attr.value))
      const safePaint = !['fill', 'stroke'].includes(attr.name) || !/url\s*\(/i.test(attr.value) || /^url\(#[\w-]+\)$/.test(attr.value)
      if (!attrs.has(attr.name) || !safeHref || !safePaint) node.removeAttributeNode(attr)
    }
    if (node.hasAttribute('data-poster-background')) node.setAttribute('data-original-aspect', node.getAttribute('preserveAspectRatio') || 'xMidYMid slice')
    if (node.hasAttribute('data-poster-element')) node.setAttribute('data-base-transform', node.getAttribute('transform') || '')
  }
  return document.importNode(doc.documentElement, true) as unknown as SVGSVGElement
}

// Measure the embedded raster before framing it. A poster-shaped <image>
// viewport with `slice` permanently crops source pixels before any pan/zoom.
export async function preparePosterImages(svg: SVGSVGElement) {
  await Promise.all([...svg.querySelectorAll('[data-poster-background]')].map(async node => {
    const source = node.getAttribute('href')
    if (!source) return
    const image = new Image()
    image.src = source
    await image.decode()
    node.setAttribute('data-source-width', String(image.naturalWidth))
    node.setAttribute('data-source-height', String(image.naturalHeight))
  }))
}

export function backgroundImageFrame(width: number, height: number, sourceWidth: number, sourceHeight: number, settings: PosterSettings, aspect: string) {
  const zoom = settings.zoom, dx = width * settings.offsetX / 200, dy = height * settings.offsetY / 200
  if (!(Number.isFinite(sourceWidth) && Number.isFinite(sourceHeight) && sourceWidth > 0 && sourceHeight > 0)) return { x: width * (1 - zoom) / 2 + dx, y: height * (1 - zoom) / 2 + dy, width: width * zoom, height: height * zoom, aspect }
  const scale = aspect.includes('slice') ? Math.max(width / sourceWidth, height / sourceHeight) : Math.min(width / sourceWidth, height / sourceHeight)
  const w = sourceWidth * scale, h = sourceHeight * scale
  const alignX = aspect.startsWith('xMin') ? 0 : aspect.startsWith('xMax') ? 1 : .5
  const alignY = aspect.includes('YMin') ? 0 : aspect.includes('YMax') ? 1 : .5
  return {
    x: width / 2 + ((width - w) * alignX - width / 2) * zoom + dx,
    y: height / 2 + ((height - h) * alignY - height / 2) * zoom + dy,
    width: w * zoom, height: h * zoom, aspect: 'xMidYMid meet',
  }
}
export function applySettings(svg: SVGSVGElement, settings: PosterSettings) {
  const art = svg.querySelector('#poster-art') || svg
  const viewBox = (art.getAttribute('viewBox') || '').split(/\s+/).map(Number)
  const width = viewBox[2] || Number(art.getAttribute('width')), height = viewBox[3] || Number(art.getAttribute('height'))
  for (const image of svg.querySelectorAll('[data-poster-background]')) {
    applyEdgeFill(image as SVGImageElement, settings.edgeBlur)
    const aspect = settings.imageFit === 'original' ? image.getAttribute('data-original-aspect') || 'xMidYMid slice' : settings.imageFit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice'
    const w = Number(image.getAttribute('data-width')), h = Number(image.getAttribute('data-height'))
    const frame = backgroundImageFrame(w, h, Number(image.getAttribute('data-source-width')), Number(image.getAttribute('data-source-height')), settings, aspect)
    image.setAttribute('preserveAspectRatio', frame.aspect)
    image.setAttribute('x', String(frame.x)); image.setAttribute('y', String(frame.y))
    image.setAttribute('width', String(frame.width)); image.setAttribute('height', String(frame.height))
    image.setAttribute('opacity', String(settings.opacity))
  }
  for (const overlay of svg.querySelectorAll('[data-poster-dimming]')) overlay.setAttribute('opacity', String(settings.dimming))
  for (const node of svg.querySelectorAll('[data-poster-element]')) {
    const layout = settings.elements[node.getAttribute('data-poster-element') as ElementId] || {}
    applyElementText(node, layout.text, width)
    const base = node.getAttribute('data-base-transform') || ''
    node.setAttribute('transform', base.replace(/^translate\([^)]*\)/, `translate(${(layout.x || 0) * width / 100} ${(layout.y || 0) * height / 100})`).replace(/scale\([^)]*\)/, `scale(${layout.scale ?? 1})`))
    node.setAttribute('display', layout.hidden ? 'none' : 'inline')
    if (layout.shadow) {
      const id = node.getAttribute('data-poster-element') as ElementId
      applyDropShadow(svg, id, layout)
      node.setAttribute('filter', `url(#poster-shadow-${id})`)
    }
    else node.removeAttribute('filter')
  }
  applyPosterAnimation(svg, settings)
}

// Only trusted, numeric editor settings generate CSS. Fetched SVGs still pass
// through the inert-vocabulary sanitizer; no incoming styles are allowed.
export function applyPosterAnimation(svg: SVGSVGElement, settings: PosterSettings, enabled = true) {
  let style = svg.querySelector('[data-poster-animation]')
  if (!enabled || settings.animation !== 'slow-zoom' || !svg.querySelector('[data-poster-background]')) { style?.remove(); return }
  if (!style) {
    style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    style.setAttribute('data-poster-animation', 'true'); svg.prepend(style)
  }
  const duration = bound(settings.animationDuration, 20, 8, 60)
  const scale = 1 + bound(settings.animationZoom, 12, 5, 30) / 100
  const css = `@keyframes poster-background-zoom { from { transform:scale(1) } to { transform:scale(${scale}) } }
    [data-poster-background] { transform-box:fill-box; transform-origin:center; animation:poster-background-zoom ${duration}s ease-in-out infinite alternate; }
    [data-poster-animation-paused] [data-poster-background] { animation-play-state:paused; }
    @media (prefers-reduced-motion:reduce) { [data-poster-background] { animation:none; } }
    @media print { [data-poster-background] { animation:none; } }`
  if (style.textContent !== css) style.textContent = css
}

export function exportPosterSvg(svg: SVGSVGElement, settings: PosterSettings, animated = false, backgroundOnly = false) {
  applySettings(svg, settings)
  const exported = svg.cloneNode(true) as SVGSVGElement
  exported.querySelectorAll('[data-editor-ui], [data-poster-element][display="none"]').forEach(node => node.remove())
  exported.querySelectorAll('[data-poster-selected]').forEach(node => node.removeAttribute('data-poster-selected'))
  exported.removeAttribute('data-poster-animation-paused')
  if (backgroundOnly) exported.querySelectorAll('[data-poster-element]').forEach(node => node.remove())
  applyPosterAnimation(exported, settings, animated)
  return new Blob([new XMLSerializer().serializeToString(exported)], { type: 'image/svg+xml' })
}

// A stationary, overscanned copy fills the canvas even when the sharp image moves.
function applyEdgeFill(image: SVGImageElement, enabled: boolean) {
  const parent = image.parentElement!
  let fill = parent.querySelector('[data-poster-edge-fill]')
  if (!enabled) { fill?.remove(); return }
  if (!fill) {
    const ns = 'http://www.w3.org/2000/svg'
    fill = document.createElementNS(ns, 'g')
    fill.setAttribute('data-poster-edge-fill', 'true')
    const defs = document.createElementNS(ns, 'defs')
    const filter = document.createElementNS(ns, 'filter')
    filter.id = 'poster-edge-blur'
    filter.setAttribute('x', '-30%'); filter.setAttribute('y', '-30%')
    filter.setAttribute('width', '160%'); filter.setAttribute('height', '160%')
    filter.setAttribute('color-interpolation-filters', 'sRGB')
    const blur = document.createElementNS(ns, 'feGaussianBlur')
    blur.setAttribute('stdDeviation', '24')
    filter.append(blur); defs.append(filter)
    const copy = image.cloneNode() as SVGImageElement
    copy.removeAttribute('data-poster-background'); copy.removeAttribute('opacity')
    const w = Number(image.getAttribute('data-width')), h = Number(image.getAttribute('data-height'))
    copy.setAttribute('x', String(-w * .15)); copy.setAttribute('y', String(-h * .15))
    copy.setAttribute('width', String(w * 1.3)); copy.setAttribute('height', String(h * 1.3))
    copy.setAttribute('preserveAspectRatio', 'xMidYMid slice')
    copy.setAttribute('filter', 'url(#poster-edge-blur)')
    fill.append(defs, copy); parent.insertBefore(fill, image)
  }
}

// A local SVG filter keeps preview and every export on the same renderer.
function applyDropShadow(svg: SVGSVGElement, id: ElementId, layout: ElementLayout) {
  const ns = 'http://www.w3.org/2000/svg'
  let filter = svg.querySelector(`#poster-shadow-${id}`)
  if (!filter) {
    const defs = document.createElementNS(ns, 'defs')
    filter = document.createElementNS(ns, 'filter')
    filter.id = `poster-shadow-${id}`
    filter.setAttribute('x', '-100%'); filter.setAttribute('y', '-100%')
    filter.setAttribute('width', '300%'); filter.setAttribute('height', '300%')
    filter.setAttribute('color-interpolation-filters', 'sRGB')
    const primitive = (tag: string, attrs: Record<string, string>) => {
      const node = document.createElementNS(ns, tag)
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
      filter!.append(node)
      return node
    }
    primitive('feMorphology', { in: 'SourceAlpha', operator: 'dilate' })
    primitive('feGaussianBlur', {})
    primitive('feOffset', { result: 'shadow-mask' })
    primitive('feFlood', { 'flood-color': '#000000' })
    primitive('feComposite', { in2: 'shadow-mask', operator: 'in' })
    const merge = primitive('feMerge', {})
    for (const input of ['', 'SourceGraphic']) {
      const node = document.createElementNS(ns, 'feMergeNode')
      if (input) node.setAttribute('in', input)
      merge.append(node)
    }
    defs.append(filter); svg.prepend(defs)
  }
  filter.querySelector('feMorphology')!.setAttribute('radius', String(layout.shadowSpread ?? shadowDefaults.shadowSpread))
  filter.querySelector('feGaussianBlur')!.setAttribute('stdDeviation', String(layout.shadowBlur ?? shadowDefaults.shadowBlur))
  for (const axis of ['dx', 'dy']) filter.querySelector('feOffset')!.setAttribute(axis, String(layout.shadowDistance ?? shadowDefaults.shadowDistance))
  filter.querySelector('feFlood')!.setAttribute('flood-opacity', String(layout.shadowOpacity ?? shadowDefaults.shadowOpacity))
}

const originalText = new WeakMap<Element, SVGTextElement>()
const appliedText = new WeakMap<Element, string | undefined>()
let textMeasure: CanvasRenderingContext2D | null = null
function sourceText(node: Element) {
  const text = node.querySelector<SVGTextElement>('text')
  if (!text) return null
  if (!originalText.has(text)) originalText.set(text, text.cloneNode(true) as SVGTextElement)
  return { text, original: originalText.get(text)! }
}
export function posterElementText(svg: SVGSVGElement, id: ElementId): string | null {
  const node = svg.querySelector(`[data-poster-element="${id}"]`)
  const source = node && sourceText(node)
  if (!source) return null
  const spans = [...source.original.querySelectorAll('tspan')]
  return spans.length ? spans.map(span => span.textContent).join(' ') : source.original.textContent || ''
}
function applyElementText(node: Element, value: string | undefined, width: number) {
  const source = sourceText(node)
  if (!source) return
  const { text, original } = source
  if (appliedText.get(text) === value) return
  appliedText.set(text, value)
  if (value === undefined) {
    if (text.textContent !== original.textContent) text.replaceChildren(...[...original.childNodes].map(child => child.cloneNode(true)))
    return
  }
  const first = original.querySelector('tspan') || original
  const x = Number(first.getAttribute('x')), y = Number(first.getAttribute('y'))
  const size = Number(original.getAttribute('font-size')) || 24
  const id = node.getAttribute('data-poster-element')
  const margin = width === 400 ? 28 : 56
  const qr = node.parentElement?.querySelector('[data-poster-element="qr"] svg')
  const right = ['invitation', 'website'].includes(id || '') && qr ? Number(qr.getAttribute('x')) - 16 : width - margin
  const maxWidth = id === 'qr' ? 200 : Math.max(size, right - x)
  const context = textMeasure ||= document.createElement('canvas').getContext('2d')!
  context.font = `${original.getAttribute('font-weight') || '400'} ${size}px sans-serif`
  const lines: string[] = []
  for (const paragraph of value.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/(\s+)/)) {
      if (line && context.measureText(line + word).width > maxWidth) { lines.push(line.trimEnd()); line = '' }
      for (const character of word) {
        if (line && context.measureText(line + character).width > maxWidth) { lines.push(line); line = '' }
        line += character
      }
    }
    lines.push(line.trimEnd())
  }
  text.replaceChildren(...lines.map((line, index) => {
    const span = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
    span.setAttribute('x', String(x)); span.setAttribute('y', String(y + index * size * 1.25))
    span.textContent = line
    return span
  }))
}
