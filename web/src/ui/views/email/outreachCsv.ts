export type OutreachRow={email:string;name:string;source_url:string;source_checked_at:string;approved:boolean;review_reason:string}
export function parseOutreachCsv(text:string):OutreachRow[]{
 if(text.length>1_000_000)throw Error('Use a CSV file under 1 MB.')
 const rows:string[][]=[];let row:string[]=[],value='',quoted=false
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(value);value=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(v=>v.trim()))rows.push(row);row=[];value=''}else value+=c}
 if(quoted)throw Error('The CSV contains an unclosed quote.');row.push(value);if(row.some(v=>v.trim()))rows.push(row)
 const headers=(rows.shift()||[]).map(h=>h.replace(/^\uFEFF/,'').trim().toLowerCase());if(!headers.includes('email'))throw Error('The CSV needs an email column.')
 if(rows.length>500)throw Error('Import at most 500 rows per campaign.')
 return rows.map(values=>{const r=Object.fromEntries(headers.map((h,i)=>[h,values[i]||'']));return {email:r.email.trim().toLowerCase(),name:r.name||r.organization||r.organizations||'',source_url:r.source_url||r.email_source_url||r.sources?.split(' | ')[0]||'',source_checked_at:r.source_checked_at||r.checked_at_utc||r.original_source_checked_at?.split(' | ')[0]||'',approved:false,review_reason:r.review_reason||r.review_reasons||''}})
}
