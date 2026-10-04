import { useRef, useState } from 'react'
import { BioMarkdown } from './BioMarkdown'

export function BioMarkdownEditor({ id, value, onChange }: {
  id: string
  value: string
  onChange: (value: string) => void
}) {
  const input = useRef<HTMLTextAreaElement>(null)
  const [preview, setPreview] = useState(false)

  function format(before: string, after = '', placeholder = 'text', lines = false) {
    const field = input.current
    if (!field) return
    const start = lines ? value.lastIndexOf('\n', field.selectionStart - 1) + 1 : field.selectionStart
    const end = field.selectionEnd
    const selected = value.slice(start, end) || placeholder
    const replacement = lines ? selected.split('\n').map((line) => before + line).join('\n') : before + selected + after
    onChange(value.slice(0, start) + replacement + value.slice(end))
    requestAnimationFrame(() => {
      field.focus()
      field.setSelectionRange(start + before.length, start + replacement.length - after.length)
    })
  }

  return (
    <div className="bio-editor">
      <div className="bio-editor-toolbar" role="group" aria-label="Bio Markdown formatting">
        <button type="button" disabled={preview} onClick={() => format('**', '**')} title="Bold (Ctrl or Command+B)"><strong>Bold</strong></button>
        <button type="button" disabled={preview} onClick={() => format('*', '*')} title="Italic (Ctrl or Command+I)"><em>Italic</em></button>
        <button type="button" disabled={preview} onClick={() => format('# ', '', 'Heading', true)}>Heading</button>
        <button type="button" disabled={preview} onClick={() => format('- ', '', 'List item', true)}>List</button>
        <button type="button" disabled={preview} onClick={() => format('[', '](https://example.com)', 'Link text')}>Link</button>
        <button type="button" aria-pressed={preview} aria-controls={`${id}-preview`} onClick={() => setPreview(!preview)}>{preview ? 'Edit' : 'Preview'}</button>
      </div>
      <textarea
        ref={input}
        id={id}
        hidden={preview}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && ['b', 'i'].includes(event.key.toLowerCase())) {
            event.preventDefault()
            const marker = event.key.toLowerCase() === 'b' ? '**' : '*'
            format(marker, marker)
          }
        }}
        rows={8}
        placeholder="Tell people about yourself…"
        aria-describedby={`${id}-help`}
      />
      {preview && <div id={`${id}-preview`} className="bio-editor-preview" role="region" aria-label="Bio preview"><BioMarkdown value={value || '*Your bio preview will appear here.*'} /></div>}
      <p id={`${id}-help`} className="muted bio-editor-help">Markdown supported: **bold**, *italic*, headings, lists, and links. Line breaks are preserved.</p>
    </div>
  )
}
