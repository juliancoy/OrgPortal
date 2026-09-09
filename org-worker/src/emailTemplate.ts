import { emailFail, emailPortalBase, type EmailCampaign, type EmailEvent } from './emailShared';

export function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!)); }
function publicImage(value: string | null) { try { const url = new URL(value || ''); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null; } catch { return null; } }
export function renderCampaign(env: Env, campaign: EmailCampaign, name: string, unsubscribe: string | null) {
  const event = JSON.parse(campaign.event_json) as EmailEvent;
  const eventUrl = `${emailPortalBase(env)}/events/${encodeURIComponent(event.slug)}`;
  const values: Record<string, string> = { first_name: name.trim().split(/\s+/)[0] || 'there', event_title: event.title, organization: event.organization_name || 'Our community' };
  const replace = (text: string) => text.replace(/\{\{\s*(first_name|event_title|organization)\s*\}\}/g, (_, key: string) => values[key]);
  const subject = replace(campaign.subject).replace(/[\r\n\0]/g, ' ').slice(0, 240);
  const body = replace(campaign.body);
  const postalAddress = env.EMAIL_POSTAL_ADDRESS?.trim();
  if (!postalAddress) emailFail(503, 'The sender mailing address needs administrator setup.');
  const image = publicImage(event.image_url);
  const eventTime = event.starts_at ? new Date(event.starts_at) : null;
  const date = eventTime && !Number.isNaN(eventTime.getTime()) ? eventTime.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short' }) + ' (Eastern)' : 'Date to be announced';
  const footer = unsubscribe ? `<a href="${escapeHtml(unsubscribe)}">Unsubscribe from these ${campaign.audience === 'event' ? 'event updates' : 'organization announcements'}</a>` : 'Test email — no subscription will be changed.';
  const text = `${body}\n\n${event.title}\n${date}\n${event.location || ''}\nView event and register: ${eventUrl}\n\n${event.organization_name || 'OrgPortal'}\n${postalAddress}\n${unsubscribe ? `Unsubscribe: ${unsubscribe}` : 'Test email'}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f3f5f7;color:#18212b;font:16px/1.6 Arial,sans-serif"><table role="presentation" width="100%"><tr><td align="center" style="padding:24px 12px"><table role="presentation" style="width:100%;max-width:600px;background:#fff;border-top:5px solid #155eef"><tr><td style="padding:28px"><p style="font-weight:bold;color:#155eef">${escapeHtml(event.organization_name || 'OrgPortal')}</p><div>${escapeHtml(body).replace(/\r?\n/g, '<br>')}</div><h1 style="font-size:26px;line-height:1.25">${escapeHtml(event.title)}</h1>${image ? `<img src="${escapeHtml(image)}" alt="" width="544" style="width:100%;height:auto">` : ''}<p>${escapeHtml(date)}<br>${escapeHtml(event.location || '')}</p><p><a href="${escapeHtml(eventUrl)}" style="display:inline-block;background:#155eef;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">View event &amp; register</a></p><hr style="border:0;border-top:1px solid #dde2e8"><p style="font-size:13px;color:#536170">${escapeHtml(postalAddress)}<br>${footer}</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}
function mimeBase64(value: string) {
  const encoded = btoa(Array.from(new TextEncoder().encode(value), (byte) => String.fromCharCode(byte)).join(''));
  return encoded.match(/.{1,76}/g)?.join('\r\n') || '';
}
export function campaignMime(env: Env, campaign: EmailCampaign, recipient: { email: string; name: string; id: string; kind: string }, unsubscribe: string | null) {
  const rendered = renderCampaign(env, campaign, recipient.name, unsubscribe);
  const boundary = `portal-${crypto.randomUUID()}`;
  const subject = (recipient.kind === 'test' ? '[Test] ' : '') + rendered.subject;
  const encodedSubject = btoa(Array.from(new TextEncoder().encode(subject), (byte) => String.fromCharCode(byte)).join(''));
  const headers = [
    `From: ${campaign.sender_email}`, `To: ${recipient.email}`, `Reply-To: ${campaign.sender_email}`,
    `Subject: =?UTF-8?B?${encodedSubject}?=`, `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${recipient.id}@${campaign.sender_email.split('@')[1]}>`, 'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  if (unsubscribe) headers.push(`List-Unsubscribe: <${unsubscribe}>`, 'List-Unsubscribe-Post: List-Unsubscribe=One-Click');
  const part = (type: string, body: string) => `--${boundary}\r\nContent-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${mimeBase64(body)}\r\n`;
  return `${headers.join('\r\n')}\r\n\r\n${part('text/plain', rendered.text)}${part('text/html', rendered.html)}--${boundary}--\r\n`;
}
