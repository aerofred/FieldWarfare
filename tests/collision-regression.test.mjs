import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collides} from '../src/rules.js';
import {MultiplayerRoom} from '../server/room.js';

test('a round character can pass a corner when its body clears it',()=>{
 assert.equal(collides(.65,.65,.4,[{minX:1,maxX:2,minZ:1,maxZ:2}]),false);
});
test('living characters block movement instead of passing through each other',()=>{
 const room=new MultiplayerRoom({fillBots:false}),a=room.add({name:'A'}),b=room.add({name:'B'});
 Object.assign(a,{x:-8,z:8,jump:0,vy:0});Object.assign(b,{x:-8,z:3,jump:0,vy:0});
 for(let i=0;i<90;i++){room.input(a.id,{seq:i+1,forward:1,strafe:0,yaw:0,pitch:0});room.tick(1/30);}
 assert.ok(a.z>=b.z+.78,`a=${a.z}, b=${b.z}`);
});
test('shots on a visible upper arm register on the authoritative server',()=>{
 const room=new MultiplayerRoom({fillBots:false,random:()=>.5}),a=room.add({name:'A'}),b=room.add({name:'B'});
 Object.assign(a,{x:-8,z:8,cooldown:0,yaw:0,pitch:0});Object.assign(b,{x:-8,z:3,protectedUntil:0,yaw:0,pitch:0});
 const point={x:b.x+.34,y:.15+1.2,z:b.z},eye=room.eye(a),dx=point.x-eye.x,dz=point.z-eye.z;
 a.yaw=Math.atan2(-dx,-dz);a.pitch=Math.atan2(point.y-eye.y,Math.hypot(dx,dz));room.fire(a);assert.ok(b.health<100);
});
