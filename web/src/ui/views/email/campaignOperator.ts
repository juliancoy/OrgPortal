import type { CampaignPreview, EmailSender } from './emailApi'
export type Delivery = CampaignPreview['deliveries'][number]
export function deliveryState(row: Delivery, outreach = false) {
  if (row.bounced_at) return 'bounced'
  if (['sent', 'failed', 'uncertain', 'sending', 'skipped'].includes(row.status)) return row.status
  if (row.suppressed || row.known_bounced || row.review_status === 'held' || (!outreach && row.subscription_status === 'unsubscribed') || (outreach && row.dns_status !== 'mx_present')) return 'excluded'
  return row.status
}
export function eligibleWaiting(row: Delivery, outreach: boolean) {
  return row.kind === 'campaign' && ['draft', 'queued'].includes(row.status) &&
    !row.suppressed && !row.known_bounced && row.review_status === 'approved' &&
    (outreach ? row.dns_status === 'mx_present' : row.subscription_status === 'subscribed')
}
export function campaignOperator(campaign: CampaignPreview, sender: EmailSender | null, now = Date.now()) {
  const rows = campaign.deliveries.filter(row => row.kind === 'campaign')
  const remaining = rows.filter(row => eligibleWaiting(row, campaign.audience_mode === 'outreach')).length
  const uncertain = campaign.deliveries.filter(row => row.status === 'uncertain').length
  const excluded = rows.filter(row => ['excluded', 'skipped'].includes(deliveryState(row, campaign.audience_mode === 'outreach'))).length
  const accepted = rows.filter(row => row.status === 'sent' && !row.bounced_at).length
  const bounced = rows.filter(row => row.bounced_at).length
  const failed = rows.filter(row => row.status === 'failed').length
  const waiting = rows.filter(row => ['draft', 'queued', 'sending'].includes(row.status) && !['excluded', 'skipped'].includes(deliveryState(row, campaign.audience_mode === 'outreach'))).length
  const blockers = []
  if (!sender?.configured) blockers.push('Complete sender setup.')
  if (!sender?.connected || sender.email !== campaign.sender_email) blockers.push('Connect the Google account that owns this campaign.')
  if (!sender?.sending_enabled) blockers.push('Mass sending is disabled.')
  if (!campaign.self_test_sent) blockers.push('Send and inspect a self-test for this draft.')
  if (uncertain) blockers.push(`Record the verified outcome of ${uncertain} uncertain send${uncertain === 1 ? '' : 's'}.`)
  if (!remaining) blockers.push('No eligible recipients are waiting.')
  if (sender && sender.used_today >= sender.daily_limit) blockers.push('The portal daily allowance is used. Queued mail will wait for capacity.')
  const cooldown = sender && sender.cooldown_until > now ? sender.cooldown_until : 0
  let notice = campaign.report_only ? 'Historical report only. This campaign cannot send.'
    : uncertain ? `${uncertain} send${uncertain === 1 ? '' : 's'} need review. Resolve the outcomes below before resuming.`
    : cooldown ? `Google paused sending until ${new Date(cooldown).toLocaleString()}. Queued mail will wait automatically.`
    : campaign.status === 'paused' ? 'Campaign paused. Review failures, exclusions, and remaining recipients before resuming.'
    : campaign.status === 'queued' && campaign.scheduled_at > now ? `Scheduled for ${new Date(campaign.scheduled_at).toLocaleString()}.`
    : campaign.status === 'queued' ? 'Campaign queued. Refresh status to follow progress; you can pause it at any time.'
    : campaign.status === 'completed' ? 'Campaign finished processing. Review any bounces or failures below.'
    : blockers.length ? 'Complete the readiness checks before approving this campaign.' : 'Ready for your final review.'
  if (!campaign.report_only && ['draft', 'paused', 'queued'].includes(campaign.status) && sender && sender.used_today >= sender.daily_limit && !uncertain && !cooldown) notice = 'The portal daily allowance is used. Queued mail will wait for capacity.'
  const totals = !rows.length ? campaign.delivery_stats : undefined
  return {remaining, uncertain: uncertain || totals?.uncertain || 0, excluded: totals?.skipped ?? excluded, accepted: totals ? Math.max(0, totals.accepted - totals.bounced) : accepted, bounced: totals?.bounced ?? bounced, failed: totals?.failed ?? failed, waiting: totals?.pending ?? waiting, blockers, cooldown, notice}
}
export function gmailSentSearch(sender: string, delivery: Delivery, from: string) {
  const query = `in:sent rfc822msgid:${delivery.id}@${from.split('@')[1]}`
  return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(sender)}#search/${encodeURIComponent(query)}`
}

export function deliveryReason(row: Delivery) {
  if (row.error) return row.error
  if (row.suppressed) return 'Recipient opted out of this group.'
  if (row.known_bounced) return 'Previous permanent delivery failure.'
  if (row.review_status === 'held') return 'Source and audience review required.'
  if (row.kind === 'campaign' && row.source_url && row.dns_status !== 'mx_present') return 'Mail routing is not verified.'
  if (row.subscription_status === 'unsubscribed' && !row.source_url && row.kind === 'campaign') return 'No current subscription.'
  return row.gmail_message_id ? 'Accepted by Gmail' : '—'
}
