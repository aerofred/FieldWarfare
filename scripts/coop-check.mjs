import {chromium} from '@playwright/test';
import WebSocket from 'ws';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createGameServer} from '../server/server.js';
// Online co-op: the lobby's mode and rules create the room, a second human
// joins the same squad, and the mission ends for both.
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(check,timeout=15000){const until=Date.now()+timeout;while(Date.now()<until){if(await check())return;await sleep(30);}throw new Error('Co-op condition timeout');}
await mkdir('artifacts',{recursive:true});
const server=await createGameServer({host:'127.0.0.1',port:0}),origin=`http://127.0.0.1:${server.address.port}`;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const context=await browser.newContext({locale:'fr-FR',viewport:{width:1280,height:900}});await context.addInitScript(()=>{if(!localStorage.getItem('fw-settings'))localStorage.setItem('fw-settings',JSON.stringify({volume:0,quality:'low'}));});
const page=await context.newPage(),errors=[],checks=[],messages=[];let bob;
page.on('pageerror',e=>errors.push(e.message));
const state=()=>page.evaluate(()=>window.fieldWarfare.getState());const pass=name=>{checks.push(name);console.log('OK : '+name);};
try{
 await page.goto(origin,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.fieldWarfare);await page.locator('#loading').waitFor({state:'detached'});
 await page.locator('[data-mode="assault"]').click();await page.locator('[data-rule="blue"][data-step="1"]').click();await page.locator('[data-rule="red"][data-step="-1"]').click();
 await page.locator('[data-venue="online"]').click();assert.match(await page.locator('#deploy-description').textContent(),/ASSAUT/);await page.locator('#deploy').click();
 await waitFor(async()=>(await page.locator('#online-room').textContent()).includes('Salle vide'));await page.screenshot({path:'artifacts/coop-online-modal.png'});
 await page.locator('#online-name').fill('Alice');await page.locator('#online-connect').click();await page.waitForFunction(()=>window.fieldWarfare.getState().online);
 let s=await state();assert.equal(s.mode,'assault');assert.deepEqual(server.room.rules,{mode:'assault',duration:300,blue:2,red:5});assert.equal(s.roster.filter(a=>a.team==='blue').length,2);assert.equal(s.bots,5);pass('the lobby mode and rules create the online co-op room');
 bob=new WebSocket(origin.replace('http:','ws:')+'/multiplayer');bob.on('message',raw=>messages.push(JSON.parse(raw.toString())));bob.on('error',()=>{});await once(bob,'open');
 bob.send(JSON.stringify({type:'join',name:'Bob',team:'red',mode:'ffa'}));await waitFor(()=>messages.some(m=>m.type==='welcome'));
 const welcome=messages.find(m=>m.type==='welcome');assert.equal(welcome.snapshot.mode,'assault');assert.equal(welcome.snapshot.players.find(p=>p.id===welcome.id).team,'blue');
 await waitFor(async()=>(await state()).roster.filter(a=>a.team==='blue'&&!a.isBot).length===2);assert.equal((await state()).roster.filter(a=>a.team==='blue').length,2);pass('a second human replaces the allied bot in the same squad');
 const status=await(await fetch(origin+'/api/server')).json();assert.equal(status.mode,'assault');assert.equal(status.players,2);
 const third=new WebSocket(origin.replace('http:','ws:')+'/multiplayer'),thirdMessages=[];third.on('message',raw=>thirdMessages.push(JSON.parse(raw.toString())));third.on('error',()=>{});await once(third,'open');third.send(JSON.stringify({type:'join',name:'Carol'}));await waitFor(()=>thirdMessages.length>0);assert.match(thirdMessages[0].message,/data\.error\.squadFull/);third.terminate();pass('a full squad refuses another human');
 await page.locator('#resume').click();await page.waitForFunction(()=>window.fieldWarfare.getState().state==='active');
 assert.match(await page.locator('#hud-objective').textContent(),/RELAIS A/);assert.match(await page.locator('#network-hud').textContent(),/EN LIGNE/);await page.screenshot({path:'artifacts/coop-online-gameplay.png'});
 const alice=server.room.players.get(s.id),bobActor=server.room.players.get(welcome.id);alice.protectedUntil=bobActor.protectedUntil=0;const enemy=[...server.room.players.values()].find(p=>p.hostile);
 server.room.damage(bobActor,500,enemy);server.broadcast();await waitFor(async()=>(await state()).roster.find(a=>a.id===bobActor.id)?.alive===false);assert.equal((await state()).state,'active');pass('the mission continues while one squad member is down');
 server.room.damage(alice,500,enemy);server.broadcast();await waitFor(async()=>(await state()).state==='ended');assert.equal(await page.locator('#result-title').textContent(),'ESCOUADE À TERRE.');
 await waitFor(()=>messages.some(m=>m.type==='snapshot'&&m.phase==='over'&&m.result==='red'&&m.resultReason==='wiped'));pass('both humans down ends the mission for the whole squad');
 server.room.restartIn=.01;server.room.tick(.1);server.broadcast();await waitFor(async()=>(await state()).phase==='active');assert.equal(server.room.logic.relay,0);pass('the co-op room restarts the mission');
 bob.close();await page.locator('#quit').click().catch(()=>{});await waitFor(()=>server.room.players.size===0);
 assert.deepEqual(errors,[]);await writeFile('artifacts/coop-check.json',JSON.stringify({status:'passed',checks,errors},null,2));console.log(JSON.stringify({status:'passed',checks,errors},null,2));
}catch(error){await writeFile('artifacts/coop-failure.json',JSON.stringify({error:error.stack,checks,room:server.room.snapshot(),client:await state().catch(()=>null),errors},null,2));throw error;}
finally{bob?.terminate();await browser.close();await server.close();}
