// Plays a solo mission with touch input only, on an emulated iPhone in
// landscape: no keyboard, no mouse and no pointer lock.
const testOrigin=process.env.TEST_ORIGIN||'http://127.0.0.1:4173';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const context=await browser.newContext({locale:'fr-FR',viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const cdp=await context.newCDPSession(page);
const state=()=>page.evaluate(()=>window.fieldWarfare.getState());
const wait=ms=>page.waitForTimeout(ms);
// Raw touch points, so two fingers can move at once as on a phone.
const touches=points=>points.map(([id,x,y])=>({id,x,y,radiusX:8,radiusY:8,force:1}));
const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:touches(points)});
async function drag(id,from,to,steps=8){await touch('touchStart',[[id,...from]]);for(let i=1;i<=steps;i++)await touch('touchMove',[[id,from[0]+(to[0]-from[0])*i/steps,from[1]+(to[1]-from[1])*i/steps]]);return async()=>touch('touchEnd',[]);}
async function center(selector){const box=await page.locator(selector).boundingBox();assert.ok(box,`${selector} is visible`);return [box.x+box.width/2,box.y+box.height/2];}
async function press(selector,ms=60){const [x,y]=await center(selector);await touch('touchStart',[[9,x,y]]);await wait(ms);await touch('touchEnd',[]);}
const checks=[];
// At 844 × 390 the four right buttons fit in 170 × 180 px (258 × 220 before), and the moved
// buttons all sit left of them.
const innerWidthCheck=c=>844-c.left<=170&&390-c.top<=180&&c.others.every(right=>right<c.left);
try{
 // One novice bot in team deathmatch: a death would not end the run.
 await page.addInitScript(()=>{if(!localStorage.getItem('fw-settings'))localStorage.setItem('fw-settings',JSON.stringify({mode:'tdm',venue:'local',botDifficulty:'recruit',rules:{tdm:{duration:600,score:100,blue:1,red:1}}}));});
 await page.goto(testOrigin,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.fieldWarfare);await page.locator('#loading').waitFor({state:'detached'});
 assert.ok(await page.evaluate(()=>document.body.classList.contains('touch')));checks.push('touch mode detected');
 assert.equal((await page.evaluate(()=>window.fieldWarfare.getRendererInfo())).quality,'low');checks.push('light graphics preset');
 assert.deepEqual(await page.evaluate(()=>['.controls-panel .touch-only','.controls-panel .desktop-only'].map(s=>getComputedStyle(document.querySelector(s)).display)),['flex','none']);checks.push('touch manual in briefing');
 await page.screenshot({path:'artifacts/touch-lobby.png'});
 // The sniper rifle is chosen in the arsenal: its scope is checked below.
 await page.evaluate(()=>document.querySelector('[data-weapon="3"]').click());
 await page.locator('#deploy').tap();await page.waitForFunction(()=>window.fieldWarfare.getState().state==='active');await wait(600);
 let s=await state();assert.equal(s.state,'active');assert.equal(s.touch,true);assert.equal(await page.evaluate(()=>!!document.pointerLockElement),false);checks.push('mission starts without pointer lock');
 assert.ok(await page.locator('[data-touch="fire"]').isVisible());

 // Look: drag on the right half turns the view.
 const yaw0=s.view.yaw;let release=await drag(1,[560,200],[460,170]);await release();s=await state();assert.ok(s.view.yaw>yaw0+.3,`yaw ${yaw0} → ${s.view.yaw}`);checks.push('drag to look');
 // Move: push the stick forward and hold.
 const z0=s.player.z,x0=s.player.x;release=await drag(2,[150,290],[150,240],4);await wait(1200);await release();s=await state();
 const moved=Math.hypot(s.player.x-x0,s.player.z-z0);assert.ok(moved>2,`moved ${moved}`);checks.push('analog stick moves');
 // Two fingers at once: stick held while the other thumb looks around.
 const before=await state();await touch('touchStart',[[3,150,290]]);await touch('touchMove',[[3,150,240]]);
 await touch('touchStart',[[3,150,240],[4,600,200]]);for(let i=1;i<=6;i++)await touch('touchMove',[[3,150,240],[4,600-i*12,200]]);await wait(500);await touch('touchEnd',[]);
 s=await state();assert.ok(Math.abs(s.view.yaw-before.view.yaw)>.2&&Math.hypot(s.player.x-before.player.x,s.player.z-before.player.z)>.8);checks.push('move and look together');
 // Sprint: stick pushed far past its ring.
 const ss=await state();release=await drag(5,[150,300],[150,200],4);await wait(700);const sprinting=await page.evaluate(()=>document.querySelector('.touch-stick').classList.contains('sprint'));await release();
 assert.ok(sprinting);checks.push('sprint gesture');
 // Fire: hold the button, then release.
 await press('[data-touch="fire"]',450);s=await state();assert.ok(s.shots>0&&s.ammo.ammo<5,JSON.stringify(s.ammo));checks.push('fire button');
 await press('[data-touch="reload"]');await page.waitForFunction(()=>window.fieldWarfare.getState().ammo.ammo===5,null,{timeout:20000});checks.push('reload button');
 await press('[data-touch="aim"]');assert.equal((await state()).view.aim,true);await press('[data-touch="aim"]');assert.equal((await state()).view.aim,false);checks.push('aim toggle');
 await press('[data-touch="crouch"]');assert.equal((await state()).view.crouch,true);await press('[data-touch="crouch"]');checks.push('crouch toggle');
 // The right cluster stays small and tight against the edge.
 const cluster=await page.evaluate(()=>{const boxes=['fire','aim','jump','crouch'].map(id=>document.querySelector(`[data-touch="${id}"]`).getBoundingClientRect());return {left:Math.min(...boxes.map(b=>b.left)),top:Math.min(...boxes.map(b=>b.top)),others:['reload','weapon','grenade','fire-left'].map(id=>document.querySelector(`[data-touch="${id}"]`).getBoundingClientRect().right)};});
 assert.ok(innerWidthCheck(cluster),JSON.stringify(cluster));checks.push('compact right cluster');
 // A thumb that lands on a right button and slides still aims.
 for(const id of ['crouch','jump']){const yaw=(await state()).view.yaw,[x,y]=await center(`[data-touch="${id}"]`);const end=await drag(7,[x,y],[x-90,y-10]);await end();await wait(150);const s2=await state();assert.ok(s2.view.yaw>yaw+.25,`${id}: yaw ${yaw} → ${s2.view.yaw}`);if(id==='crouch')assert.equal(s2.view.crouch,false);}
 checks.push('aim through the right buttons');
 const before2=(await state()).shots;await press('[data-touch="fire-left"]',300);assert.ok((await state()).shots>before2);checks.push('left trigger');
 // Stick modes, set from the pause menu like a player would.
 {const setStick=async mode=>{await press('[data-touch="pause"]');await page.waitForFunction(()=>window.fieldWarfare.getState().state==='paused');await page.locator('#pause-settings').tap();await page.locator('#stick-mode').selectOption(mode);await page.locator('#close-settings').tap();await page.locator('#resume').tap();await page.waitForFunction(()=>window.fieldWarfare.getState().state==='active');};
  const rest=await center('.touch-stick'),near=[rest[0]+30,rest[1]-20],far=[rest[0]+120,rest[1]-90];
  const ringAt=async point=>{await touch('touchStart',[[11,...point]]);await wait(150);const r=await page.evaluate(()=>{const el=document.querySelector('.touch-stick'),b=el.getBoundingClientRect();return {held:el.classList.contains('held'),x:b.left+b.width/2,y:b.top+b.height/2,knob:el.firstElementChild.style.transform};});await touch('touchEnd',[]);await wait(100);return r;};
  const at=(r,p)=>r.held&&Math.hypot(r.x-p[0],r.y-p[1])<3;
  let r=await ringAt(far);assert.ok(at(r,far),'floating: '+JSON.stringify(r));
  await setStick('semi');r=await ringAt(near);assert.ok(at(r,rest)&&r.knob.includes('translate'),'semi near: '+JSON.stringify(r));r=await ringAt(far);assert.ok(at(r,far),'semi far: '+JSON.stringify(r));
  await setStick('fixed');r=await ringAt(near);assert.ok(at(r,rest),'fixed near: '+JSON.stringify(r));r=await ringAt(far);assert.ok(!r.held,'fixed far: '+JSON.stringify(r));
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('fw-settings')).stickMode),'fixed');
  await setStick('floating');checks.push('stick modes: floating, semi-fixed, fixed');}
 assert.equal(await page.locator('[data-touch="weapon"]').textContent(),'HÉCATE');
 await press('[data-touch="weapon"]');await wait(300);assert.equal((await state()).weapon,'revolver');assert.equal(await page.locator('[data-touch="weapon"]').textContent(),'RV-357');checks.push('weapon chip by the ammo');
 // The sniper rifle scope comes up at once and does not draw the world twice.
 const open=await page.evaluate(()=>window.fieldWarfare.getRendererInfo().calls);
 await press('[data-touch="weapon"]');await page.waitForFunction(()=>window.fieldWarfare.getState().weapon==='hecate');await wait(400);
 await press('[data-touch="aim"]');await wait(120);
 const scoped=await page.evaluate(()=>({calls:window.fieldWarfare.getRendererInfo().calls,aiming:document.body.classList.contains('aiming')}));
 await page.screenshot({path:'artifacts/touch-scope.png'});
 assert.ok(scoped.aiming&&scoped.calls<open*1.4,JSON.stringify({open,scoped}));checks.push('instant light scope');
 await press('[data-touch="aim"]');for(let i=0;i<3;i++)await press('[data-touch="weapon"]');await page.waitForFunction(()=>window.fieldWarfare.getState().weapon==='revolver');
 await press('[data-touch="grenade"]');await page.waitForFunction(()=>window.fieldWarfare.getState().grenades===1);assert.equal(await page.locator('[data-touch="grenade"] b').textContent(),'1');checks.push('grenade button');
 const [sx,sy]=await center('[data-touch="scores"]');await touch('touchStart',[[6,sx,sy]]);await wait(100);assert.ok(await page.locator('#scoreboard').isVisible());await page.screenshot({path:'artifacts/touch-scores.png'});await touch('touchEnd',[]);await wait(50);assert.ok(!(await page.locator('#scoreboard').isVisible()));checks.push('hold for scores');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('killfeed')).display),'none');checks.push('no kill feed on mobile');
 await page.screenshot({path:'artifacts/touch-gameplay.png'});
 await press('[data-touch="pause"]');await page.waitForFunction(()=>window.fieldWarfare.getState().state==='paused');const frozen=(await state()).elapsed;await wait(400);assert.equal((await state()).elapsed,frozen);
 assert.equal(await page.locator('#lock-help').textContent(),'Touchez Reprendre pour revenir au combat.');await page.screenshot({path:'artifacts/touch-pause.png'});
 await page.locator('#resume').tap();await page.waitForFunction(()=>window.fieldWarfare.getState().state==='active');checks.push('pause and resume');
 // Gyroscope: off by default. On, the view follows the attitude of the
 // device like the screen of a VR headset, in portrait and either way round
 // in landscape; in the sights only when asked.
 {const setGyro=async mode=>{await press('[data-touch="pause"]');await page.waitForFunction(()=>window.fieldWarfare.getState().state==='paused');await page.locator('#pause-settings').tap();await page.locator('#gyro').selectOption(mode);assert.equal(await page.locator('#gyro-sensitivity').isVisible(),mode!=='off');await page.locator('#close-settings').tap();await page.locator('#resume').tap();await page.waitForFunction(()=>window.fieldWarfare.getState().state==='active');};
  // The device goes from one attitude to another (alpha, beta, gamma in
  // degrees, the screen turned by angle) in a few readings: the change of
  // yaw and pitch of the view, and its roll once there.
  // The bots may kill the player meanwhile: each move waits for the respawn.
  const move=async(from,to,angle)=>{await page.waitForFunction(()=>{const s=window.fieldWarfare.getState();return s.state==='active'&&s.player?.alive;},null,{timeout:15000});return page.evaluate(async([from,to,angle])=>{Object.defineProperty(window,'orientation',{value:angle,configurable:true});const send=([alpha,beta,gamma])=>dispatchEvent(new DeviceOrientationEvent('deviceorientation',{alpha,beta,gamma}));send(from);const before=window.fieldWarfare.getState();for(let i=1;i<=6;i++){send(from.map((v,k)=>v+(to[k]-v)*i/6));await new Promise(r=>setTimeout(r,16));}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const after=window.fieldWarfare.getState();return {yaw:after.view.yaw-before.view.yaw,pitch:after.view.pitch-before.view.pitch,roll:after.view.roll};},[from,to,angle]);};
  const deg=Math.PI/180,near=(value,expected)=>Math.abs(value-expected)<.03,is=(m,yaw,pitch,roll)=>assert.ok(near(m.yaw,yaw)&&near(m.pitch,pitch)&&near(m.roll,roll),JSON.stringify({m,yaw,pitch,roll}));
  // Portrait, held upright: the same turn to the left, the top tipped back.
  let m=await move([0,90,0],[30,90,0],0);is(m,0,0,0);
  await setGyro('always');
  m=await move([0,90,0],[30,90,0],0);is(m,30*deg,0,0);
  m=await move([0,90,0],[0,120,0],0);is(m,0,30*deg,0);
  // Landscape, top of the device to the left: the body turns left, the
  // back tips down, the device rolls (its top to the left) and the view
  // rolls with it so the horizon stays level.
  m=await move([90,0,-90],[120,0,-90],90);is(m,30*deg,0,0);
  m=await move([90,0,-90],[90,0,-60],90);is(m,0,-30*deg,0);
  m=await move([90,0,-90],[90,-30,-90],90);is(m,0,0,30*deg);
  // Held the other way round (-90 on iOS, 270 elsewhere).
  m=await move([270,0,90],[300,0,90],-90);is(m,30*deg,0,0);
  m=await move([270,0,90],[300,0,90],270);is(m,30*deg,0,0);
  // Late readings lose nothing: a whole turn in one step.
  m=await move([90,0,-90],[180,0,-90],90);is(m,90*deg,0,0);
  // Aiming does not slow the device: it keeps pointing at the target.
  await press('[data-touch="aim"]');m=await move([90,0,-90],[120,0,-90],90);is(m,30*deg,0,0);await press('[data-touch="aim"]');
  // In the sights only: the device steers nothing otherwise, and the view
  // levels itself once the sights drop.
  await setGyro('aim');m=await move([90,0,-90],[120,0,-90],90);is(m,0,0,0);
  await press('[data-touch="aim"]');m=await move([90,0,-90],[90,-30,-90],90);is(m,0,0,30*deg);await press('[data-touch="aim"]');
  await wait(800);assert.ok(Math.abs((await state()).view.roll)<.02);
  await setGyro('off');await page.evaluate(()=>delete window.orientation);checks.push('gyroscope aiming');}
 // Tilt: choosing it asks for the neutral position and calibrates on it.
 // Leaning away from it turns the view for as long as it lasts: a roll to
 // the left (as a steering wheel) turns left, the back tipped down lowers
 // the view, which stays level; back near neutral the view stops.
 {const pose=([alpha,beta,gamma])=>page.evaluate(([alpha,beta,gamma])=>{Object.defineProperty(window,'orientation',{value:90,configurable:true});dispatchEvent(new DeviceOrientationEvent('deviceorientation',{alpha,beta,gamma}));},[alpha,beta,gamma]);
  const settings=async()=>{await press('[data-touch="pause"]');await page.waitForFunction(()=>window.fieldWarfare.getState().state==='paused');await page.locator('#pause-settings').tap();};
  const play=async()=>{await page.locator('#close-settings').tap();await page.locator('#resume').tap();await page.waitForFunction(()=>window.fieldWarfare.getState().state==='active');};
  const calibrated=()=>page.waitForFunction(()=>document.querySelector('#gyro-calibrate').textContent==='RECALIBRER'&&!document.querySelector('#gyro-calibrate').disabled,null,{timeout:6000});
  const hold=async(angles,ms=400)=>{await page.waitForFunction(()=>{const s=window.fieldWarfare.getState();return s.state==='active'&&s.player?.alive;},null,{timeout:15000});await pose(angles);await wait(50);const before=(await state()).view;await wait(ms);const after=(await state()).view;return {yaw:after.yaw-before.yaw,pitch:after.pitch-before.pitch,roll:after.roll};};
  const still=m=>assert.ok(Math.abs(m.yaw)<.01&&Math.abs(m.pitch)<.01,JSON.stringify(m));
  await settings();await pose([90,0,-90]);await page.locator('#gyro').selectOption('tilt');
  assert.match(await page.locator('#gyro-calibration-note').textContent(),/position neutre/);await calibrated();await play();
  still(await hold([90,0,-90]));still(await hold([90,-2,-90]));
  for(let i=0;i<2;i++){const m=await hold([90,-20,-90]);assert.ok(m.yaw>.25&&Math.abs(m.pitch)<.01&&Math.abs(m.roll)<.02,JSON.stringify(m));}
  {const m=await hold([90,0,-70],250);assert.ok(m.pitch<-.1&&Math.abs(m.yaw)<.01,JSON.stringify(m));}
  still(await hold([90,0,-90]));
  // Recalibrating makes the current lean the neutral one.
  await settings();await pose([90,0,-70]);await page.locator('#gyro-calibrate').tap();await calibrated();await play();
  still(await hold([90,0,-70]));
  await settings();await page.locator('#gyro').selectOption('off');await play();await page.evaluate(()=>delete window.orientation);checks.push('tilt aiming');}
 // Turning the phone to portrait pauses the mission.
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>window.fieldWarfare.getState().state==='paused');assert.ok(await page.locator('.rotate-hint').isVisible());checks.push('portrait pauses');
 await page.setViewportSize({width:844,height:390});
 // iPad in landscape: the left trigger comes down above the stick.
 await page.locator('#resume').tap();await page.waitForFunction(()=>window.fieldWarfare.getState().state==='active');await page.setViewportSize({width:1180,height:820});await wait(200);
 const tablet=await page.evaluate(()=>{const f=document.querySelector('[data-touch="fire-left"]').getBoundingClientRect(),s=document.querySelector('.touch-stick').getBoundingClientRect(),g=document.querySelector('[data-touch="grenade"]').getBoundingClientRect(),overlap=(a,b)=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;return {top:f.top,bottom:f.bottom,stickTop:s.top,clear:!overlap(f,s)&&!overlap(f,g)};});
 await page.screenshot({path:'artifacts/touch-ipad.png'});
 // Sliding from the stick onto the left trigger fires and frees the stick.
 {const shots=(await state()).shots,[fx,fy]=await center('[data-touch="fire-left"]'),[sx,sy]=await center('.touch-stick');await touch('touchStart',[[8,sx,sy]]);for(let i=1;i<=10;i++)await touch('touchMove',[[8,sx+(fx-sx)*i/10,sy+(fy-sy)*i/10]]);await wait(400);
  const slid=await page.evaluate(()=>({held:document.querySelector('.touch-stick').classList.contains('held'),pressed:document.querySelector('[data-touch="fire-left"]').classList.contains('pressed')}));await touch('touchEnd',[]);
  assert.ok(!slid.held&&slid.pressed&&(await state()).shots>shots,JSON.stringify(slid));checks.push('slide from stick to left trigger');}
 assert.ok(tablet.top>820/2&&tablet.bottom<=tablet.stickTop&&tablet.clear,JSON.stringify(tablet));checks.push('tablet left trigger above the stick');
 await page.setViewportSize({width:844,height:390});
 const assets=await page.evaluate(async()=>Promise.all(['/manifest.webmanifest','/icon-180.png','/icon-512.png'].map(async u=>{const r=await fetch(u);return [r.status,r.headers.get('content-type')];})));
 assert.deepEqual(assets.map(a=>a[0]),[200,200,200]);assert.ok(assets[0][1].includes('manifest')&&assets[1][1]==='image/png');checks.push('home screen manifest and icons');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks}));
}finally{await writeFile('artifacts/touch-errors.json',JSON.stringify(errors,null,2));await browser.close();}
