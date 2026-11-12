import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createGameServer} from '../server/server.js';

await mkdir('artifacts',{recursive:true});
const server=await createGameServer({host:'127.0.0.1',port:0,fillBots:false}),origin=`http://127.0.0.1:${server.address.port}`;
let browser;const errors=[],results=[];
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const page=await browser.newPage({locale:'fr-FR',viewport:{width:1100,height:720}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/app.js',route=>route.fulfill({contentType:'text/javascript',body:''}));await page.goto(origin);
 const harness=await build({stdin:{contents:`import {Game} from './src/game.js';import {NetworkSession} from './src/network.js';import {animateSoldier} from './src/models.js';import * as THREE from 'three';window.sim=new Game({quality:'medium',sensitivity:1,volume:0,mapId:'gardens'},state=>{document.getElementById('lobby').classList.toggle('hidden',state!=='lobby');document.getElementById('hud').classList.toggle('hidden',state==='lobby');});window.NetworkSession=NetworkSession;window.sim.lock=()=>{};window.animateSoldier=animateSoldier;window.THREE=THREE;document.getElementById('loading').remove();`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife'});await page.addScriptTag({content:harness.outputFiles[0].text});
 for(const id of ['gardens','railway','factory']){
  await page.evaluate(id=>{const g=window.sim;g.settings.mapId=id;g.start('tdm');g.pause();g.bots.forEach(b=>b.model.root.visible=false);g.camera.position.set(...(id==='gardens'?[16,6,19]:id==='railway'?[5,4,3]:[8,4,19]));g.camera.lookAt(...(id==='gardens'?[0,2,10]:id==='railway'?[-10,2,-9]:[-7,2,-6]));g.weaponModel.group.visible=false;},id);
  for(const quality of ['low','medium','high']){
   const materials=await page.evaluate(quality=>{const g=window.sim;g.settings.quality=quality;g.setQuality();g.visuals.render();const types=new Set();for(const b of g.bots)b.model.body.traverseVisible(o=>{if(o.isMesh&&o!==b.model.flash)types.add(o.material.type);});let detailedViewModel=false;g.weaponModel.group.traverse(o=>{if(o.material?.isMeshStandardMaterial)detailedViewModel=true;});return{soldiers:[...types],detailedViewModel};},quality);
   assert.deepEqual(materials.soldiers,[quality==='low'?'MeshLambertMaterial':'MeshStandardMaterial']);assert.ok(materials.detailedViewModel,'soldier quality only applies to third-person models');
   const result=await page.evaluate(async quality=>{const g=window.sim;g.settings.quality=quality;g.setQuality();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const times=[];for(let i=0;i<6;i++){const before=performance.now();await new Promise(requestAnimationFrame);times.push(performance.now()-before);}return{quality,shadows:g.renderer.shadowMap.enabled,shadowSize:g.sun.shadow.mapSize.x,ratio:g.renderer.getPixelRatio(),geometries:g.renderer.info.memory.geometries,textures:g.renderer.info.memory.textures,calls:g.renderer.info.render.calls,triangles:g.renderer.info.render.triangles,frameMs:Math.round(times.sort((a,b)=>a-b)[3]),environment:!!g.scene.environment};},quality);
   assert.equal(result.shadows,quality!=='low');assert.ok(result.environment);assert.ok(result.triangles>1000);results.push({map:id,...result});
   if(quality==='high')await page.screenshot({path:`artifacts/graphics-${id}.png`});
  }
  console.log('OK : '+id+' renders in all three profiles');
 }
 // A close view reveals broken skinning, normals and material errors hidden by a lobby camera.
 await page.evaluate(()=>{const g=window.sim;g.settings.mapId='gardens';g.start('tdm');g.pause();g.bots.forEach(b=>b.model.root.visible=false);const b=g.bots[0];b.model.root.visible=true;b.model.root.position.set(10,.15,22);b.model.root.rotation.y=0;b.model.root.scale.y=1;window.animateSoldier(b.model,{alive:true,speed:0},.1);g.camera.position.set(11.4,1.55,24.8);g.camera.lookAt(10,1.12,22);g.weaponModel.group.visible=false;});
 await page.screenshot({path:'artifacts/graphics-soldier.png'});
 const lod=await page.evaluate(()=>{
  const g=window.sim,model=g.bots[0].model,position=model.root.position.clone(),fov=g.camera.fov,levels=[];g.camera.fov=78;g.camera.updateProjectionMatrix();
  for(const distance of [6,20,40,12]){model.root.position.copy(g.camera.position);model.root.position.y-=1;model.root.position.z-=distance;g.visuals.render();levels.push(model.detailLevel);}
  model.root.position.copy(position);g.camera.fov=fov;g.camera.updateProjectionMatrix();g.visuals.render();return levels;
 });assert.deepEqual(lod,[0,1,2,0]);console.log('OK : rendering selects near, medium and far soldier geometry automatically');
 for(const index of [0,1,2]){
  const result=await page.evaluate(index=>{const g=window.sim;g.equip(index,true);g.weaponModel.group.visible=true;Object.assign(g.player,{x:0,z:17});g.yaw=0;g.pitch=0;g.reloadTime=0;g.updatePlayer(.016);const initial=g.weaponModel.magazine.position.y;g.reloadTime=g.weapon.reload*.5;g.updatePlayer(.001);let optics=0;g.weaponModel.group.traverse(o=>{if(o.material?.transparent&&o.material.opacity<.2)optics++;});return{id:g.weapon.id,initial,reloadY:g.weaponModel.magazine.position.y,optics};},index);assert.ok(result.reloadY<result.initial-.1);assert.equal(result.optics>0,['minimi','mp5','hecate'].includes(result.id),'only optical sights have transparent lenses');await page.screenshot({path:`artifacts/graphics-reload-${index}.png`});
  await page.evaluate(()=>{const g=window.sim;g.reloadTime=0;g.aim=true;g.gunAim=1;g.updatePlayer(.01);});await page.screenshot({path:`artifacts/graphics-aim-${index}.png`});
 }
 // Repeated quality/map changes must dispose map textures and geometry instead of accumulating them.
 const memory=await page.evaluate(()=>{const g=window.sim,measure=()=>{g.visuals.render();return{textures:g.renderer.info.memory.textures,geometries:g.renderer.info.memory.geometries};};g.lobby();g.settings.quality='medium';g.setQuality();g.loadMap('factory');const before=measure();for(let i=0;i<3;i++){g.loadMap('gardens');g.loadMap('railway');g.loadMap('factory');}return{before,after:measure()};});
 assert.ok(memory.after.textures<=memory.before.textures+2,JSON.stringify(memory));assert.ok(memory.after.geometries<=memory.before.geometries+2,JSON.stringify(memory));
 const decals=await page.evaluate(()=>{const g=window.sim;g.loadMap('gardens');for(let i=0;i<150;i++)g.visuals.impact({x:12,y:1.6,z:14},{x:7.175,y:1.6,z:14});const count=g.visuals.impacts.count;g.loadMap('factory');return{count,afterMapChange:g.visuals.impacts.count};});assert.equal(decals.count,96);assert.equal(decals.afterMapChange,0);
 const observer=server.room.add({name:'Observer'});observer.protectedUntil=server.room.clock+20;
 await page.evaluate(async()=>{const session=new window.NetworkSession(window.sim,{name:'Alice',address:location.origin});await session.connect();});observer.ammunition[0].ammo--;server.room.reload(observer);
 await page.waitForFunction(id=>{const b=window.sim.bots.find(b=>b.id===id);return b&&b.reload>0&&b.model.rifle.rotation.z>.3;},observer.id);
 await page.waitForFunction(id=>window.sim.bots.find(b=>b.id===id)?.reload===0,observer.id);await page.evaluate(()=>window.sim.lobby());server.room.remove(observer.id);console.log('OK : peer reload drives a real network soldier animation; decals are capped and reset');
 await page.setViewportSize({width:820,height:600});await page.evaluate(()=>window.sim.visuals.render());
 await page.unroute('**/app.js');await page.goto(origin,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.fieldWarfare);await page.locator('#loading').waitFor({state:'detached'});
 await page.locator('#settings-button').click();assert.equal(await page.locator('#quality option').count(),3);assert.equal(await page.locator('#quality').inputValue(),'medium');await page.locator('#quality').selectOption('high');await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.fieldWarfare);await page.locator('#loading').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.fieldWarfare.getRendererInfo().quality),'high');console.log('OK : three profiles are exposed in settings, default balanced and persisted after reload');assert.deepEqual(errors,[]);
 await writeFile('artifacts/graphics-check.json',JSON.stringify({status:'passed',renderer:'Chrome SwiftShader (software; not a GPU FPS benchmark)',profiles:results,memory,errors},null,2));console.log(JSON.stringify({status:'passed',profiles:results,memory,errors},null,2));
}catch(error){console.error(JSON.stringify({errors}));throw error;}finally{await browser?.close();await server.close();}
