const STORAGE_KEY='orgportal.ecosystem.network.settings'
// Only preferences: searches, selected organizations and camera state stay ephemeral.
export function persistNetworkSettings(root,signal){
 const controls=[...root.querySelectorAll('.eco-network-controls input[id],.eco-network-controls select[id],.eco-network-controls input[name]')].filter(el=>el.id!=='network-search'&&el.id!=='neighbors')
 const key=el=>el.id||`${el.name}:${el.value}`
 const read=()=>{try{const value=JSON.parse(localStorage.getItem(STORAGE_KEY));return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return {}}}
 const saved=read()
 for(const el of controls){
  const value=saved[key(el)]
  if(el.type==='checkbox'){if(typeof value==='boolean')el.checked=value}
  else if(el.type==='color'){if(typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value))el.value=value}
  else if(el.tagName==='SELECT'){if([...el.options].some(option=>option.value===value))el.value=value}
  else if(typeof value==='number'&&Number.isFinite(value)&&(!el.hasAttribute('min')||value>=Number(el.min))&&(!el.hasAttribute('max')||value<=Number(el.max))){el.value=String(value)}
  const output=el.id&&root.querySelector(`#${el.id}-value`)
  if(output)output.textContent=el.id==='link-width'?Number(el.value).toFixed(2):el.step==='0.1'?Number(el.value).toFixed(1):el.value
 }
 const save=()=>{
  const values=read()
  for(const el of controls){const value=el.type==='checkbox'?el.checked:(el.tagName==='SELECT'||el.type==='color')?el.value:el.valueAsNumber;if(el.validity.valid&&(typeof value!=='number'||Number.isFinite(value)))values[key(el)]=value}
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(values))}catch{/* Storage can be disabled or full; preferences still work for this visit. */}
 }
 root.querySelector('.eco-network-controls').addEventListener('input',save,{signal})
 root.querySelector('.eco-network-controls').addEventListener('change',save,{signal})
 root.addEventListener('click',event=>{if(event.target.closest('#network-reset'))save()},{signal})
}
