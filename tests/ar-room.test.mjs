import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeGrid,buildArena,mergeCells,ROOM_SCALE,FLOOR_Y} from '../src/ar-room.js';
import {GameRoom} from '../src/sim/room.js';
import {createNavigation} from '../src/navigation.js';
import {collides} from '../src/rules.js';

// A 4 × 5 m room scanned in 10 cm cells: walls 2.5 m high all round, a sofa
// (2 × 0.9 m, 80 cm high) against one wall, a low cable that is not an
// obstacle, and floor seen through the doorway that belongs to no room.
function scannedRoom(){
 const cols=44,rows=54,cells=new Uint8Array(cols*rows),set=(c,r,v)=>{cells[r*cols+c]=v;};
 for(let r=1;r<53;r++)for(let c=1;c<43;c++)set(c,r,1);
 for(let c=1;c<43;c++){set(c,1,251);set(c,52,251);}for(let r=1;r<53;r++){set(1,r,251);set(42,r,251);}
 for(let r=3;r<12;r++)for(let c=10;c<30;c++)set(c,r,81);
 for(let c=5;c<15;c++)set(c,30,4);
 set(0,40,1);set(0,41,1);
 return {floor:-1.2,yaw:.3,x0:-2,z0:-2.5,cell:.1,cols,rows,cells:Buffer.from(cells).toString('base64'),area:18,walls:4,faces:0,lidar:false};
}

test('greedy merging covers each kept cell exactly once', () => {
 const cols=5,rows=4,keys=[1,1,2,2,null, 1,1,2,2,null, 3,3,3,null,null, 3,3,3,1,1];
 const rects=mergeCells(cols,rows,i=>keys[i]),seen=new Array(cols*rows).fill(0);
 for(const r of rects)for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++){const i=(r.r+y)*cols+r.c+x;assert.equal(keys[i],r.key);seen[i]++;}
 keys.forEach((k,i)=>assert.equal(seen[i],k==null?0:1));
 assert.equal(rects.length,4);
});

test('a scanned room becomes an arena of the usual size with its sofa as cover', () => {
 const arena=buildArena(decodeGrid(scannedRoom()));
 assert.ok(arena);assert.equal(arena.scale,ROOM_SCALE);
 // 40 × 50 interior cells, less the sofa; the cable's cells stay free.
 assert.ok(Math.abs(arena.area-(4*5-2*.9))<.05,`area ${arena.area}`);
 const sofa=arena.world.solids.find(b=>Math.abs(b.maxY-(FLOOR_Y+.8/ROOM_SCALE))<1e-6);
 assert.ok(sofa,'sofa solid');assert.ok(Math.abs(sofa.maxX-sofa.minX-2/ROOM_SCALE)<1e-6&&Math.abs(sofa.maxZ-sofa.minZ-.9/ROOM_SCALE)<1e-6);
 assert.ok(!arena.world.solids.some(b=>b.maxY<FLOOR_Y+.08/ROOM_SCALE),'the cable is no obstacle');
 // Everything fits the navigation grid; spawns and patrols stand clear.
 for(const b of arena.world.solids)assert.ok(Math.max(Math.abs(b.minX),Math.abs(b.maxX),Math.abs(b.minZ),Math.abs(b.maxZ))<=31);
 const {enemySpawns,patrol,soloSpawn}=arena.config;assert.ok(enemySpawns.length>=8);assert.ok(patrol.length>=2);
 for(const p of [...enemySpawns,...patrol,soloSpawn])assert.ok(!collides(p.x,p.z,.4,arena.world.obstacles),`clear at ${p.x},${p.z}`);
 // Bots find their way from every spawn to the operator, round the sofa.
 const navigation=createNavigation(arena.world.obstacles);
 for(const s of enemySpawns){const path=navigation.findPath(s,soloSpawn);assert.ok(path.length,'path');const end=path.at(-1);assert.ok(Math.hypot(end.x-soloSpawn.x,end.z-soloSpawn.z)<1.5);}
 // The doorway's floor outside the room is fenced off.
 assert.ok(collides(-30,0,.4,arena.world.obstacles)||collides(30,0,.4,arena.world.obstacles));
});

test('a larger room grows the soldiers so the arena still fits', () => {
 const cols=140,rows=60,cells=new Uint8Array(cols*rows).fill(1);
 const arena=buildArena(decodeGrid({floor:0,yaw:0,x0:0,z0:0,cell:.1,cols,rows,cells:Buffer.from(cells).toString('base64')}));
 assert.ok(arena.scale>ROOM_SCALE);assert.ok(Math.abs(7/arena.scale-29)<1e-6);
 assert.equal(buildArena(decodeGrid({floor:0,yaw:0,x0:0,z0:0,cell:.1,cols:10,rows:10,cells:Buffer.from(new Uint8Array(100).fill(1)).toString('base64')})),null,'1 m² is too small');
});

test('in a room the operator is his device and the waves come to him', () => {
 const arena=buildArena(decodeGrid(scannedRoom()));
 let seed=7;const random=()=>(seed=(seed*16807)%2147483647)/2147483647;
 const room=new GameRoom({autoRestart:false,arena,random});
 const me=room.add({name:'OPERATEUR',mode:'survival',rules:{score:3,blue:1,red:4},mapId:'room',botDifficulty:'elite'});
 assert.equal(room.mapId,'room');assert.ok(me.free);assert.equal(room.phase,'active');
 assert.equal(room.actors.filter(p=>p.hostile).length,4);
 // The device, 1.4 m above the floor at 1:8, in the middle of the room.
 const device={x:0,y:FLOOR_Y+1.4/ROOM_SCALE,z:4};let seq=0,hits=0,shots=0;
 const send=(extra={})=>room.input(me.id,{seq:++seq,forward:1,strafe:0,yaw:0,pitch:-.6,...device,...extra});
 send();room.tick(1/30);
 assert.equal(me.x,device.x);assert.equal(me.z,device.z);assert.ok(Math.abs(room.eye(me).y-device.y)<1e-9);
 // The stick does nothing: only the device moves him.
 for(let i=0;i<30;i++){send();room.tick(1/30);}assert.equal(me.x,device.x);assert.equal(me.z,device.z);
 // His shots leave the device.
 room.drainEvents();room.action(me.id,{type:'action',action:'fire'});const shot=room.drainEvents().find(e=>e.type==='shot'&&e.actor===me.id);
 assert.ok(shot);assert.ok(Math.abs(shot.origin.y-device.y)<1e-9);
 // A blast on the floor right under the device does not reach it.
 const health=me.health;room.explode({x:device.x,y:.2,z:device.z,owner:room.actors.find(p=>p.hostile)});assert.equal(me.health,health);
 // The enemies come and shoot at the device; none goes through the furniture.
 for(let i=0;i<30*40&&room.phase==='active';i++){send();room.tick(1/30);for(const e of room.drainEvents())if(e.type==='shot'&&e.actor!==me.id){shots++;if(e.hit===me.id)hits++;}
  for(const p of room.actors)if(p.hostile&&p.alive)assert.ok(!collides(p.x,p.z,.39,arena.world.obstacles.filter(o=>o.maxY===undefined||o.maxY>.5)),'hostile inside an obstacle');}
 assert.ok(shots>0,'enemies fired');assert.ok(hits>0,'some shots reached the device');
});
