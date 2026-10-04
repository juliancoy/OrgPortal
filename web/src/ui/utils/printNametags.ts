export async function printNametags(element: HTMLElement, styles: string, title: string) {
  const frame = document.createElement('iframe')
  frame.title = title
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-10000px;'
  document.body.append(frame)
  try {
    const doc = frame.contentDocument!
    const style = doc.createElement('style')
    style.textContent = styles
    doc.head.append(style)
    doc.title = title
    doc.body.append(element.cloneNode(true))
    await Promise.all(Array.from(doc.images).map(img => img.decode().catch(() => undefined)))
    const printWindow = frame.contentWindow!
    printWindow.addEventListener('afterprint', () => frame.remove(), { once: true })
    printWindow.focus()
    printWindow.print()
  } catch (error) {
    frame.remove()
    throw error
  }
}
