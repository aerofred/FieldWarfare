// Geometry of the augmented reality miniature, apart from three.js and the
// native plugin so the tests can check it.
import {t} from './i18n.js';

// Every map is 64 × 64 m inside perimeter walls a metre thick: the
// miniature is cut a little outside them.
export const MAP_SIZE=64,MAP_HALF=33;
// Scale of the miniature: real metres per game metre. 1:80 puts the map on
// 80 cm of table and a soldier at a little over 2 cm.
export const DEFAULT_SCALE=1/80,MIN_SCALE=1/400,MAX_SCALE=1/16;
export const clampScale=scale=>Math.min(MAX_SCALE,Math.max(MIN_SCALE,Number.isFinite(scale)?scale:DEFAULT_SCALE));
export const scaleLabel=scale=>t('data.ar.scale',{ratio:Math.round(1/scale),size:Math.round(MAP_SIZE*scale*100)});

// Where the top of the screen points on the ground, from a camera's world
// matrix (column-major elements): its forward axis (-z) plus its up axis
// (y), so a view looking straight down still has a heading.
export function screenHeading(e){
 const x=e[4]-e[8],z=e[6]-e[10],length=Math.hypot(x,z);
 return length<1e-6?{x:0,z:-1}:{x:x/length,z:z/length};
}
// The yaw a game camera would have looking along a ground heading.
export const headingYaw=h=>Math.atan2(-h.x,-h.z);

// The stick moves the soldier relative to the screen, as in a third-person
// game, while the soldier faces where the crosshair points: the push (x to
// the right, y to the top of the screen) becomes the forward and strafe
// amounts the room expects for the soldier's yaw.
export function screenMove(x,y,heading,yaw){
 const wx=y*heading.x-x*heading.z,wz=y*heading.z+x*heading.x,s=Math.sin(yaw),c=Math.cos(yaw);
 return {forward:-wx*s-wz*c,strafe:wx*c-wz*s};
}

// View angles from the soldier's eye to a point, in the room's convention:
// yaw 0 looks down -z, pitch up is positive.
export function aimAngles(eye,target){
 const dx=target.x-eye.x,dy=target.y-eye.y,dz=target.z-eye.z;
 return {yaw:Math.atan2(-dx,-dz),pitch:Math.atan2(dy,Math.hypot(dx,dz))};
}
