import {useState} from 'react'

export function supportMessageDocument(html:string){
 const policy="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src https://lifetech.fyi https://orgportal.cc; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="'+policy+'"><style>html,body{margin:0;padding:0;background:#fff;color:#18343b;font:16px/1.6 Arial,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}</style></head><body>'+html+'</body></html>'
}
export function SupportMessageBody({body,html}:{body:string;html?:string|null}){
 const [plain,setPlain]=useState(false)
 if(!html)return <pre>{body}</pre>
 return <div className="support-message-content">
  <button type="button" className="support-message-format" aria-pressed={plain} onClick={()=>setPlain(value=>!value)}>{plain?'Show formatted message':'Show plain text'}</button>
  {plain?<pre>{body}</pre>:<iframe title="Formatted email" className="support-formatted-message" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" loading="lazy" srcDoc={supportMessageDocument(html)}/>}
 </div>
}
