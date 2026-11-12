import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MultiplayerRoom} from '../server/room.js';
import {collides,WEAPONS} from '../src/rules.js';
import {createNavigation,walkable} from '../server/navigation.js';
import {createWorld} from '../src/world.js';

const actors=room=>[...room.players.values()];
const input={seq:1,forward:0,strafe:0,yaw:0,pitch:-Math.atan2(.57,5)};
const arena=(p,x,z)=>Object.assign(p,{x,z,jump:0,vy:0,health:100,alive:true,protectedUntil:0,cooldown:0});
function seededRandom(){let state=42;return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};}

test('a first human starts a 4v4 room, with seven server bots and private human state',()=>{
 const room=new MultiplayerRoom();assert.equal(room.players.size,0);assert.equal(room.phase,'waiting');room.tick(1);assert.equal(room.players.size,0);
 const human=room.add({name:'Alice'}),snapshot=room.snapshot(human.id);assert.equal(room.phase,'active');assert.equal(snapshot.humans,1);assert.equal(snapshot.bots,7);assert.equal(snapshot.fillBots,true);
 for(const team of ['blue','red'])assert.equal(snapshot.players.filter(p=>p.team===team).length,4);
 assert.equal(snapshot.players.filter(p=>p.isBot).length,7);assert.equal(snapshot.self.id,human.id);assert.ok(snapshot.players.every(p=>p.ammunition===undefined));
 for(const bot of actors(room).filter(p=>p.isBot)){assert.equal(collides(bot.x,bot.z,.34,room.world.obstacles),false);assert.ok(bot.brain);}
});

test('humans replace bots, preserve the running score and release all eight human slots',()=>{
 const room=new MultiplayerRoom(),a=room.add({name:'First',team:'red'}),round=room.round;room.scores.red=12;room.remaining=200;
 for(let i=0;i<7;i++)room.add({name:'Human '+i});assert.equal(room.humanCount,8);assert.equal(room.players.size,8);assert.equal(actors(room).filter(p=>p.isBot).length,0);assert.equal(room.round,round);assert.equal(room.scores.red,12);assert.equal(room.remaining,200);
 assert.throws(()=>room.add({name:'Ninth'}),/data\.error\.serverFull/);room.remove(a.id);assert.equal(room.humanCount,7);assert.equal(actors(room).filter(p=>p.isBot&&p.team==='red').length,1);assert.equal(room.phase,'active');
 room.add({name:'Replacement',team:'red'});assert.equal(room.humanCount,8);assert.equal(room.players.size,8);
});

test('full human teams are rejected without evicting any bots or resetting the match',()=>{
 const room=new MultiplayerRoom();for(let i=0;i<4;i++)room.add({name:'Alpha '+i,team:'blue'});
 const ids=actors(room).map(p=>p.id);assert.throws(()=>room.add({name:'Extra',team:'blue'}),/data\.error\.teamFull/);assert.deepEqual(actors(room).map(p=>p.id),ids);
 const auto=room.add({name:'Auto'});assert.equal(auto.team,'red');assert.equal(room.players.size,8);
});

test('last human disconnect clears bots and projectiles; reconnect starts a fresh round',()=>{
 const room=new MultiplayerRoom(),a=room.add({name:'Alice'});const bot=actors(room).find(p=>p.isBot);room.throwGrenade(bot);room.scores.blue=8;room.remove(a.id);
 assert.equal(room.players.size,0);assert.equal(room.grenades.length,0);assert.equal(room.phase,'waiting');room.tick(100);assert.equal(room.players.size,0);
 room.add({name:'Bob'});assert.equal(room.players.size,8);assert.equal(room.phase,'active');assert.deepEqual(room.scores,{blue:0,red:0});assert.equal(room.remaining,480);
});

test('human shots kill bots; bot shots kill humans; both score, protect allies and respawn',()=>{
 const room=new MultiplayerRoom({random:()=>.5}),human=room.add({name:'Alice'}),enemy=actors(room).find(p=>p.isBot&&p.team!==human.team),ally=actors(room).find(p=>p.isBot&&p.team===human.team);
 for(const p of actors(room))arena(p,26,25);arena(human,-8,8);arena(enemy,-8,3);arena(ally,-7,8);room.clock=3;
 room.input(human.id,input);for(let i=0;i<4;i++){human.cooldown=0;room.action(human.id,{action:'fire'});}assert.equal(enemy.alive,false);assert.equal(room.scores.blue,1);assert.equal(human.kills,1);
 // Enemy and allied bots share spawn protection and friendly-fire rules.
 assert.equal(room.damage(ally,200,human),false);enemy.protectedUntil=room.clock+2;enemy.alive=true;assert.equal(room.damage(enemy,200,human),false);
 arena(enemy,-8,3);enemy.yaw=Math.PI;enemy.pitch=-Math.atan2(.57,5);
 for(let i=0;i<5;i++){enemy.cooldown=0;room.fire(enemy);}assert.equal(human.alive,false);assert.equal(room.scores.red,1);assert.equal(enemy.kills,1);
 room.damage(enemy,200,ally);assert.equal(enemy.alive,false);const deaths=enemy.deaths;
 for(let i=0;i<123;i++)room.tick(1/30);assert.equal(human.alive,true);assert.equal(enemy.alive,true);assert.equal(enemy.deaths,deaths);assert.ok(enemy.protectedUntil>room.clock);assert.equal(room.damage(enemy,200,human),false);
});

test('bots navigate the real factory and fight autonomously without any client commands',()=>{
 const room=new MultiplayerRoom({random:seededRandom()}),human=room.add({name:'Observer'});human.protectedUntil=1e9;
 const initial=new Map(actors(room).map(p=>[p.id,{x:p.x,z:p.z}]));let shots=0,kills=0,moving=false;
 for(let tick=0;tick<1800;tick++){
   room.tick(1/30);
   for(const event of room.drainEvents()){if(event.type==='shot')shots++;if(event.type==='kill')kills++;}
   for(const p of actors(room).filter(p=>p.isBot)){assert.equal(collides(p.x,p.z,.33,room.world.obstacles),false);const start=initial.get(p.id);if(Math.hypot(p.x-start.x,p.z-start.z)>2)moving=true;}
 }
 assert.ok(moving,'bots leave their spawns');assert.ok(shots>10,`bots fired ${shots} shots`);assert.ok(kills>0,'bots can kill each other');assert.ok(room.scores.blue+room.scores.red>0);
});

test('bots reload ammunition and respect the weapon cooldown',()=>{
 const room=new MultiplayerRoom({random:()=>.5});room.add({name:'Alice'});const bot=actors(room).find(p=>p.isBot);bot.ammunition[bot.weapon].ammo=0;bot.cooldown=0;
 assert.equal(room.fire(bot),false);assert.ok(bot.reload>0);const reload=bot.reload;bot.brain.nextThink=1e9;bot.brain.path=[];bot.brain.targetId=null;
 for(let i=0;i<Math.ceil((reload+.1)*30);i++)room.tick(1/30);assert.equal(bot.ammunition[bot.weapon].ammo,WEAPONS[bot.weapon].capacity);bot.cooldown=0;assert.equal(room.fire(bot),true);assert.equal(room.fire(bot),false);
});

test('bot routes cross the factory doorways instead of getting stuck at thin walls',()=>{
 const obstacles=createWorld().obstacles,navigation=createNavigation(obstacles);
 for(const [start,end]of [[{x:0,z:-27},{x:0,z:10}],[{x:-4,z:16},{x:-4,z:10}],[{x:14,z:-20},{x:-8,z:8}]]){
  const path=navigation.findPath(start,end);assert.ok(path.length>0);assert.deepEqual(path.at(-1),end);
  let previous=start;for(const point of path){assert.equal(walkable(previous,point,obstacles),true);previous=point;}
 }
});
