import {chromium} from '@playwright/test';
import WebSocket from 'ws';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createGameServer} from '../server/server.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(check){const until=Date.now()+15000;while(Date.now()<until){if(await check())return;await sleep(50);}throw new Error('Difficulty condition timeout');}
await mkdir('artifacts',{recursive:true});
const server=await createGameServer({host:'127.0.0.1',port:0}),fixed=await createGameServer({host:'127.0.0.1',port:0,botDifficulty:'elite'}),origin=`http://127.0.0.1:${server.address.port}`;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const context=await browser.newContext({locale:'fr-FR',viewport:{width:1440,height:900}});await context.addInitScript(()=>{if(!localStorage.getItem('fw-settings'))localStorage.setItem('fw-settings',JSON.stringify({volume:0,quality:'low'}));});
const page=await context.newPage(),errors=[],checks=[];let other;
page.on('pageerror',e=>errors.push(e.message));
const state=()=>page.evaluate(()=>window.fieldWarfare.getState());
const pass=name=>{checks.push(name);console.log('OK : '+name);};
async function load(url){await page.goto(url,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.fieldWarfare);await page.locator('#loading').waitFor({state:'detached'});}
async function quit(){await page.evaluate(()=>document.exitPointerLock());await page.waitForFunction(()=>window.fieldWarfare.getState().state==='paused');await page.locator('#quit').click();}
try{
 await load(origin);assert.equal(await page.locator('#bot-difficulty option').count(),4);
 for(const [level,mode]of [['recruit','tdm'],['soldier','assault'],['veteran','survival'],['elite','tdm']]){
  await page.locator('#bot-difficulty').selectOption(level);assert.ok((await page.locator('#bot-difficulty-description').textContent()).length>20);
  await page.locator(`[data-mode="${mode}"]`).click();await page.locator('#deploy').click();await page.waitForFunction(()=>window.fieldWarfare.getState().state==='active');
  const initial=await state();assert.equal(initial.botDifficulty,level);await sleep(500);assert.equal((await state()).botDifficulty,level);assert.equal((await state()).player.alive,true);await quit();pass('solo '+mode+' uses '+level);
 }
 await load(origin);assert.equal(await page.locator('#bot-difficulty').inputValue(),'elite');pass('difficulty choice persists after reload');
 for(const [width,height]of [[1440,900],[1280,720],[1024,768],[820,900],[390,844]]){
  await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const boxes=await page.evaluate(()=>['.intro','.deployment-panel'].map(sel=>{const b=document.querySelector(sel).getBoundingClientRect();return{top:b.top,bottom:b.bottom};}));
  assert.ok(boxes[0].bottom<=boxes[1].top,JSON.stringify({width,height,boxes}));await page.locator('#bot-difficulty').scrollIntoViewIfNeeded();assert.ok(await page.locator('#bot-difficulty').isVisible());
  await page.screenshot({path:`artifacts/bot-difficulty-${width}.png`});
 }pass('selector stays accessible without overlapping the briefing on desktop and mobile');
 await page.setViewportSize({width:1280,height:900});await page.locator('#bot-difficulty').selectOption('veteran');await page.locator('[data-mode="tdm"]').click();await page.locator('[data-venue="online"]').click();await page.locator('#deploy').click();await page.locator('#online-name').fill('Alice');await page.locator('#online-connect').click();await page.waitForFunction(()=>window.fieldWarfare.getState().online);
 assert.equal((await state()).botDifficulty,'veteran');assert.equal(server.room.botDifficulty,'veteran');await waitFor(async()=>(await page.locator('#network-hud').textContent()).includes('VÉTÉRAN'));pass('first human chooses the common online difficulty');
 other=new WebSocket(origin.replace('http:','ws:')+'/multiplayer');const messages=[];other.on('message',m=>messages.push(JSON.parse(m.toString())));other.on('error',()=>{});await once(other,'open');other.send(JSON.stringify({type:'join',name:'Bob',botDifficulty:'recruit'}));await waitFor(()=>messages.some(m=>m.type==='welcome'));assert.equal(messages.find(m=>m.type==='welcome').snapshot.botDifficulty,'veteran');assert.equal((await state()).botDifficulty,'veteran');pass('later players receive the existing difficulty');
 other.terminate();await page.locator('#quit').click();await waitFor(()=>server.room.humanCount===0);
 await load(`http://127.0.0.1:${fixed.address.port}`);await page.locator('#bot-difficulty').selectOption('recruit');await page.locator('[data-mode="tdm"]').click();await page.locator('[data-venue="online"]').click();await page.locator('#deploy').click();await page.locator('#online-name').fill('Alice');await page.locator('#online-connect').click();await page.waitForFunction(()=>window.fieldWarfare.getState().online);
 assert.equal((await state()).botDifficulty,'elite');await waitFor(async()=>(await page.locator('#network-hud').textContent()).includes('ÉLITE'));pass('dedicated server overrides the requested level and shows the applied level');
 assert.deepEqual(errors,[]);await writeFile('artifacts/bot-difficulty-check.json',JSON.stringify({status:'passed',checks,errors},null,2));console.log(JSON.stringify({status:'passed',checks,errors},null,2));
}catch(error){await writeFile('artifacts/bot-difficulty-failure.json',JSON.stringify({error:error.stack,checks,state:await state().catch(()=>null),errors},null,2));throw error;}
finally{other?.terminate();await browser.close();await server.close();await fixed.close();}
