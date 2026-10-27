import {useAuth} from '../../../app/AppProviders'
import {useAutosave} from '../../hooks/useAutosave'
import {AutosaveStatus} from '../AutosaveStatus'
import { useId, useState, type ReactNode } from 'react'
import { BioMarkdownEditor } from './BioMarkdownEditor'
import Check from 'lucide-react/dist/esm/icons/check.mjs'
import Copy from 'lucide-react/dist/esm/icons/copy.mjs'
import Pencil from 'lucide-react/dist/esm/icons/pencil.mjs'
import './inline-profile.css'

export function InlineProfileField({ label, value, children, onSave, multiline = false, markdown = false, type = 'text', options }: {
  label: string; value: string; children?: ReactNode; onSave: (value: string) => Promise<void>
  multiline?: boolean; markdown?: boolean; type?: string; options?: { value: string; label: string }[]
}) {
  const id = useId()
  const {token}=useAuth()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const autosave=useAutosave({value:draft,save:async next=>{await onSave(next)},scope:`${id}:${token}`,enabled:editing})
  return <div className="inline-profile-field">
    {editing ? <form onSubmit={async event=>{event.preventDefault();if(await autosave.flush())setEditing(false)}}>
      <label htmlFor={id}>{label}</label>
      <fieldset>
        {options ? <select autoFocus id={id} value={draft} onChange={event => setDraft(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : markdown ? <BioMarkdownEditor id={id} value={draft} onChange={setDraft} /> : multiline ?
          <textarea autoFocus id={id} value={draft} onChange={event => setDraft(event.target.value)} rows={4} /> :
          <input autoFocus id={id} type={type} value={draft} onChange={event => setDraft(event.target.value)} />}
        <AutosaveStatus state={autosave} label={label} onRetry={autosave.retry}/>
        <div className="inline-profile-actions"><button type="submit" className="btn-secondary">Done</button></div>
      </fieldset>
    </form> : <>
      <div className="inline-profile-value">{children || <span className="muted">Add {label.toLowerCase()}</span>}</div>
      <div className="inline-profile-actions inline-profile-tools">
        <button type="button" className="inline-profile-edit btn-secondary" aria-label={`Edit ${label.toLowerCase()}`} title={`Edit ${label.toLowerCase()}`} onClick={() => { setDraft(value); setEditing(true); setError('') }}><Pencil size={18} aria-hidden="true" /></button>
        <button type="button" className="btn-secondary" aria-label={`Copy ${label.toLowerCase()}`} title={`Copy ${label.toLowerCase()}`} disabled={!value} onClick={async () => {
          try { await navigator.clipboard.writeText(value); setCopied(true); setError(''); window.setTimeout(() => setCopied(false), 1600) }
          catch { setError('Could not copy. Please try again.') }
        }}>{copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}</button>
      </div>
      {copied && <span className="sr-only" role="status">{label} copied.</span>}
      {error && <p role="alert">{error}</p>}
    </>}
  </div>
}
