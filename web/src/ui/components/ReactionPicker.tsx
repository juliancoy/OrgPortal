import { useEffect, useId, useRef, useState } from 'react'
import './reaction-picker.css'

/** Native popovers render in the browser top layer, outside clipping and stacking contexts. */
export function ReactionPicker({ emojis, disabled = false, onSelect }: {
  emojis: readonly string[]
  disabled?: boolean
  onSelect: (emoji: string) => void
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const picker = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (event.target instanceof Node && picker.current?.contains(event.target)) return
      picker.current?.hidePopover()
    }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  useEffect(() => { if (disabled) picker.current?.hidePopover() }, [disabled])

  return <>
    <button ref={trigger} type="button" popoverTarget={id} disabled={disabled}
      aria-expanded={open} aria-controls={id}>React</button>
    <div ref={picker} id={id} popover="auto" className="comment-reaction-picker"
      role="group" aria-label="Choose a reaction" onToggle={() => {
        const panel = picker.current, anchor = trigger.current
        const visible = Boolean(panel?.matches(':popover-open'))
        setOpen(visible)
        if (!visible || !panel || !anchor) return
        const rect = anchor.getBoundingClientRect()
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 8))
        const below = rect.bottom + 6
        const top = below + panel.offsetHeight <= window.innerHeight - 8
          ? below : Math.max(8, rect.top - panel.offsetHeight - 6)
        panel.style.left = `${left}px`
        panel.style.top = `${top}px`
      }}>
      {emojis.map(emoji => <button key={emoji} type="button" disabled={disabled}
        aria-label={`React with ${emoji}`} onClick={() => {
          picker.current?.hidePopover()
          trigger.current?.focus()
          onSelect(emoji)
        }}>{emoji}</button>)}
    </div>
  </>
}
