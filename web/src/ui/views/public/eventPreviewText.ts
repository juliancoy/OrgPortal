/** Plain text for compact cards; imported HTML and Markdown are never rendered. */
export function eventPreviewText(value?: string | null) {
 let result = value || ''
 const entities: Record<string,string> = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',hellip:'…',ndash:'–',mdash:'—'}
 for(let pass=0;pass<2;pass++)result=result.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi,(match,key:string)=>{
  if(key.startsWith('#')){const point=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);return point>0&&point<=0x10ffff?String.fromCodePoint(point):' '}
  return entities[key.toLowerCase()]??match
 })
 return result.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ')
  .replace(/<[^>]*>/g,' ')
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g,'$1')
  .replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|>\s*)/gm,'')
  .replace(/\*\*|__|~~|`/g,'').replace(/\s+/g,' ').trim()
}
