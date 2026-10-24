export type SupportMailbox = {
 address: string; senderAddress: string; organizationId: string; senderName: string;
 organizationName: string; imageUrl: string | null; ticketPrefix: string;
};
const lifeTechId = 'ef646755-9443-4c7b-ba4b-a7a29754f666';

export async function supportMailboxForOrganization(db: D1Database, organizationId: string): Promise<SupportMailbox | null> {
 const org = await db.prepare('SELECT id,name,image_url FROM organizations WHERE id=?').bind(organizationId).first<{id:string;name:string;image_url:string|null}>();
 if (!org) return null;
 await db.prepare('INSERT OR IGNORE INTO support_mailboxes(organization_id,address) VALUES(?,?)')
  .bind(org.id, org.id === lifeTechId ? 'service@lifetech.fyi' : 'service+'+crypto.randomUUID().replaceAll('-', '')+'@notify.orgportal.cc').run();
 const row = await db.prepare('SELECT address FROM support_mailboxes WHERE organization_id=?').bind(org.id).first<{address:string}>();
 if (!row) return null;
 return {address:row.address,senderAddress:org.id===lifeTechId?row.address:'service@notify.orgportal.cc',organizationId:org.id,
  senderName:org.name+' service',organizationName:org.name,imageUrl:org.image_url,ticketPrefix:org.id===lifeTechId?'LT':'OP'};
}
export async function supportMailboxForAddress(db: D1Database, address: string) {
 const row = await db.prepare('SELECT organization_id FROM support_mailboxes WHERE address=?').bind(address.toLowerCase()).first<{organization_id:string}>();
 return row ? supportMailboxForOrganization(db,row.organization_id) : null;
}
export async function supportOrganizationForRequest(db: D1Database, request: Request) {
 const hostname = (request.headers.get('x-forwarded-host') || new URL(request.url).host).toLowerCase().split(':')[0];
 const row = await db.prepare("SELECT organization_id FROM group_sites WHERE hostname=? OR (custom_domain_hostname=? AND custom_domain_status='attached') LIMIT 1")
  .bind(hostname,hostname).first<{organization_id:string|null}>();
 return row?.organization_id || (hostname==='lifetech.fyi'?lifeTechId:null);
}
