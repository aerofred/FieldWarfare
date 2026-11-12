import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GameRoom} from '../src/sim/room.js';
import {grenadeBot,GRENADE_COOLDOWN} from '../src/sim/bots.js';
import {resetBrain,updateBrain,botProfile} from '../src/bot-ai.js';
import {collides,distance} from '../src/rules.js';
import {clearShot} from '../src/world.js';

function seeded(seed=7){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};}
const place=(p,x,z)=>Object.assign(p,{x,z,jump:0,vy:0,vx:0,vz:0,alive:true,health:100,protectedUntil:0,cooldown:0});
const run=(room,seconds,dt=1/30)=>{const events=[];for(let i=0;i<seconds/dt;i++){room.tick(dt);events.push(...room.drainEvents());}return events;};

test('kill events name the weapon and the range, or the grenade',()=>{
 const room=new GameRoom({random:()=>.5,fillBots:false}),blue=room.add({name:'Alice'}),red=room.add({name:'Bob'});room.clock=3;
 place(blue,-8,8);place(red,-8,2);blue.weapon=3;room.drainEvents();
 room.damage(red,200,blue);let kill=room.drainEvents().find(e=>e.type==='kill');
 assert.equal(kill.weapon,'hecate');assert.equal(kill.range,6);
 place(red,-8,2);room.explode({x:-8,y:.3,z:2,owner:blue});kill=room.drainEvents().find(e=>e.type==='kill');
 assert.equal(kill.weapon,'grenade');assert.equal(kill.range,null);
});

test('snapshots tell whose grenade is live so clients warn only of enemy ones',()=>{
 const room=new GameRoom({random:()=>.5,fillBots:false}),blue=room.add({name:'Alice'});room.add({name:'Bob'});
 room.throwGrenade(blue);const [g]=room.snapshot(blue.id).grenades;
 assert.equal(g.owner,blue.id);assert.equal(g.team,blue.team);
});

test('a co-op enemy grenade is scaled like its bullets',()=>{
 const room=new GameRoom({random:seeded()}),me=room.add({name:'Solo',mode:'assault',rules:{blue:1,red:2}});
 const enemy=[...room.players.values()].find(p=>p.hostile);place(me,0,0);
 room.explode({x:me.x,y:.3,z:me.z,owner:enemy});assert.equal(me.health,100-Math.round(180*room.logic.botDamage(enemy)));
});

// Two open spots 14 m apart on the factory floor with nothing in between.
function openLane(room){
 const free=(x,z)=>!collides(x,z,1.5,room.world.obstacles);
 for(let x=-24;x<=24;x+=2)for(let z=-24;z<=24;z+=2){const a={x,z},b={x:x+14,z};if(free(a.x,a.z)&&free(b.x,b.z)&&clearShot({...a,y:4},{...b,y:4},room.world.solids)&&clearShot({...a,y:.5},{...b,y:.5},room.world.solids))return [a,b];}
 throw new Error('no open lane');
}

test('a bot throws a grenade where a target just vanished and it lands there',()=>{
 const room=new GameRoom({random:seeded(),botDifficulty:'elite',mapId:'factory'}),me=room.add({name:'Me',mode:'tdm',rules:{blue:1,red:1}});
 const bot=[...room.players.values()].find(p=>p.isBot),[from,to]=openLane(room);
 place(bot,from.x,from.z);place(me,40,40);room.clock=50;
 Object.assign(bot.brain,{lastKnown:{...to},lastSeen:room.clock-1,visible:false,nextGrenade:0,targetId:me.id});
 assert.equal(grenadeBot(room,bot),true);assert.equal(bot.grenades,1);assert.equal(room.grenades.length,1);
 assert.ok(bot.brain.nextGrenade>=room.clock+GRENADE_COOLDOWN.elite*.8);
 assert.equal(grenadeBot(room,bot),false,'one grenade per cooldown');
 // Only the grenade moves: freeze everyone else for the fuse.
 const g=room.grenades[0];room.phase='waiting';let boom=null;for(let i=0;i<80&&!boom;i++){room.tick(1/30);boom=room.drainEvents().find(e=>e.type==='explosion');}
 assert.ok(boom,'the grenade exploded');assert.ok(distance(boom,to)<3.5,JSON.stringify({boom,to,g}));
});

test('bots do not throw at a target in sight, too close, or long forgotten, and recruits never do',()=>{
 const make=level=>{const room=new GameRoom({random:seeded(),botDifficulty:level,mapId:'factory'});room.add({name:'Me',mode:'tdm',rules:{blue:1,red:1}});const bot=[...room.players.values()].find(p=>p.isBot),[from,to]=openLane(room);place(bot,from.x,from.z);room.clock=50;Object.assign(bot.brain,{lastKnown:{...to},lastSeen:49,visible:false,nextGrenade:0});return {room,bot};};
 let {room,bot}=make('recruit');assert.equal(grenadeBot(room,bot),false);
 ({room,bot}=make('elite'));bot.brain.visible=true;assert.equal(grenadeBot(room,bot),false);
 ({room,bot}=make('elite'));bot.brain.lastSeen=40;assert.equal(grenadeBot(room,bot),false);
 ({room,bot}=make('elite'));bot.brain.lastKnown={x:bot.x+3,z:bot.z};assert.equal(grenadeBot(room,bot),false);
 assert.equal(room.grenades.length,0);
});

test('bots run from an enemy grenade once they notice it, and ignore friendly ones',()=>{
 const bot={id:'bot',team:'blue',x:0,z:0,yaw:0,pitch:0,jump:0,health:100,reload:0,lastHit:-100,alive:true,brain:resetBrain(0,()=>.5)};
 const enemy={id:'enemy',team:'red',x:0,z:-30,alive:true},ally={id:'ally',team:'blue',x:5,z:5,alive:true};
 const env=grenades=>({actors:[bot,enemy,ally],now:1,difficulty:'soldier',random:()=>.5,obstacles:[],navigation:{findPath:()=>[]},eye:p=>({x:p.x,y:1.87,z:p.z}),clear:()=>false,grenades});
 const worldX=input=>-Math.sin(bot.yaw)*input.forward+Math.cos(bot.yaw)*input.strafe;
 const reaction=botProfile('soldier').reaction,grenade=(owner,age)=>[{x:2,z:0,age,owner}];
 const fleeing=updateBrain(bot,env(grenade(enemy,reaction+.1)),.02);assert.ok(worldX(fleeing)<-.5,JSON.stringify(fleeing));assert.equal(bot.brain.evading,true);
 bot.brain=resetBrain(0,()=>.5);assert.ok(Math.abs(worldX(updateBrain(bot,env(grenade(enemy,reaction*.5)),.02)))<.1,'not noticed yet');
 bot.brain=resetBrain(0,()=>.5);assert.ok(Math.abs(worldX(updateBrain(bot,env(grenade(ally,2)),.02)))<.1,'friendly grenades are harmless');
});
