import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtemp, copyFile, appendFile, rm, rename} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
const directory = await mkdtemp(fileURLToPath(new URL('./dev-watch-check-',import.meta.url)))
const files = ['dev.mjs','runtime.mjs','main.cjs','preload.cjs','browser-auth.cjs','desktop.css']
let launcher, output = '', closed, status
const pids = []
async function until(predicate) {
  for(let i=0;i<200;i++) {
    if(predicate())return
    if(closed)throw Error(`Launcher exited (${status}): ${output}`)
    await new Promise(resolve=>setTimeout(resolve,100))
  }
  throw Error(`Timed out: ${output}`)
}
try {
  for(const file of files)await copyFile(new URL(file,import.meta.url),join(directory,file))
  // This temporary shell has the same project root, but needs its own icon.
  await copyFile(new URL('./icon.png',import.meta.url),join(directory,'icon.png'))
  launcher=spawn(process.execPath,[join(directory,'dev.mjs')],{env:{...process.env,ORGPORTAL_SITE_ROOT:fileURLToPath(new URL('../../../BmoreMedTech/',import.meta.url)),XDG_CONFIG_HOME:join(directory,'profile'),WAYLAND_DISPLAY:''},stdio:['ignore','pipe','pipe']})
  launcher.stdout.on('data',data=>{output+=data;for(const match of String(data).matchAll(/desktop started \(PID (\d+)\)/g))pids.push(Number(match[1]))})
  launcher.stderr.on('data',data=>{output+=data})
  launcher.once('close',code=>{closed=true;status=code})
  await until(()=>pids.length===1)
  // Let Electron finish opening before the first restart.
  await new Promise(resolve=>setTimeout(resolve,2000))
  for(const file of ['desktop.css','preload.cjs','main.cjs','runtime.mjs','browser-auth.cjs']) {
    const count=pids.length
    await appendFile(join(directory,file),'\n/* development watcher check */\n')
    await until(()=>pids.length>count)
    assert.throws(()=>process.kill(pids[count-1],0), /ESRCH/)
  }
  const count=pids.length
  await copyFile(join(directory,'main.cjs'),join(directory,'main.cjs.tmp'))
  await rename(join(directory,'main.cjs.tmp'),join(directory,'main.cjs'))
  await until(()=>pids.length>count)
  assert.equal((output.match(/OrgPortal development: /g)||[]).length,1,'Vite must stay running on the same port')
  launcher.kill('SIGTERM')
  await until(()=>closed)
  assert.ok([0,143].includes(status), 'Shutdown should finish normally or report SIGTERM')
  for(const pid of pids)assert.throws(()=>process.kill(pid,0),/ESRCH/)
  console.log('PASS: all five desktop modules restart Electron, atomic saves work, Vite stays running, shutdown leaves no desktop process')
}finally{
  if(launcher&&!closed)launcher.kill('SIGTERM')
  if(launcher&&!closed)await new Promise(resolve=>launcher.once('close',resolve))
  await rm(directory,{recursive:true,force:true})
}
