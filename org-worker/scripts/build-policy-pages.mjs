import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const root = new URL('../../docs/privacy/', import.meta.url);
const files = {privacy:'RETENTION_AND_DELETION.md',support:'SUPPORT.md',terms:'TERMS.md'};
const escape = s => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inline(text) {
 return escape(text).replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_,label,url)=>{
   const page=Object.keys(files).find(k=>files[k]===url);
   const href=page?`/api/org/${page}`:url==='OPERATIONS.md'?'https://github.com/juliancoy/OrgPortal/blob/main/docs/privacy/OPERATIONS.md':url;
   return /^(https:\/\/|\/api\/org\/)/.test(href)?`<a href="${href}">${label}</a>`:label;
 }).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
}
const pages={};
for(const [name,file] of Object.entries(files)) {
 const body=readFileSync(new URL(file,root),'utf8').trim().split(/\n\s*\n/).map(block=>{
  if(block.startsWith('|')) {
   const rows=block.split('\n').filter(row=>!/^\|[\s|:-]+\|$/.test(row));
   return '<div class="table"><table>'+rows.map((row,i)=>'<tr>'+row.split('|').slice(1,-1).map(cell=>`<${i?'td':'th'}>${inline(cell.trim())}</${i?'td':'th'}>`).join('')+'</tr>').join('')+'</table></div>';
  }
  const h=block.match(/^(#{1,3}) (.*)$/);
  return h?`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`:`<p>${inline(block.replace(/\n/g,' '))}</p>`;
 }).join('\n');
 pages[name]=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>OrgPortal ${name}</title><style>body{font:17px/1.65 system-ui,sans-serif;max-width:960px;margin:40px auto;padding:0 20px;color:#17352f;background:#fafcfb}a{color:#155e59}nav{display:flex;gap:20px;flex-wrap:wrap}h1,h2{line-height:1.2}table{border-collapse:collapse;font-size:15px}td,th{border:1px solid #cad8d3;text-align:left;padding:10px;vertical-align:top}.table{overflow:auto}p{overflow-wrap:anywhere}</style><nav><a href="https://orgportal.cc">OrgPortal</a><a href="/api/org/privacy">Privacy</a><a href="/api/org/support">Support</a><a href="/api/org/terms">Terms</a></nav><main>${body}</main></html>`;
}
mkdirSync(new URL('../src/generated/',import.meta.url),{recursive:true});
writeFileSync(new URL('../src/generated/policyPages.json',import.meta.url),JSON.stringify(pages,null,2)+'\n');
