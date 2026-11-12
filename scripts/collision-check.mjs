import {chromium} from '@playwright/test';
import WebSocket from 'ws';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createGameServer} from '../server/server.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(check){const until=Date.now()+12000;while(Date.now()<until){if(await check())return;await sleep(30);}throw new Error('Collision browser condition timeout');}
await mkdir('artifacts',{recursive:true});const server=await createGameServer({host:'127.0.0.1',port:0,fillBots:false}),origin=`http://127.0.0.1:${server.address.port}`;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const context=await browser.newContext({locale:'fr-FR',viewport:{width:1280,height:900}});await context.addInitScript(()=>localStorage.setItem('fw-settings',JSON.stringify({quality:'low',volume:0})));
const page=await context.newPage(),errors=[],checks=[],messages=[];let bob;
page.on('pageerror',e=>errors.push(e.message));const state=()=>page.evaluate(()=>window.fieldWarfare.getState());const pass=name=>{checks.push(name);console.log('OK : '+name);};
try{
 await page.goto(origin,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.fieldWarfare);await page.locator('#loading').waitFor({state:'detached'});await page.locator('[data-mode="tdm"]').click();await page.locator('[data-venue="online"]').click();await page.locator('#deploy').click();await page.locator('#online-name').fill('Alice');await page.locator('#online-connect').click();await page.waitForFunction(()=>window.fieldWarfare.getState().online);
 bob=new WebSocket(origin.replace('http:','ws:')+'/multiplayer');bob.on('message',raw=>messages.push(JSON.parse(raw.toString())));bob.on('error',()=>{});await once(bob,'open');bob.send(JSON.stringify({type:'join',name:'Bob'}));await waitFor(()=>messages.some(m=>m.type==='welcome'));
 const a=server.room.players.get((await state()).id),b=server.room.players.get(messages.find(m=>m.type==='welcome').id);
 async function lane(ax,az,bx,bz){
  if((await state()).state==='active'){await page.evaluate(()=>document.exitPointerLock());await page.waitForFunction(()=>window.fieldWarfare.getState().state==='paused');}
  for(const [p,x,z]of [[a,ax,az],[b,bx,bz]]){Object.assign(p,{x,z,yaw:0,pitch:0,health:100,alive:true,jump:0,vy:0,crouch:false,cooldown:0,protectedUntil:0});p.input={...p.input,forward:0,strafe:0,yaw:0,pitch:0,fire:false,crouch:false};}
  server.broadcast();await waitFor(async()=>Math.hypot((await state()).player.x-ax,(await state()).player.z-az)<.05);
  await page.locator('#resume').click();await page.waitForFunction(()=>window.fieldWarfare.getState().state==='active');
 }
 await lane(-8,8,-8,3);await page.keyboard.down('KeyW');await sleep(2000);await page.keyboard.up('KeyW');await sleep(100);
 assert.ok(a.z>=b.z+.799);assert.ok(a.z<5);assert.ok((await state()).player.z>=b.z+.65);pass('browser prediction and authoritative movement both stop at a living character');
 b.alive=false;b.health=0;b.respawnAt=server.room.clock+100;server.broadcast();await sleep(150);await page.keyboard.down('KeyW');await sleep(500);await page.keyboard.up('KeyW');assert.ok(a.z<b.z+.3);pass('dead characters release the passage');
 await lane(-8,8,-8,3);
 const dx=.34,dz=-5,pitch=Math.atan2((.15+1.2)-server.room.eye(a).y,Math.hypot(dx,dz)),yaw=Math.atan2(-dx,-dz);
 await page.evaluate(({yaw,pitch})=>{const e=new MouseEvent('mousemove');Object.defineProperty(e,'movementX',{value:-yaw/.0018});Object.defineProperty(e,'movementY',{value:-pitch/.0018});document.dispatchEvent(e);document.dispatchEvent(new MouseEvent('mousedown',{button:0}));document.dispatchEvent(new MouseEvent('mouseup',{button:0}));},{yaw,pitch});
 await waitFor(()=>b.health<100);await waitFor(()=>messages.some(m=>m.type==='snapshot'&&m.players.some(p=>p.id===b.id&&p.health<100)));assert.ok(a.hits>0);pass('a real mouse click on the visible arm damages the target and synchronizes the impact');
 await lane(-10,-15,-10,-23);const previous=a.shots;
 await page.evaluate(pitch=>{const e=new MouseEvent('mousemove');Object.defineProperty(e,'movementX',{value:0});Object.defineProperty(e,'movementY',{value:-pitch/.0018});document.dispatchEvent(e);document.dispatchEvent(new MouseEvent('mousedown',{button:0}));document.dispatchEvent(new MouseEvent('mouseup',{button:0}));},-Math.atan2(.57,8));
 await waitFor(()=>a.shots>previous);await sleep(100);assert.equal(b.health,100);pass('the factory wall stops the browser shot before the target');
 assert.deepEqual(errors,[]);await writeFile('artifacts/collision-check.json',JSON.stringify({status:'passed',checks,errors},null,2));console.log(JSON.stringify({status:'passed',checks,errors},null,2));
}catch(error){await writeFile('artifacts/collision-failure.json',JSON.stringify({error:error.stack,checks,room:server.room.snapshot(),client:await state().catch(()=>null),errors},null,2));throw error;}
finally{bob?.terminate();await browser.close();await server.close();}
