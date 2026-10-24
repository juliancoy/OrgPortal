import { useState } from 'react'
import type { Section } from './GovernanceDocumentPage'

const roles = new Set(['The Public', 'Attendees', 'Volunteers', 'Members', 'Organizers', 'Stakeholders', 'Persona Non Grata', 'Coffee Chair', 'Master of Ceremonies (eMCee)', 'Venue Champion', 'Offices'])

export function InteractiveClauses({ section, canEdit, onEdit }: { section: Section; canEdit: boolean; onEdit: (text: string) => void }) {
 const [selected, setSelected] = useState<number | null>(null)
 const [draft, setDraft] = useState('')
 const paragraphs = section.text.split('\n\n')
 function select(index: number) { setSelected(selected === index ? null : index); setDraft(paragraphs[index]); setTimeout(() => document.getElementById(`${section.id}-clause-${index}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0) }
 return <div className="interactive-clauses">
  {['personnel', 'meetings'].includes(section.id) && <div className="governance-role-bubbles" aria-label={`Roles in ${section.title}`}>
   {paragraphs.map((paragraph, index) => { const heading = paragraph.split('\n')[0]; return roles.has(heading) ? (heading === 'Offices' ? ['Chair', 'Secretary', 'Treasurer'] : [heading]).map(role => <button type="button" key={`${index}-${role}`} aria-expanded={selected === index} aria-controls={`${section.id}-clause-${index}`} onClick={() => select(index)}>{role}</button>) : null })}
  </div>}
  {paragraphs.map((paragraph, index) => {
   const newline = paragraph.indexOf('\n'), heading = newline > 0 ? paragraph.slice(0, newline) : null
   return <div className="governance-clause" id={`${section.id}-clause-${index}`} key={index}>
    {heading ? <><h3>{heading}</h3><p>{paragraph.slice(newline + 1)}</p></> : <p>{paragraph}</p>}
    {canEdit && <button type="button" className="governance-clause-edit" aria-expanded={selected === index} onClick={() => select(index)}>Edit {heading || 'paragraph'}</button>}
    {selected === index && <div className="governance-clause-editor">
     {canEdit ? <><label>Suggested wording for {heading || 'paragraph'}<textarea autoFocus rows={7} value={draft} maxLength={50000} onChange={event => setDraft(event.target.value)}/></label><p>This changes the wording of a role or rule. It does not assign people or permissions.</p><button type="button" disabled={!draft.trim() || draft === paragraph} onClick={() => { onEdit(paragraphs.map((text, position) => position === index ? draft : text).join('\n\n')); setSelected(null) }}>Review section change</button></> : <p>Sign in with active LifeTech membership to suggest changes to this role.</p>}
     <button type="button" onClick={() => setSelected(null)}>Close</button>
    </div>}
   </div>
  })}
 </div>
}
