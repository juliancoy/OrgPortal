import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'
export async function testUploadImageCompression() {
 const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/ui/components/compressUploadImage.ts',import.meta.url))],bundle:true,write:false,format:'iife',globalName:'uploadImages'})
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome'})
 try {
  const page=await browser.newPage();await page.addScriptTag({content:bundle.outputFiles[0].text})
  const result=await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=2400;canvas.height=1200
   const ctx=canvas.getContext('2d');ctx.fillStyle='#087f8c';ctx.fillRect(1200,0,1200,1200)
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))
   const input=new File([blob],'transparent.png',{type:'image/png'}),output=await uploadImages.compressUploadImage(input)
   if(output.size>=input.size||output.type!=='image/webp'||output.name!=='transparent.webp')throw Error('Compression failed')
   const decoded=await createImageBitmap(output)
   if(decoded.width!==2048||decoded.height!==1024)throw Error('Dimensions changed incorrectly')
   const check=document.createElement('canvas');check.width=decoded.width;check.height=decoded.height
   const pixels=check.getContext('2d');pixels.drawImage(decoded,0,0)
   if(pixels.getImageData(0,0,1,1).data[3]!==0||pixels.getImageData(1800,500,1,1).data[3]!==255)throw Error('Transparency changed')
   decoded.close()
   for(const [name,type] of [['animated.gif','image/gif'],['animated.webp','image/webp'],['slides.pdf','application/pdf']]){
    const original=new File(['preserve bytes'],name,{type})
    if(await uploadImages.compressUploadImage(original)!==original)throw Error('Animation or document modified')
   }
   let rejected=false
   try{await uploadImages.compressUploadImage(new File(['broken'],'broken.png',{type:'image/png'}))}catch{rejected=true}
   if(!rejected)throw Error('Invalid image accepted')
   return {inputBytes:input.size,outputBytes:output.size,transparency:'preserved'}
  });console.log('Upload compression:',JSON.stringify(result));return result
 }finally{await browser.close()}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await testUploadImageCompression()
