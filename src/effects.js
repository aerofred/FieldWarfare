import * as THREE from 'three';

// Pooled combat effects: every particle, tracer and casing lives in a fixed
// GPU buffer, so firing never allocates geometry or materials.
const POINT_VERTEX=`
attribute float size;attribute vec4 tint;attribute vec2 extra;
uniform float viewport;
varying vec4 vTint;varying vec2 vExtra;varying float vDepth;varying float vSize;
#include <fog_pars_vertex>
void main(){
 vTint=tint;vExtra=extra;vSize=size;
 vec4 mvPosition=modelViewMatrix*vec4(position,1.);
 gl_PointSize=size*projectionMatrix[1][1]*viewport/max(.05,-mvPosition.z);
 gl_Position=projectionMatrix*mvPosition;vDepth=-mvPosition.z;
 #include <fog_vertex>
}`;
const POINT_FRAGMENT=`
varying vec4 vTint;varying vec2 vExtra;varying float vDepth;varying float vSize;
uniform float additive;uniform float close;
#include <fog_pars_fragment>
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
void main(){
 vec2 p=gl_PointCoord*2.-1.;float r=dot(p,p);if(r>1.||vTint.a<.002)discard;
 float a=pow(1.-r,vExtra.y);
 if(vExtra.y<2.5)a*=.55+.45*noise(gl_PointCoord*3.5+vExtra.x*17.);
 // Fade what brushes the camera; a puff a few sizes away stays visible,
 // except through the magnifying scope (close=0).
 a*=max(smoothstep(.35,1.8,vDepth),close*smoothstep(1.2,3.,vDepth/max(vSize,.001)));
 gl_FragColor=vec4(vTint.rgb,vTint.a*a);
 #ifdef USE_FOG
  if(additive>.5){
   #ifdef FOG_EXP2
    float d=fogDensity*vFogDepth;gl_FragColor.a*=exp(-d*d);
   #endif
  }else{
   #include <fog_fragment>
  }
 #endif
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
const viewport=new THREE.Vector4();

class ParticleLayer{
 constructor(scene,count,additive){
  this.count=count;this.cursor=0;this.active=0;this.dirty=true;
  this.pos=new Float32Array(count*3);this.vel=new Float32Array(count*3);this.life=new Float32Array(count);this.max=new Float32Array(count);
  this.size0=new Float32Array(count);this.size1=new Float32Array(count);this.alpha=new Float32Array(count);this.drag=new Float32Array(count);this.gravity=new Float32Array(count);
  this.size=new Float32Array(count);this.tint=new Float32Array(count*4);this.extra=new Float32Array(count*2);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(this.pos,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('size',new THREE.BufferAttribute(this.size,1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('tint',new THREE.BufferAttribute(this.tint,4).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('extra',new THREE.BufferAttribute(this.extra,2).setUsage(THREE.DynamicDrawUsage));
  const material=new THREE.ShaderMaterial({uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{viewport:{value:500},additive:{value:additive?1:0},close:{value:1}}]),vertexShader:POINT_VERTEX,fragmentShader:POINT_FRAGMENT,transparent:true,depthWrite:false,fog:true,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending});
  this.points=new THREE.Points(geometry,material);this.points.frustumCulled=false;this.points.renderOrder=additive?3:2;
  // Size is in metres: convert with the viewport of the pass being drawn
  // (screen, post-processing target or the M14 lens).
  this.points.onBeforeRender=(renderer,scene,camera)=>{renderer.getCurrentViewport(viewport);material.uniforms.viewport.value=viewport.w*.5;material.uniforms.close.value=camera.fov>=30?1:0;};
  scene.add(this.points);
 }
 emit(x,y,z,vx,vy,vz,{life=.5,size=.1,grow=size,color,alpha=1,drag=0,gravity=0,hardness=1.5}){
  const i=this.cursor;this.cursor=(this.cursor+1)%this.count;
  this.pos.set([x,y,z],i*3);this.vel.set([vx,vy,vz],i*3);this.life[i]=this.max[i]=life;this.size0[i]=size;this.size1[i]=grow;this.alpha[i]=alpha;this.drag[i]=drag;this.gravity[i]=gravity;
  this.tint[i*4]=color.r;this.tint[i*4+1]=color.g;this.tint[i*4+2]=color.b;this.tint[i*4+3]=alpha;this.extra[i*2]=Math.random();this.extra[i*2+1]=hardness;this.size[i]=size;
  this.active++;this.dirty=true;
 }
 update(dt){
  if(!this.active&&!this.dirty)return;
  let active=0;
  for(let i=0;i<this.count;i++){
   if(this.life[i]<=0)continue;
   this.life[i]-=dt;
   if(this.life[i]<=0){this.size[i]=0;this.tint[i*4+3]=0;continue;}
   active++;const k=i*3,drag=Math.exp(-this.drag[i]*dt);
   this.vel[k]*=drag;this.vel[k+1]=this.vel[k+1]*drag-this.gravity[i]*dt;this.vel[k+2]*=drag;
   this.pos[k]+=this.vel[k]*dt;this.pos[k+1]+=this.vel[k+1]*dt;this.pos[k+2]+=this.vel[k+2]*dt;
   if(this.pos[k+1]<.12&&this.gravity[i]>0){this.pos[k+1]=.12;this.vel[k+1]*=-.25;this.vel[k]*=.5;this.vel[k+2]*=.5;}
   const t=1-this.life[i]/this.max[i];this.size[i]=this.size0[i]+(this.size1[i]-this.size0[i])*Math.sqrt(t);
   // Quick fade-in avoids popping, long fade-out reads as dissipation.
   this.tint[i*4+3]=this.alpha[i]*Math.min(1,t*12)*(1-t)*(1-t*.3);
  }
  this.active=active;this.dirty=active>0;
  const a=this.points.geometry.attributes;a.position.needsUpdate=a.size.needsUpdate=a.tint.needsUpdate=true;if(this.extraDirty!==this.cursor){a.extra.needsUpdate=true;this.extraDirty=this.cursor;}
 }
 clear(){this.life.fill(0);this.size.fill(0);for(let i=3;i<this.tint.length;i+=4)this.tint[i]=0;this.active=0;this.dirty=true;}
 dispose(){this.points.geometry.dispose();this.points.material.dispose();this.points.removeFromParent();}
}

const TRACER_VERTEX=`
attribute vec3 head;attribute vec2 corner;attribute float alpha;
uniform float width;uniform float minAngle;
varying float vAlpha;varying vec2 vCorner;
void main(){
 vec4 t=modelViewMatrix*vec4(position,1.),h=modelViewMatrix*vec4(head,1.);
 vec4 p=mix(t,h,corner.x);vec3 d=h.xyz-t.xyz;
 vec3 side=cross(d,p.xyz);side=length(side)>1e-6?normalize(side):vec3(1.,0.,0.);
 float w=max(width,-p.z*minAngle)*(.35+corner.x*.65);
 p.xyz+=side*corner.y*w;vAlpha=alpha;vCorner=corner;gl_Position=projectionMatrix*p;
}`;
const TRACER_FRAGMENT=`
uniform vec3 color;varying float vAlpha;varying vec2 vCorner;
void main(){float a=vCorner.x*vCorner.x*(1.-vCorner.y*vCorner.y)*vAlpha;if(a<.003)discard;gl_FragColor=vec4(color,a);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
class Tracers{
 constructor(scene,count=64){
  this.count=count;this.items=Array.from({length:count},()=>({life:0,from:new THREE.Vector3(),dir:new THREE.Vector3(),length:0,travel:0,speed:0,streak:0}));this.cursor=0;this.active=0;
  const geometry=new THREE.BufferGeometry(),vertices=count*4;
  this.tail=new Float32Array(vertices*3);this.head=new Float32Array(vertices*3);this.alpha=new Float32Array(vertices);const corner=new Float32Array(vertices*2),index=[];
  for(let i=0;i<count;i++){corner.set([0,-1,0,1,1,-1,1,1],i*8);const v=i*4;index.push(v,v+2,v+1,v+1,v+2,v+3);}
  geometry.setAttribute('position',new THREE.BufferAttribute(this.tail,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('head',new THREE.BufferAttribute(this.head,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('alpha',new THREE.BufferAttribute(this.alpha,1).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('corner',new THREE.BufferAttribute(corner,2));geometry.setIndex(index);
  const material=new THREE.ShaderMaterial({uniforms:{color:{value:new THREE.Color(3.2,2.1,1.05)},width:{value:.011},minAngle:{value:.0012}},vertexShader:TRACER_VERTEX,fragmentShader:TRACER_FRAGMENT,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
  this.mesh=new THREE.Mesh(geometry,material);this.mesh.frustumCulled=false;this.mesh.renderOrder=4;scene.add(this.mesh);
 }
 add(a,b,speed=420){
  const item=this.items[this.cursor];this.cursor=(this.cursor+1)%this.count;
  item.from.copy(a);item.dir.subVectors(b,a);item.length=item.dir.length();if(item.length<.3){item.life=0;return;}
  item.dir.divideScalar(item.length);item.travel=0;item.speed=speed;item.streak=Math.min(6,2.5+item.length*.04);item.life=1;this.active++;
 }
 update(dt){
  if(!this.active&&!this.dirty)return;let active=0;
  for(let i=0;i<this.count;i++){
   const item=this.items[i];let alpha=0,tail=0,head=0;
   if(item.life>0){item.travel+=item.speed*dt;head=Math.min(item.length,item.travel);tail=Math.max(0,item.travel-item.streak);if(tail>=item.length)item.life=0;else{active++;alpha=.85;}}
   for(let v=0;v<4;v++){const k=(i*4+v)*3;for(let c=0;c<3;c++){const axis=c===0?'x':c===1?'y':'z';this.tail[k+c]=item.from[axis]+item.dir[axis]*tail;this.head[k+c]=item.from[axis]+item.dir[axis]*head;}this.alpha[i*4+v]=alpha;}
  }
  this.active=active;this.dirty=active>0;const a=this.mesh.geometry.attributes;a.position.needsUpdate=a.head.needsUpdate=a.alpha.needsUpdate=true;
 }
 clear(){for(const item of this.items)item.life=0;this.active=0;this.dirty=true;}
 dispose(){this.mesh.geometry.dispose();this.mesh.material.dispose();this.mesh.removeFromParent();}
}

class Casings{
 constructor(scene,count=48){
  const geometry=new THREE.CylinderGeometry(.0058,.0058,.034,7);geometry.rotateZ(Math.PI/2);
  this.mesh=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({color:'#c39a4e',metalness:.9,roughness:.32}),count);this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.mesh.frustumCulled=false;
  this.items=Array.from({length:count},()=>({life:0,p:new THREE.Vector3(),v:new THREE.Vector3(),q:new THREE.Quaternion(),spin:new THREE.Vector3(),bounced:0}));this.cursor=0;this.active=0;
  this.matrix=new THREE.Matrix4();this.scale=new THREE.Vector3();this.zero=new THREE.Matrix4().makeScale(0,0,0);this.delta=new THREE.Quaternion();this.euler=new THREE.Euler();
  for(let i=0;i<count;i++)this.mesh.setMatrixAt(i,this.zero);scene.add(this.mesh);
 }
 add(position,velocity,scale=1,kind='brass'){
  const c=this.items[this.cursor];this.cursor=(this.cursor+1)%this.items.length;
  c.p.copy(position);c.v.copy(velocity);c.q.random();c.spin.set((Math.random()-.5)*30,(Math.random()-.5)*30,(Math.random()-.5)*30);c.life=5;c.bounced=0;c.scale=scale;c.kind=kind;this.active++;
 }
 update(dt,onBounce){
  if(!this.active)return;let active=0;
  for(let i=0;i<this.items.length;i++){
   const c=this.items[i];if(c.life<=0)continue;c.life-=dt;
   if(c.life<=0){this.mesh.setMatrixAt(i,this.zero);continue;}active++;
   if(c.bounced<4){c.v.y-=9.8*dt;c.p.addScaledVector(c.v,dt);this.delta.setFromEuler(this.euler.set(c.spin.x*dt,c.spin.y*dt,c.spin.z*dt));c.q.multiply(this.delta);
    if(c.p.y<.108){c.p.y=.108;if(c.v.y<-.6){onBounce?.(c.p,c.bounced,c.scale,c.kind,-c.v.y);c.v.y*=-.32;c.v.x*=.55;c.v.z*=.55;c.spin.multiplyScalar(.5);c.bounced++;}else{c.v.set(0,0,0);c.bounced=4;}}}
   this.scale.setScalar(c.scale*Math.min(1,c.life*2));this.matrix.compose(c.p,c.q,this.scale);this.mesh.setMatrixAt(i,this.matrix);
  }
  this.active=active;this.mesh.instanceMatrix.needsUpdate=true;
 }
 clear(){for(let i=0;i<this.items.length;i++){this.items[i].life=0;this.mesh.setMatrixAt(i,this.zero);}this.active=0;this.mesh.instanceMatrix.needsUpdate=true;}
 dispose(){this.mesh.geometry.dispose();this.mesh.material.dispose();this.mesh.removeFromParent();}
}

const color=hex=>new THREE.Color(hex),hdr=(hex,k)=>new THREE.Color(hex).multiplyScalar(k);
const COLORS={spark:hdr('#ffc070',3.5),flash:hdr('#ffd9a0',6),fire:hdr('#ff8a35',3),ember:hdr('#ff6a20',2.5),dust:color('#a59f8c'),smoke:color('#5d5c56'),dark:color('#2e2c28'),muzzle:color('#c9c6bb'),debris:color('#2d2a24')};
const r=(a=1)=>(Math.random()-.5)*2*a,side=new THREE.Vector3();
// Muzzle smoke by weapon: a blast thrown forward that stalls within a metre,
// a cloud that lingers and climbs, side jets from the sniper rifle's muzzle brake
// or the revolver's cylinder gap. heat: barrel smoke added per shot (wisp).
export const MUZZLE={
 minimi:{flash:.35,blast:4,speed:3,size:.06,grow:.42,alpha:.2,linger:1,heat:.07},
 mag58:{flash:.45,blast:6,speed:3.6,size:.08,grow:.6,alpha:.26,linger:2,heat:.09},
 r870:{flash:.55,blast:9,speed:4.2,size:.09,grow:.8,alpha:.3,linger:3,heat:.45},
 hecate:{flash:.6,blast:3,speed:2.5,size:.08,grow:.6,alpha:.2,linger:1,brake:4,heat:.6},
 mp5:{flash:0,blast:2,speed:.8,size:.035,grow:.24,alpha:.1,linger:1,heat:.04},
 revolver:{flash:.4,blast:5,speed:3,size:.06,grow:.5,alpha:.26,linger:2,gap:2,heat:.35},
 ppk:{flash:0,blast:2,speed:.7,size:.03,grow:.2,alpha:.09,linger:1,heat:.03}
};

export class Effects{
 constructor(scene){this.glow=new ParticleLayer(scene,700,true);this.smoke=new ParticleLayer(scene,1400,false);this.tracers=new Tracers(scene);this.casings=new Casings(scene);this.dustColor=COLORS.dust;}
 setMap(id){const tint={gardens:'#a8a088',railway:'#9d978b',desert:'#c9b089',market:'#9a8f88',harbor:'#c8cdd0'}[id];this.dustColor=tint?color(tint):COLORS.dust;this.clear();}
 tracer(a,b,speed){this.tracers.add(a,b,speed);}
 casing(position,velocity,scale,kind){this.casings.add(position,velocity,scale,kind);}
 sparks(p,count=6,speed=4){for(let i=0;i<count;i++)this.glow.emit(p.x,p.y,p.z,r(speed),Math.random()*speed,r(speed),{life:.15+Math.random()*.25,size:.035,grow:.01,color:COLORS.spark,gravity:9,drag:1.5,hardness:3});}
 // glare: the flash's halo, faded out when the shooter aims and the weapon
 // hides the muzzle.
 muzzle(p,dir,id,glare=1){
  const m=MUZZLE[id]??MUZZLE.minimi;
  if(m.flash&&glare>.05)this.glow.emit(p.x+dir.x*.08,p.y+dir.y*.08,p.z+dir.z*.08,dir.x*2,dir.y*2,dir.z*2,{life:.05,size:m.flash*glare,grow:m.flash*1.4*glare,color:COLORS.flash,alpha:.7,hardness:2});
  for(let i=0;i<m.blast;i++){const s=m.speed*(.35+Math.random()*.65),o=Math.random()*.08;this.smoke.emit(p.x+dir.x*o,p.y+dir.y*o,p.z+dir.z*o,dir.x*s+r(.35),dir.y*s+r(.35)+.15,dir.z*s+r(.35),{life:.5+Math.random()*.5,size:m.size,grow:m.grow*(.7+Math.random()*.6),color:COLORS.muzzle,alpha:m.alpha,drag:5.5,gravity:-.3,hardness:1.2});}
  for(let i=0;i<m.linger;i++){const s=.3+Math.random()*.5,o=.15+Math.random()*.3;this.smoke.emit(p.x+dir.x*o,p.y+dir.y*o,p.z+dir.z*o,dir.x*s+r(.1),dir.y*s+.15+Math.random()*.1,dir.z*s+r(.1),{life:1.6+Math.random()*1.2,size:m.size*1.5,grow:m.grow*1.8,color:COLORS.muzzle,alpha:m.alpha*.8,drag:1.8,gravity:-.22,hardness:1.1});}
  if(!m.brake&&!m.gap)return;
  // The brake vents sideways and a little back; the gap sits behind the barrel.
  side.set(-dir.z,0,dir.x).normalize();const back=m.gap?.15:0,jets=m.brake||m.gap;
  for(let i=0;i<jets*2;i++){const k=i%2?1:-1,s=(m.brake?2.5:1.5)+Math.random()*1.5;this.smoke.emit(p.x-dir.x*back,p.y-dir.y*back,p.z-dir.z*back,side.x*k*s-dir.x*.6+r(.2),.2+r(.2),side.z*k*s-dir.z*.6+r(.2),{life:.6+Math.random()*.5,size:m.brake?.07:.03,grow:m.brake?.55:.2,color:COLORS.muzzle,alpha:m.alpha*(m.brake?1.2:.7),drag:5,gravity:-.25,hardness:1.2});}
 }
 // Smoke curling from a hot barrel; heat from 0 to 1.
 wisp(p,heat){this.smoke.emit(p.x+r(.01),p.y+.01,p.z+r(.01),r(.06),.25+Math.random()*.2,r(.06),{life:1.4+Math.random()*1,size:.025,grow:.18+heat*.12,color:COLORS.muzzle,alpha:.07+heat*.18,drag:.8,gravity:-.15,hardness:1.1});}
 impact(p,n,metal=Math.random()<.35){
  for(let i=0;i<3;i++){const s=.6+Math.random()*1.2;this.smoke.emit(p.x+n.x*.03,p.y+n.y*.03,p.z+n.z*.03,n.x*s+r(.35),n.y*s+r(.35)+.2,n.z*s+r(.35),{life:.5+Math.random()*.5,size:.06,grow:.38,color:this.dustColor,alpha:.4,drag:3.5,gravity:-.1});}
  for(let i=0;i<4;i++){const s=1.5+Math.random()*2.5;this.smoke.emit(p.x,p.y,p.z,n.x*s+r(1.2),n.y*s+Math.random()*1.5,n.z*s+r(1.2),{life:.4+Math.random()*.4,size:.022,color:COLORS.debris,alpha:.95,gravity:9.8,drag:.5,hardness:8});}
  if(metal)for(let i=0;i<5;i++){const s=2+Math.random()*4;this.glow.emit(p.x,p.y,p.z,n.x*s+r(2),n.y*s+Math.random()*2,n.z*s+r(2),{life:.08+Math.random()*.18,size:.022,grow:.008,color:COLORS.spark,gravity:9,hardness:3});}
 }
 explosion(p){
  this.glow.emit(p.x,p.y+.3,p.z,0,0,0,{life:.14,size:2.2,grow:5,color:COLORS.flash,alpha:.9,hardness:1.6});
  for(let i=0;i<16;i++)this.glow.emit(p.x+r(.3),p.y+.2+Math.random()*.3,p.z+r(.3),r(4),1+Math.random()*4,r(4),{life:.25+Math.random()*.35,size:.5,grow:1.6,color:i%3?COLORS.fire:COLORS.ember,alpha:.75,drag:4,gravity:-1.5,hardness:1.4});
  for(let i=0;i<34;i++){const s=6+Math.random()*10;this.glow.emit(p.x,p.y+.2,p.z,r(1)*s,Math.random()*s*.8,r(1)*s,{life:.35+Math.random()*.6,size:.04,grow:.015,color:COLORS.spark,gravity:9.8,drag:.8,hardness:3});}
  for(let i=0;i<26;i++){const s=.8+Math.random()*1.6;this.smoke.emit(p.x+r(.7),p.y+.4+Math.random()*.9,p.z+r(.7),r(s),1.2+Math.random()*2.4,r(s),{life:3+Math.random()*2.5,size:1.3,grow:5+Math.random()*2.5,color:i%3?COLORS.smoke:COLORS.dark,alpha:.78,drag:1.1,gravity:-.45,hardness:1.1});}
  for(let i=0;i<16;i++){const a=i/16*Math.PI*2,s=4+Math.random()*3;this.smoke.emit(p.x,.35,p.z,Math.cos(a)*s,.4,Math.sin(a)*s,{life:1.4+Math.random()*1,size:.6,grow:3,color:this.dustColor,alpha:.6,drag:2.4,hardness:1.2});}
  for(let i=0;i<22;i++){const s=3+Math.random()*7;this.smoke.emit(p.x,p.y+.2,p.z,r(1)*s,2+Math.random()*s,r(1)*s,{life:.8+Math.random()*.9,size:.05,color:COLORS.debris,alpha:1,gravity:9.8,drag:.3,hardness:8});}
 }
 update(dt,onCasing){this.glow.update(dt);this.smoke.update(dt);this.tracers.update(dt);this.casings.update(dt,onCasing);}
 clear(){this.glow.clear();this.smoke.clear();this.tracers.clear();this.casings.clear();}
 dispose(){this.glow.dispose();this.smoke.dispose();this.tracers.dispose();this.casings.dispose();}
}
