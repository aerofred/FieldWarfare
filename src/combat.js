import {rayBox,wallDistance} from './world.js';
const EPS=1e-6;
// Anatomical hit volumes exclude weapons, backpacks and team markers.
// Coordinates match createSoldier; only height scales while crouched.
const parts=[
 ['torso',0,1.12,.025,.54,.6,.36],['hips',0,.83,0,.42,.2,.31],['neck',0,1.43,0,.22,.17,.2],
 ['arm',-.3,1.17,.08,.19,.45,.24],['arm',.3,1.2,.04,.19,.42,.24],
 ['arm',-.18,1.03,.28,.14,.16,.32],
 ['leg',-.14,.46,0,.2,.7,.23],['leg',.14,.46,0,.2,.7,.23],
 ['foot',-.14,.05,.04,.21,.15,.33],['foot',.14,.05,.04,.21,.15,.33]
];
function ellipsoid(origin,dir,center,radius,range){
 const o={},d={};for(const axis of ['x','y','z']){o[axis]=(origin[axis]-center[axis])/radius[axis];d[axis]=dir[axis]/radius[axis];}
 const a=d.x*d.x+d.y*d.y+d.z*d.z,b=o.x*d.x+o.y*d.y+o.z*d.z,c=o.x*o.x+o.y*o.y+o.z*o.z-1;if(c<=0)return 0;
 const disc=b*b-a*c;if(disc<0)return null;const t=(-b-Math.sqrt(disc))/a;return t>=0&&t<=range?t:null;
}
export function characterHit(origin,direction,actor,range=Infinity){
 const yaw=(actor.yaw||0)+Math.PI,c=Math.cos(yaw),s=Math.sin(yaw),scale=actor.crouch?.65:1,bottom=.15+(actor.jump||0);
 const dx=origin.x-actor.x,dz=origin.z-actor.z,local={x:c*dx-s*dz,y:origin.y-bottom,z:s*dx+c*dz},dir={x:c*direction.x-s*direction.z,y:direction.y,z:s*direction.x+c*direction.z};
 let nearest=range,result=null;
 const head=ellipsoid(local,dir,{x:0,y:1.64*scale,z:0},{x:.195,y:.22*scale,z:.195},range);
 if(head!==null){nearest=head;result={distance:head,head:true,part:'head'};}
 for(const [part,x,y,z,w,h,d]of parts){const t=rayBox(local,dir,{minX:x-w/2,maxX:x+w/2,minY:(y-h/2)*scale,maxY:(y+h/2)*scale,minZ:z-d/2,maxZ:z+d/2},nearest);if(t!==null&&(!result||t<nearest-EPS)){nearest=t;result={distance:t,head:false,part};}}
 return result;
}
export function traceShot(origin,direction,range,solids,actors,shooter=null){
 const wall=wallDistance(origin,direction,solids,range);let nearest=wall,victim=null,head=false,part=null;
 for(const actor of actors)if(actor!==shooter&&actor.alive!==false){const hit=characterHit(origin,direction,actor,nearest);if(hit&&hit.distance<nearest-EPS){nearest=hit.distance;victim=actor;head=hit.head;part=hit.part;}}
 return {distance:nearest,victim,head,part,wall:!victim&&wall<range,end:{x:origin.x+direction.x*nearest,y:origin.y+direction.y*nearest,z:origin.z+direction.z*nearest}};
}
