import {chromium} from '@playwright/test'
import assert from 'node:assert/strict'
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader']})
try{
const page=await browser.newPage();await page.route('**/camera-controls-test',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));await page.goto((process.env.MAP_ORIGIN||'http://127.0.0.1:5187')+'/camera-controls-test');await page.evaluate(async()=>{
document.body.innerHTML='<canvas style="width:800px;height:600px"></canvas><input id="field">';const canvas=document.querySelector('canvas');const {createNetworkGPU3D}=await import('/src/features/ecosystem/webgpu-3d-renderer.js');window.r=await createNetworkGPU3D(canvas,console.error,()=>{});r.resize(800,600);r.fit([{x:0,y:0,z:0,renderRadius:10}]);window.project=()=>r.project({x:0,y:0,z:0});
});
const pos=()=>page.evaluate(()=>project());const before=await pos();await page.mouse.move(300,300);await page.mouse.down();await page.mouse.move(340,320,{steps:5});await page.mouse.up();assert.notDeepEqual(await pos(),before);
await page.locator('canvas').focus();const turned=await pos();await page.keyboard.down('w');await page.waitForTimeout(250);await page.keyboard.up('w');assert.notDeepEqual(await pos(),turned);
const stopped=await pos();await page.waitForTimeout(100);assert.deepEqual(await pos(),stopped);
await page.keyboard.down('d');await page.waitForTimeout(250);await page.keyboard.up('d');assert.notDeepEqual(await pos(),stopped);
await page.keyboard.down('w');await page.waitForTimeout(100);await page.locator('input').focus();const blurred=await pos();await page.waitForTimeout(150);assert.deepEqual(await pos(),blurred);await page.keyboard.up('w');await page.keyboard.type('wasd');assert.equal(await page.locator('input').inputValue(),'wasd');await page.evaluate(()=>r.dispose());console.log('PASS drag look, camera movement, strafe, key release, focus loss, typing, disposal');
}finally{await browser.close()}
