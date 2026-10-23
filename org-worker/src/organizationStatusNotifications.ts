import {notificationPreferences} from './notificationPreferences';
import {enqueueUserPush} from './push';
import {googleAccessToken,sendGmail,type Sender} from './emailGoogle';
import {emailDailyLimit,emailPortalBase,normalizeEmail} from './emailShared';
import {emailMime,escapeHtml} from './emailTemplate';
export type OrganizationStatusNotice={id:string;user_id:string;organization_id:string;organization_name:string;organization_slug:string;previous_role:string|null;previous_status:string|null;role:string|null;status:string|null;attempts:number};
export function organizationStatusLabel(role:string|null,status:string|null) {
  if(!role||!status)return 'No membership';
  const label=role==='owner'?'Owner':role==='administrator'?'Organizer':'Member';
  return status==='active'?label:`${label} (inactive)`;
}
export function organizationStatusMessage(row:OrganizationStatusNotice) {
  const organization=row.organization_name;
  if(!row.role||!row.status)return {title:`Your membership in ${organization} has ended`,body:`Your membership has been removed. Access granted by that membership has ended.`};
  if(row.status!=='active')return {
    title:row.role==='member'?`Your membership in ${organization} is now inactive`:`Your ${row.role==='owner'?'owner':'organizer'} access to ${organization} is now inactive`,
    body:`Your ${organizationStatusLabel(row.role,'active').toLowerCase()} membership is inactive. It no longer grants organization permissions.`,
  };
  const title=row.role==='owner'?`You are now owner of ${organization}`:row.role==='administrator'?`You are now an organizer of ${organization}`:`You are now a member of ${organization}`;
  const body=row.role==='owner'?`You can manage ${organization}’s profile, portal setup, members, and organizer access.`
    :row.role==='administrator'?`You have organizer access to ${organization}. You can manage its profile, portal setup, and members.`
    :`Your membership in ${organization} is active. Open the organization to explore its community and member tools.`;
  return {title:row.previous_role===row.role&&row.previous_status==='inactive'?`Your ${organizationStatusLabel(row.role,'active').toLowerCase()} access to ${organization} is active again`:title,body};
}
export async function organizationStatusLinks(env:Env,row:OrganizationStatusNotice) {
  const tenant=await env.DB.prepare('SELECT hostname,canonical_path_prefix FROM group_sites WHERE organization_id=? ORDER BY id LIMIT 1').bind(row.organization_id).first<{hostname:string;canonical_path_prefix:string}>();
  // Shared slug portals have internal .local routing hosts, not public domains.
  const publicHost=tenant&&/^[a-z0-9.-]+$/i.test(tenant.hostname)&&!/(^localhost$|\.(local|localhost|internal|test|invalid)$)/i.test(tenant.hostname)&&!/^\d+(?:\.\d+){3}$/.test(tenant.hostname);
  const base=publicHost?`https://${tenant.hostname}${tenant.canonical_path_prefix||''}`:emailPortalBase(env);
  const profile=`${base}/orgs/${encodeURIComponent(row.organization_slug)}`;
  return {profile,dashboard:`${profile}/dashboard`,settings:`${base}/settings/notifications`};
}
export function renderOrganizationStatusEmail(row:OrganizationStatusNotice,links:{profile:string;dashboard:string;settings:string}) {
  const message=organizationStatusMessage(row);
  const canManage=row.status==='active'&&(row.role==='owner'||row.role==='administrator');
  const action=canManage?'Open organization dashboard':'View organization',href=canManage?links.dashboard:links.profile;
  const transition=`Previous: ${organizationStatusLabel(row.previous_role,row.previous_status)}. Current: ${organizationStatusLabel(row.role,row.status)}.`;
  const footer='You receive these account updates because organization status emails are enabled.';
  const text=`${message.title}\n\n${message.body}\n\n${transition}\nOrganization: ${row.organization_name}\n${action}: ${href}\n\n${footer}\nManage email and push notifications: ${links.settings}`;
  const html=`<!doctype html><html><body style="margin:0;background:#f3f5f7;color:#18212b;font:16px/1.6 Arial,sans-serif"><table role="presentation" width="100%"><tr><td align="center" style="padding:24px 12px"><table role="presentation" style="width:100%;max-width:600px;background:#fff;border-top:5px solid #155e59"><tr><td style="padding:28px"><p style="font-weight:bold;color:#155e59">${escapeHtml(row.organization_name)} · OrgPortal</p><h1 style="font-size:26px;line-height:1.3">${escapeHtml(message.title)}</h1><p>${escapeHtml(message.body)}</p><p style="padding:12px;background:#f3f5f7;border-radius:6px">${escapeHtml(transition)}</p><p><a href="${escapeHtml(href)}" style="display:inline-block;background:#155e59;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">${action}</a></p><hr style="border:0;border-top:1px solid #dde2e8"><p style="font-size:13px;color:#536170">${footer} <a href="${escapeHtml(links.settings)}">Manage email and push notifications</a></p></td></tr></table></td></tr></table></body></html>`;
  return {subject:message.title,text,html};
}
export async function dispatchOrganizationStatusPush(env:Env) {
  if(!env.PUSH_QUEUE||!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY||!env.VAPID_SUBJECT)return;
  const rows=await env.DB.prepare("SELECT * FROM organization_status_notifications WHERE push_status='queued' ORDER BY created_at,id LIMIT 100").all<OrganizationStatusNotice>();
  for(const row of rows.results||[]) {
    const prefs=await notificationPreferences(env.DB,row.user_id);
    if(!prefs.push_enabled||!prefs.organization_status_push) {
      await env.DB.prepare("UPDATE organization_status_notifications SET push_status='skipped' WHERE id=? AND push_status='queued'").bind(row.id).run();continue;
    }
    const links=await organizationStatusLinks(env,row);
    await enqueueUserPush(env,{eventId:`organization-status:${row.id}`,organizationStatusId:row.id,userId:row.user_id,...organizationStatusMessage(row),deepLink:links.profile});
    await env.DB.prepare("UPDATE organization_status_notifications SET push_status='enqueued' WHERE id=? AND push_status='queued'").bind(row.id).run();
  }
}
/** Uses the established Gmail sender, shared sender lease and rolling quota. */
export async function runOrganizationStatusEmail(env:Env) {
  const started=Date.now();
  await env.DB.prepare("UPDATE organization_status_notifications SET email_status='uncertain',error='Sending stopped before the result was recorded. Check Gmail Sent mail.' WHERE email_status='sending' AND attempted_at<?").bind(started-180_000).run();
  // Preference changes suppress queued mail even while the sender is offline.
  await env.DB.prepare(`UPDATE organization_status_notifications SET email_status='skipped',error='Email disabled in account preferences.' WHERE email_status='queued'
    AND EXISTS (SELECT 1 FROM notification_preferences p WHERE p.user_id=organization_status_notifications.user_id AND p.organization_status_email=0)`).run();
  if(env.ORGANIZATION_STATUS_EMAIL_ENABLED==='false')return;
  const sender=await env.DB.prepare("SELECT * FROM email_senders WHERE status='connected' AND cooldown_until<=? ORDER BY connected_at LIMIT 1").bind(started).first<Sender>();
  if(!sender)return;
  const lease=crypto.randomUUID();
  const locked=await env.DB.prepare('UPDATE email_senders SET lease_until=?,lease_owner=? WHERE owner_user_id=? AND lease_until<? RETURNING owner_user_id').bind(started+90_000,lease,sender.owner_user_id,started).first();
  if(!locked)return;
  try {
    const rows=await env.DB.prepare(`SELECT n.*,COALESCE(p.email,c.user_email) AS recipient_email FROM organization_status_notifications n
      LEFT JOIN notification_preferences p ON p.user_id=n.user_id LEFT JOIN user_contact_pages c ON c.user_id=n.user_id
      WHERE n.email_status='queued' AND n.next_attempt_at<=? AND COALESCE(p.organization_status_email,1)=1
      AND COALESCE(p.email,c.user_email) IS NOT NULL ORDER BY n.created_at,n.id LIMIT 10`).bind(started).all<OrganizationStatusNotice&{recipient_email:string}>();
    if(!rows.results?.length)return;
    const token=await googleAccessToken(env,sender);if(!token)return;
    for(const row of rows.results) {
      if(Date.now()-started>30_000)break;
      const usage=await env.DB.prepare('SELECT count(*) AS n FROM email_send_attempts WHERE sender_user_id=? AND attempted_at>?').bind(sender.owner_user_id,Date.now()-86_400_000).first<{n:number}>();
      if(Number(usage?.n||0)>=emailDailyLimit(env))break;
      const email=normalizeEmail(row.recipient_email);if(!email)continue;
      const links=await organizationStatusLinks(env,row);
      const raw=emailMime(sender.email,{email,id:row.id},renderOrganizationStatusEmail(row,links));
      const claimed=await env.DB.prepare(`UPDATE organization_status_notifications SET email_status='sending',attempted_at=?,attempts=attempts+1,error=NULL
        WHERE id=? AND email_status='queued' AND NOT EXISTS (SELECT 1 FROM notification_preferences p WHERE p.user_id=organization_status_notifications.user_id AND p.organization_status_email=0) RETURNING id`).bind(Date.now(),row.id).first();
      if(!claimed)continue;
      await env.DB.prepare('INSERT INTO email_send_attempts (id,sender_user_id,attempted_at) VALUES (?,?,?)').bind(crypto.randomUUID(),sender.owner_user_id,Date.now()).run();
      const result=await sendGmail(token,raw),retry=result.status==='retry'&&row.attempts<3;
      const status=retry?'queued':result.status==='retry'?'failed':result.status;
      await env.DB.prepare("UPDATE organization_status_notifications SET email_status=?,gmail_message_id=?,sent_at=?,error=?,next_attempt_at=? WHERE id=? AND email_status='sending'")
        .bind(status,result.id||null,status==='sent'?Date.now():null,result.error||null,retry?Date.now()+3_600_000:0,row.id).run();
      if(result.reconnect)await env.DB.prepare("UPDATE email_senders SET status='reconnect' WHERE owner_user_id=? AND lease_owner=?").bind(sender.owner_user_id,lease).run();
      if(result.status==='retry')await env.DB.prepare('UPDATE email_senders SET cooldown_until=? WHERE owner_user_id=? AND lease_owner=?').bind(Date.now()+3_600_000,sender.owner_user_id,lease).run();
      if(result.reconnect||result.status==='retry')break;
    }
  } finally {await env.DB.prepare('UPDATE email_senders SET lease_until=0,lease_owner=NULL WHERE owner_user_id=? AND lease_owner=?').bind(sender.owner_user_id,lease).run();}
}
