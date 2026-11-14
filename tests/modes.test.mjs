import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GameRoom} from '../src/sim/room.js';
import {normalizeRules,MODES,rulesSummary} from '../src/modes.js';
import {collides,distance,WEAPONS} from '../src/rules.js';
import {createNavigation} from '../src/navigation.js';
import {createWorld} from '../src/world.js';
import {MAPS} from '../src/maps.js';

function seeded(seed=7){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};}
const actors=room=>[...room.players.values()];
const place=(p,x,z)=>Object.assign(p,{x,z,jump:0,vy:0,alive:true,health:100,protectedUntil:0,cooldown:0});
const run=(room,seconds,dt=1/30)=>{const events=[];for(let i=0;i<seconds/dt;i++){room.tick(dt);events.push(...room.drainEvents());}return events;};

test('rules are clamped to the offered range and snapped to their step',()=>{
 assert.deepEqual(normalizeRules('tdm',{blue:1,red:5,score:43,duration:9999}),{mode:'tdm',duration:1200,score:45,blue:1,red:5});
 assert.deepEqual(normalizeRules('ffa',{players:40,blue:3}),{mode:'ffa',duration:480,score:25,players:12});
 assert.equal(normalizeRules('nonsense').mode,'tdm');assert.equal(normalizeRules('survival',{score:'x'}).score,5);
 for(const [id,mode]of Object.entries(MODES))for(const [key,[value,min,max]]of Object.entries(mode.fields))assert.ok(value>=min&&value<=max,`${id}.${key}`);
 assert.equal(rulesSummary({mode:'tdm',blue:1,red:5,score:40,duration:480}),'1 VS 5 · 40 KILLS · 8 MIN');
});

test('team sizes are set per side: one human alone against five bots',()=>{
 const room=new GameRoom({random:seeded()}),me=room.add({name:'Solo',mode:'tdm',rules:{blue:1,red:5}});
 assert.equal(room.phase,'active');assert.equal(me.team,'blue');
 assert.deepEqual(actors(room).filter(p=>p.team==='blue').map(p=>p.id),[me.id]);assert.equal(actors(room).filter(p=>p.team==='red'&&p.isBot).length,5);
 assert.throws(()=>room.add({name:'Second',team:'blue'}),/data\.error\.teamFull/);const second=room.add({name:'Second'});assert.equal(second.team,'red');assert.equal(actors(room).filter(p=>p.team==='red').length,5);
 const later=new GameRoom();later.add({name:'A',mode:'tdm',rules:{blue:2,red:2}});later.add({name:'B',mode:'ctf',rules:{blue:8,red:8}});assert.equal(later.rules.mode,'tdm');assert.equal(later.players.size,4);
});

test('a dedicated server can impose its mode while the first player picks the rules',()=>{
 const room=new GameRoom({mode:'ctf'});room.add({name:'Host',mode:'ffa',rules:{score:5,blue:2,red:3}});
 assert.equal(room.rules.mode,'ctf');assert.equal(room.rules.score,5);assert.equal(room.players.size,5);
 assert.throws(()=>new GameRoom({mode:'chess'}),/Mode/);assert.throws(()=>room.add({name:'X',mode:'chess'}),/Mode/);
});

test('free-for-all: everyone fights everyone, bots fill the arena and the leader wins at the limit',()=>{
 const room=new GameRoom({random:seeded()}),me=room.add({name:'Ana',mode:'ffa',rules:{players:6,score:5}});
 assert.equal(room.players.size,6);assert.ok(actors(room).every(p=>p.team==='ffa'));assert.ok(actors(room).every(p=>!collides(p.x,p.z,.4,room.world.obstacles)));
 const [a,b]=actors(room).filter(p=>p.isBot);for(const p of actors(room))place(p,26,25);place(a,-8,8);place(b,-8,3);room.clock=5;
 assert.equal(room.damage(b,200,a),true);assert.equal(a.kills,1);assert.equal(b.alive,false);assert.equal(room.damage(me,10,me),false,'no self damage');
 me.kills=4;place(b,-8,3);room.damage(b,200,me);assert.equal(room.phase,'over');assert.equal(room.result,me.id);assert.equal(room.resultName,'Ana');assert.equal(room.resultReason,'score');
 const tie=new GameRoom();tie.add({name:'T',mode:'ffa',rules:{players:3}});tie.remaining=.01;tie.tick(.1);assert.equal(tie.result,'draw');
});

test('free-for-all respawns away from the other combatants',()=>{
 const room=new GameRoom({random:seeded(3)}),me=room.add({name:'Ana',mode:'ffa',rules:{players:8}});
 for(const p of actors(room))if(p!==me)place(p,-8+Math.random(),8+Math.random());room.spawn(me);
 assert.ok(actors(room).filter(p=>p!==me).every(p=>distance(p,me)>10),`${me.x},${me.z}`);
});

test('capture the flag: take, drop, return and capture only while the home flag is safe',()=>{
 const room=new GameRoom({fillBots:false}),blue=room.add({name:'Blue',mode:'ctf',rules:{score:2}}),red=room.add({name:'Red'});assert.equal(room.phase,'active');
 const flags=room.logic.flags,home=MAPS.factory.flags;room.clock=5;
 place(blue,home.red.x,home.red.z);room.tick(1/30);assert.equal(flags.red.state,'carried');assert.equal(blue.carrying,'red');assert.ok(room.drainEvents().some(e=>e.type==='flag'&&e.action==='taken'));
 // Carriers keep fighting but neither sprint nor climb.
 blue.cooldown=0;assert.equal(room.fire(blue),true);assert.equal(blue.carrying,'red');
 const start={x:blue.x,z:blue.z};room.input(blue.id,{seq:1,forward:1,strafe:0,yaw:Math.PI,pitch:0,sprint:true});for(let i=0;i<15;i++)room.tick(1/30);assert.ok(distance(blue,start)<4.5*.5+.05);
 room.damage(blue,200,red);assert.equal(flags.red.state,'dropped');assert.equal(blue.carrying,null);
 place(red,flags.red.x,flags.red.z);room.tick(1/30);assert.equal(flags.red.state,'home','a defender returns the dropped flag');
 // The red carrier cannot score while blue holds the red flag.
 run(room,4.2);place(blue,home.red.x,home.red.z);place(red,home.blue.x,home.blue.z);room.tick(1/30);assert.equal(flags.blue.state,'carried');assert.equal(flags.red.state,'carried');
 place(red,home.red.x,home.red.z);room.tick(1/30);assert.equal(room.scores.red,0);
 place(blue,home.blue.x,home.blue.z);room.tick(1/30);assert.equal(room.scores.blue,0,'blue flag is away too');
 room.damage(red,200,blue);assert.equal(flags.blue.state,'dropped');const returnIn=room.logic.objective().flags.blue.returnIn;assert.ok(returnIn>19);
 room.clock+=20.1;place(blue,home.blue.x+.5,home.blue.z);room.tick(1/30);assert.equal(flags.blue.state,'home');assert.equal(room.scores.blue,1);assert.equal(blue.captures,1);assert.equal(flags.red.state,'home');
 room.scores.blue=1;place(blue,home.red.x,home.red.z);room.tick(1/30);place(blue,home.blue.x,home.blue.z);room.tick(1/30);assert.equal(room.phase,'over');assert.equal(room.result,'blue');
});

test('flag bases sit on open ground that bots can reach from both spawns',()=>{
 for(const [id,map]of Object.entries(MAPS)){
  const world=createWorld(id),nav=createNavigation(world.obstacles);
  for(const team of ['blue','red']){const base=map.flags[team];assert.equal(collides(base.x,base.z,1.2,world.obstacles),false,`${id} ${team}`);
   for(const spawn of [map.teamSpawns.blue[0],map.teamSpawns.red[0]]){const path=nav.findPath(spawn,base);assert.ok(path.length&&distance(path.at(-1),base)<1.5,`${id} ${team} from ${spawn.x},${spawn.z}`);}}
 }
});

test('assault co-op: the squad captures relays together, gets resupplied and wins on the last one',()=>{
 const room=new GameRoom({random:seeded()}),a=room.add({name:'A',mode:'assault',rules:{blue:2,red:4}}),b=room.add({name:'B',team:'red'});
 assert.equal(b.team,'blue','co-op humans always join the squad');assert.equal(actors(room).filter(p=>p.team==='blue').length,2);assert.equal(actors(room).filter(p=>p.hostile).length,4);
 assert.throws(()=>room.add({name:'C'}),/data\.error\.squadFull/);
 for(const p of actors(room))if(p.hostile)place(p,26,-25);
 for(let i=0;i<3;i++){const r=room.mapConfig.relays[i];place(a,r.x,r.z);a.health=40;for(const p of actors(room))if(p.hostile)place(p,26,-25);for(let t=0;t<7.3*30;t++)room.tick(1/30);if(i<2){assert.equal(room.logic.relay,i+1);assert.equal(a.health,100);}}
 assert.equal(room.phase,'over');assert.equal(room.result,'blue');assert.equal(room.resultReason,'objective');
});

test('assault co-op: a fallen human respawns while another fights, and the mission fails if all fall',()=>{
 const room=new GameRoom({random:seeded()}),a=room.add({name:'A',mode:'assault',rules:{blue:2,red:3}}),b=room.add({name:'B'}),enemy=actors(room).find(p=>p.hostile);room.clock=5;
 room.damage(a,200,enemy);assert.equal(room.phase,'active');assert.equal(a.alive,false);for(let i=0;i<10.2*30;i++){room.tick(1/30);b.health=100;b.lastHit=room.clock;}assert.equal(a.alive,true);
 a.protectedUntil=b.protectedUntil=0;room.damage(a,200,enemy);room.damage(b,200,enemy);assert.equal(room.phase,'over');assert.equal(room.result,'red');assert.equal(room.resultReason,'wiped');
 const solo=new GameRoom(),me=solo.add({name:'Solo',mode:'assault'});solo.remaining=.01;solo.tick(.1);assert.equal(solo.result,'red');assert.equal(solo.resultReason,'time');assert.ok(me);
});

test('co-op enemies do light damage, never respawn and are cleared after five seconds',()=>{
 const room=new GameRoom({random:()=>.5}),me=room.add({name:'Solo',mode:'assault'}),enemy=actors(room).find(p=>p.hostile);
 for(const p of actors(room))if(p!==enemy&&p!==me)place(p,26,-25);place(me,-8,8);place(enemy,-8,3);room.clock=5;
 enemy.brain={...enemy.brain,wantsFire:true,targetId:me.id,nextThink:1e9};room.fire(enemy,{direction:{x:0,y:-.06,z:1},damageScale:room.logic.botDamage(enemy),interval:.25});assert.ok(me.health<100&&me.health>=90,`health ${me.health}`);
 room.damage(enemy,200,me);assert.equal(room.scores.blue,1);assert.equal(me.kills,1);const id=enemy.id;run(room,5.2);assert.equal(room.players.has(id),false);
});

test('survival: waves grow, a cleared sector reinforces after six seconds and the last wave wins',()=>{
 const room=new GameRoom({random:seeded()}),me=room.add({name:'Solo',mode:'survival',rules:{score:3,red:3,blue:2}}),ally=actors(room).find(p=>p.isBot&&!p.hostile);
 const clear=()=>{for(const p of actors(room))if(p.hostile&&p.alive){p.protectedUntil=0;room.damage(p,500,me);}};
 assert.equal(room.logic.objective().wave,1);assert.equal(actors(room).filter(p=>p.hostile).length,3);
 ally.protectedUntil=0;room.damage(ally,500,actors(room).find(p=>p.hostile));assert.equal(ally.alive,false);
 clear();room.tick(1/30);assert.equal(room.logic.objective().waveDelay>5,true);run(room,6.1);assert.equal(room.logic.objective().wave,2);assert.equal(actors(room).filter(p=>p.hostile&&p.alive).length,5);assert.equal(ally.alive,true,'fallen squad members return with the next wave');
 clear();run(room,6.2);clear();room.tick(1/30);assert.equal(room.phase,'over');assert.equal(room.result,'blue');
});

test('bots fight in every mode on their own: flags move, arenas score and waves hunt the squad',()=>{
 const ctf=new GameRoom({random:seeded(11)}),watcher=ctf.add({name:'Watcher',mode:'ctf',rules:{blue:4,red:4}});watcher.protectedUntil=1e9;place(watcher,-29,0);watcher.protectedUntil=1e9;
 const ctfEvents=run(ctf,150);assert.ok(ctfEvents.some(e=>e.type==='flag'&&e.action==='taken'),'bots take a flag');
 const ffa=new GameRoom({random:seeded(5)}),viewer=ffa.add({name:'Viewer',mode:'ffa',rules:{players:6}});viewer.protectedUntil=1e9;
 const ffaEvents=run(ffa,60);assert.ok(ffaEvents.filter(e=>e.type==='kill').length>0,'free-for-all bots score');
 const survival=new GameRoom({random:seeded(9)}),solo=survival.add({name:'Solo',mode:'survival'});const before=solo.health;let hurt=false;
 for(let i=0;i<60*30&&!hurt;i++){survival.tick(1/30);if(solo.health<before||!solo.alive)hurt=true;solo.protectedUntil=0;}
 assert.ok(hurt,'hostiles find and engage the squad');
});

test('fire cadence follows the weapon interval at any tick rate',()=>{
 for(const dt of [1/30,1/60]){
  const room=new GameRoom({fillBots:false}),a=room.add({name:'A',weapon:1});room.add({name:'B'});a.cooldown=0;place(a,-29,-29);a.yaw=Math.PI/4;
  room.input(a.id,{seq:1,forward:0,strafe:0,yaw:Math.PI*1.25,pitch:.5,fire:true});const shots=a.shots;
  for(let i=0;i<Math.round(1/dt);i++){room.tick(dt);a.lastInput=room.clock;}
  assert.ok(Math.abs(a.shots-shots-Math.round(1/WEAPONS[1].interval))<=1,`${dt}: ${a.shots-shots} shots`);
 }
});
test('taking the enemy flag ends spawn protection',()=>{
 const room=new GameRoom({fillBots:false}),blue=room.add({name:'Blue',mode:'ctf'});room.add({name:'Red'});room.clock=5;
 const home=MAPS.factory.flags;place(blue,home.red.x,home.red.z);blue.protectedUntil=room.clock+2;room.tick(1/30);
 assert.equal(blue.carrying,'red');assert.equal(blue.protectedUntil<=room.clock,true);
});

