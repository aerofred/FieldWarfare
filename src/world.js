import {createExtraWorld} from './extra-worlds.js';
import {laddersFor} from './ladders.js';
// Collision geometry shared by the rendered factory and authoritative server.
// Movement uses the horizontal bounds; weapon traces also use the height.
export function createWorld(id='factory') {
  if(id!=='factory')return createExtraWorld(id);
  const obstacles=[],solids=[];
  const box=(w,h,d,x,y,z,walk=true)=>{
    const bounds={minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2};
    if(walk)obstacles.push(bounds);solids.push({...bounds,minY:y-h/2,maxY:y+h/2});
  };
  const cylinder=(radius,h,x,y,z,walk=true)=>{const b={shape:'cylinder',x,z,radius,minX:x-radius,maxX:x+radius,minZ:z-radius,maxZ:z+radius,minY:y-h/2,maxY:y+h/2};solids.push(b);if(walk)obstacles.push(b);};
  for(const [w,d,x,z]of [[64,1,0,-32],[64,1,0,32],[1,64,-32,0],[1,64,32,0]])box(w,3.4,d,x,1.7,z);
  box(13,8,.65,-10,4,-19);box(9,8,.65,12,4,-19);box(5,2,.8,1.5,1,-19);
  box(.7,6,12,-17,3,-11);box(.7,3.8,7,-17,1.9,8.5);box(.7,7,15,18,3.5,-11);box(.7,2.2,7,18,1.1,10);
  for(const x of [-16,1,17])for(const z of [-18,-5,12])box(.48,10.5,.48,x,5.25,z);
  for(const [x,z,rotated]of [[-10,-7,false],[7,-11,false],[-5,0,true]])box(rotated?4.2:2.2,1.1,rotated?2.2:4.2,x,.55,z);
  box(3.8,1.5,2.2,10,.75,3);
  for(const x of [-12,-10.5,-9])cylinder(.57,2.4,x,1.2,-14);
  for(const [x,z,rotated]of [[24,12,true],[-24,1,true],[5,22,false],[-14,24,false],[24,-25,false]])box(rotated?2.8:7,2.9,rotated?7:2.8,x,1.45,z);
  for(const [x,z,rotated]of [[-5,15,false],[10,13,false],[25,-6,true],[-23,14,false],[5,-25,false]])box(rotated?.9:4,1.05,rotated?4:.9,x,.525,z);
  for(const [x,z]of [[-5,-11],[14,7],[-12,15],[20,-15],[-21,-23],[1,7]])box(1.5,1.4,1.5,x,.7,z);
  for(const [x,z]of [[-2,12],[-1,13],[15,-14],[16,-13],[26,4],[-21,-13]])cylinder(.5,1,x,.5,z);
  for(const [x,z,h]of [[-24,-26,17],[-20,-27,13],[27,-12,14]])cylinder(1.8,h,x,h/2,z);
  box(3.2,3.4,2.4,13,1.7,-16);
  // Upper machine blocks, stacked crates and roof pieces are visible geometry
  // too. Keep navigation conservative where a character can touch them.
  for(const [x,z,rotated]of [[-10,-7,false],[7,-11,false],[-5,0,true]]){
    const w=rotated?4.2:2.2,d=rotated?2.2:4.2;box(w*.75,.65,d*.65,x,1.42,z,false);box(1.3,2.4,1.1,x-.25,1.2,z-1.1);cylinder(.4,1.5,x,1.8,z,false);
  }
  box(4.3,.25,2.6,10,1.63,3);
  for(const [x,z]of [[-5,-11],[14,7],[-12,15],[20,-15],[-21,-23],[1,7]])box(1.45,.95,1.45,x+.2,1.9,z+.1);
  for(const [x,z,h]of [[-24,-26,17],[-20,-27,13],[27,-12,14]]){cylinder(1.95,.3,x,h-1,z,false);cylinder(1.95,.3,x,3,z,false);}
  for(const [w,d,x,z]of [[9,13,-12,-11],[7,9,13,7],[5,13,3,-12]])box(w,.15,d,x,10.25,z,false);
  box(5,1.1,.8,1.5,7.5,-19,false);box(33,.6,1.15,0,8.6,-4,false);
  return {obstacles,solids,ladders:laddersFor('factory')};
}

// Ray tests run for every solid of every line of sight and shot, many
// thousand times a second: they allocate nothing, as garbage collection
// pauses showed up as stutters on older iPads.
let slabNear=0,slabFar=0;
function slab(origin,direction,min,max){
  if(Math.abs(direction)<1e-9)return !(origin<min||origin>max);
  let a=(min-origin)/direction,b=(max-origin)/direction;
  if(a>b){const t=a;a=b;b=t;}
  slabNear=Math.max(slabNear,a);slabFar=Math.min(slabFar,b);return !(slabNear>slabFar);
}
export function rayBox(origin,direction,box,maxDistance=Infinity) {
  if(box.shape==='cylinder')return rayCylinder(origin,direction,box,maxDistance);
  slabNear=0;slabFar=maxDistance;
  if(!slab(origin.x,direction.x,box.minX,box.maxX)||!slab(origin.y,direction.y,box.minY,box.maxY)||!slab(origin.z,direction.z,box.minZ,box.maxZ))return null;
  return slabNear;
}
export function raySphere(origin,direction,center,radius,maxDistance=Infinity) {
  const x=origin.x-center.x,y=origin.y-center.y,z=origin.z-center.z;
  const b=x*direction.x+y*direction.y+z*direction.z,c=x*x+y*y+z*z-radius*radius,discriminant=b*b-c;
  if(discriminant<0)return null;const t=-b-Math.sqrt(discriminant);return c<=0?0:t>=0&&t<=maxDistance?t:null;
}
export function wallDistance(origin,direction,solids,range) {
  let nearest=range;
  for(let i=0;i<solids.length;i++){const t=rayBox(origin,direction,solids[i],nearest);if(t!==null)nearest=t;}
  if(direction.y<0){const ground=(.1-origin.y)/direction.y;if(ground>=0)nearest=Math.min(nearest,ground);}
  return nearest;
}
// Any solid closer than the target blocks it: no need to find the nearest.
const shotDirection={x:0,y:0,z:0};
export function clearShot(a,b,solids){
  const d=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);if(d<.001)return true;
  const direction=shotDirection,limit=d-1e-6;direction.x=(b.x-a.x)/d;direction.y=(b.y-a.y)/d;direction.z=(b.z-a.z)/d;
  if(direction.y<0){const ground=(.1-a.y)/direction.y;if(ground>=0&&ground<limit)return false;}
  for(let i=0;i<solids.length;i++){const t=rayBox(a,direction,solids[i],d);if(t!==null&&t<limit)return false;}
  return true;
}

export function rayCylinder(origin,direction,b,range=Infinity){
 const x=origin.x-b.x,z=origin.z-b.z,r=b.radius;
 if(x*x+z*z<=r*r&&origin.y>=b.minY&&origin.y<=b.maxY)return 0;
 let nearest=range,found=false;const a=direction.x**2+direction.z**2,half=x*direction.x+z*direction.z,c=x*x+z*z-r*r,disc=half*half-a*c;
 if(a>1e-12&&disc>=0){
  const root=Math.sqrt(disc);
  for(let i=0;i<2;i++){const t=(-half+(i?root:-root))/a,y=origin.y+direction.y*t;if(t>=0&&t<=nearest&&y>=b.minY&&y<=b.maxY){nearest=t;found=true;}}
 }
 if(Math.abs(direction.y)>1e-12)for(let i=0;i<2;i++){const t=((i?b.maxY:b.minY)-origin.y)/direction.y,dx=x+direction.x*t,dz=z+direction.z*t;if(t>=0&&t<=nearest&&dx*dx+dz*dz<=r*r){nearest=t;found=true;}}
 return found?nearest:null;
}
