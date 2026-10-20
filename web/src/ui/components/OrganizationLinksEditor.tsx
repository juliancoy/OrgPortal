import { organizationLinkTypes, organizationLinkLabels, type OrganizationLink, type OrganizationLinkType } from '../../../../shared/organizationLinks'

export function OrganizationLinksEditor({links,onChange}:{links:OrganizationLink[];onChange:(links:OrganizationLink[])=>void}) {
  const update=(id:string,change:Partial<OrganizationLink>)=>onChange(links.map(link=>link.id===id?{...link,...change}:link))
  return <fieldset className="organization-links-editor">
    <legend>Organization Links</legend>
    <p className="muted">Manage these links once for the organization. Its public page, social shortcuts, and event poster QR options use the same links.</p>
    {links.map((link,index)=><div className="organization-link-editor-row" key={link.id}>
      <label>Type<select aria-label={`Link ${index+1} type`} value={link.type} onChange={event=>update(link.id,{type:event.target.value as OrganizationLinkType})}>{organizationLinkTypes.map(type=><option key={type} value={type}>{organizationLinkLabels[type]}</option>)}</select></label>
      <label>Label (optional)<input aria-label={`Link ${index+1} label`} value={link.label || ''} maxLength={80} placeholder={organizationLinkLabels[link.type]} onChange={event=>update(link.id,{label:event.target.value})}/></label>
      <label>URL<input aria-label={`Link ${index+1} URL`} type="url" maxLength={2048} value={link.url} placeholder={link.type==='whatsapp'?'https://chat.whatsapp.com/…':link.type==='luma'?'https://luma.com/your-community':link.type==='eventbrite'?'https://www.eventbrite.com/o/your-organization':'https://…'} onChange={event=>update(link.id,{url:event.target.value})}/></label>
      <button type="button" aria-label={`Remove link ${index+1}`} onClick={()=>onChange(links.filter(item=>item.id!==link.id))}>Remove</button>
    </div>)}
    <button type="button" disabled={links.length>=30} onClick={()=>onChange([...links,{id:crypto.randomUUID(),type:'website',url:''}])}>Add organization link</button>
  </fieldset>
}
