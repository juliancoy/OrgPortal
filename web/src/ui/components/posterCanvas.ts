import { elementLabels, type ElementId, type PosterSettings } from './posterEditorState'
const ns = 'http://www.w3.org/2000/svg'
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
export function artwork(svg: SVGSVGElement): SVGSVGElement {
  return svg.querySelector<SVGSVGElement>('#poster-art') || svg
}
function dimensions(svg: SVGSVGElement) {
  const art = artwork(svg)
  const box = art.viewBox.baseVal
  return { width: box.width || Number(art.getAttribute('width')), height: box.height || Number(art.getAttribute('height')) }
}
export function drawSelection(svg: SVGSVGElement, settings: PosterSettings) {
  svg.querySelector('[data-editor-ui]')?.remove()
  const art = artwork(svg), { width, height } = dimensions(svg)
  let box = { x: 6, y: 6, width: width - 12, height: height - 12 }
  if (settings.selectedElement === 'background') {
    const image = svg.querySelector('[data-poster-background]')
    if (!image) return
    box = { x: Number(image.getAttribute('x')), y: Number(image.getAttribute('y')), width: Number(image.getAttribute('width')), height: Number(image.getAttribute('height')) }
  } else {
    const node = svg.querySelector<SVGGElement>(`[data-poster-element="${settings.selectedElement}"]`)
    if (!node || node.getAttribute('display') === 'none') return
    const b = node.getBBox(), m = node.transform.baseVal.consolidate()?.matrix
    if (!m) return
    const p = new DOMPoint(b.x, b.y).matrixTransform(m)
    box = { x: p.x, y: p.y, width: b.width * m.a, height: b.height * m.d }
  }
  const group = document.createElementNS(ns, 'g'); group.setAttribute('data-editor-ui', 'true')
  const rect = document.createElementNS(ns, 'rect')
  for (const [key, value] of Object.entries(box)) rect.setAttribute(key, String(value))
  rect.setAttribute('fill', 'none'); rect.setAttribute('stroke', '#087482'); rect.setAttribute('stroke-width', '2')
  rect.setAttribute('vector-effect', 'non-scaling-stroke'); rect.setAttribute('pointer-events', 'none')
  group.append(rect)
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const handle = document.createElementNS(ns, 'rect')
    const screen = (svg.querySelector<SVGUseElement>('use') || art).getScreenCTM()
    const scale = screen ? Math.hypot(screen.a, screen.b) : 1
    const size = Math.min(width / 4, Math.max(Math.max(width, height) * .035, 44 / (scale || 1)))
    handle.setAttribute('x', String(clamp(box.x + (sx > 0 ? box.width : 0) - size / 2, 0, width - size)))
    handle.setAttribute('y', String(clamp(box.y + (sy > 0 ? box.height : 0) - size / 2, 0, height - size)))
    handle.setAttribute('width', String(size)); handle.setAttribute('height', String(size))
    handle.setAttribute('fill', '#087482'); handle.setAttribute('stroke', '#fff'); handle.setAttribute('stroke-width', '2')
    handle.setAttribute('data-resize', `${sx},${sy}`); handle.style.cursor = sx === sy ? 'nwse-resize' : 'nesw-resize'
    group.append(handle)
  }
  art.append(group)
}
export function bindCanvas(svg: SVGSVGElement, getSettings: () => PosterSettings, update: (s: PosterSettings) => void) {
  const { width, height } = dimensions(svg)
  let drag: { id: number; start: DOMPoint; matrix: DOMMatrix; settings: PosterSettings; resize: number[] | null } | null = null
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || drag) return
    const target = event.target as Element
    const copy = target.closest('use') as SVGUseElement | null
    const matrix = (copy || artwork(svg)).getScreenCTM()
    if (!matrix) return
    const inverse = matrix.inverse(), point = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse)
    let handle = target.closest('[data-resize]')
    let node = target.closest('[data-poster-element]')
    // Four-up <use> copies expose the instance, not their source nodes.
    if (copy) {
      const hit = (n: SVGGraphicsElement) => {
        const b = n.getBBox(), m = n.transform.baseVal.consolidate()?.matrix
        const p = m ? point.matrixTransform(m.inverse()) : point
        return n.getAttribute('display') !== 'none' && p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height
      }
      handle = [...svg.querySelectorAll<SVGGraphicsElement>('[data-resize]')].find(hit) || null
      node = [...svg.querySelectorAll<SVGGraphicsElement>('[data-poster-element]')].reverse().find(hit) || null
    }
    const settings = getSettings()
    const selected = handle ? settings.selectedElement : node?.getAttribute('data-poster-element') || (svg.querySelector('[data-poster-background]') ? 'background' : null)
    if (!selected || !Object.hasOwn(elementLabels, selected)) return
    const next = { ...settings, selectedElement: selected as ElementId }
    update(next)
    drag = { id: event.pointerId, start: point, matrix: inverse, settings: next, resize: handle?.getAttribute('data-resize')?.split(',').map(Number) || null }
    svg.setPointerCapture(event.pointerId); event.preventDefault()
  }
  const move = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(drag.matrix)
    const dx = (p.x - drag.start.x) / width, dy = (p.y - drag.start.y) / height
    const s = drag.settings, id = s.selectedElement, layout = s.elements[id] || {}
    const delta = drag.resize ? (dx * drag.resize[0] + dy * drag.resize[1]) * 2 : 0
    if (id === 'background') update({ ...s, ...(drag.resize ? { zoom: clamp(s.zoom + delta, .25, 3) } : { offsetX: clamp(s.offsetX + dx * 200, -100, 100), offsetY: clamp(s.offsetY + dy * 200, -100, 100) }) })
    else update({ ...s, elements: { ...s.elements, [id]: { ...layout, ...(drag.resize ? { scale: clamp((layout.scale ?? 1) + delta, .25, 3) } : { x: clamp((layout.x || 0) + dx * 100, -100, 100), y: clamp((layout.y || 0) + dy * 100, -100, 100) }) } } })
  }
  const end = (event: PointerEvent) => { if (drag?.id === event.pointerId) { drag = null; if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId) } }
  svg.addEventListener('pointerdown', down); svg.addEventListener('pointermove', move)
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end); svg.addEventListener('lostpointercapture', end)
  return () => { svg.removeEventListener('pointerdown', down); svg.removeEventListener('pointermove', move); svg.removeEventListener('pointerup', end); svg.removeEventListener('pointercancel', end); svg.removeEventListener('lostpointercapture', end) }
}
