export const elementLabels = { background: 'Background image', logo: 'Logo', brand: 'Organization name', tagline: 'Tagline', title: 'Title', date: 'Date', time: 'Time', location: 'Location', description: 'Description', qr: 'RSVP QR code', invitation: 'Join us', website: 'Website' }
export type ElementId = keyof typeof elementLabels
export type ElementLayout = { hidden?: boolean; scale?: number; x?: number; y?: number }
export type PosterSettings = {
  format: 'letter' | 'letter-4up' | 'postcard' | 'social'; theme: 'light' | 'dark'
  background: 'solid' | 'city' | 'gradient' | 'lifetech' | 'gallery'; mediaId: string
  link: string; zoom: number; offsetX: number; offsetY: number; opacity: number; dimming: number; edgeBlur: boolean; imageFit: 'original' | 'contain' | 'cover'
  elements: Partial<Record<ElementId, ElementLayout>>; selectedElement: ElementId
}
export const defaults: PosterSettings = { format: 'letter', theme: 'light', background: 'solid', mediaId: '', link: 'portal', zoom: 1, offsetX: 0, offsetY: 0, opacity: 1, dimming: .66, edgeBlur: false, imageFit: 'original', elements: {}, selectedElement: 'time' }
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
    s.edgeBlur = v.edgeBlur === true
    if (['original', 'contain', 'cover'].includes(v.imageFit)) s.imageFit = v.imageFit
    s.dimming = bound(v.dimming, .66, 0, 1)
    s.elements = {}
    for (const id of Object.keys(elementLabels) as ElementId[]) {
      const item = v.elements?.[id]
      if (item && typeof item === 'object') s.elements[id] = { hidden: item.hidden === true, scale: bound(item.scale, 1, .25, 3), x: bound(item.x, 0, -100, 100), y: bound(item.y, 0, -100, 100) }
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
export function applySettings(svg: SVGSVGElement, settings: PosterSettings) {
  const art = svg.querySelector('#poster-art') || svg
  const viewBox = (art.getAttribute('viewBox') || '').split(/\s+/).map(Number)
  const width = viewBox[2] || Number(art.getAttribute('width')), height = viewBox[3] || Number(art.getAttribute('height'))
  for (const image of svg.querySelectorAll('[data-poster-background]')) {
    applyEdgeFill(image as SVGImageElement, settings.edgeBlur)
    image.setAttribute('preserveAspectRatio', settings.imageFit === 'original' ? image.getAttribute('data-original-aspect') || 'xMidYMid slice' : settings.imageFit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice')
    const w = Number(image.getAttribute('data-width')), h = Number(image.getAttribute('data-height'))
    image.setAttribute('x', String(w * ((1 - settings.zoom) / 2 + settings.offsetX / 200)))
    image.setAttribute('y', String(h * ((1 - settings.zoom) / 2 + settings.offsetY / 200)))
    image.setAttribute('width', String(w * settings.zoom)); image.setAttribute('height', String(h * settings.zoom))
    image.setAttribute('opacity', String(settings.opacity))
  }
  for (const overlay of svg.querySelectorAll('[data-poster-dimming]')) overlay.setAttribute('opacity', String(settings.dimming))
  for (const node of svg.querySelectorAll('[data-poster-element]')) {
    const layout = settings.elements[node.getAttribute('data-poster-element') as ElementId] || {}
    const base = node.getAttribute('data-base-transform') || ''
    node.setAttribute('transform', base.replace(/^translate\([^)]*\)/, `translate(${(layout.x || 0) * width / 100} ${(layout.y || 0) * height / 100})`).replace(/scale\([^)]*\)/, `scale(${layout.scale ?? 1})`))
    node.setAttribute('display', layout.hidden ? 'none' : 'inline')
  }
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
