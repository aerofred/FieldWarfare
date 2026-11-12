const testOrigin=process.env.TEST_ORIGIN||'http://127.0.0.1:4173';
import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
// Competitive modes in the browser: team deathmatch, capture the flag and
// free-for-all, with adjustable team sizes and the real result screens.
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const page=await browser.newPage({locale:'fr-FR',viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const state=()=>page.evaluate(()=>window.fieldWarfare.getState());
async function quit(){await page.evaluate(()=>document.exitPointerLock());await page.waitForFunction(()=>window.fieldWarfare.getState().state==='paused');await page.locator('#quit').click();}
try{
 await page.goto(testOrigin,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.fieldWarfare);await page.locator('#loading').waitFor({state:'detached'});
 await page.locator('#settings-button').click();await page.locator('#quality').selectOption('low');await page.locator('#close-settings').click();
 // One human alone against five bots, set with the lobby steppers.
 await page.locator('[data-mode="tdm"]').click();assert.equal(await page.locator('[data-mode="tdm"]').getAttribute('aria-pressed'),'true');
 for(let i=0;i<3;i++)await page.locator('[data-rule="blue"][data-step="-1"]').click();await page.locator('[data-rule="red"][data-step="1"]').click();
 assert.equal(await page.locator('#rule-blue').textContent(),'1 JOUEUR');assert.match(await page.locator('#deploy-description').textContent(),/1 CONTRE 5/);await page.screenshot({path:'artifacts/deathmatch-lobby.png'});
 await page.locator('#deploy').click();await page.waitForFunction(()=>window.fieldWarfare.getState().state==='active');
 let s=await state();assert.equal(s.mode,'tdm');assert.equal(s.roster.length,6);assert.equal(s.roster.filter(a=>a.team==='blue').length,1);assert.equal(s.roster.filter(a=>a.team==='red').length,5);assert.equal(s.bots,5);assert.ok(s.remaining>475);
 assert.ok(await page.locator('#team-scores').isVisible());assert.equal(await page.locator('#capture-points').isVisible(),false);await page.screenshot({path:'artifacts/deathmatch-gameplay.png'});
 await page.keyboard.down('Tab');assert.equal(await page.locator('#scoreboard-roster tbody tr').count(),6);await page.screenshot({path:'artifacts/deathmatch-scoreboard.png'});await page.keyboard.up('Tab');
 await page.evaluate(()=>document.exitPointerLock());await page.waitForFunction(()=>window.fieldWarfare.getState().state==='paused');const paused=(await state()).remaining;await page.waitForTimeout(500);assert.equal((await state()).remaining,paused);await page.locator('#quit').click();
 await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.fieldWarfare);await page.locator('#loading').waitFor({state:'detached'});assert.equal(await page.locator('#rule-red').textContent(),'5 JOUEURS','rules persist per mode');
 await page.locator('[data-mode="ctf"]').click();await page.locator('#deploy').click();await page.waitForFunction(()=>window.fieldWarfare.getState().state==='active');s=await state();assert.equal(s.mode,'ctf');assert.equal(s.roster.length,8);assert.equal(s.objective.flags.red.state,'home');assert.match(await page.locator('#hud-objective').textContent(),/DRAPEAU/);await page.screenshot({path:'artifacts/ctf-gameplay.png'});await quit();
 await page.locator('[data-mode="ffa"]').click();await page.locator('#deploy').click();await page.waitForFunction(()=>window.fieldWarfare.getState().state==='active');s=await state();assert.equal(s.mode,'ffa');assert.ok(s.roster.every(a=>a.team==='ffa'));assert.equal(s.bots,7);await page.screenshot({path:'artifacts/ffa-gameplay.png'});await quit();
 for(const width of [1024,820,390]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);for(const mode of ['tdm','ctf','ffa']){const bounds=await page.locator(`[data-mode="${mode}"]`).boundingBox();assert.ok(bounds.width>70,`${mode} ${width}`);}}
 await page.screenshot({path:'artifacts/deathmatch-mobile.png'});
 const harness=await build({stdin:{contents:"import {Game} from './src/game.js';window.simulation=new Game({sensitivity:1,volume:0,quality:'low'},()=>{});window.simulation.lock=()=>{};",resolveDir:process.cwd()},bundle:true,write:false,format:'iife'});
 const html=(await readFile('index.html','utf8')).replace('<script type="module" src="/app.js"></script>','');await page.route('**/simulation',route=>route.fulfill({contentType:'text/html',body:html}));await page.setViewportSize({width:1280,height:900});await page.goto(testOrigin+'/simulation');await page.addScriptTag({content:harness.outputFiles[0].text});
 const simulation=await page.evaluate(()=>{
  const g=window.simulation,checks={},title=()=>document.getElementById('result-title').textContent,advance=s=>{for(let t=0;t<s;t+=.05)g.network.update(.05);};
  const begin=(mode,rules)=>{g.start(mode,0,null,'factory',rules);const room=g.network.room,me=room.players.get(g.network.id);room.clock+=3;for(const p of room.players.values()){p.protectedUntil=0;if(p.brain)p.brain.nextThink=1e9;}return {room,me,enemies:[...room.players.values()].filter(p=>p.team!==me.team||p.team==='ffa'&&p!==me)};};
  let {room,me,enemies}=begin('tdm',{blue:2,red:2,score:10});
  const ally=[...room.players.values()].find(p=>p.team==='blue'&&p!==me);checks.friendlyFire=room.damage(ally,200,me)===false;
  room.damage(enemies[0],200,me);advance(.05);checks.singleScore=g.teamScores.blue===1&&g.kills===1&&g.state==='active';
  room.damage(me,200,enemies[1]);advance(.05);checks.playerDeath=!g.player.alive&&g.state==='active'&&!document.getElementById('respawn-overlay').classList.contains('hidden')&&g.teamScores.red===1;
  advance(4.2);checks.playerRespawn=g.player.alive&&g.player.health===100&&document.getElementById('respawn-overlay').classList.contains('hidden');
  for(const p of enemies)p.protectedUntil=0;room.scores.blue=8;room.damage(enemies[0],200,me);room.damage(enemies[1],200,me);advance(.05);checks.blueVictory=g.state==='ended'&&title()==='VICTOIRE ALPHA.'&&document.querySelectorAll('#result-roster tbody tr').length===4;
  ({room,me,enemies}=begin('tdm',{score:10}));room.scores.red=9;room.damage(me,200,enemies[0]);advance(.05);checks.redVictory=g.state==='ended'&&title()==='DÉFAITE ALPHA.';
  for(const [name,blue,red,expected]of[['timeoutWin',8,7,'VICTOIRE ALPHA.'],['timeoutLoss',7,8,'DÉFAITE ALPHA.'],['draw',8,8,'ÉGALITÉ.']]){({room}=begin('tdm'));room.scores={blue,red};room.remaining=.01;advance(.05);checks[name]=g.state==='ended'&&title()===expected;}
  // Capture the flag through the HUD: take, carry home, score, win.
  ({room,me}=begin('ctf',{score:1}));const bases=room.mapConfig.flags;Object.assign(me,{x:bases.red.x,z:bases.red.z});advance(.1);g.updateHUD();
  checks.flagTaken=g.player.carrying==='red'&&document.getElementById('hud-objective').textContent==='RAPPORTEZ LE DRAPEAU À VOTRE BASE';
  Object.assign(me,{x:bases.blue.x,z:bases.blue.z});advance(.1);checks.flagCaptured=g.state==='ended'&&title()==='VICTOIRE ALPHA.'&&g.teamScores.blue===1&&document.getElementById('result-stats').textContent.includes('VOS CAPTURES');
  // Free-for-all: the human wins at the limit, or reads their place.
  ({room,me,enemies}=begin('ffa',{players:4,score:5}));for(let i=0;i<2;i++){room.damage(enemies[i],200,me);}me.kills=4;enemies[2].protectedUntil=0;room.damage(enemies[2],200,me);advance(.05);checks.ffaVictory=g.state==='ended'&&title()==='VICTOIRE.'&&document.querySelectorAll('#result-roster tbody tr').length===4;
  ({room,me,enemies}=begin('ffa',{players:4,score:5}));enemies[0].kills=4;room.damage(enemies[1],200,enemies[0]);advance(.05);checks.ffaPlace=g.state==='ended'&&/PLACE\.$/.test(title());
  ({room}=begin('tdm'));checks.restart=g.teamScores.blue===0&&g.teamScores.red===0&&g.bots.length===7&&g.player.deaths===0&&g.state==='active';
  return{checks};
 });assert.ok(Object.values(simulation.checks).every(Boolean),JSON.stringify(simulation,null,2));assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',...simulation,errors},null,2));await writeFile('artifacts/deathmatch-check.json',JSON.stringify(simulation,null,2));
}finally{await writeFile('artifacts/deathmatch-browser-errors.json',JSON.stringify(errors,null,2));await browser.close();}
