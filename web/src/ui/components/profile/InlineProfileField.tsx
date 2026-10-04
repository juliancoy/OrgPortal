import { useId, useState, type ReactNode } from 'react'
import { BioMarkdownEditor } from './BioMarkdownEditor'
import './inline-profile.css'

export function InlineProfileField({ label, value, children, onSave, multiline = false, markdown = false, type = 'text', options }: {
  label: string; value: string; children?: ReactNode; onSave: (value: string) => Promise<void>
  multiline?: boolean; markdown?: boolean; type?: string; options?: { value: string; label: string }[]
}) {
  const id = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  return <div className="inline-profile-field">
    {editing ? <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError('')
      try { await onSave(draft); setEditing(false); setSaved(true) }
      catch (error) { setError(error instanceof Error ? error.message : 'Could not save. Please try again.') }
      finally { setBusy(false) }
    }}>
      <label htmlFor={id}>{label}</label>
      <fieldset disabled={busy}>
        {options ? <select autoFocus id={id} value={draft} onChange={event => setDraft(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : markdown ? <BioMarkdownEditor id={id} value={draft} onChange={setDraft} /> : multiline ?
          <textarea autoFocus id={id} value={draft} onChange={event => setDraft(event.target.value)} rows={4} /> :
          <input autoFocus id={id} type={type} value={draft} onChange={event => setDraft(event.target.value)} />}
        <div className="inline-profile-actions"><button type="submit">{busy ? 'Saving…' : `Save ${label.toLowerCase()}`}</button>
          <button type="button" className="btn-secondary" onClick={() => { setEditing(false); setError('') }}>Cancel</button></div>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form> : <>
      <div className="inline-profile-value">{children || <span className="muted">Add {label.toLowerCase()}</span>}</div>
      <button type="button" className="inline-profile-edit btn-secondary" onClick={() => { setDraft(value); setEditing(true); setSaved(false); setError('') }}>Edit {label.toLowerCase()}</button>
      {saved && <span className="sr-only" role="status">{label} saved.</span>}
    </>}
  </div>
}
