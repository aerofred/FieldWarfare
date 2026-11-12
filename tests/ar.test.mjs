import {test} from 'node:test';
import assert from 'node:assert/strict';
import {screenHeading,headingYaw,screenMove,aimAngles,clampScale,scaleLabel,MIN_SCALE,MAX_SCALE,DEFAULT_SCALE} from '../src/ar-math.js';

const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-9,`${message}: ${a} ≠ ${b}`);
// Column-major camera matrix from its x, y and z axes (no translation).
const axes=(x,y,z)=>[...x,0,...y,0,...z,0,0,0,0,1];

test('the heading of the screen holds when looking straight down at the table', () => {
 // Level view down -z.
 let h=screenHeading(axes([1,0,0],[0,1,0],[0,0,1]));close(h.x,0,'x');close(h.z,-1,'z');
 // Straight down, the top of the screen towards -z: the up axis gives the heading.
 h=screenHeading(axes([1,0,0],[0,0,-1],[0,1,0]));close(h.x,0,'x');close(h.z,-1,'z');
 // Turned to look down +x.
 h=screenHeading(axes([0,0,1],[0,1,0],[-1,0,0]));close(h.x,1,'x');close(h.z,0,'z');
 close(headingYaw({x:0,z:-1}),0,'yaw facing -z');close(headingYaw({x:-1,z:0}),Math.PI/2,'yaw facing -x');
});

test('the stick moves the soldier relative to the screen, whatever he faces', () => {
 const up={x:0,z:-1};
 // Soldier facing the top of the screen: the stick passes through.
 let m=screenMove(0,1,up,0);close(m.forward,1,'forward');close(m.strafe,0,'strafe');
 m=screenMove(1,0,up,0);close(m.forward,0,'forward');close(m.strafe,1,'strafe');
 // Soldier facing the right of the screen (yaw -90°): pushing up strafes left.
 m=screenMove(0,1,up,-Math.PI/2);close(m.forward,0,'forward');close(m.strafe,-1,'strafe');
 // Soldier facing the player (yaw 180°): pushing up walks backwards.
 m=screenMove(0,1,up,Math.PI);close(m.forward,-1,'forward');close(m.strafe,0,'strafe');
 // A diagonal push keeps its length.
 m=screenMove(.6,.6,{x:Math.SQRT1_2,z:-Math.SQRT1_2},1.1);close(Math.hypot(m.forward,m.strafe),Math.hypot(.6,.6),'length');
});

test('the aim angles point the room\'s view at the target', () => {
 const eye={x:2,y:1.87,z:3};
 for(const target of [{x:2,y:1.87,z:-7},{x:-5,y:0,z:3},{x:9,y:4,z:10}]){
  const {yaw,pitch}=aimAngles(eye,target),c=Math.cos(pitch);
  // GameRoom.direction for these angles.
  const d={x:-Math.sin(yaw)*c,y:Math.sin(pitch),z:-Math.cos(yaw)*c},t={x:target.x-eye.x,y:target.y-eye.y,z:target.z-eye.z},l=Math.hypot(t.x,t.y,t.z);
  for(const k of ['x','y','z'])close(d[k],t[k]/l,k);
 }
});

test('the miniature scale stays within its bounds', () => {
 assert.equal(clampScale(1),MAX_SCALE);assert.equal(clampScale(0),MIN_SCALE);assert.equal(clampScale(NaN),DEFAULT_SCALE);
 assert.equal(scaleLabel(DEFAULT_SCALE),'SCALE 1:80 · 80 CM PER SIDE');
});
