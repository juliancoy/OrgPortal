import sanitizeHtml from 'sanitize-html';

/** Keep email typography and tables, while removing executable content and network CSS. */
export function sanitizeSupportHtml(input:string|undefined):string|null{
 if(!input)return null;
 const length=/^(?:auto|0|[\d.]+(?:px|em|rem|%))(?:\s+(?:auto|0|[\d.]+(?:px|em|rem|%))){0,3}$/i;
 const color=/^(?:#[a-f\d]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\))$/i;
 const cleaned=sanitizeHtml(input.slice(0,150000),{
  allowedTags:['a','p','div','span','br','strong','b','em','i','u','s','table','thead','tbody','tfoot','tr','th','td','h1','h2','h3','h4','h5','h6','ul','ol','li','blockquote','pre','code','hr','img'],
  allowedAttributes:{'*':['style','title','lang','dir'],a:['href','target','rel'],img:['src','alt','width','height'],table:['width','height','cellpadding','cellspacing','role','align'],td:['width','height','align','valign','colspan','rowspan'],th:['width','height','align','valign','colspan','rowspan']},
  allowedSchemes:['https','http','mailto'],allowedSchemesByTag:{img:['https']},allowProtocolRelative:false,
  allowedStyles:{'*':{
   color:[color],'background-color':[color],background:[color],
   'font-family':[/^[a-z\d\s,'"-]+$/i],'font-size':[/^[\d.]+(?:px|em|rem|%)$/i],'font-weight':[/^(?:normal|bold|bolder|[1-9]00)$/i],
   'font-style':[/^(?:normal|italic|oblique)$/i],'line-height':[/^(?:normal|[\d.]+(?:px|em|%)?)$/i],
   margin:[length],padding:[length],'margin-top':[length],'margin-right':[length],'margin-bottom':[length],'margin-left':[length],'padding-top':[length],'padding-right':[length],'padding-bottom':[length],'padding-left':[length],
   width:[length],height:[length],'max-width':[length],'max-height':[length],'min-width':[length],'min-height':[length],
   border:[/^(?:0|[\d.]+px\s+(?:solid|dashed|dotted)\s+(?:#[a-f\d]{3,8}|[a-z]+))$/i],'border-top':[/^[\d.]+px\s+solid\s+#[a-f\d]{3,8}$/i],'border-bottom':[/^[\d.]+px\s+solid\s+#[a-f\d]{3,8}$/i],'border-radius':[length],'border-collapse':[/^(?:collapse|separate)$/i],
   'text-align':[/^(?:left|right|center|justify)$/i],'text-decoration':[/^(?:none|underline|line-through)$/i],'letter-spacing':[length],
   display:[/^(?:none|block|inline|inline-block|table|table-row|table-cell)$/i],overflow:[/^(?:hidden|auto|visible)$/i],'overflow-wrap':[/^(?:anywhere|break-word|normal)$/i]
  }},
  transformTags:{a:(_tag,attrs)=>({tagName:'a',attribs:{...attrs,target:'_blank',rel:'noopener noreferrer'}})},
 });
 return cleaned.trim()&&cleaned.length<=200000?cleaned:null;
}
