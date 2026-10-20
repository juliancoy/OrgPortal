import { useState } from 'react'
import type { CampaignPreview, EmailSender } from './emailApi'
import { campaignOperator, gmailSentSearch, type Delivery } from './campaignOperator'
export type Reconciliation = {deliveryId: string; status: 'sent' | 'failed'; gmail_message_id: string; evidence: string}
export function CampaignOperatorPanel({campaign, sender}: {campaign: CampaignPreview; sender: EmailSender | null}) {
  const state = campaignOperator(campaign, sender)
  return <section className="email-operator" aria-label="Campaign readiness and progress">
    <div className="email-notice" role="status">{state.notice}</div>
    <div className="email-progress-grid">{[
      ['Waiting', state.waiting], ['Gmail accepted · no bounce reported', state.accepted], ['Bounced', state.bounced],
      ['Failed', state.failed], ['Held or skipped', state.excluded], ['Needs outcome review', state.uncertain],
    ].map(([label, count]) => <div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div>
    <p className="muted">Gmail acceptance does not confirm inbox delivery. Review copies are excluded from campaign totals; any uncertain review copy still needs attention.</p>
    {!campaign.report_only && <details open={campaign.status === 'draft' || campaign.status === 'paused'}><summary>Readiness checks · {state.remaining} eligible recipients waiting</summary>
      <dl className="email-readiness"><dt>Sender</dt><dd>{campaign.from_email} · {sender?.connected && sender.email === campaign.sender_email ? 'connected' : 'connection needed'}</dd>
        <dt>Self-test</dt><dd>{campaign.self_test_sent ? 'Accepted by Gmail — inspect your inbox' : 'Required for this draft'}</dd>
        <dt>Audience</dt><dd>{state.remaining} eligible and waiting · {state.excluded} held or skipped</dd>
        <dt>Timing</dt><dd>{campaign.scheduled_at > Date.now() ? new Date(campaign.scheduled_at).toLocaleString() : 'As soon as queued'} (your local time)</dd>
        <dt>Unsubscribe</dt><dd>Each campaign recipient receives an individual opt-out link.</dd></dl>
      {state.blockers.length > 0 ? <ul>{state.blockers.map(item => <li key={item}>{item}</li>)}</ul> : <p>Ready to review and approve.</p>}
      {campaign.audience_mode === 'outreach' && campaign.status === 'paused' && <p>Before the next batch: sync available delivery failures, resolve uncertain sends, inspect held contacts, and confirm the remaining audience. Next batch: up to {Math.min(campaign.batch_size || 50, state.remaining)} recipients.</p>}
    </details>}
  </section>
}
export function DeliveryRecovery({campaign, delivery, busy, onSave}: {campaign: CampaignPreview; delivery: Delivery; busy: boolean; onSave: (value: Reconciliation) => Promise<void>}) {
  const [open, setOpen] = useState(false)
  const [outcome, setOutcome] = useState<'sent' | 'failed'>('sent')
  const [receipt, setReceipt] = useState('')
  const [evidence, setEvidence] = useState('')
  return <div className="email-recovery">
    <a href={gmailSentSearch(campaign.sender_email, delivery, campaign.from_email)} target="_blank" rel="noreferrer">Check Gmail Sent</a>
    <button type="button" disabled={busy} onClick={() => setOpen(!open)} aria-expanded={open}>Record verified outcome</button>
    {open && <form onSubmit={event => {event.preventDefault(); void onSave({deliveryId:delivery.id,status:outcome,gmail_message_id:outcome === 'sent' ? receipt.trim() : '',evidence:evidence.trim()})}}>
      <p>Search Sent mail and provider evidence. An empty search alone does not confirm that the message was never sent.</p>
      <label>Verified outcome<select value={outcome} onChange={event => setOutcome(event.target.value as 'sent' | 'failed')}><option value="sent">Confirmed accepted by Gmail</option><option value="failed">Confirmed not sent</option></select></label>
      {outcome === 'sent' && <label>Gmail message ID<input value={receipt} maxLength={200} required onChange={event => setReceipt(event.target.value)}/></label>}
      <label>Evidence supporting this outcome<textarea value={evidence} minLength={20} maxLength={1000} required onChange={event => setEvidence(event.target.value)}/></label>
      <p>Recording an outcome does not resend this message or resume the campaign.</p>
      <button disabled={busy || evidence.trim().length < 20 || (outcome === 'sent' && !receipt.trim())}>Save verified outcome</button>
      <button type="button" className="portal-button-secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
    </form>}
  </div>
}
