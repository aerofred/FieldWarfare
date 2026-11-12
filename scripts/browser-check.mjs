const testOrigin=process.env.TEST_ORIGIN||'http://127.0.0.1:4173';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-web-security']});
const page=await browser.newPage({locale:'fr-FR',viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(testOrigin,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.fieldWarfare);await page.locator('#loading').waitFor({state:'detached'});
 await page.screenshot({path:'artifacts/lobby.png'});
 await page.locator('[data-view="arsenal"]').click();await page.locator('[data-weapon="2"]').click();assert.equal(await page.locator('#lobby-weapon').textContent(),'SG-12');await page.screenshot({path:'artifacts/arsenal.png'});
 await page.locator('[data-weapon="0"]').click();await page.locator('#back-play').click();
 await page.locator('#settings-button').click();await page.locator('#quality').selectOption('low');await page.locator('#sensitivity').fill('1.2');await page.locator('#sensitivity').dispatchEvent('input');await page.locator('#close-settings').click();
 await page.locator('#deploy').click();await page.waitForFunction(()=>window.fieldWarfare.getState().state==='active');await page.waitForTimeout(500);
 const start=await page.evaluate(()=>window.fieldWarfare.getState());assert.equal(start.bots,6);assert.equal(start.ammo.ammo,100);assert.equal(start.mode,'assault');assert.ok(await page.evaluate(()=>!!document.pointerLockElement));
 await page.keyboard.down('KeyW');await page.waitForTimeout(1200);await page.keyboard.up('KeyW');const moved=await page.evaluate(()=>window.fieldWarfare.getState());assert.ok(moved.player.z<start.player.z-.5);
 await page.mouse.down();await page.waitForTimeout(450);await page.mouse.up();let state=await page.evaluate(()=>window.fieldWarfare.getState());assert.ok(state.shots>0);assert.ok(state.ammo.ammo<100);
 await page.keyboard.press('KeyR');await page.waitForFunction(()=>window.fieldWarfare.getState().ammo.ammo===100,{timeout:20000});state=await page.evaluate(()=>window.fieldWarfare.getState());assert.equal(state.ammo.ammo,100);assert.ok(state.ammo.reserve<200);
 await page.keyboard.press('Digit2');await page.waitForTimeout(300);assert.equal((await page.evaluate(()=>window.fieldWarfare.getState())).weapon,'revolver');await page.keyboard.press('Digit3');await page.waitForTimeout(300);assert.equal((await page.evaluate(()=>window.fieldWarfare.getState())).weapon,'revolver');await page.keyboard.press('Digit1');await page.waitForTimeout(300);assert.equal((await page.evaluate(()=>window.fieldWarfare.getState())).weapon,'minimi');
 await page.keyboard.press('KeyG');await page.waitForFunction(()=>window.fieldWarfare.getState().grenades===1);
 await page.screenshot({path:'artifacts/gameplay.png'});
 await page.evaluate(()=>document.exitPointerLock());await page.waitForFunction(()=>window.fieldWarfare.getState().state==='paused');const paused=await page.evaluate(()=>window.fieldWarfare.getState().elapsed);await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.fieldWarfare.getState().elapsed),paused);
 await page.locator('#pause-settings').click();assert.equal(await page.locator('#sensitivity').inputValue(),'1.2');await page.locator('#close-settings').click();await page.locator('#resume').click();await page.waitForFunction(()=>window.fieldWarfare.getState().state==='active');await page.evaluate(()=>document.exitPointerLock());await page.locator('#quit').click();
 await page.locator('[data-mode="survival"]').click();await page.locator('#deploy').click();await page.waitForFunction(()=>window.fieldWarfare.getState().state==='active');state=await page.evaluate(()=>window.fieldWarfare.getState());assert.equal(state.mode,'survival');assert.equal(state.wave,1);assert.equal(state.bots,4);await page.evaluate(()=>document.exitPointerLock());await page.locator('#quit').click();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/mobile.png'});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
 await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.fieldWarfare);await page.locator('#settings-button').click();assert.equal(await page.locator('#quality').inputValue(),'low');assert.equal(await page.locator('#sensitivity').inputValue(),'1.2');
 // Exercise complete missions against the production Game class. The test
 // harness is bundled in memory and is never included in the published site.
 const harness=await build({stdin:{contents:"import {Game} from './src/game.js';window.simulation=new Game({sensitivity:1,volume:0,quality:'low'},()=>{});window.simulation.lock=()=>{};",resolveDir:process.cwd()},bundle:true,write:false,format:'iife'});
 const html=(await readFile('index.html','utf8')).replace('<script type="module" src="/app.js"></script>','');
 await page.route('**/simulation',route=>route.fulfill({contentType:'text/html',body:html}));await page.goto(testOrigin+'/simulation');await page.addScriptTag({content:harness.outputFiles[0].text});
 const missions=await page.evaluate(()=>{
   // Missions run in the page's own room, advanced through the real session.
   const g=window.simulation,checks=[],advance=s=>{for(let t=0;t<s;t+=.05)g.network.update(.05);},room=()=>g.network.room,me=()=>room().players.get(g.network.id),clear=()=>{for(const p of room().players.values())if(p.hostile&&p.alive){p.protectedUntil=0;room().damage(p,500,me());}};
   g.start('assault',0);me().protectedUntil=1e9;
   for(let i=0;i<3;i++){const r=[{x:-8,z:8},{x:12,z:-7},{x:-7,z:-23}][i];Object.assign(me(),r);for(let t=0;t<8&&g.objective.relay===i;t+=.5){clear();advance(.5);}checks.push(g.objective.relay===i+1);}
   checks.push(g.state==='ended'&&document.getElementById('result-title').textContent==='MISSION ACCOMPLIE.');
   g.start('survival',1);for(let i=1;i<=5;i++){checks.push(g.objective.wave===i);clear();advance(.1);if(i<5)advance(6.2);}checks.push(g.state==='ended'&&g.objective.wave===5&&document.getElementById('result-title').textContent==='MISSION ACCOMPLIE.');
   g.start('assault',2);room().remaining=.01;advance(.1);checks.push(g.state==='ended'&&document.getElementById('result-title').textContent==='MISSION ÉCHOUÉE.');
   g.start('survival',0);me().protectedUntil=0;room().damage(me(),150,[...room().players.values()].find(p=>p.hostile));advance(.05);checks.push(g.state==='ended'&&g.player.health===0&&document.getElementById('result-title').textContent==='OPÉRATEUR À TERRE.');
   return {checks,staticDrawCalls:g.renderer.info.render.calls};
 });assert.ok(missions.checks.every(Boolean),JSON.stringify(missions));
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks:['WebGL render','arsenal selection','settings persistence','assault launch','pointer lock','movement','automatic fire','reload and reserves','weapon switching','grenades','pause freezes simulation','resume','survival launch','responsive layout','three-relay victory','five-wave victory','timeout defeat','operator defeat'],errors},null,2));
}finally{await writeFile('artifacts/browser-errors.json',JSON.stringify(errors,null,2));await browser.close();}
