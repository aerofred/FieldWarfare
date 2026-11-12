// Plays with a simulated controller, from the lobby to the pause menu, on a
// desktop page and then on an emulated phone. Headless browsers have no real
// controller, so navigator.getGamepads returns a pad the test drives.
const testOrigin=process.env.TEST_ORIGIN||'http://127.0.0.1:4173';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const errors=[],checks=[];
const PAD=['a','b','x','y','lb','rb','lt','rt','back','start','ls','rs','up','down','left','right'];
async function open(options,id){
 const context=await browser.newContext({locale:'fr-FR',...options}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(id=>{
  const pad={id,index:0,connected:true,mapping:'standard',timestamp:0,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0})),vibrationActuator:{effects:[],playEffect(type,params){this.effects.push(params);return Promise.resolve('complete');}}};
  window.testPad=pad;Object.defineProperty(navigator,'getGamepads',{value:()=>[pad,null,null,null]});
  // One novice bot in team deathmatch: a death does not end the run.
  localStorage.setItem('fw-settings',JSON.stringify({mode:'tdm',venue:'local',botDifficulty:'recruit',volume:0,quality:'low',rules:{tdm:{duration:600,score:100,blue:1,red:1}}}));
 },id);
 await page.goto(testOrigin,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.fieldWarfare);await page.locator('#loading').waitFor({state:'detached'});
 current=page;await page.evaluate(()=>{const e=new Event('gamepadconnected');e.gamepad=window.testPad;dispatchEvent(e);});
 return {context,page};
}
const set=(page,changes)=>page.evaluate(([changes,names])=>{const p=window.testPad;for(const [k,v]of Object.entries(changes)){if(k.startsWith('axis'))p.axes[Number(k.slice(4))]=v;else{const b=p.buttons[names.indexOf(k)];b.value=typeof v==='number'?v:v?1:0;b.pressed=b.value>.5;}}p.timestamp=performance.now();},[changes,PAD]);
// Software rendering is slow: hold each press for several frames.
const tap=async(page,name,ms=220)=>{await set(page,{[name]:true});await page.waitForTimeout(ms);await set(page,{[name]:false});await page.waitForTimeout(220);};
let current;const state=(page=current)=>page.evaluate(()=>window.fieldWarfare.getState());
try{
 // Desktop with an Xbox controller.
 let {context,page}=await open({viewport:{width:1280,height:800}},'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)');
 assert.ok(await page.evaluate(()=>document.body.classList.contains('pad-connected')));
 assert.equal(await page.locator('.controls-panel .pad-only kbd').first().textContent(),'STICK GAUCHE / L3');checks.push('controller detected, manual labels');
 await tap(page,'start');await page.waitForFunction(()=>window.fieldWarfare.getState().state==='active');let s=await state();
 assert.equal(s.gamepad,true);assert.equal(s.aimAssist.enabled,true);assert.equal(await page.evaluate(()=>!!document.pointerLockElement),false);checks.push('start deploys without mouse capture');
 assert.deepEqual(await page.locator('.hud-hints kbd').allTextContents(),['X','LT','Y','MENU']);checks.push('HUD hints show controller buttons');
 const yaw0=s.view.yaw;await set(page,{axis2:1});await page.waitForTimeout(400);await set(page,{axis2:0});s=await state();assert.ok(s.view.yaw<yaw0-.15,`yaw ${yaw0} → ${s.view.yaw}`);checks.push('right stick looks');
 const p0=s.player;await set(page,{axis1:-1});await page.waitForTimeout(1000);await set(page,{axis1:0});s=await state();{const moved=Math.hypot(s.player.x-p0.x,s.player.z-p0.z);assert.ok(moved>1,`moved ${moved}`);}checks.push("left stick moves");
 await set(page,{rb:true});await page.waitForTimeout(450);await set(page,{rb:false});await page.waitForTimeout(80);s=await state();assert.ok(s.shots>0&&s.ammo.ammo<100);checks.push('RB fires');
 assert.ok(await page.evaluate(()=>window.testPad.vibrationActuator.effects.length>0));checks.push('recoil rumble');
 await set(page,{lb:true});await page.waitForTimeout(260);assert.equal((await state()).view.aim,true);await set(page,{lb:false});await page.waitForTimeout(260);assert.equal((await state()).view.aim,false);checks.push('LB aims');
 await tap(page,'x');await page.waitForFunction(()=>window.fieldWarfare.getState().ammo.ammo===100,null,{timeout:20000});checks.push('X reloads');
 await tap(page,'b');assert.equal((await state()).view.crouch,true);await tap(page,'b');assert.equal((await state()).view.crouch,false);checks.push('B crouches');
 await tap(page,'y');await page.waitForTimeout(250);assert.equal((await state()).weapon,'revolver');await tap(page,'left');await page.waitForTimeout(250);assert.equal((await state()).weapon,'minimi');checks.push('Y and d-pad switch weapons');
 // A quick RT press draws the revolver and still fires it once ready.
 const shots=(await state()).shots;await tap(page,'rt',120);await page.waitForFunction(n=>{const s=window.fieldWarfare.getState();return s.weapon==='revolver'&&s.shots>n;},shots,{timeout:5000});
 s=await state();assert.equal(s.ammo.ammo,5);checks.push('RT draws the revolver and fires');
 // Software rendering slows game time: let the revolver's cycle end.
 await page.waitForTimeout(1600);await tap(page,'rt');await page.waitForFunction(()=>window.fieldWarfare.getState().ammo.ammo===4,null,{timeout:5000});checks.push('RT keeps firing the revolver');
 await tap(page,'y');await page.waitForFunction(()=>window.fieldWarfare.getState().weapon==='minimi');
 await tap(page,'lt');await page.waitForFunction(()=>window.fieldWarfare.getState().grenades===1);checks.push('LT throws a grenade');
 await set(page,{back:true});await page.waitForTimeout(260);assert.ok(await page.locator('#scoreboard').isVisible());await set(page,{back:false});await page.waitForTimeout(260);assert.ok(!(await page.locator('#scoreboard').isVisible()));checks.push('VIEW holds the scores');
 await page.screenshot({path:'artifacts/gamepad-gameplay.png'});
 await tap(page,'start');await page.waitForFunction(()=>window.fieldWarfare.getState().state==='paused');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'resume');
 await tap(page,'down');assert.equal(await page.evaluate(()=>document.activeElement.id),'pause-settings');await tap(page,'a');assert.ok(await page.locator('#settings').isVisible());
 const before=await page.locator('#sensitivity').inputValue();await tap(page,'down');assert.equal(await page.evaluate(()=>document.activeElement.id),'sensitivity');await tap(page,'right');assert.ok(Number(await page.locator('#sensitivity').inputValue())>Number(before));
 await page.screenshot({path:'artifacts/gamepad-menu.png'});
 // Aim assist setting: reachable with the d-pad and saved.
 for(let i=0;i<3;i++)await tap(page,'down');assert.equal(await page.evaluate(()=>document.activeElement.id),'aim-assist');await tap(page,'right');
 assert.equal(await page.locator('#aim-assist').inputValue(),'strong');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('fw-settings')).aimAssist),'strong');checks.push('aim assist setting');
 await tap(page,'b');assert.ok(!(await page.locator('#settings').isVisible()));await tap(page,'b');await page.waitForFunction(()=>window.fieldWarfare.getState().state==='active');checks.push('menus: d-pad, A, B, sliders');
 // The keyboard takes over again, and Escape pauses without mouse capture.
 await page.keyboard.press('Escape');await page.waitForFunction(()=>window.fieldWarfare.getState().state==='paused');s=await state();assert.equal(s.gamepad,false);assert.equal(s.aimAssist.enabled,false);
 assert.equal(await page.locator('.hud-hints kbd').first().textContent(),'R');checks.push('keyboard takes over');
 await context.close();

 // Phone with a PlayStation controller: touch buttons give way to it.
 ({context,page}=await open({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:2},'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'));
 await tap(page,'start');await page.waitForFunction(()=>window.fieldWarfare.getState().state==='active');
 assert.ok(!(await page.locator('[data-touch="fire"]').isVisible()));checks.push('touch buttons hidden while the controller plays');
 assert.equal(await page.locator('.controls-panel .pad-only kbd').nth(4).textContent(),'✕ / ○');checks.push('PlayStation symbols');
 await set(page,{rb:true});await page.waitForTimeout(300);await set(page,{rb:false});assert.ok((await state()).shots>0);
 await page.touchscreen.tap(600,200);await page.waitForTimeout(260);assert.ok(await page.locator('[data-touch="fire"]').isVisible());checks.push('touch takes over again');
 await context.close();
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks}));
}finally{await writeFile('artifacts/gamepad-errors.json',JSON.stringify(errors,null,2));await browser.close();}
