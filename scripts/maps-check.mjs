import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import WebSocket from 'ws';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createGameServer} from '../server/server.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(check){const until=Date.now()+15000;while(Date.now()<until){if(await check())return;await sleep(30);}throw new Error('Map browser condition timeout');}
await mkdir('artifacts',{recursive:true});
const server=await createGameServer({host:'127.0.0.1',port:0}),origin=`http://127.0.0.1:${server.address.port}`;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const context=await browser.newContext({locale:'fr-FR',viewport:{width:1440,height:900}});await context.addInitScript(()=>{if(!localStorage.getItem('fw-settings'))localStorage.setItem('fw-settings',JSON.stringify({quality:'low',volume:0,botDifficulty:'recruit'}));});
const page=await context.newPage(),errors=[],checks=[];let observer;
page.on('pageerror',e=>errors.push(e.message));
const state=()=>page.evaluate(()=>window.fieldWarfare.getState());const pass=name=>{checks.push(name);console.log('OK : '+name);};
async function load(){await page.goto(origin,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.fieldWarfare);await page.locator('#loading').waitFor({state:'detached'});}
async function quit(){await page.evaluate(()=>document.exitPointerLock());await page.waitForFunction(()=>window.fieldWarfare.getState().state==='paused');await page.locator('#quit').click();}
try{
 await load();assert.equal(await page.locator('#map-choice option').count(),6);
 for(const id of ['gardens','railway','desert','market','harbor','factory']){
  await page.locator('#map-choice').selectOption(id);assert.equal((await state()).mapId,id);await page.screenshot({path:`artifacts/map-${id}-lobby.png`});
  for(const mode of ['tdm','assault','survival','ctf','ffa']){await page.locator(`[data-mode="${mode}"]`).click();await page.locator('#deploy').click();await page.waitForFunction(()=>window.fieldWarfare.getState().state==='active');assert.equal((await state()).mapId,id);await sleep(200);assert.equal((await state()).mode,mode);await quit();}
  pass(id+' launches all five solo modes and returns to the same map');
 }
 await page.locator('#map-choice').selectOption('gardens');await load();assert.equal(await page.locator('#map-choice').inputValue(),'gardens');assert.equal((await state()).mapId,'gardens');pass('map selection persists after reload');
 for(const [width,height]of [[1280,720],[820,900],[390,844]]){
  await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const boxes=await page.evaluate(()=>['.intro','.map-selector','.deployment-panel'].map(sel=>{const r=document.querySelector(sel).getBoundingClientRect();return{top:r.top,bottom:r.bottom,left:r.left,right:r.right};}));
  if(width<760){assert.ok(boxes[0].bottom<=boxes[1].top,JSON.stringify(boxes));assert.ok(boxes[1].bottom<=boxes[2].top,JSON.stringify(boxes));}
  await page.locator('#map-choice').scrollIntoViewIfNeeded();assert.equal(await page.locator('#map-choice').isVisible(),true);await page.screenshot({path:`artifacts/map-selector-${width}.png`});
 }pass('map selector is usable on desktop and mobile');await page.setViewportSize({width:1440,height:900});
 for(const id of ['gardens','railway']){
  await page.locator('#map-choice').selectOption(id);await page.locator('[data-mode="tdm"]').click();await page.locator('[data-venue="online"]').click();await page.locator('#deploy').click();await page.locator('#online-name').fill('Alice');await page.locator('#online-connect').click();await page.waitForFunction(()=>window.fieldWarfare.getState().online);assert.equal((await state()).mapId,id);assert.equal(server.room.mapId,id);
  observer=new WebSocket(origin.replace('http:','ws:')+'/multiplayer');const messages=[];observer.on('message',m=>messages.push(JSON.parse(m.toString())));observer.on('error',()=>{});await once(observer,'open');observer.send(JSON.stringify({type:'join',name:'Bob',mapId:id==='gardens'?'railway':'gardens'}));await waitFor(()=>messages.some(m=>m.type==='welcome'));assert.equal(messages.find(m=>m.type==='welcome').snapshot.mapId,id);assert.equal(messages.find(m=>m.type==='welcome').snapshot.players.length,8);
  observer.terminate();await page.locator('#quit').click();await waitFor(()=>server.room.humanCount===0);await page.locator('[data-venue="local"]').click();pass(id+' is shared with another real WebSocket player regardless of their requested map');
 }
 // Bundle a test-only Game instance in memory; no movement cheat is shipped.
 const html=(await readFile('index.html','utf8')).replace('<script type="module" src="/app.js"></script>','');
 await page.route('**/map-simulation',route=>route.fulfill({contentType:'text/html',body:html}));await page.goto(origin+'/map-simulation');
 const harness=await build({stdin:{contents:"import {Game} from './src/game.js';import * as THREE from 'three';import {createWorld,wallDistance} from './src/world.js';window.sim=new Game({quality:'low',volume:0,mapId:'gardens'},state=>{document.getElementById('lobby').classList.toggle('hidden',state!=='lobby');document.getElementById('hud').classList.toggle('hidden',state==='lobby');});document.getElementById('loading').remove();window.sim.lock=()=>{};window.testMap={THREE,createWorld,wallDistance};",resolveDir:process.cwd()},bundle:true,write:false,format:'iife'});await page.addScriptTag({content:harness.outputFiles[0].text});
 const simulation=await page.evaluate(()=>{
  const g=window.sim,{THREE,createWorld,wallDistance}=window.testMap,checks={};
  for(const id of ['gardens','railway']){
   g.settings.mapId=id;g.start('assault',0);const room=g.network.room,me=room.players.get(g.network.id),clear=()=>{for(const p of room.players.values())if(p.hostile&&p.alive){p.protectedUntil=0;room.damage(p,500,me);}};me.protectedUntil=1e9;
   for(let i=0;i<3&&g.state==='active';i++){Object.assign(me,{x:g.relays[i].x,z:g.relays[i].z});for(let t=0;t<8&&g.state==='active';t+=.5){clear();for(let k=0;k<10;k++)g.network.update(.05);}}checks[id+'Objectives']=g.state==='ended'&&g.objective.relay===3;
   g.start('tdm',0);const w=createWorld(id),samples=id==='gardens'?[[{x:0,y:1.7,z:12},{x:1,y:0,z:0}],[{x:-4.2,y:1.7,z:6},{x:0,y:0,z:1}],[{x:0,y:1.7,z:12},{x:0,y:1,z:0}]]:[[{x:0,y:1.7,z:-9},{x:1,y:0,z:0}],[{x:-23,y:1.7,z:-3},{x:0,y:0,z:-1}]];
   checks[id+'Raycasts']=samples.every(([o,d])=>{const ray=new THREE.Raycaster(new THREE.Vector3(o.x,o.y,o.z),new THREE.Vector3(d.x,d.y,d.z),0,30),hit=ray.intersectObjects(g.map.solidMeshes,false)[0];return Math.abs(Math.min(30,hit?.distance??30)-wallDistance(o,d,w.solids,30))<.001;});
  }
  g.settings.mapId='gardens';g.start('tdm',0);g.bots.forEach(b=>b.attack=999);g.yaw=0;Object.assign(g.player,{x:0,z:24});g.keys.add('KeyW');for(let i=0;i<110;i++)g.updatePlayer(1/30);g.keys.clear();checks.walkThroughSouthHouse=g.player.z<8;
  g.yaw=Math.PI;Object.assign(g.player,{x:0,z:-24});g.keys.add('KeyW');for(let i=0;i<110;i++)g.updatePlayer(1/30);g.keys.clear();checks.walkThroughNorthHouse=g.player.z>-8;
  g.pause();return checks;
 });assert.ok(Object.values(simulation).every(Boolean),JSON.stringify(simulation));pass('both houses can be crossed using player movement; objectives and client/server raycasts agree');
 for(const [id,x,z,yaw]of [['gardens',0,17,0],['gardens',0,-17,Math.PI],['railway',-23,-3,-Math.PI/2]]){
  await page.evaluate(({id,x,z,yaw})=>{const g=window.sim;g.settings.mapId=id;g.start('tdm',0);g.bots.forEach(b=>b.attack=999);Object.assign(g.player,{x,z});g.yaw=yaw;g.pitch=0;g.updatePlayer(.001);g.pause();},{id,x,z,yaw});await sleep(100);await page.screenshot({path:`artifacts/map-${id}-interior-${z}.png`});
 }
 assert.deepEqual(errors,[]);await writeFile('artifacts/maps-check.json',JSON.stringify({status:'passed',checks,simulation,errors},null,2));console.log(JSON.stringify({status:'passed',checks,simulation,errors},null,2));
}catch(error){await writeFile('artifacts/maps-failure.json',JSON.stringify({error:error.stack,checks,state:await state().catch(()=>null),errors},null,2));throw error;}
finally{observer?.terminate();await browser.close();await server.close();}
