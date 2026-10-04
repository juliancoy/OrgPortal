import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { DiffView, diffWords } from '../../components/governance/DiffView'
import type { Section, Ticket } from './GovernanceDocumentPage'

const ticketPath = '/governance/documents/lifetech-constitution/tickets/'
const pending = (ticket: Ticket) => !['passed', 'failed', 'withdrawn'].includes(ticket.status)
const attribution = (ticket: Ticket) => `${ticket.proposer_name || 'Member'} · ${new Date(ticket.created_at).toLocaleString()} · ${ticket.status} · revision ${ticket.document_version}`

export function DraftSection({ section, version, tickets, canEdit, editing, onEdit, onCancel, children }: {
 section: Section; version: number; tickets: Ticket[]; canEdit: boolean; editing: boolean;
 onEdit: () => void; onCancel: () => void; children: ReactNode
}) {
 const [selected, setSelected] = useState<string | null>(null)
 const [historyOpen, setHistoryOpen] = useState(false)
 const current = tickets.filter(t => pending(t) && t.document_version === version && t.document_base === section.text)
 const suggestion = selected === '' ? undefined : current.find(t => t.id === selected) || current[0]
 const segments = useMemo(() => suggestion ? diffWords(section.text, suggestion.proposed_body_diff) : [], [section.text, suggestion])
 const history = tickets.map(t => `${t.title}: ${attribution(t)}`).join('\n')
 const hover = suggestion ? `Suggested by ${attribution(suggestion)}\n${suggestion.body}\n\nSection edit history (newest first):\n${history}` : ''
 return <section id={section.id} className="draft-section">
  <div className="draft-section-heading"><h2>{section.title}</h2>{canEdit && <button type="button" onClick={editing ? onCancel : onEdit} aria-expanded={editing}>{editing ? 'Cancel section edit' : 'Edit section'}</button>}</div>
  {current.length > 0 && <div className="draft-suggestion-picker"><label>Suggested changes for {section.title}<select value={suggestion?.id || ''} onChange={e => setSelected(e.target.value)}><option value="">Current text without suggestions</option>{current.map(t => <option key={t.id} value={t.id}>{t.title} — {t.proposer_name}</option>)}</select></label>{suggestion && <p>Showing one pending suggestion: {attribution(suggestion)}. <Link to={ticketPath + suggestion.id}>Open change ticket</Link></p>}</div>}
  <div className="governance-document-text draft-annotated-text">{suggestion ? segments.map((segment, i) => segment.type === 'unchanged' ? <span key={i}>{segment.text}</span> : <button key={i} type="button" className={'draft-edit draft-edit-' + segment.type} title={hover} aria-label={`${segment.type === 'added' ? 'Suggested addition' : 'Suggested deletion'} by ${suggestion.proposer_name}: ${segment.text}. Show edit history.`} onClick={() => setHistoryOpen(true)}>{segment.type === 'removed' ? <del>{segment.text}</del> : <ins>{segment.text}</ins>}</button>) : section.text}</div>
  {tickets.some(t => pending(t) && !current.includes(t)) && <p>Earlier-revision suggestions are retained in the history below. Review their original wording before proposing a new change.</p>}
  {tickets.length > 0 && <details className="draft-history" open={historyOpen} onToggle={e => setHistoryOpen(e.currentTarget.open)}><summary>Section edit history ({tickets.length})</summary><p>Submitted suggestions are preserved as tickets. Each entry compares its original revision with its proposed wording; a passed ticket’s record shows whether it was incorporated. History includes this section’s entries among the 200 most recent document tickets.</p><ol>{tickets.map(t => <li key={t.id}><Link to={ticketPath + t.id}>{t.title}</Link><p>{attribution(t)}</p><p>{t.body}</p><details><summary>View proposed edit</summary><DiffView original={t.document_base} proposed={t.proposed_body_diff}/></details></li>)}</ol></details>}
  {editing && <div className="draft-section-editor"><h3>Suggest an edit to {section.title}</h3><p>Your edit creates a change ticket for organizer review. The current text is retained until adoption.</p>{children}</div>}
 </section>
}
