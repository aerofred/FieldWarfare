import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createWeapon} from './models.js';

// Lobby weapon photography: the in-game models, without hands, lit like a
// studio product shot. One small offscreen renderer draws into every 2D
// canvas; only the selected or hovered weapon turns, the others are cached.
export class WeaponShowcase{
 constructor(){
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
  const r=this.renderer;r.setPixelRatio(1);r.outputColorSpace=THREE.SRGBColorSpace;r.toneMapping=THREE.ACESFilmicToneMapping;r.toneMappingExposure=1.15;r.shadowMap.enabled=true;r.shadowMap.type=THREE.PCFSoftShadowMap;r.setClearColor(0,0);
  this.scene=new THREE.Scene();const pmrem=new THREE.PMREMGenerator(r),room=new RoomEnvironment();this.environment=pmrem.fromScene(room,.04);room.dispose();pmrem.dispose();this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.55;
  // Key from the upper front, cool rim from behind, warm fill from below.
  const key=this.key=new THREE.DirectionalLight('#fff2df',3.2);key.position.set(.5,3,.9);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.radius=6;key.shadow.bias=-.0004;key.shadow.normalBias=.001;Object.assign(key.shadow.camera,{near:.5,far:5});this.scene.add(key);
  const rim=new THREE.DirectionalLight('#bcd4ff',2.4);rim.position.set(-1.6,1,-.4);this.scene.add(rim);
  const fill=new THREE.DirectionalLight('#ffd9a8',.5);fill.position.set(1,-1,.3);this.scene.add(fill);
  this.floor=new THREE.Mesh(new THREE.PlaneGeometry(4,4),new THREE.ShadowMaterial({opacity:.38}));this.floor.rotation.x=-Math.PI/2;this.floor.receiveShadow=true;this.scene.add(this.floor);
  this.camera=new THREE.PerspectiveCamera(22,3,.1,20);
  this.models=new Map();this.cache=new Map();this.targets=[];this.active=null;this.time=0;this.last=0;this.loop=this.loop.bind(this);requestAnimationFrame(this.loop);
 }
 model(id){
  if(!this.models.has(id)){
   const m=createWeapon(id,{hands:false}),pivot=new THREE.Group();m.light.intensity=0;m.group.remove(m.light);m.group.remove(m.flash);m.flash.material.dispose();
   // Profile view, muzzle right, centred on its bounding box and resting on the floor.
   m.group.rotation.y=-Math.PI/2;pivot.add(m.group);m.group.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(m.group),centre=box.getCenter(new THREE.Vector3());
   m.group.position.sub(centre);pivot.userData={height:box.max.y-box.min.y,length:box.max.x-box.min.x};pivot.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});this.models.set(id,pivot);
  }
  return this.models.get(id);
 }
 // Small canvases render at twice their size and are filtered down, so thin
 // parts (sights, trigger guards) do not shimmer while the weapon turns.
 supersample(h){return h<300?2:1;}
 // canvas: a 2D canvas in the page; live: keep turning; group: weapons framed
 // at one common scale so their relative lengths read true side by side.
 attach(canvas,id,{live=false,group=[id]}={}){this.targets=this.targets.filter(t=>t.canvas.isConnected&&t.canvas!==canvas);const target={canvas,id,live,group,angle:0};this.targets.push(target);this.draw(target,true);return target;}
 setLive(canvas,live){const t=this.targets.find(t=>t.canvas===canvas);if(t){t.live=live;if(!live)this.draw(t,true);}}
 size(canvas){const ratio=Math.min(2,devicePixelRatio||1),w=Math.max(1,Math.round(canvas.clientWidth*ratio)),h=Math.max(1,Math.round(canvas.clientHeight*ratio));return[w,h];}
 render(id,w,h,angle,group=[id]){
  const pivot=this.model(id),r=this.renderer,aspect=w/h;this.scene.add(pivot);
  const {height}=pivot.userData,fit=Math.max(...group.map(other=>{const {height,length}=this.model(other).userData;return Math.max(length*1.1,height*1.4*aspect);}));
  // The shadow map spans the group's largest weapon: a pistol gets as many
  // shadow texels as a rifle, so its shadows do not crawl as it turns.
  const span=Math.max(...group.map(other=>{const {height,length}=this.model(other).userData;return Math.max(length,height);}))*.75,shadow=this.key.shadow.camera;
  if(shadow.right!==span){Object.assign(shadow,{left:-span,right:span,top:span,bottom:-span});shadow.updateProjectionMatrix();}
  pivot.position.y=height/2+.012;pivot.rotation.set(0,angle,0);
  // Camera slightly above and in front, distance chosen so `fit` metres span the frame.
  const fov=THREE.MathUtils.degToRad(this.camera.fov),distance=fit/aspect/2/Math.tan(fov/2);this.camera.aspect=aspect;this.camera.position.set(.1*distance,.16*distance+height*.5,distance);this.camera.lookAt(0,height*.5,0);this.camera.updateProjectionMatrix();
  if(r.domElement.width!==w||r.domElement.height!==h)r.setSize(w,h,false);r.render(this.scene,this.camera);this.scene.remove(pivot);return r.domElement;
 }
 draw(target,still=false){
  const {canvas,id}=target,[w,h]=this.size(canvas);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const key=`${id}:${w}x${h}:${target.group}`,ctx=canvas.getContext('2d');let source;
  const k=this.supersample(h);
  if(still&&!target.angle){if(!this.cache.has(key)){const c=document.createElement('canvas');c.width=w;c.height=h;const cx=c.getContext('2d');cx.imageSmoothingQuality='high';cx.drawImage(this.render(id,w*k,h*k,0,target.group),0,0,w,h);this.cache.set(key,c);}source=this.cache.get(key);}
  else source=this.render(id,w*k,h*k,target.angle,target.group);
  ctx.clearRect(0,0,w,h);ctx.imageSmoothingQuality='high';ctx.drawImage(source,0,0,w,h);
 }
 loop(now){
  requestAnimationFrame(this.loop);const dt=Math.min(.05,(now-this.last)/1000||0);this.last=now;
  // Its canvases live in the lobby. In game, reading their offsetParent would
  // force a layout every frame, right after the HUD changed.
  if(this.paused)return;this.time+=dt;
  for(const t of this.targets){
   if(!t.canvas.isConnected||!t.canvas.offsetParent)continue;
   const [w,h]=this.size(t.canvas);if(t.canvas.width!==w||t.canvas.height!==h)this.draw(t,!t.live&&!t.angle);// shown or resized
   if(t.live){t.angle=Math.sin(this.time*.55)*.38;this.draw(t);}
   else if(t.angle){t.angle*=Math.max(0,1-dt*6);if(Math.abs(t.angle)<.002)t.angle=0;this.draw(t,!t.angle);}
  }
 }
}
