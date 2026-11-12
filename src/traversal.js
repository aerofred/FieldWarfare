import {CHARACTER_RADIUS,CHARACTER_HEIGHT,feet,circleBox} from './collision.js';

// Climbing over obstacles and up ladders, shared by the local game and the
// authoritative server so both move the character the same way.
export const MANTLE_REACH=1.55;// highest ledge above the feet that can be pulled onto
const MIN_LEDGE=.25,CLIMB_SPEED=2.4,STANDOFF=CHARACTER_RADIUS+.22,CROUCH_HEIGHT=CHARACTER_HEIGHT*.65,EPS=1e-6;
const ease=t=>t*t*(3-2*t);

// No solid crosses the body column at (x,z) between bottom and bottom+height.
function fits(x,z,bottom,height,solids){
 if(Math.abs(x)>31-CHARACTER_RADIUS||Math.abs(z)>31-CHARACTER_RADIUS)return false;
 return !solids.some(b=>b.minY<bottom+height-EPS&&b.maxY>bottom+EPS&&circleBox(x,z,CHARACTER_RADIUS,b));
}
// A ledge ahead within reach, with room to stand (or crouch) on top of it.
export function findLedge(actor,dirX,dirZ,solids,reach=MANTLE_REACH,from=CHARACTER_RADIUS){
 const f=feet(actor);let top=-Infinity;
 for(const d of [from+.1,from+.25,from+.4]){const px=actor.x+dirX*d,pz=actor.z+dirZ*d;for(const b of solids)if(b.maxY>f+MIN_LEDGE&&b.maxY<=f+reach&&b.minY<f+reach&&circleBox(px,pz,.08,b))top=Math.max(top,b.maxY);if(top>-Infinity)break;}
 if(top===-Infinity)return null;
 // Pull straight up first: the column above the current spot must be free.
 if(!fits(actor.x,actor.z,f,top+CROUCH_HEIGHT-f,solids))return null;
 for(const d of [from+.55,from+.75,from+.4]){
  const x=actor.x+dirX*d,z=actor.z+dirZ*d;
  if(!solids.some(b=>Math.abs(b.maxY-top)<.03&&circleBox(x,z,.12,b)))continue;
  if(fits(x,z,top,CHARACTER_HEIGHT,solids))return{x,z,y:top,crouch:false};
  if(fits(x,z,top,CROUCH_HEIGHT,solids))return{x,z,y:top,crouch:true};
 }
 return null;
}
function startMantle(actor,ledge){
 const f=feet(actor);actor.climb=null;actor.vy=0;actor.grounded=false;
 actor.mantle={t:0,duration:.28+.16*(ledge.y-f),from:{x:actor.x,z:actor.z,y:f},to:ledge};
}
function nearLadder(actor,ladders){
 const f=feet(actor);
 for(const l of ladders){const dx=actor.x-l.x,dz=actor.z-l.z,out=dx*l.nx+dz*l.nz,side=-dx*l.nz+dz*l.nx;if(out>0&&out<STANDOFF+.35&&Math.abs(side)<.6&&f<l.top-.25)return l;}
 return null;
}
// Returns 'mantle' or 'climb' while traversal owns the character this frame
// (the caller then skips walking and gravity), otherwise null.
// input: {forward:-1..1, yaw, jumpPressed}
export function traverse(actor,input,dt,world){
 const solids=world.solids,ladders=world.ladders||[],lookX=-Math.sin(input.yaw||0),lookZ=-Math.cos(input.yaw||0);
 // Reach is measured from the floor last stood on, not from the top of a jump.
 if(actor.grounded!==false&&!actor.mantle&&!actor.climb)actor.ground=feet(actor);
 if(actor.mantle){
  const m=actor.mantle;m.t+=dt;const u=Math.min(1,m.t/m.duration),rise=ease(Math.min(1,u/.6)),reach=ease(Math.max(0,(u-.35)/.65));
  actor.x=m.from.x+(m.to.x-m.from.x)*reach;actor.z=m.from.z+(m.to.z-m.from.z)*reach;actor.jump=Math.max(0,m.from.y+(m.to.y+.04-m.from.y)*rise-.15);actor.vy=0;actor.grounded=false;
  if(m.to.crouch)actor.crouch=true;
  if(u>=1){actor.x=m.to.x;actor.z=m.to.z;actor.jump=Math.max(0,m.to.y-.15);actor.grounded=true;actor.mantle=null;}
  return 'mantle';
 }
 if(actor.climb){
  const l=actor.climb;
  if(input.jumpPressed){actor.climb=null;actor.vy=2.5;actor.x+=l.nx*.15;actor.z+=l.nz*.15;return null;}// let go
  // Hold the climber centred in front of the rungs.
  const pull=Math.min(1,dt*10);actor.x+=(l.x+l.nx*STANDOFF-actor.x)*pull;actor.z+=(l.z+l.nz*STANDOFF-actor.z)*pull;
  let f=feet(actor)+(input.forward||0)*CLIMB_SPEED*dt;actor.vy=0;actor.grounded=false;
  if(f<=.15+EPS&&(input.forward||0)<0){actor.jump=0;actor.grounded=true;actor.climb=null;return null;}// stepped off at the bottom
  f=Math.max(.15,Math.min(f,l.top-.25));actor.jump=f-.15;
  if((input.forward||0)>0&&f>=l.top-1.1){const ledge=findLedge(actor,-l.nx,-l.nz,solids,MANTLE_REACH,STANDOFF);if(ledge){startMantle(actor,ledge);return 'mantle';}}
  return 'climb';
 }
 if((input.forward||0)>0){
  const l=nearLadder(actor,ladders);
  if(l&&lookX*-l.nx+lookZ*-l.nz>.55){actor.climb=l;actor.crouch=false;actor.vy=0;return 'climb';}
  // Jump at a ledge, or reach it while airborne, to pull onto it.
  if(input.jumpPressed||actor.grounded===false&&actor.jump>.05&&(actor.vy||0)<3){const reach=(actor.ground??feet(actor))+MANTLE_REACH-feet(actor),ledge=reach>MIN_LEDGE&&findLedge(actor,lookX,lookZ,solids,reach);if(ledge){startMantle(actor,ledge);return 'mantle';}}
 }
 return null;
}
export function traversing(actor){return !!(actor.mantle||actor.climb);}
