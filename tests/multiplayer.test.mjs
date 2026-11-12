import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MultiplayerRoom,safeName} from '../server/room.js';
import {createWorld,clearShot} from '../src/world.js';
import {collides,WEAPONS,moveSpeed,shotSpread} from '../src/rules.js';
const twoPlayers=()=>{const room=new MultiplayerRoom({random:()=>.5,fillBots:false});const blue=room.add({name:'Alice'}),red=room.add({name:'Bob'});room.clock=3;return{room,blue,red};};
const arena=(a,x,z)=>Object.assign(a,{x,z,health:100,alive:true,protectedUntil:0,cooldown:0,yaw:0,pitch:0,jump:0});

test('human room waits for opponents, balances eight slots and rejects a ninth',()=>{
 const room=new MultiplayerRoom({fillBots:false});room.add({name:'Alice'});assert.equal(room.phase,'waiting');room.add({name:'Bob'});assert.equal(room.phase,'active');
 for(let i=0;i<6;i++)room.add({name:'Player '+i});assert.equal(room.players.size,8);assert.equal([...room.players.values()].filter(p=>p.team==='blue').length,4);assert.throws(()=>room.add({name:'Ninth'}),/data\.error\.serverFull/);
 for(const actor of room.players.values())assert.equal(collides(actor.x,actor.z,.4,room.world.obstacles),false);
});
test('name and team validation rejects invalid identities and full teams',()=>{
 const room=new MultiplayerRoom({fillBots:false});assert.throws(()=>room.add({name:'',team:'blue'}),/data\.error\.badName/);assert.throws(()=>room.add({name:'Valid',team:'admin'}),/data\.error\.badTeam/);
 for(let i=0;i<4;i++)room.add({name:'Alpha '+i,team:'blue'});assert.throws(()=>room.add({name:'Extra',team:'blue'}),/data\.error\.teamFull/);
 assert.equal(safeName('<img src=x>'),'img srcx');assert.ok(safeName('X'.repeat(100)).length<=18);
});
test('server owns position, clamps movement and stops stale or invalid input',()=>{
 const {room,blue}=twoPlayers(),start={x:blue.x,z:blue.z};
 room.input(blue.id,{seq:1,forward:100,strafe:0,yaw:0,pitch:0,x:999,z:999});room.tick(.1);assert.ok(Math.abs(blue.z-start.z)<=.451);assert.equal(blue.x,start.x);
 room.input(blue.id,{seq:2,forward:NaN,strafe:0,yaw:0,pitch:0});assert.equal(blue.input.seq,1);
 for(let i=0;i<4;i++)room.tick(.1);const stopped=blue.z;room.tick(.1);assert.equal(blue.z,stopped);
 arena(blue,-18,-11);for(let i=0;i<30;i++){room.input(blue.id,{seq:10+i,forward:0,strafe:1,yaw:0,pitch:0});room.tick(1/30);}assert.ok(blue.x<=-17.68);assert.equal(collides(blue.x,blue.z,.34,room.world.obstacles),false);
});
test('server validates hits and ammunition, awards one kill and respawns the victim',()=>{
 const {room,blue,red}=twoPlayers();arena(blue,-8,8);arena(red,-8,3);blue.pitch=-Math.atan2(.57,5);
 for(let i=0;i<4;i++){blue.cooldown=0;assert.equal(room.fire(blue),true);}assert.equal(red.alive,false);assert.equal(room.scores.blue,1);assert.equal(blue.ammunition[0].ammo,96);
 blue.cooldown=0;room.fire(blue);assert.equal(room.scores.blue,1);assert.equal(red.deaths,1);
 for(let i=0;i<39;i++)room.tick(.1);assert.equal(red.alive,false);room.tick(.2);assert.equal(red.alive,true);assert.equal(red.health,100);assert.equal(room.damage(red,200,blue),false);assert.equal(red.deaths,1);
});
test('wall occlusion and friendly bodies block weapon hits',()=>{
 const {room,blue,red}=twoPlayers();arena(blue,-10,-15);arena(red,-10,-23);assert.equal(clearShot(room.eye(blue),room.eye(red),createWorld().solids),false);room.fire(blue);assert.equal(red.health,100);
 const friend=room.add({name:'Ally',team:'blue'});arena(blue,-8,10);arena(friend,-8,6);arena(red,-8,2);blue.pitch=-Math.atan2(.57,4);room.fire(blue);assert.equal(friend.health,100);assert.equal(red.health,100);assert.equal(room.scores.blue,0);
});
test('grenades share team damage rules and server-owned counts',()=>{
 const {room,blue,red}=twoPlayers();const friend=room.add({name:'Ally',team:'blue'});arena(blue,-8,10);arena(friend,-7.7,8);arena(red,-8,8);room.throwGrenade(blue);room.throwGrenade(blue);room.throwGrenade(blue);assert.equal(room.grenades.length,2);assert.equal(blue.grenades,0);
 room.explode({x:-8,y:.3,z:8,owner:blue});assert.equal(friend.health,100);assert.equal(blue.health,100);assert.equal(red.alive,false);assert.equal(room.scores.blue,1);
});
test('reload, weapon changes and fire cadence are enforced by the server',()=>{
 const {room,blue}=twoPlayers();blue.cooldown=0;room.fire(blue);const ammo=blue.ammunition[0].ammo;assert.equal(room.fire(blue),false);assert.equal(blue.ammunition[0].ammo,ammo);
 room.action(blue.id,{action:'reload'});assert.ok(blue.reload>0);blue.cooldown=0;assert.equal(room.fire(blue),false);for(let i=0;i<150;i++)room.tick(1/30);assert.equal(blue.ammunition[0].ammo,100);assert.equal(blue.ammunition[0].reserve,199);
 const sidearm=WEAPONS.findIndex(w=>w.sidearm);room.action(blue.id,{action:'weapon',weapon:sidearm});assert.equal(blue.weapon,sidearm);
 room.action(blue.id,{action:'weapon',weapon:2});assert.equal(blue.weapon,sidearm,'only the weapon chosen on joining');room.action(blue.id,{action:'weapon',weapon:99});assert.equal(blue.weapon,sidearm);
 room.action(blue.id,{action:'weapon',weapon:0});assert.equal(blue.weapon,0);
 const sniper=room.add({name:'Carol',weapon:3});assert.equal(sniper.weapon,3);room.action(sniper.id,{action:'weapon',weapon:0});assert.equal(sniper.weapon,3);assert.equal(room.add({name:'Dave',weapon:sidearm}).weapon,0,'the sidearm is never the main weapon');
});
test('round ends at limit, restarts automatically and returns to waiting after disconnect',()=>{
 const {room,blue,red}=twoPlayers();room.scores.blue=39;room.damage(red,200,blue);assert.equal(room.phase,'over');assert.equal(room.result,'blue');const round=room.round;room.tick(10.1);assert.equal(room.phase,'active');assert.equal(room.round,round+1);assert.deepEqual(room.scores,{blue:0,red:0});
 room.remove(red.id);assert.equal(room.phase,'waiting');assert.equal(room.snapshot(blue.id).players.length,1);assert.equal(blue.alive,true);
});
test('a shotgun blast sums its pellets into one hit, deadly up close and weak at range',()=>{
 const {room,blue,red}=twoPlayers(),shotgun=WEAPONS.findIndex(w=>w.id==='r870');blue.weapon=shotgun;
 arena(blue,-8,8);arena(red,-8,4);blue.pitch=-Math.atan2(.57,4);room.drainEvents();assert.equal(room.fire(blue),true);
 const events=room.drainEvents(),shot=events.find(e=>e.type==='shot');assert.equal(shot.pellets.length,WEAPONS[shotgun].pellets);assert.equal(shot.hit,red.id);
 assert.equal(red.alive,false);assert.equal(events.filter(e=>e.type==='kill').length,1);assert.equal(blue.hits,1);
 room.tick(5);arena(red,-8,-12);blue.pitch=-Math.atan2(.57,20);blue.cooldown=0;room.fire(blue);assert.equal(red.alive,true);assert.ok(red.health>50,`${red.health} left at 20 m`);
});
test('heavy weapons slow their carrier and raise their sights slowly',()=>{
 const [minimi,mag,hecate]=['minimi','mag58','hecate'].map(id=>WEAPONS.find(w=>w.id===id));
 assert.ok(moveSpeed(mag)<moveSpeed(minimi));assert.ok(moveSpeed(minimi)<moveSpeed(WEAPONS.find(w=>w.id==='r870')));assert.ok(shotSpread(hecate,1)<shotSpread(hecate,0)/50);
 const {room,blue}=twoPlayers();blue.weapon=WEAPONS.indexOf(mag);room.input(blue.id,{seq:1,forward:0,strafe:0,yaw:0,pitch:0,aim:true});
 const tick=n=>{for(let i=0;i<n;i++){room.tick(1/30);blue.lastInput=room.clock;}};
 tick(7);assert.ok(blue.sighted>.4&&blue.sighted<.5,`${blue.sighted} after .23 s`);tick(10);assert.equal(blue.sighted,1);
 room.input(blue.id,{seq:2,forward:0,strafe:0,yaw:0,pitch:0,aim:false});room.tick(1/30);assert.equal(blue.sighted,0);
});
test('a new main weapon chosen while down is carried from the next spawn',()=>{
 const {room,blue,red}=twoPlayers(),hecate=WEAPONS.findIndex(w=>w.id==='hecate'),sidearm=WEAPONS.findIndex(w=>w.sidearm);
 room.action(blue.id,{action:'weapon',weapon:sidearm});room.damage(blue,200,red);assert.equal(blue.alive,false);
 for(const weapon of [sidearm,'3',99])room.action(blue.id,{action:'loadout',weapon});assert.equal(room.snapshot(blue.id).self.nextPrimary,0,'invalid choices are ignored');
 room.action(blue.id,{action:'loadout',weapon:hecate});assert.equal(blue.primary,0);assert.equal(room.snapshot(blue.id).self.nextPrimary,hecate);
 room.spawn(blue);assert.equal(blue.primary,hecate);assert.equal(blue.weapon,hecate,'the new life starts with the new weapon in hand');assert.equal(room.snapshot(blue.id).self.nextPrimary,hecate);
 room.action(blue.id,{action:'weapon',weapon:0});assert.equal(blue.weapon,hecate);room.action(blue.id,{action:'weapon',weapon:sidearm});assert.equal(blue.weapon,sidearm);
 const crowd=new MultiplayerRoom({random:()=>.5});crowd.add({name:'Alice'});assert.ok([...crowd.players.values()].filter(p=>p.isBot).every(p=>WEAPONS[p.weapon].id==='minimi'),'bots carry the light machine gun');
});
test('the sidearm is chosen on joining and changed for the next life',()=>{
 const [revolver,ppk]=['revolver','ppk'].map(id=>WEAPONS.findIndex(w=>w.id===id)),{room,blue,red}=twoPlayers();
 assert.equal(blue.sidearm,revolver,'the revolver by default');assert.equal(room.add({name:'Erin',sidearm:ppk}).sidearm,ppk);assert.equal(room.add({name:'Finn',sidearm:2}).sidearm,revolver,'a main weapon is no sidearm');
 room.action(blue.id,{action:'weapon',weapon:ppk});assert.equal(blue.weapon,0,'only the sidearm carried');
 room.action(blue.id,{action:'loadout',weapon:ppk});assert.equal(room.snapshot(blue.id).self.nextSidearm,ppk);assert.equal(room.snapshot(blue.id).self.nextPrimary,0,'the main weapon is kept');
 room.damage(blue,200,red);room.spawn(blue);assert.equal(blue.sidearm,ppk);assert.equal(blue.weapon,0);
 room.action(blue.id,{action:'weapon',weapon:revolver});assert.equal(blue.weapon,0);room.action(blue.id,{action:'weapon',weapon:ppk});assert.equal(blue.weapon,ppk);
 assert.ok(WEAPONS[ppk].damage<WEAPONS[revolver].damage/1.5&&WEAPONS[ppk].suppressed,'a quiet, weaker counterpart to the revolver');
});
test('the break between rounds ends once every human redeploys',()=>{
 const {room,blue,red}=twoPlayers();room.action(blue.id,{action:'redeploy'});room.scores.blue=39;room.damage(red,200,blue);assert.equal(room.phase,'over');
 room.action(blue.id,{action:'redeploy'});room.tick(1/30);assert.equal(room.phase,'over');
 room.action(red.id,{action:'redeploy'});room.tick(1/30);assert.equal(room.phase,'active');
 room.finish({winner:'red',reason:'score'});room.tick(1/30);assert.equal(room.phase,'over','a new break waits for new requests');
});
test('snapshot exposes all human combatants but only the requesting player ammunition',()=>{
 const {room,blue,red}=twoPlayers(),snapshot=room.snapshot(blue.id);assert.equal(snapshot.players.length,2);assert.equal(snapshot.self.id,blue.id);assert.equal(snapshot.self.ammunition.length,WEAPONS.length);assert.equal(snapshot.players.find(p=>p.id===red.id).ammunition,undefined);assert.ok(snapshot.players.every(p=>Number.isFinite(p.protectedFor)));
});
test('a fallen soldier leaves an ammunition box that refills a human and expires after thirty seconds',()=>{
 const {room,blue,red}=twoPlayers();arena(blue,0,0);arena(red,0,6);room.damage(red,200,blue);
 assert.equal(room.drops.length,1);assert.equal(room.snapshot(blue.id).drops.length,1);
 // Full reserves: the box stays on the ground.
 Object.assign(blue,{x:room.drops[0].x,z:room.drops[0].z});room.tick(.05);assert.equal(room.drops.length,1);
 blue.ammunition[blue.primary].reserve=0;blue.ammunition[blue.sidearm].reserve=1;room.tick(.05);
 assert.equal(room.drops.length,0);assert.equal(blue.ammunition[blue.primary].reserve,WEAPONS[blue.primary].reserve);assert.equal(blue.ammunition[blue.sidearm].reserve,WEAPONS[blue.sidearm].reserve);
 assert.ok(room.drainEvents().some(e=>e.type==='pickup'&&e.actor===blue.id));
 arena(blue,-8,-8);room.damage(blue,200,red);assert.equal(room.drops.length,1);room.tick(29.9);assert.equal(room.drops.length,1);room.tick(.2);assert.equal(room.drops.length,0);
});
