import {collides} from '../src/rules.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BOT_LEVELS,botProfile,resetBrain,updateBrain,recordBotShot} from '../src/bot-ai.js';
import {createNavigation} from '../src/navigation.js';
import {clearShot} from '../src/world.js';
import {MultiplayerRoom} from '../server/room.js';

function fixture(difficulty='soldier'){
 const bot={id:'bot',team:'blue',x:0,z:0,yaw:0,pitch:0,jump:0,health:100,reload:0,lastHit:-100,alive:true,brain:resetBrain(0,()=>.5)};
 const enemy={id:'enemy',team:'red',x:0,z:-10,jump:0,health:100,alive:true};
 const env={actors:[bot,enemy],now:1,difficulty,random:()=>.5,obstacles:[],navigation:{findPath:(a,b)=>[{x:b.x,z:b.z}]},eye:p=>({x:p.x,y:1.87,z:p.z}),clear:()=>true};
 return{bot,enemy,env,step(dt=.02){env.now+=dt;const input=updateBrain(bot,env,dt);bot.yaw=input.yaw;bot.pitch=input.pitch;return input;}};
}

test('the four difficulties produce progressively faster reactions and more sustained fire',()=>{
 const results=[];
 for(const level of Object.keys(BOT_LEVELS)){
  const f=fixture(level);let first=null,shots=0;
  for(let i=0;i<500;i++){f.step();if(f.bot.brain.wantsFire){first??=f.env.now;shots++;recordBotShot(f.bot,f.env.now,level,()=>.5);}}
  results.push({level,first,shots});
 }
 for(let i=1;i<results.length;i++){assert.ok(results[i].first<results[i-1].first,JSON.stringify(results));assert.ok(results[i].shots>results[i-1].shots,JSON.stringify(results));}
});

test('no enemy is tracked through a wall before it is seen or heard',()=>{
 const f=fixture('elite');f.env.clear=()=>false;f.step();assert.equal(f.bot.brain.targetId,null);assert.equal(f.bot.brain.lastKnown,null);
 f.enemy.x=20;f.env.now+=1;f.step();assert.equal(f.bot.brain.lastKnown,null);assert.notDeepEqual(f.bot.brain.path.at(-1),{x:20,z:-10});
});

test('lost targets leave a frozen last-known position which expires',()=>{
 const f=fixture('soldier');f.step();assert.deepEqual(f.bot.brain.lastKnown,{x:0,z:-10});
 f.env.clear=()=>false;f.enemy.x=12;f.env.now+=.5;f.step();assert.equal(f.bot.brain.visible,false);assert.deepEqual(f.bot.brain.lastKnown,{x:0,z:-10});assert.deepEqual(f.bot.brain.path.at(-1),{x:0,z:-10});
 f.env.now+=botProfile('soldier').memory+1;f.step();assert.equal(f.bot.brain.lastKnown,null);assert.equal(f.bot.brain.targetId,null);assert.equal(f.bot.brain.mode,'patrol');
});

test('a recent nearby shot can be investigated without revealing the exact hidden position',()=>{
 const f=fixture('veteran');f.env.clear=()=>false;f.enemy.x=1;f.enemy.z=-9;f.enemy.lastShot=1;f.step();
 assert.deepEqual(f.bot.brain.lastKnown,{x:0,z:-8});assert.equal(f.bot.brain.visible,false);assert.equal(f.bot.brain.wantsFire,false);
});

test('field of view and turning speed prevent instant shots behind the bot',()=>{
 const f=fixture('elite');f.enemy.z=10;f.step();assert.equal(f.bot.brain.visible,false);assert.equal(f.bot.brain.wantsFire,false);
 f.enemy.lastShot=f.env.now;const yaw=f.bot.yaw;f.env.now+=.3;const input=f.step();assert.ok(Math.abs(input.yaw-yaw)<=botProfile('elite').turn*.02+.01);assert.equal(f.bot.brain.wantsFire,false);
});

test('a newly intervening wall and allied soldiers stop firing immediately',()=>{
 const f=fixture('elite');f.step();f.env.now+=1;f.step();assert.equal(f.bot.brain.wantsFire,true);
 f.env.actors.push({id:'friend',team:'blue',x:0,z:-5,alive:true});f.step();assert.equal(f.bot.brain.wantsFire,false);
 f.env.actors.pop();f.env.clear=()=>false;f.step();assert.equal(f.bot.brain.wantsFire,false);
});

test('advanced bots seek actual cover when hurt; recruits keep simple movement',()=>{
 for(const level of ['recruit','elite']){
  const f=fixture(level),wall={minX:1,maxX:3,minZ:-4,maxZ:-2,minY:0,maxY:3};
  f.env.obstacles=[wall];f.env.navigation=createNavigation([wall]);f.env.clear=(a,b)=>clearShot(a,b,[wall]);f.bot.health=30;f.bot.lastHit=1;f.step();
  if(level==='elite'){assert.equal(f.bot.brain.mode,'cover');assert.ok(f.bot.brain.cover);assert.ok(f.bot.brain.path.length);assert.equal(f.env.clear({...f.enemy,y:1.4},{...f.bot.brain.cover,y:1.15}),false);}
  else assert.equal(f.bot.brain.cover,null);
 }
});

test('all profiles keep finite inputs, obey collisions and play the real factory',()=>{
 for(const level of Object.keys(BOT_LEVELS)){
  let seed=71;const room=new MultiplayerRoom({botDifficulty:level,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)});room.add({name:'Observer'}).protectedUntil=1e9;
  let shots=0;for(let i=0;i<1800;i++){room.tick(1/30);for(const e of room.drainEvents())if(e.type==='shot')shots++;
   for(const p of room.players.values()){assert.ok([p.x,p.z,p.yaw,p.pitch].every(Number.isFinite),level);if(p.isBot){assert.ok([p.input.forward,p.input.strafe].every(Number.isFinite),level);assert.equal(collides(p.x,p.z,.33,room.world.obstacles),false,level);}}
  }
  assert.ok(shots>0,level+' never shoots');assert.equal(room.players.size,8);
 }
});

test('first human chooses a shared level; later arrivals cannot change it',()=>{
 const room=new MultiplayerRoom();const a=room.add({name:'Alice',botDifficulty:'veteran'});room.add({name:'Bob',botDifficulty:'recruit'});
 assert.equal(room.botDifficulty,'veteran');assert.equal(room.snapshot(a.id).botDifficulty,'veteran');assert.equal(room.difficultyFixed,false);
 for(const p of [...room.players.values()].filter(p=>!p.isBot))room.remove(p.id);room.add({name:'Next',botDifficulty:'elite'});assert.equal(room.botDifficulty,'elite');
 assert.throws(()=>new MultiplayerRoom().add({name:'Bad',botDifficulty:'godmode'}),/data\.error\.badBotLevel/);
});

test('a configured server level persists across empty rooms and overrides client choices',()=>{
 const room=new MultiplayerRoom({botDifficulty:'elite'}),a=room.add({name:'Alice',botDifficulty:'recruit'});assert.equal(room.snapshot(a.id).botDifficulty,'elite');assert.equal(room.difficultyFixed,true);
 room.remove(a.id);room.add({name:'Bob',botDifficulty:'soldier'});assert.equal(room.botDifficulty,'elite');
});

test('a bot shot by an unseen attacker turns toward the rough origin of the hit',()=>{
 const room=new MultiplayerRoom({random:()=>.5}),human=room.add({name:'Alice'}),bot=[...room.players.values()].find(p=>p.isBot&&p.team!==human.team);
 Object.assign(human,{x:-9,z:-27,protectedUntil:0});Object.assign(bot,{x:-9,z:10,yaw:Math.PI,alive:true,health:100,protectedUntil:0});bot.brain.visible=false;bot.brain.targetId=null;bot.brain.lastKnown=null;
 assert.equal(room.damage(bot,10,human),true);assert.deepEqual(bot.brain.lastKnown,{x:-8,z:-28},'the shooter is placed on the four-metre grid, never exactly');assert.equal(bot.brain.mode,'investigate');assert.equal(bot.brain.repathAt,0);
 // A visible attacker changes nothing: the bot already tracks it.
 const seen=[...room.players.values()].find(p=>p.isBot&&p.team!==human.team&&p!==bot);Object.assign(seen,{x:-9,z:-20,alive:true,health:100,protectedUntil:0});seen.brain.visible=true;seen.brain.lastKnown={x:1,z:1};room.damage(seen,10,human);assert.deepEqual(seen.brain.lastKnown,{x:1,z:1});
});
