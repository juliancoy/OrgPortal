import { EMAIL_POSTAL_ADDRESS } from './emailPostalAddress';
import { emailContent } from './emailContent';
import { engagementUrl } from './emailEngagement';
import { emailFromAddress, emailPortalBase, type EmailCampaign, type EmailEvent } from './emailShared';

export function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!)); }
function publicImage(value: string | null) { try { const url = new URL(value || ''); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null; } catch { return null; } }
export function renderCampaign(env: Env, campaign: EmailCampaign, name: string, unsubscribe: string | null) {
  const event = JSON.parse(campaign.event_json) as EmailEvent;
  const content = emailContent(campaign.content_json);
  const accent = content.accent;
  const eventUrl = content.rsvp_url || `${emailPortalBase(env)}/${campaign.event_id ? 'events' : 'orgs'}/${encodeURIComponent(event.slug)}`;
  const values: Record<string, string> = { first_name: name.trim().split(/\s+/)[0] || 'there', event_title: event.title, organization: event.organization_name || 'Our community' };
  const replace = (text: string) => text.replace(/\{\{\s*(first_name|event_title|organization)\s*\}\}/g, (_, key: string) => values[key]);
  const subject = replace(campaign.subject).replace(/[\r\n\0]/g, ' ').slice(0, 240);
  const body = replace(campaign.body);
  const bodyHtml = body.split(/(https:\/\/[^\s<>"']+)/g).map((part,index) => index%2
    ? `<a href="${escapeHtml(part)}">${escapeHtml(part)}</a>` : escapeHtml(part)).join('').replace(/\r?\n/g,'<br>');
  const postalAddress = EMAIL_POSTAL_ADDRESS;
  const image = content.image_data || publicImage(event.image_url);
  const eventTime = event.starts_at ? new Date(event.starts_at) : null;
  const date = eventTime && !Number.isNaN(eventTime.getTime()) ? eventTime.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short' }) + ' (Eastern)' : 'Date to be announced';
  const footer = unsubscribe ? `<a href="${escapeHtml(unsubscribe)}">Unsubscribe from this group's emails</a>` : 'Test email — no subscription will be changed.';
  const linkLabel=content.rsvp_url ? content.rsvp_label : campaign.event_id ? 'View event and register' : 'Visit group';
  const text = `${body}\n\n${event.title}\n${campaign.event_id ? date : ''}\n${event.location || ''}\n${linkLabel}: ${eventUrl}\n\n${event.organization_name || 'OrgPortal'}\n${postalAddress}\n${unsubscribe ? `Unsubscribe: ${unsubscribe}` : 'Test email'}`;
  const notice='Campaign emails measure image loads and link clicks for 90 days. These signals may include automated activity.';
  const html = `<!doctype html><html><body style="margin:0;background:#f3f5f7;color:#18212b;font:16px/1.6 Arial,sans-serif"><table role="presentation" width="100%"><tr><td align="center" style="padding:24px 12px"><table role="presentation" style="width:100%;max-width:600px;background:#fff;border-top:5px solid ${accent}"><tr><td style="padding:28px"><p style="font-weight:bold;color:${accent}">${content.logo_url ? `<img src="${escapeHtml(content.logo_url)}" alt="" width="64" style="display:block;margin-bottom:12px">` : ''}${escapeHtml(event.organization_name || 'OrgPortal')}</p>${content.tagline ? `<p>${escapeHtml(content.tagline)}</p>` : ''}${content.heading ? `<h1>${escapeHtml(content.heading)}</h1>` : ''}<div>${bodyHtml}</div><h1 style="font-size:26px;line-height:1.25">${escapeHtml(event.title)}</h1>${image ? `<img src="${escapeHtml(image)}" alt="" width="544" style="width:100%;height:auto">` : ''}<p>${campaign.event_id ? escapeHtml(date) : ''}<br>${escapeHtml(event.location || '')}</p><p><a href="${escapeHtml(eventUrl)}" style="display:inline-block;background:${accent};color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">${escapeHtml(linkLabel)}</a></p><hr style="border:0;border-top:1px solid #dde2e8"><p style="font-size:13px;color:#536170">${escapeHtml(postalAddress)}<br>${footer}<br>${notice} <a href="${escapeHtml(new URL('/api/org/privacy',emailPortalBase(env)).toString())}">Privacy</a></p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text: text+`\n\n${notice}`, html };
}
function mimeBase64(value: string) {
  const encoded = btoa(Array.from(new TextEncoder().encode(value), (byte) => String.fromCharCode(byte)).join(''));
  return encoded.match(/.{1,76}/g)?.join('\r\n') || '';
}
export async function campaignMime(env: Env, campaign: EmailCampaign, recipient: { email: string; name: string; id: string; kind: string }, unsubscribe: string | null) {
  const rendered = renderCampaign(env, campaign, recipient.name, unsubscribe);
  if(recipient.kind==='campaign') {
    const links=[...new Set([...rendered.html.matchAll(/href="([^"<>]+)"/g)].map(m=>m[1].replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"')).filter(url=>url!==unsubscribe && url!==new URL('/api/org/privacy',emailPortalBase(env)).toString() && url.startsWith('https://')))];
    const trackedLinks=new Map<string,string>();
    for(const target of links) {
      const tracked=await engagementUrl(env,recipient.id,'click',target);
      rendered.html=rendered.html.split(`href="${escapeHtml(target)}"`).join(`href="${escapeHtml(tracked)}"`);
      trackedLinks.set(target,tracked);
    }
    rendered.text=rendered.text.replace(/https:\/\/[^\s<>"']+/g,target=>trackedLinks.get(target)||target);
    const pixel=await engagementUrl(env,recipient.id,'open');
    rendered.html=rendered.html.replace('</body>',`<img src="${escapeHtml(pixel)}" width="1" height="1" alt=""></body>`);
  }
  const subject = (recipient.kind === 'test' ? '[Test] ' : '') + rendered.subject;
  const content=emailContent(campaign.content_json);
  if(content.image_data)rendered.html=rendered.html.split(content.image_data).join('cid:campaign-photo');
  return emailMime(emailFromAddress(env, campaign.sender_email), recipient, { ...rendered, subject }, unsubscribe, content);
}
export function emailMime(sender: string, recipient: {email: string; id: string}, rendered: {subject: string; text: string; html: string}, unsubscribe: string | null = null, content?: ReturnType<typeof emailContent>) {
  const boundary = `portal-${crypto.randomUUID()}`;
  const subject = rendered.subject.replace(/[\r\n\0]/g, ' ').slice(0,240);
  const encodedSubject = btoa(Array.from(new TextEncoder().encode(subject), (byte) => String.fromCharCode(byte)).join(''));
  const headers = [
    `From: ${content?.sender_name ? `=?UTF-8?B?${mimeBase64(content.sender_name).replace(/\r?\n/g,'')}?= <${sender}>` : sender}`, `To: ${recipient.email}`, `Reply-To: ${sender}`,
    `Subject: =?UTF-8?B?${encodedSubject}?=`, `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${recipient.id}@${sender.split('@')[1]}>`, 'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  if (unsubscribe) headers.push(`List-Unsubscribe: <${unsubscribe}>`, 'List-Unsubscribe-Post: List-Unsubscribe=One-Click');
  const part = (type: string, body: string) => `--${boundary}\r\nContent-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${mimeBase64(body)}\r\n`;
  const alternative=`${headers.join('\r\n')}\r\n\r\n${part('text/plain', rendered.text)}${part('text/html', rendered.html)}--${boundary}--\r\n`;
  if(!content?.image_data)return alternative;
  const related=`related-${crypto.randomUUID()}`, match=content.image_data.match(/^data:(image\/(?:jpeg|png));base64,(.+)$/)!;
  return alternative.replace(`Content-Type: multipart/alternative; boundary="${boundary}"`, `Content-Type: multipart/related; boundary="${related}"`).split('\r\n\r\n')[0]+`\r\n\r\n--${related}\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n${part('text/plain',rendered.text)}${part('text/html',rendered.html)}--${boundary}--\r\n--${related}\r\nContent-Type: ${match[1]}\r\nContent-Disposition: inline; filename="campaign-photo.${match[1]==='image/png'?'png':'jpg'}"\r\nContent-ID: <campaign-photo>\r\nContent-Transfer-Encoding: base64\r\n\r\n${match[2].match(/.{1,76}/g)!.join('\r\n')}\r\n--${related}--\r\n`;
}
