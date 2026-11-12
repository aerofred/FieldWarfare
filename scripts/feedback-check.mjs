const testOrigin=process.env.TEST_ORIGIN||'http://127.0.0.1:4173';
import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
// Combat feedback in the browser: multi-kills and streaks, weapon and range
// of each kill, the enemy grenade warning and per-mode personal records.
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const page=await browser.newPage({locale:'fr-FR',viewport:{width:1280,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 const harness=await build({stdin:{contents:"import {Game} from './src/game.js';window.simulation=new Game({sensitivity:1,volume:0,quality:'low'},()=>{});window.simulation.lock=()=>{};",resolveDir:process.cwd()},bundle:true,write:false,format:'iife'});
 const html=(await readFile('index.html','utf8')).replace('<script type="module" src="/app.js"></script>','');await page.route('**/simulation',route=>route.fulfill({contentType:'text/html',body:html}));await page.goto(testOrigin+'/simulation');await page.addScriptTag({content:harness.outputFiles[0].text});await page.evaluate(()=>document.getElementById('loading')?.remove());
 const text=id=>page.locator('#'+id).textContent();
 await page.evaluate(()=>{
  const g=window.simulation;document.getElementById('lobby').classList.add('hidden');document.getElementById('hud').classList.remove('hidden');window.advance=s=>{for(let t=0;t<s;t+=.05)g.network.update(.05);};
  window.begin=rules=>{g.start('tdm',0,null,'factory',rules);const room=g.network.room,me=room.players.get(g.network.id);room.clock+=3;for(const p of room.players.values()){p.protectedUntil=0;if(p.brain)p.brain.nextThink=1e9;}window.room=room;window.me=me;window.enemies=[...room.players.values()].filter(p=>p.team!==me.team);};
  window.begin({blue:1,red:3,score:30});
 });
 const checks={};
 // Two kills within four seconds, then a third: double, then triple and a streak of three.
 await page.evaluate(()=>{const e=window.enemies;Object.assign(e[0],{x:window.me.x,z:window.me.z-12});window.room.damage(e[0],200,window.me);window.advance(1);window.room.damage(e[1],200,window.me,true);window.advance(.1);});
 checks.double=(await text('notifications')).startsWith('DOUBLE ÉLIMINATION');
 checks.killfeedWeapon=(await page.locator('#killfeed div').first().locator('b').textContent())==='LMG-5.56'&&(await text('killfeed')).includes('/ TÊTE');
 await page.evaluate(()=>{window.advance(1);window.room.damage(window.enemies[2],200,window.me);window.advance(.1);});
 checks.triple=(await text('notifications')).startsWith('TRIPLE ÉLIMINATION')&&(await text('notifications')).includes('SÉRIE DE 3');
 await page.screenshot({path:'artifacts/feedback-streak.png'});
 const combat=await page.evaluate(()=>({...window.simulation.combat}));checks.counted=combat.streak===3&&combat.best===3&&combat.headshots===1;
 await page.evaluate(()=>window.simulation.showScoreboard(true));checks.scoreboard=(await text('scoreboard-stats')).includes('SÉRIE · MAX 3');await page.evaluate(()=>window.simulation.showScoreboard(false));
 // An enemy grenade lands to the player's left: the warning sits left of the crosshair.
 await page.evaluate(()=>{const g=window.simulation,me=window.me,e=window.enemies[0];window.advance(4.5);g.yaw=0;window.room.grenades.push({id:'test-grenade',owner:e,x:me.x-3,y:.3,z:me.z,vx:0,vy:0,vz:0,fuse:1.6});window.advance(.1);g.updateGrenadeWarning();});
 const warning=await page.locator('#grenade-warning').boundingBox();
 checks.grenadeWarning=await page.locator('#grenade-warning').isVisible()&&await page.locator('#grenade-warning').evaluate(el=>el.classList.contains('close'))&&warning.x+warning.width/2<640-60&&(await page.locator('#grenade-warning span').textContent())==='3 M';
 await page.screenshot({path:'artifacts/feedback-grenade.png'});
 await page.evaluate(()=>{window.room.grenades.push({id:'own-grenade',owner:window.me,x:window.me.x+2,y:.3,z:window.me.z,vx:0,vy:0,vz:0,fuse:1.6});window.advance(1.7);window.simulation.updateGrenadeWarning();});
 checks.ownGrenadeIgnored=!(await page.locator('#grenade-warning').isVisible());
 // Killed by a rifle: who, with what and from how far; the streak starts over.
 await page.evaluate(()=>{const e=window.enemies[1];Object.assign(e,{x:window.me.x+10,z:window.me.z,weapon:3});window.me.protectedUntil=0;window.room.damage(window.me,200,e);window.advance(.1);});
 checks.killer=/^ÉLIMINÉ PAR .+ · PGM HÉCATE II · 10 M$/.test(await text('respawn-killer'));
 checks.streakReset=await page.evaluate(()=>window.simulation.combat.streak===0&&window.simulation.combat.best===3);
 await page.screenshot({path:'artifacts/feedback-killer.png'});
 // Round won: best streak in the results and a first personal record.
 await page.evaluate(()=>{window.advance(4.5);window.room.scores.blue=29;const e=window.enemies[0];e.protectedUntil=0;window.room.damage(e,200,window.me);window.advance(.1);});
 checks.results=(await text('result-stats')).includes('MEILLEURE SÉRIE')&&/^NOUVEAU RECORD · DEATHMATCH PAR ÉQUIPE · 4 ÉLIMINATIONS · SÉRIE DE 3$/.test(await text('result-record'));
 await page.evaluate(()=>{document.getElementById('hud').classList.add('hidden');document.getElementById('results').classList.remove('hidden');});await page.screenshot({path:'artifacts/feedback-results.png'});
 // A weaker round shows the record without beating it.
 await page.evaluate(()=>{window.begin({blue:1,red:3,score:10});window.room.scores.blue=9;const e=window.enemies[0];window.room.damage(e,200,window.me);window.advance(.1);});
 checks.record=/^RECORD · DEATHMATCH PAR ÉQUIPE · 4 ÉLIMINATIONS · SÉRIE DE 3$/.test(await text('result-record'))&&!(await page.locator('#result-record').evaluate(el=>el.classList.contains('new')));
 await writeFile('artifacts/feedback-check.json',JSON.stringify({checks,errors},null,2));
 for(const [name,ok]of Object.entries(checks))assert.ok(ok,name);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({checks:Object.keys(checks),errors},null,2));
}finally{await browser.close();}
