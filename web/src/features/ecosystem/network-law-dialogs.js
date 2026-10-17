export function mountNetworkLawDialogs(root,signal){
 for(const trigger of root.querySelectorAll('[data-law-dialog]')){
  const dialog=root.querySelector('#'+trigger.dataset.lawDialog)
  trigger.addEventListener('click',()=>dialog.showModal(),{signal})
  dialog.querySelector('[data-close-law]').addEventListener('click',()=>dialog.close(),{signal})
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation()},{signal})
  dialog.addEventListener('click',event=>{
   if(event.target!==dialog)return
   const box=dialog.getBoundingClientRect()
   if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close()
  },{signal})
 }
}
