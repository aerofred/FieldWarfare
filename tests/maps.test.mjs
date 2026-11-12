import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MAPS} from '../src/maps.js';
import {createWorld,clearShot,wallDistance} from '../src/world.js';
import {collides,moveWithCollision,distance} from '../src/rules.js';
import {createNavigation,walkable} from '../src/navigation.js';
import {MultiplayerRoom} from '../server/room.js';

for(const id of ['gardens','railway','desert','market','harbor']){
 test(id+': spawns, objectives and patrol routes are accessible',()=>{
  const m=MAPS[id],w=createWorld(id),nav=createNavigation(w.obstacles);
  for(const p of [...m.teamSpawns.blue,...m.teamSpawns.red,...m.enemySpawns,m.soloSpawn,...m.relays,...m.patrol,m.flags.blue,m.flags.red]){
   assert.equal(collides(p.x,p.z,.4,w.obstacles),false,JSON.stringify(p));
   const path=nav.findPath(m.soloSpawn,p);assert.ok(path.length>0||distance(m.soloSpawn,p)<1);if(path.length)assert.ok(distance(path.at(-1),p)<1.5,JSON.stringify(p));
  }
  assert.ok(w.solids.length>w.obstacles.length,'roofs and lintels block shots while leaving floor routes open');
 });
 test(id+': both bot teams navigate, fire and respawn using the selected world',()=>{
  let seed=42;const room=new MultiplayerRoom({mapId:id,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)});room.add({name:'Observer'}).protectedUntil=1e9;
  let shots=0,kills=0;for(let i=0;i<2700;i++){room.tick(1/30);for(const e of room.drainEvents()){if(e.type==='shot')shots++;if(e.type==='kill')kills++;}for(const p of room.players.values()){assert.ok([p.x,p.z,p.yaw,p.pitch].every(Number.isFinite));assert.equal(collides(p.x,p.z,.33,room.world.obstacles),false);}}
  assert.ok(shots>10,`${id}: ${shots} shots`);assert.ok(kills>0,'bots fight on this map');assert.equal(room.players.size,8);assert.equal(room.snapshot().mapId,id);
 });
}

test('both houses have connected front and rear doors, and a complete loop outside',()=>{
 const w=createWorld('gardens');
 for(const side of [-1,1]){
  const front={x:0,z:side*6},back={x:0,z:side*23};assert.equal(walkable(front,back,w.obstacles),true);
  const p={...front};moveWithCollision(p,0,side*17,.34,w.obstacles);assert.ok(distance(p,back)<.01);
  const loop=[{x:-9,z:side*7},{x:9,z:side*7},{x:9,z:side*21},{x:-9,z:side*21},{x:-9,z:side*7}];for(let i=1;i<loop.length;i++)assert.equal(walkable(loop[i-1],loop[i],w.obstacles),true);
  assert.equal(clearShot({x:-4.2,y:1.7,z:side*6},{x:-4.2,y:1.7,z:side*12},w.solids),true,'window opening');
  assert.equal(clearShot({x:5,y:1.7,z:side*12},{x:10,y:1.7,z:side*12},w.solids),false,'side wall');
  assert.ok(wallDistance({x:0,y:1.7,z:side*12},{x:0,y:1,z:0},w.solids,10)<2,'solid ceiling');
 }
});

test('rail workshop can be crossed through both doors and the office is accessible',()=>{
 const w=createWorld('railway'),nav=createNavigation(w.obstacles);
 assert.equal(walkable({x:-30,z:-3},{x:-15,z:-3},w.obstacles),true);
 assert.equal(walkable({x:17,z:-12},{x:24,z:-12},w.obstacles),true);
 assert.equal(walkable({x:24,z:-12},{x:24,z:-3},w.obstacles),true);
 const path=nav.findPath({x:-24,z:26},{x:24,z:-12});assert.ok(distance(path.at(-1),{x:24,z:-12})<1);
});

test('first human chooses the common map; later humans keep it; fixed servers override it',()=>{
 const room=new MultiplayerRoom(),a=room.add({name:'Alice',mapId:'gardens'});room.add({name:'Bob',mapId:'railway'});assert.equal(room.mapId,'gardens');assert.equal(room.snapshot(a.id).mapId,'gardens');
 for(const p of [...room.players.values()].filter(p=>!p.isBot))room.remove(p.id);room.add({name:'Next',mapId:'railway'});assert.equal(room.mapId,'railway');assert.equal(room.navigation,null);
 const fixed=new MultiplayerRoom({mapId:'railway'});fixed.add({name:'Guest',mapId:'gardens'});assert.equal(fixed.mapId,'railway');assert.equal(fixed.mapFixed,true);
 assert.throws(()=>new MultiplayerRoom({mapId:'other'}),/data\.error\.badMap/);assert.throws(()=>new MultiplayerRoom().add({name:'Bad',mapId:'other'}),/data\.error\.badMap/);
});

test('new maps: interiors open on both sides, the harbour walkway and trawler deck are reachable by ladder only',()=>{
 const desert=createWorld('desert');for(const [x,z]of [[5,11],[-5,-11]])assert.equal(walkable({x,z:z-5},{x,z:z+5},desert.obstacles),true,'house doors '+z);
 assert.equal(walkable({x:-17,z:-15},{x:-17,z:-21},desert.obstacles),true,'hangar opening');
 const market=createWorld('market'),nav=createNavigation(market.obstacles);
 assert.equal(walkable({x:0,z:12},{x:0,z:-12},market.obstacles),true,'hall portals');assert.equal(walkable({x:-14,z:0},{x:-6,z:0},market.obstacles),true,'hall side door');
 for(const [a,b]of [[{x:-7.2,z:13.5},{x:-24,z:13.5}],[{x:7.2,z:-18.5},{x:24,z:-18.5}]])assert.equal(walkable(a,b,market.obstacles),true,'shop crossing '+a.z);
 assert.ok(distance(nav.findPath({x:-26,z:27},{x:26,z:-27}).at(-1),{x:26,z:-27})<1);
 const harbor=createWorld('harbor');assert.equal(walkable({x:-6,z:-15},{x:-18,z:-15},harbor.obstacles),true,'cold store door');
 for(const [x,z,top]of [[-5.5,0,3.25],[20,9,2.6]])assert.ok(harbor.solids.some(b=>Math.abs(b.maxY-top)<.01&&x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ),'raised floor '+x);
 assert.equal(harbor.solids.some(b=>b.minX>31),false,'open sea to the east');
});
