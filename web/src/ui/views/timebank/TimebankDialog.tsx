import { useEffect, useId, useRef, type ReactNode } from 'react'

export function TimebankDialog({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current!
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => { dialog.close(); document.body.style.overflow = previousOverflow; if (opener?.isConnected) opener.focus() }
  }, [])
  return <dialog ref={ref} className="tb-dialog timebank-page" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}>
    <div className="tb-dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" className="tb-icon-button" disabled={busy} onClick={onClose} aria-label="Close dialog">×</button></div>
    {children}
  </dialog>
}
