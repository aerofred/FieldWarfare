import {chromium} from '@playwright/test';
import WebSocket from 'ws';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createGameServer} from '../server/server.js';
import {WEAPONS} from '../src/rules.js';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(check,timeout=15000){const until=Date.now()+timeout;while(Date.now()<until){if(await check())return;await sleep(30);}throw new Error('Bot browser condition timeout');}
await mkdir('artifacts',{recursive:true});
const server=await createGameServer({port:0,host:'127.0.0.1'}),origin=`http://127.0.0.1:${server.address.port}`;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const context=await browser.newContext({locale:'fr-FR',viewport:{width:1280,height:900}});await context.addInitScript(()=>localStorage.setItem('fw-settings',JSON.stringify({volume:0,quality:'low',sensitivity:1})));
const page=await context.newPage(),errors=[],checks=[];let observer;
page.on('pageerror',e=>errors.push(e.message));
const state=()=>page.evaluate(()=>window.fieldWarfare.getState());
const pass=name=>{checks.push(name);console.log('OK : '+name);};
try{
 await page.goto(origin,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.fieldWarfare);await page.locator('#loading').waitFor({state:'detached'});
 await page.locator('[data-mode="tdm"]').click();await page.locator('[data-venue="online"]').click();await page.locator('#deploy').click();await page.locator('#online-name').fill('Alice');await page.locator('#online-connect').click();await page.waitForFunction(()=>window.fieldWarfare.getState().online);
 let snapshot=await state();assert.equal(snapshot.phase,'active');assert.equal(snapshot.roster.length,8);assert.equal(snapshot.roster.filter(p=>p.isBot).length,7);await waitFor(async()=>(await page.locator('#network-hud').textContent()).includes('7 BOTS'));pass('solo human joins an active 4v4 room with seven bots');
 const start=server.room.snapshot(snapshot.id);await sleep(800);assert.ok(server.room.snapshot(snapshot.id).players.some(p=>p.isBot&&Math.hypot(p.x-start.players.find(a=>a.id===p.id).x,p.z-start.players.find(a=>a.id===p.id).z)>.1));pass('bots move on the server while human is in the menu');
 observer=new WebSocket(origin.replace('http:','ws:')+'/multiplayer');const messages=[];observer.on('message',raw=>messages.push(JSON.parse(raw.toString())));observer.on('error',()=>{});await once(observer,'open');observer.send(JSON.stringify({type:'join',name:'Bob'}));await waitFor(()=>messages.some(m=>m.type==='welcome'));
 await waitFor(async()=>(await state()).roster.filter(p=>p.isBot).length===6);assert.equal(server.room.humanCount,2);pass('second human replaces a bot without interrupting the round');
 await page.locator('#resume').click();await page.waitForFunction(()=>window.fieldWarfare.getState().state==='active');
 await page.keyboard.down('Tab');assert.equal(await page.locator('#scoreboard-roster tbody tr').count(),8);assert.ok((await page.locator('#scoreboard-roster').textContent()).includes(' · BOT'));await page.screenshot({path:'artifacts/multiplayer-bots-scoreboard.png'});await page.keyboard.up('Tab');pass('eight combatants and bot labels in the scoreboard');
 // Both edges occur in one JS task, shorter than the 30 Hz sampling interval.
 for(const [key,weapon,capacity]of [['Digit1','minimi',100],['Digit2','revolver',6]]){
  await page.keyboard.press(key);await waitFor(async()=>(await state()).weapon===weapon);await sleep(450);
  const before=await state();assert.equal(before.player.alive,true);
  await page.evaluate(()=>{document.dispatchEvent(new MouseEvent('mousedown',{button:0}));document.dispatchEvent(new MouseEvent('mouseup',{button:0}));});
  await waitFor(async()=>(await state()).shots>before.shots);const after=await state();assert.equal(after.shots,before.shots+1);assert.equal(after.ammo.ammo,capacity-1);
  pass('quick browser click fires exactly once with '+weapon);
 }
 // Only the main weapon chosen in the lobby and the revolver are carried.
 await page.keyboard.press('Digit3');await sleep(300);assert.equal((await state()).weapon,'revolver');assert.equal(server.room.players.get(snapshot.id).weapon,WEAPONS.findIndex(w=>w.sidearm));pass('the loadout is the chosen weapon and the revolver');
 // Position one server bot in a clear shooting lane. The browser still uses
 // its real mouse handler and the public network protocol to eliminate it.
 const local=server.room.players.get(snapshot.id),enemy=[...server.room.players.values()].find(p=>p.isBot&&p.team!==local.team);
 await page.evaluate(()=>document.exitPointerLock());await page.waitForFunction(()=>window.fieldWarfare.getState().state==='paused');
 for(const p of server.room.players.values())if(p.isBot){p.brain.nextThink=server.room.clock+15;p.brain.path=[];p.brain.targetId=local.id;p.brain.visible=false;p.input={...p.input,forward:0,strafe:0,fire:false};}
 Object.assign(local,{x:-8,z:8,health:100,alive:true,yaw:0,pitch:0,jump:0,vy:0,protectedUntil:server.room.clock+30,cooldown:0});Object.assign(enemy,{x:-8,z:3,health:100,alive:true,jump:0,vy:0,protectedUntil:0});local.input={...local.input,yaw:0,pitch:0,forward:0,strafe:0,fire:false};server.broadcast();
 await waitFor(async()=>Math.abs((await state()).player.z-8)<.1);await page.locator('#resume').click();await page.waitForFunction(()=>window.fieldWarfare.getState().state==='active');
 await page.evaluate(dy=>{const event=new MouseEvent('mousemove');Object.defineProperty(event,'movementX',{value:0});Object.defineProperty(event,'movementY',{value:dy});document.dispatchEvent(event);},Math.atan2(.57,5)/.0018);
 const oldKills=local.kills,oldScore=server.room.scores.blue;
 for(let i=0;i<2;i++){await page.evaluate(()=>{document.dispatchEvent(new MouseEvent('mousedown',{button:0}));document.dispatchEvent(new MouseEvent('mouseup',{button:0}));});await sleep(420);}
 await waitFor(()=>!enemy.alive);assert.equal(local.kills,oldKills+1);assert.equal(server.room.scores.blue,oldScore+1);
 await waitFor(()=>messages.some(m=>m.type==='snapshot'&&m.players.some(p=>p.id===enemy.id&&!p.alive)&&m.teamScores.blue===oldScore+1));pass('human kills server bot and another client receives the same score');
 await waitFor(()=>enemy.alive);assert.equal(enemy.health,100);pass('server bot respawns automatically');
 observer.close();await waitFor(()=>server.room.humanCount===1);await waitFor(async()=>(await state()).roster.filter(p=>p.isBot).length===7);assert.equal(server.room.phase,'active');pass('disconnected human is replaced by a bot');
 await page.evaluate(()=>document.exitPointerLock());await page.waitForFunction(()=>window.fieldWarfare.getState().state==='paused');await page.locator('#quit').click();await waitFor(()=>server.room.players.size===0);pass('empty room removes all bots');
 assert.deepEqual(errors,[]);await writeFile('artifacts/multiplayer-bots-check.json',JSON.stringify({status:'passed',checks,errors},null,2));console.log(JSON.stringify({status:'passed',checks,errors},null,2));
}catch(error){await writeFile('artifacts/multiplayer-bots-failure.json',JSON.stringify({error:error.stack,checks,room:server.room.snapshot(),client:await state().catch(()=>null),errors},null,2));throw error;}
finally{observer?.terminate();await browser.close();await server.close();}
