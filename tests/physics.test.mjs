import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CHARACTER_RADIUS,collides,moveWithCollision,moveCharacter,updateVertical,setStance,separateCharacters} from '../src/collision.js';
import {characterHit,traceShot} from '../src/combat.js';
import {grenadeOrigin,updateGrenade} from '../src/projectiles.js';
import {createWorld,raySphere} from '../src/world.js';
const wall={minX:2,maxX:2.02,minZ:-10,maxZ:10,minY:0,maxY:4};
const actor=(x=0,z=0)=>({x,z,yaw:0,jump:0,vy:0,crouch:false,alive:true});

test('continuous movement blocks fast wall crossings and preserves the full sliding distance',()=>{
 const p=actor();moveWithCollision(p,100,7,.4,[wall]);assert.ok(p.x<1.601);assert.ok(Math.abs(p.z-7)<.001);assert.equal(collides(p.x,p.z,.4,[wall]),false);
 const q=actor();moveWithCollision(q,0,20,.4,[{minX:-4,maxX:4,minZ:2,maxZ:2.01}]);assert.ok(q.z<1.601);
});
test('round corners are smooth and narrow doorways remain passable',()=>{
 const p=actor(.65,.65);assert.equal(collides(p.x,p.z,.4,[{minX:1,maxX:3,minZ:1,maxZ:3}]),false);
 const door=[{minX:-3,maxX:-.55,minZ:1,maxZ:1.1},{minX:.55,maxX:3,minZ:1,maxZ:1.1}];const q=actor();moveWithCollision(q,0,3,.4,door);assert.ok(q.z>2.99);
 const r=actor(.3,0);moveWithCollision(r,0,3,.4,door);assert.equal(collides(r.x,r.z,.4,door),false);
});
test('living bodies stop fast movement, corpses do not, and overlapping spawns separate safely',()=>{
 const world={solids:[]},p=actor(0,4),other=actor(0,0);moveCharacter(p,0,-20,world,[other]);assert.ok(p.z>.799);
 other.alive=false;moveCharacter(p,0,-2,world,[other]);assert.ok(p.z<0);
 const a=actor(),b=actor();separateCharacters([a,b],world);assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=.799);
 const c=actor(1.58,0),d=actor(1.58,0);separateCharacters([c,d],{solids:[wall]});assert.equal(collides(c.x,c.z,.4,[wall]),false);assert.equal(collides(d.x,d.z,.4,[wall]),false);
});
test('ceiling collisions stop the jump and low cover can support a landing',()=>{
 const ceiling={minX:-3,maxX:3,minZ:-3,maxZ:3,minY:2.2,maxY:2.4},p=actor();p.vy=5;
 for(let i=0;i<10;i++)updateVertical(p,1/30,[ceiling]);assert.ok(.15+p.jump+1.88<=2.20001);assert.ok(p.vy<=0);
 const crate={minX:-1,maxX:1,minZ:-1,maxZ:1,minY:0,maxY:.7},q=actor();q.jump=1;q.vy=-2;
 for(let i=0;i<15;i++)updateVertical(q,1/30,[crate]);assert.ok(Math.abs(q.jump-.55)<.0001);assert.equal(q.grounded,true);
});
test('standing is prevented under a low lintel until the character leaves it',()=>{
 const ceiling={minX:-2,maxX:2,minZ:-2,maxZ:2,minY:1.5,maxY:1.7},p=actor();p.crouch=true;setStance(p,false,[ceiling]);assert.equal(p.crouch,true);p.x=4;setStance(p,false,[ceiling]);assert.equal(p.crouch,false);
});
test('shots distinguish head, torso, arms, legs and the space between the legs',()=>{
 const p=actor(),direction={x:0,y:0,z:1};
 for(const [x,y,part]of [[0,1.79,'head'],[0,1.27,'torso'],[.34,1.35,'arm'],[.14,.55,'leg'],[.14,.2,'foot']])assert.equal(characterHit({x,y,z:-5},direction,p,20)?.part,part);
 assert.equal(characterHit({x:0,y:.5,z:-5},direction,p,20),null);
});
test('hit volumes follow crouching, jumping and rotation while excluding equipment',()=>{
 const p=actor(),d={x:0,y:0,z:1};assert.equal(characterHit({x:0,y:1.79,z:-5},d,p,20)?.head,true);
 p.crouch=true;assert.equal(characterHit({x:0,y:1.79,z:-5},d,p,20),null);assert.equal(characterHit({x:0,y:.15+1.64*.65,z:-5},d,p,20)?.head,true);
 p.crouch=false;p.jump=1;assert.equal(characterHit({x:0,y:2.79,z:-5},d,p,20)?.head,true);p.jump=0;p.yaw=Math.PI/2;
 assert.ok(characterHit({x:-5,y:1.3,z:.34},{x:1,y:0,z:0},p,20));p.yaw=0;
 for(const z of [-.7,.28])assert.equal(characterHit({x:-5,y:1.3,z},{x:1,y:0,z:0},p,20),null,'gun/backpack should not count as a body hit');
});
test('the closest wall or friendly body blocks targets behind it',()=>{
 const a=actor(0,0),b=actor(0,4),origin={x:0,y:1.27,z:-5},direction={x:0,y:0,z:1};
 const obstruction={minX:-1,maxX:1,minY:0,maxY:3,minZ:-2,maxZ:-1.98};assert.equal(traceShot(origin,direction,30,[obstruction],[a,b]).victim,null);
 assert.equal(traceShot(origin,direction,30,[],[b,a]).victim,a);a.alive=false;assert.equal(traceShot(origin,direction,30,[],[a,b]).victim,b);
 assert.equal(raySphere({x:0,y:0,z:0},{x:1,y:0,z:0},{x:0,y:0,z:0},1),0);
});
test('grenades cannot be spawned or tunnel through a nearby thin wall',()=>{
 const origin={x:1.5,y:1.5,z:0},direction={x:1,y:0,z:0},start=grenadeOrigin(origin,direction,[wall]);assert.ok(start.x<wall.minX-.129);
 const g={x:0,y:1.5,z:0,vx:100,vy:0,vz:0};updateGrenade(g,.1,[wall]);assert.ok(g.x<wall.minX-.129);assert.ok(g.vx<0);
});
test('grenades bounce on roofs instead of ignoring their height',()=>{
 const roof={minX:-3,maxX:3,minZ:-3,maxZ:3,minY:2.2,maxY:2.4},g={x:0,y:1,z:0,vx:0,vy:20,vz:0};updateGrenade(g,.1,[roof]);assert.ok(g.y<2.071);assert.ok(g.vy<0);
});
test('all map doors and boundaries admit the character radius used in gameplay',()=>{
 const world=createWorld('gardens');for(const side of [-1,1]){const p=actor(0,side*6);moveCharacter(p,0,side*17,world);assert.ok(Math.abs(p.z-side*23)<.001);assert.equal(collides(p.x,p.z,CHARACTER_RADIUS,world.obstacles),false);}
});

test('factory machine columns and stacked crates stop shots at their visible height',()=>{
 const world=createWorld();
 const machine=traceShot({x:-10.25,y:2.15,z:-12},{x:0,y:0,z:1},10,world.solids,[]);assert.ok(machine.distance<4,'machine column above its low base');
 const crate=traceShot({x:1.2,y:2.1,z:4},{x:0,y:0,z:1},6,world.solids,[]);assert.ok(crate.distance<4,'upper stacked crate');
});
test('round barrels have round movement and shot boundaries instead of box corners',()=>{
 const c={shape:'cylinder',x:0,z:0,radius:1,minX:-1,maxX:1,minZ:-1,maxZ:1,minY:0,maxY:3};
 assert.equal(collides(1.2,1.2,.4,[c]),false);assert.equal(collides(1.1,0,.4,[c]),true);
 const miss=traceShot({x:.9,y:1,z:-3},{x:0,y:0,z:1},1.5,[c],[]);assert.equal(miss.wall,false);
 const p=actor(-4,0);moveWithCollision(p,10,0,.4,[c]);assert.ok(p.x<-1.399);
});
