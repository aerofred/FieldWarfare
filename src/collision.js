export const CHARACTER_RADIUS=.4;
export const CHARACTER_HEIGHT=1.88;
const EPS=1e-7,SKIN=1e-5,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const feet=p=>.15+(p.jump||0);
export const bodyHeight=p=>CHARACTER_HEIGHT*(p.crouch?.65:1);
export function circleBox(x,z,r,b){if(b.shape==='cylinder')return (x-b.x)**2+(z-b.z)**2<(r+b.radius)**2-EPS;const dx=x-clamp(x,b.minX,b.maxX),dz=z-clamp(z,b.minZ,b.maxZ);return dx*dx+dz*dz<r*r-EPS;}
export function collides(x,z,r,obstacles){if(Math.abs(x)>31-r+EPS||Math.abs(z)>31-r+EPS)return true;for(let i=0;i<obstacles.length;i++)if(circleBox(x,z,r,obstacles[i]))return true;return false;}
const overlapsHeight=(a,b)=>feet(a)<feet(b)+bodyHeight(b)-EPS&&feet(b)<feet(a)+bodyHeight(a)-EPS;

function recover(pos,r,obstacles){
 for(let pass=0;pass<5;pass++){
  let changed=false;
  for(let i=0;i<obstacles.length;i++){const b=obstacles[i];if(!circleBox(pos.x,pos.z,r,b))continue;
   if(b.shape==='cylinder'){const dx=pos.x-b.x,dz=pos.z-b.z,d=Math.hypot(dx,dz),push=r+b.radius-d+SKIN;pos.x+=(d>EPS?dx/d:1)*push;pos.z+=(d>EPS?dz/d:0)*push;changed=true;continue;}
   const x=clamp(pos.x,b.minX,b.maxX),z=clamp(pos.z,b.minZ,b.maxZ),dx=pos.x-x,dz=pos.z-z,d=Math.hypot(dx,dz);
   if(d>EPS){pos.x+=dx/d*(r-d+SKIN);pos.z+=dz/d*(r-d+SKIN);}
   else{
    // Centre inside the box: out through the nearest face (first one on ties).
    let d=pos.x-b.minX,nx=-1,nz=0;
    if(b.maxX-pos.x<d){d=b.maxX-pos.x;nx=1;nz=0;}
    if(pos.z-b.minZ<d){d=pos.z-b.minZ;nx=0;nz=-1;}
    if(b.maxZ-pos.z<d){d=b.maxZ-pos.z;nx=0;nz=1;}
    pos.x+=nx*(d+r+SKIN);pos.z+=nz*(d+r+SKIN);
   }
   changed=true;
  }
  pos.x=clamp(pos.x,-31+r,31-r);pos.z=clamp(pos.z,-31+r,31-r);if(!changed)break;
 }
}

// Continuous circle sweep against wall faces, rounded corners and bodies.
// Testing the full segment prevents tunnelling even at sprint speed/low FPS.
// It runs for every move of every soldier, so its state lives here rather
// than in closures and arrays that would feed the garbage collector.
let sweepX=0,sweepZ=0,sweepDX=0,sweepDZ=0,sweepFound=false;
const sweepHit={t:0,nx:0,nz:0};
function take(t,nx,nz){if(t<-EPS||t>1+EPS||sweepDX*nx+sweepDZ*nz>=-EPS)return;if(!sweepFound||t<sweepHit.t){sweepFound=true;sweepHit.t=Math.max(0,t);sweepHit.nx=nx;sweepHit.nz=nz;}}
// qx, qz: the corner quadrant a rounded corner may be hit from, 0 for any.
function sweepCircle(x,z,radius,qx,qz){
 const ox=sweepX-x,oz=sweepZ-z,dx=sweepDX,dz=sweepDZ,a=dx*dx+dz*dz,b=ox*dx+oz*dz,c=ox*ox+oz*oz-radius*radius;
 if(a<EPS||c<-EPS)return;const disc=b*b-a*c;if(disc<0)return;
 const t=(-b-Math.sqrt(disc))/a;if(t<-EPS||t>1+EPS)return;const nx=(ox+dx*t)/radius,nz=(oz+dz*t)/radius;
 if(!qx||nx*qx>=-EPS&&nz*qz>=-EPS)take(t,nx,nz);
}
function sweep(pos,dx,dz,r,obstacles,actors){
 sweepX=pos.x;sweepZ=pos.z;sweepDX=dx;sweepDZ=dz;sweepFound=false;
 for(let i=0;i<obstacles.length;i++){
  const b=obstacles[i];
  if(b.shape==='cylinder'){sweepCircle(b.x,b.z,r+b.radius,0,0);continue;}
  if(dx>EPS){const t=(b.minX-r-pos.x)/dx,z=pos.z+dz*t;if(z>=b.minZ-EPS&&z<=b.maxZ+EPS)take(t,-1,0);}
  if(dx<-EPS){const t=(b.maxX+r-pos.x)/dx,z=pos.z+dz*t;if(z>=b.minZ-EPS&&z<=b.maxZ+EPS)take(t,1,0);}
  if(dz>EPS){const t=(b.minZ-r-pos.z)/dz,x=pos.x+dx*t;if(x>=b.minX-EPS&&x<=b.maxX+EPS)take(t,0,-1);}
  if(dz<-EPS){const t=(b.maxZ+r-pos.z)/dz,x=pos.x+dx*t;if(x>=b.minX-EPS&&x<=b.maxX+EPS)take(t,0,1);}
  sweepCircle(b.minX,b.minZ,r,-1,-1);sweepCircle(b.minX,b.maxZ,r,-1,1);sweepCircle(b.maxX,b.minZ,r,1,-1);sweepCircle(b.maxX,b.maxZ,r,1,1);
 }
 for(let i=0;i<actors.length;i++){const a=actors[i];if(a!==pos&&a.alive!==false&&overlapsHeight(pos,a))sweepCircle(a.x,a.z,r+(a.radius||CHARACTER_RADIUS),0,0);}
 if(dx>EPS)take((31-r-pos.x)/dx,-1,0);else if(dx<-EPS)take((-31+r-pos.x)/dx,1,0);
 if(dz>EPS)take((31-r-pos.z)/dz,0,-1);else if(dz<-EPS)take((-31+r-pos.z)/dz,0,1);
 // The hit is read before the next sweep: one shared object serves them all.
 return sweepFound?sweepHit:null;
}
export function moveWithCollision(pos,dx,dz,r,obstacles,actors=[]){
 if(!(Number.isFinite(pos.x)&&Number.isFinite(pos.z)&&Number.isFinite(dx)&&Number.isFinite(dz)&&Number.isFinite(r)))return pos;
 recover(pos,r,obstacles);
 for(let pass=0;pass<5&&Math.hypot(dx,dz)>EPS;pass++){
  const hit=sweep(pos,dx,dz,r,obstacles,actors);
  if(!hit){pos.x+=dx;pos.z+=dz;break;}
  const t=Math.max(0,hit.t-SKIN/Math.max(SKIN,Math.hypot(dx,dz)));pos.x+=dx*t;pos.z+=dz*t;dx*=1-t;dz*=1-t;
  const inward=dx*hit.nx+dz*hit.nz;if(inward<0){dx-=inward*hit.nx;dz-=inward*hit.nz;}
 }
 return pos;
}
// Soldiers on the ground share one list per stance; the cached lists are
// read only, and a map rebuilds its solids rather than editing them.
const groundSolids=new WeakMap();
export function blockingSolids(actor,solids){
 const bottom=feet(actor),top=bottom+bodyHeight(actor),filter=()=>solids.filter(b=>b.minY<top-EPS&&b.maxY>bottom+EPS);
 if(actor.jump)return filter();
 let cache=groundSolids.get(solids);if(!cache)groundSolids.set(solids,cache={});
 const key=actor.crouch?'crouch':'stand';return cache[key]??=filter();
}
export function moveCharacter(actor,dx,dz,world,actors=[]){return moveWithCollision(actor,dx,dz,CHARACTER_RADIUS,blockingSolids(actor,world.solids),actors);}
export function setStance(actor,crouch,solids){
 if(crouch){actor.crouch=true;return;}
 const bottom=feet(actor),top=bottom+CHARACTER_HEIGHT;
 actor.crouch=solids.some(b=>b.minY<top-EPS&&b.maxY>bottom+bodyHeight(actor)+EPS&&circleBox(actor.x,actor.z,CHARACTER_RADIUS,b));
}
export function updateVertical(actor,dt,solids){
 let bottom=feet(actor);actor.vy=(actor.vy||0)-14*dt;let next=bottom+actor.vy*dt;actor.grounded=false;
 for(let i=0;i<solids.length;i++){const b=solids[i];if(!circleBox(actor.x,actor.z,CHARACTER_RADIUS,b))continue;
  if(actor.vy<=0&&bottom>=b.maxY-EPS&&next<=b.maxY){next=Math.max(next,b.maxY);actor.vy=0;actor.grounded=true;}
  else if(actor.vy>0&&bottom+bodyHeight(actor)<=b.minY+EPS&&next+bodyHeight(actor)>=b.minY){next=Math.min(next,b.minY-bodyHeight(actor));actor.vy=0;}
 }
 if(next<=.15){next=.15;actor.vy=0;actor.grounded=true;}actor.jump=Math.max(0,next-.15);
}
// Free operators (augmented reality) are where their device is: never pushed.
export function separateCharacters(actors,world){
 const living=actors.filter(a=>a.alive!==false&&!a.free);
 for(let pass=0;pass<6;pass++){let changed=false;
  for(let i=0;i<living.length;i++)for(let j=i+1;j<living.length;j++){
   const a=living[i],b=living[j];if(!overlapsHeight(a,b))continue;let dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);if(d>=CHARACTER_RADIUS*2-SKIN)continue;
   if(d<EPS){dx=1;dz=0;d=1;}else{dx/=d;dz/=d;}
   const push=(CHARACTER_RADIUS*2-Math.hypot(b.x-a.x,b.z-a.z)+SKIN)/2;
   moveCharacter(a,-dx*push,-dz*push,world);moveCharacter(b,dx*push,dz*push,world);changed=true;
  }if(!changed)break;
 }
}

export function safeEyeHeight(actor,wanted,solids){
 let height=wanted;for(const b of solids)if(b.minY>feet(actor)+.5&&circleBox(actor.x,actor.z,CHARACTER_RADIUS,b))height=Math.min(height,b.minY-feet(actor)-.08);return Math.max(.5,height);
}
