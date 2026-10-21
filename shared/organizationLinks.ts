export const organizationLinkTypes = ['website', 'whatsapp', 'luma', 'eventbrite', 'linkedin', 'instagram', 'facebook', 'discord', 'telegram', 'youtube', 'github'] as const;
export type OrganizationLinkType = typeof organizationLinkTypes[number];
export type OrganizationLink = { id: string; type: OrganizationLinkType; url: string; label?: string };
export const organizationLinkLabels: Record<OrganizationLinkType,string> = {
  website:'Website', whatsapp:'WhatsApp group', luma:'Luma', eventbrite:'Eventbrite', linkedin:'LinkedIn', instagram:'Instagram', facebook:'Facebook', discord:'Discord', telegram:'Telegram', youtube:'YouTube', github:'GitHub',
};

/** The organization record owns these public links; consumers store only IDs. */
export function normalizeOrganizationLinks(value: unknown): OrganizationLink[] {
  if (!Array.isArray(value) || value.length > 30) throw new Error('Supply up to 30 organization links.');
  const ids=new Set<string>(), urls=new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id) || ids.has(item.id)) throw new Error('Each organization link needs a unique ID.');
    if (!organizationLinkTypes.includes(item.type)) throw new Error('Choose a supported organization link type.');
    if (typeof item.url !== 'string' || item.url.trim().length > 2048) throw new Error('Enter a valid organization link URL.');
    let url: URL;
    try { url=new URL(item.url.trim()); } catch { throw new Error('Enter a valid HTTPS organization link.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Organization links must use HTTPS without credentials.');
    if (item.type === 'whatsapp' && !/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]+(?:\?[^#\s]*)?$/.test(item.url.trim())) throw new Error('Use a WhatsApp group invite starting with https://chat.whatsapp.com/.');
    if (urls.has(url.href)) throw new Error('This organization link URL is already listed.');
    if (item.label !== undefined && (typeof item.label !== 'string' || item.label.trim().length > 80)) throw new Error('Link labels must be 80 characters or fewer.');
    ids.add(item.id); urls.add(url.href);
    return {id:item.id,type:item.type,url:url.href,...(item.label?.trim() ? {label:item.label.trim()} : {})};
  });
}

export function readOrganizationLinks(value: unknown): OrganizationLink[] {
  try {
    const rows=typeof value === 'string' ? JSON.parse(value) : value;
    if(!Array.isArray(rows)) return [];
    const result: OrganizationLink[]=[];
    for(const row of rows.slice(0,30)) {
      try { const [link]=normalizeOrganizationLinks([row]); if(!result.some(item=>item.id===link.id || item.url===link.url)) result.push(link); } catch { /* Ignore corrupt legacy entries without hiding valid links. */ }
    }
    return result;
  } catch { return []; }
}
