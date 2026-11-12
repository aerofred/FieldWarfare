import {rayBox} from './world.js';
const RADIUS=.13,SKIN=.0001;
function cast(origin,direction,range,solids){
 let result=null;
 for(const b of solids){
  const box={minX:b.minX-RADIUS,maxX:b.maxX+RADIUS,minY:b.minY-RADIUS,maxY:b.maxY+RADIUS,minZ:b.minZ-RADIUS,maxZ:b.maxZ+RADIUS};
  if(b.shape==='cylinder')Object.assign(box,{shape:'cylinder',x:b.x,z:b.z,radius:b.radius+RADIUS});
  const t=rayBox(origin,direction,box,result?.distance??range);if(t===null)continue;
  const point={x:origin.x+direction.x*t,y:origin.y+direction.y*t,z:origin.z+direction.z*t};
  const faces=[];for(const [axis,min,max]of [['x','minX','maxX'],['y','minY','maxY'],['z','minZ','maxZ']]){faces.push({delta:Math.abs(point[axis]-box[min]),axis,sign:-1},{delta:Math.abs(point[axis]-box[max]),axis,sign:1});}
  const face=faces.sort((a,b)=>a.delta-b.delta)[0],normal={x:0,y:0,z:0};normal[face.axis]=face.sign;if(b.shape==='cylinder'&&Math.abs(point.y-box.minY)>1e-5&&Math.abs(point.y-box.maxY)>1e-5){const length=Math.max(1e-8,Math.hypot(point.x-b.x,point.z-b.z));normal.x=(point.x-b.x)/length;normal.y=0;normal.z=(point.z-b.z)/length;}
  if(t===0&&direction.x*normal.x+direction.y*normal.y+direction.z*normal.z>=0)continue;
  if(!result||t<result.distance)result={distance:t,normal};
 }
 if(direction.y<0){const t=(.15+RADIUS-origin.y)/direction.y;if(t>=0&&t<=range&&(!result||t<result.distance))result={distance:t,normal:{x:0,y:1,z:0}};}
 return result;
}
export function grenadeOrigin(origin,direction,solids){const hit=cast(origin,direction,.8,solids),d=hit?Math.max(0,hit.distance-SKIN):.8;return {x:origin.x+direction.x*d,y:origin.y+direction.y*d,z:origin.z+direction.z*d};}
export function updateGrenade(g,dt,solids){
 g.vy-=12*dt;let left=dt;
 for(let i=0;i<5&&left>1e-6;i++){
  const speed=Math.hypot(g.vx,g.vy,g.vz);if(speed<1e-6)break;const direction={x:g.vx/speed,y:g.vy/speed,z:g.vz/speed},range=speed*left,hit=cast(g,direction,range,solids);
  const travel=hit?Math.max(0,hit.distance-SKIN):range;g.x+=direction.x*travel;g.y+=direction.y*travel;g.z+=direction.z*travel;
  if(!hit)break;left=Math.max(0,left-hit.distance/speed);const n=hit.normal,dot=g.vx*n.x+g.vy*n.y+g.vz*n.z;
  if(dot<0){const bounce=n.y>0?.35:.45;g.vx-=(1+bounce)*dot*n.x;g.vy-=(1+bounce)*dot*n.y;g.vz-=(1+bounce)*dot*n.z;}
  g.x+=n.x*SKIN;g.y+=n.y*SKIN;g.z+=n.z*SKIN;if(n.y>0){g.vx*=.93;g.vz*=.93;}
 }
 if(g.y<.15+RADIUS){g.y=.15+RADIUS;g.vy=Math.max(0,g.vy);}
}
