export function supportEventLinks(provenance: string): {id:string;url:string;title:string}[] {
 try {
  const rows:unknown=JSON.parse(provenance);
  if (!Array.isArray(rows)) return [];
  const seen=new Set<string>();
  return rows.flatMap(row=>{
   if (!row || typeof row.eventId!=='string' || typeof row.eventUrl!=='string' || typeof row.eventTitle!=='string' || seen.has(row.eventId)) return [];
   const url=new URL(row.eventUrl);
   if (!['https:','http:'].includes(url.protocol) || url.username || url.password || !/^\/(?:p\/)?events\/[^/]+$/.test(url.pathname)) return [];
   seen.add(row.eventId);return [{id:row.eventId,url:url.href,title:row.eventTitle}];
  });
 } catch {return []}
}
