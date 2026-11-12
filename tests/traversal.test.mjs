import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from '../src/world.js';
import {traverse,MANTLE_REACH} from '../src/traversal.js';
import {moveCharacter,updateVertical,feet,collides} from '../src/collision.js';
import {MultiplayerRoom} from '../server/room.js';

// Same order as the game: traversal first, then walking and gravity.
function run(world,actor,{forward=1,yaw=0,jumpAt=-1}={},seconds=2){
 let peak=feet(actor);const modes=new Set();
 for(let i=0;i<seconds*60;i++){
  const jumpPressed=i===jumpAt,mode=traverse(actor,{forward,yaw,jumpPressed},1/60,world);if(mode)modes.add(mode);
  if(!mode){if(jumpPressed&&actor.grounded!==false)actor.vy=5;const s=4.5/60*forward;moveCharacter(actor,-Math.sin(yaw)*s,-Math.cos(yaw)*s,world);updateVertical(actor,1/60,world.solids);}
  peak=Math.max(peak,feet(actor));
 }
 return{peak,modes};
}
const facing=l=>Math.atan2(l.nx,l.nz);

test('every ladder stands on a free approach and leads onto its roof',()=>{
 for(const id of ['factory','gardens','railway','desert','market','harbor']){
  const world=createWorld(id);assert.ok(world.ladders.length>0,id);
  for(const l of world.ladders){
   assert.equal(collides(l.x+l.nx*1.4,l.z+l.nz*1.4,.4,world.obstacles),false,`${id} ladder ${l.x},${l.z} approach`);
   assert.ok(world.solids.some(b=>Math.abs(b.maxY-l.top)<.01&&l.x-l.nx*.3>=b.minX&&l.x-l.nx*.3<=b.maxX&&l.z-l.nz*.3>=b.minZ&&l.z-l.nz*.3<=b.maxZ),`${id} ladder ${l.x},${l.z} roof`);
   const actor={x:l.x+l.nx*1.4,z:l.z+l.nz*1.4,jump:0,vy:0,grounded:true},{peak,modes}=run(world,actor,{yaw:facing(l)},1.9);
   assert.ok(modes.has('climb')&&modes.has('mantle'),`${id} ladder ${l.x},${l.z} modes`);assert.ok(Math.abs(peak-l.top)<.06,`${id} ladder ${l.x},${l.z} reached ${peak}`);
  }
 }
});

test('climbing down a ladder returns to the ground and a jump lets go',()=>{
 const world=createWorld('railway'),l=world.ladders[0],actor={x:l.x+l.nx*1.4,z:l.z+l.nz*1.4,jump:0,vy:0,grounded:true};
 run(world,actor,{yaw:facing(l)},.9);assert.ok(actor.climb&&feet(actor)>1);
 run(world,actor,{forward:-1,yaw:facing(l)},2);assert.equal(actor.climb,null);assert.equal(feet(actor),.15);
 run(world,actor,{yaw:facing(l)},1.6);assert.ok(actor.climb);traverse(actor,{forward:0,yaw:facing(l),jumpPressed:true},1/60,world);assert.equal(actor.climb,null);
});

test('a jump pulls onto a waist-high wall but not onto a container or a stacked crate',()=>{
 const world=createWorld('factory');
 const wall={x:-5,z:16.6,jump:0,vy:0,grounded:true};const low=run(world,wall,{jumpAt:15},.9);assert.ok(low.modes.has('mantle'));assert.ok(low.peak>=1.05);
 for(const [x,z] of [[5,24.2],[-5,-9.4]]){const actor={x,z,jump:0,vy:0,grounded:true},r=run(world,actor,{jumpAt:15},1.2);assert.ok(!r.modes.has('mantle'),`${x},${z}`);assert.ok(r.peak<1.1);}
 assert.ok(MANTLE_REACH<1.6);
});

test('the server applies the same climbing to online players and keeps them from firing',()=>{
 const room=new MultiplayerRoom({fillBots:false,mapId:'railway'}),p=room.add({name:'Alice'});room.add({name:'Bob'});
 const l=room.world.ladders[0];Object.assign(p,{x:l.x+l.nx*1.4,z:l.z+l.nz*1.4,protectedUntil:1e9});
 let seq=p.input.seq,fired=false;
 for(let i=0;i<60;i++){room.input(p.id,{seq:++seq,forward:1,strafe:0,yaw:facing(l),pitch:0,fire:false});room.tick(1/30);if(i===20)fired=room.fire(p);}
 assert.equal(fired,false);assert.ok(Math.abs(p.jump+.15-l.top)<.06,`feet ${p.jump+.15}`);
 assert.ok(room.snapshot(p.id).players.some(o=>o.id===p.id&&'climbing' in o));
});
