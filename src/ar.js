import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {Capacitor,registerPlugin} from '@capacitor/core';
import {createSoldier,animateSoldier,updateSoldierLOD} from './models.js';
import {MAP_HALF,DEFAULT_SCALE,clampScale,scaleLabel,screenHeading,headingYaw,screenMove,aimAngles} from './ar-math.js';
import {decodeGrid,decodeCells,buildArena,floorRects,obstacleRects,MIN_AREA,FLOOR_Y} from './ar-room.js';
import {t,lang} from './i18n.js';

// Augmented reality on the iOS app. ARKit runs in the FieldAR plugin
// (native/ar), which shows the camera behind the page and sends the
// device's pose with each camera frame. Two ways to play:
//
// Table (tabletop miniature): the map stands on a real table and the player walks
// round it. The game keeps its full-size world; the table's anchor
// (position, turn, scale) maps game metres to real ones and the device's
// pose brought back through it becomes the game camera, a giant looking
// down on the map. The soldier is seen from outside: the stick moves him
// relative to the screen, the centre of the screen is the crosshair and he
// fires at what it covers, with a lock on the enemy closest to it.
//
// The lobby's settings choose between them (view: normal, tabletop, room);
// DEPLOY opens the camera on that kind, and the panel over it leads
// to the mission.
//
// Room: the room is scanned (with LiDAR, the full room and its
// furniture; without, the floor and the walls), becomes the arena (see
// ar-room.js) and enemy waves come into it. The player is the device: he
// walks for real, aims with the centre of the screen and holds his weapon
// as in normal play. The real room hides the soldiers behind it.

const native=(()=>{try{return Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='ios'&&Capacitor.isPluginAvailable('FieldAR')?registerPlugin('FieldAR'):null;}catch{return null;}})();
export const arSupported=()=>!!native;

// What the device offers, asked once: {supported, lidar}; null off the app.
let capabilities=null;
export function arCapabilities(){if(!native)return Promise.resolve(null);return capabilities||=Promise.resolve().then(()=>native.available()).catch(()=>null);}

// three.js always creates its WebGL context with an alpha channel: AR only
// clears it transparent (see sceneSettings) and the camera shows through.
// Leaving AR reloads the page, which drops every AR state at once; the
// reload carries what the lobby does not keep, the weapons chosen:
// {primary, sidearm}.
const BOOT='fw-ar-boot';
export function reloadWith(state){try{sessionStorage.setItem(BOOT,JSON.stringify(state));}catch{}location.reload();}
export function takeBoot(){
 try{const text=sessionStorage.getItem(BOOT);sessionStorage.removeItem(BOOT);const state=text&&JSON.parse(text);return state&&typeof state==='object'?state:null;}
 catch{return null;}
}

// Enemies whose chest is this close to the crosshair, in CSS pixels, are
// locked: a soldier two centimetres tall is hard to cover with a finger's
// worth of precision.
const LOCK_RADIUS=40;
// Nearest and farthest real distances drawn, in metres.
const NEAR=.02,FAR=50;
// A standing soldier's eye above the ground, in game metres.
const EYE=.15+1.72;
const TRACKING=Object.fromEntries(['initializing','motion','features','relocalizing','interrupted','unavailable','limited'].map(state=>[state,t(`data.ar.tracking.${state}`)]));
// Areas with one decimal, counts with grouping, in the interface language.
const decimal=new Intl.NumberFormat(lang,{minimumFractionDigits:1,maximumFractionDigits:1}),formatArea=value=>decimal.format(value);
const device=new THREE.Matrix4(),projection=new THREE.Matrix4(),table=new THREE.Matrix4(),view=new THREE.Matrix4(),local=new THREE.Matrix4(),turn=new THREE.Quaternion(),still=new THREE.Quaternion(),size=new THREE.Vector3(),offset=new THREE.Vector3(),Y=new THREE.Vector3(0,1,0);
const hit=new THREE.Vector3(),eye=new THREE.Vector3(),chest=new THREE.Vector3(),screen=new THREE.Vector3(),target=new THREE.Vector3(),centre=new THREE.Vector2(),ground=new THREE.Plane(new THREE.Vector3(0,1,0),0),cellMatrix=new THREE.Matrix4(),cellColor=new THREE.Color();
const FREE_COLOR=new THREE.Color('#9fd65a'),OBSTACLE_COLOR=new THREE.Color('#f0a24a');
const $=id=>document.getElementById(id);
// A grid's origin in the AR world: on the floor, turned by its yaw.
const gridOrigin=(out,floor,yaw)=>out.compose(offset.set(0,floor,0),turn.setFromAxisAngle(Y,yaw),size.setScalar(1));

export class AugmentedReality{
 constructor(game){
  this.game=game;this.active=false;this.kind=null;this.phase='off';this.pose=null;this.tracking='';this.found=false;this.exposure=1;this.locked=false;this.lidar=false;
  this.anchor={position:new THREE.Vector3(),yaw:0,scale:DEFAULT_SCALE};this.touches=new Map();this.gesture=null;
  this.raycaster=new THREE.Raycaster();this.ear=new THREE.Object3D();this.gridMatrix=new THREE.Matrix4();this.onDeploy=null;this.onExit=null;this.describe=null;
  // The four sides of the map: everything past them (sky dome, sea,
  // horizon) is cut, which leaves a block standing on the table.
  this.planes=[[1,0],[-1,0],[0,1],[0,-1]].map(([x,z])=>new THREE.Plane(new THREE.Vector3(x,0,z),MAP_HALF));
  // The scan of the room: free floor and obstacles as they are found.
  this.preview=new THREE.Group();this.preview.matrixAutoUpdate=false;this.preview.visible=false;
  if(native)this.createLayer();
 }
 get supported(){return !!native;}
 get table(){return this.active&&this.kind==='table';}
 get room(){return this.active&&this.kind==='room';}

 // MARK: start and stop

 // Resolves true once the camera runs on the kind given, table or room;
 // false (with a message) otherwise.
 async start(kind){
  if(!native||this.active||this.starting)return this.active;this.starting=true;let result;
  try{
   this.listeners=await Promise.all([native.addListener('frame',data=>this.onFrame(data)),native.addListener('room',data=>this.onRoom(data)),native.addListener('failure',data=>this.fail(data?.message))]);
   result=await native.start();
  }catch(error){this.removeListeners();this.message(error?.message||t('data.ar.error.start'));return false;}
  finally{this.starting=false;}
  this.active=true;this.lidar=!!result?.lidar;this.pose=null;this.tracking='initializing';this.panelKey=this.statusText=this.lobbyShown=this.kindShown=null;
  this.enter();this.choose(kind==='room'?'room':'table');return true;
 }
 async stop(){
  if(!this.active)return;this.active=false;this.phase='off';
  this.leave();this.removeListeners();
  try{await native.stop();}catch{}
 }
 fail(message){this.message(message||t('data.ar.error.stopped'));this.stop();}
 removeListeners(){for(const listener of this.listeners||[])listener.remove?.();this.listeners=null;}
 onFrame(data){if(!data)return;this.tracking=data.s||'';if(data.m&&data.p)this.pose=data;}

 // Placing the table, or scanning the room.
 choose(kind){
  this.kind=kind;this.arena=null;this.scan=null;this.found=false;this.clearPreview();
  if(kind==='room'){this.phase='scanning';native.configure({mode:'room'});}
  else{this.phase='placing';native.configure({mode:'table',placing:true});}
 }

 enter(){
  const g=this.game;document.body.classList.add('ar');
  // A dark base under the ground, so the block reads as a model on the table.
  if(!this.base){this.base=new THREE.Mesh(new THREE.BoxGeometry(MAP_HALF*2-.02,1.2,MAP_HALF*2-.02),new THREE.MeshStandardMaterial({color:'#20261f',roughness:.9}));this.base.position.y=-.62;}
  // The player's own soldier stands in a ring; a thin line runs from his
  // weapon to the point the crosshair covers.
  if(!this.ring){this.ring=new THREE.Mesh(new THREE.RingGeometry(.62,.86,40),new THREE.MeshBasicMaterial({color:'#d3f36a',transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false,forceSinglePass:true}));this.ring.rotation.x=-Math.PI/2;this.ring.raycast=()=>{};}
  if(!this.line){this.line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:'#d3f36a',transparent:true,opacity:.5,depthWrite:false}));this.line.frustumCulled=false;this.line.raycast=()=>{};}
  g.scene.add(this.base,this.ring,this.line,this.preview);this.base.visible=this.ring.visible=this.line.visible=false;
 }
 leave(){
  const g=this.game;document.body.classList.remove('ar','ar-lobby','ar-room');this.layer.classList.remove('gestures');$('crosshair')?.classList.remove('ar-lock');
  g.renderer.clippingPlanes=[];g.scene.remove(this.base,this.ring,this.line,this.preview);this.removeAvatar();this.clearPreview();
  if(this.background){g.scene.background=this.background;this.background=null;}
  g.scene.visible=true;g.mapRoot.visible=true;g.visuals.sky.mesh.visible=true;g.applyFov();this.kind=null;this.arena=null;
  // Fog, clear colour and exposure of the map.
  g.visuals.setMap(g.mapId);this.status('');
 }

 // MARK: every frame

 // Before the room hears the input: the pose, the anchor, the camera and
 // the aim of this frame.
 update(dt){
  if(!this.active)return;
  const g=this.game,p=this.pose,lobby=g.state==='lobby';this.overlay();this.sceneSettings(dt);
  if(!p){g.scene.visible=false;return;}
  device.fromArray(p.m);projection.fromArray(p.p);if(p.g)this.gridMatrix.fromArray(p.g);
  // While placing, the map follows the surface under the crosshair, its
  // far side away from the player at first.
  if(this.kind==='table'&&this.phase==='placing'&&p.h){
   hit.fromArray(p.h);
   if(!this.found){this.found=true;this.anchor.position.copy(hit);this.anchor.yaw=headingYaw(screenHeading(device.elements));}
   else this.anchor.position.lerp(hit,1-Math.exp(-10*dt));
  }
  // Choosing shows nothing; a table shows its map once a surface is found;
  // a room shows its scan in the lobby and its soldiers in play, never the
  // map the lobby keeps loaded behind.
  const table=this.kind==='table',room=this.kind==='room';
  g.scene.visible=table?this.found:room;g.mapRoot.visible=!(room&&lobby);this.base.visible=table;
  this.preview.visible=room&&lobby;if(this.preview.visible)this.placePreview();
  const planes=table?this.planes:[];if(g.renderer.clippingPlanes!==planes)g.renderer.clippingPlanes=planes;
  this.place();
  if(g.state==='active'&&g.player?.alive)this.aim();else this.setLock(false);
 }
 // Just before drawing: the game moved the camera for its own view, the
 // soldier has moved since the start of the frame.
 beforeRender(dt){if(!this.active||!this.pose)return;this.place();this.updateAvatar(dt);}
 // The camera image of the pose just drawn goes up behind it.
 rendered(){if(this.active&&this.drawn!=null)native.shown({t:this.drawn});}

 // The scene draws over the camera: no sky, fog or background, and the
 // exposure follows the room's light (ARKit's ambient estimate, 1000 is
 // neutral).
 sceneSettings(dt){
  const g=this.game,s=g.scene;
  if(s.background){this.background=s.background;s.background=null;}
  s.fog.density=0;g.visuals.sky.mesh.visible=false;g.renderer.setClearColor(0x000000,0);
  const light=this.pose?.l,goal=light>0?Math.min(1.25,Math.max(.6,light/1000)):1;
  this.exposure=THREE.MathUtils.damp(this.exposure,goal,2,dt);g.renderer.toneMappingExposure=(g.visuals.mood?.exposure??1)*this.exposure;
 }
 // Game to AR world, and its scale: the table's anchor, the room's grid
 // origin (where ARKit now has it) brought to the arena's centre, or none
 // while the room is scanned (the game then works in real metres).
 anchorMatrix(out){
  if(this.kind==='room'){
   const a=this.arena;if(!a){out.identity();return 1;}
   out.copy(this.gridMatrix).multiply(local.compose(offset.set(a.offset.x,a.offset.y,a.offset.z),still,size.setScalar(a.scale)));return a.scale;
  }
  out.compose(this.anchor.position,turn.setFromAxisAngle(Y,this.anchor.yaw),size.setScalar(this.anchor.scale));return this.anchor.scale;
 }
 // The camera stays in game metres: lights, particles and detail levels
 // all work in them. ARKit's projection keeps its lens and gets near and
 // far planes at a real NEAR and FAR from the device, in game metres.
 place(){
  const cam=this.game.camera,s=this.anchorMatrix(table),n=NEAR/s,f=FAR/s,e=cam.projectionMatrix.elements;
  view.copy(table).invert().multiply(device);view.decompose(cam.position,cam.quaternion,size);cam.updateMatrixWorld(true);
  cam.projectionMatrix.copy(projection);e[10]=-(f+n)/(f-n);e[11]=-1;e[14]=-2*f*n/(f-n);e[15]=0;cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  this.drawn=this.pose.t;
 }

 // MARK: play

 eye(out){const p=this.game.player;return out.set(p.x,.15+(p.crouch?1.12:1.72)+(p.jump||0),p.z);}
 // What the crosshair covers. A table soldier turns to it; in a room the
 // device itself fires. Aiming down the sights stays off in both.
 aim(){
  const g=this.game;g.aim=false;if(this.kind==='room')eye.copy(g.camera.position);else this.eye(eye);
  const locked=this.pick(target);this.setLock(locked);
  const a=aimAngles(eye,target);g.yaw=a.yaw;g.pitch=Math.max(-1.45,Math.min(1.45,a.pitch));
 }
 // The point under the crosshair: the chest of the closest enemy in view
 // within reach of it, else the first wall or the ground the ray meets.
 // Returns whether an enemy is locked.
 pick(out){
  const g=this.game,cam=g.camera,w=innerWidth/2,h=innerHeight/2;let best=LOCK_RADIUS,found=false;
  for(const b of g.bots){
   if(!b.alive||!g.isEnemy(b))continue;
   chest.set(b.x,(b.crouch?.95:1.35)+(b.targetJump??b.jump??0),b.z);screen.copy(chest).project(cam);if(Math.abs(screen.z)>1)continue;
   const d=Math.hypot(screen.x*w,screen.y*h);if(d<best&&g.lineOfSight(eye,chest)){best=d;found=true;out.copy(chest);}
  }
  if(found)return true;
  const ray=this.raycaster;ray.setFromCamera(centre,cam);
  let distance=ray.intersectObjects(g.map.solidMeshes,false)[0]?.distance??Infinity;
  if(ray.ray.intersectPlane(ground,hit))distance=Math.min(distance,hit.distanceTo(ray.ray.origin));
  ray.ray.at(Number.isFinite(distance)?distance:400,out);return false;
 }
 setLock(on){if(on===this.locked)return;this.locked=on;$('crosshair')?.classList.toggle('ar-lock',on);}
 // Stick push relative to the screen → forward and strafe for the soldier.
 move(x,y){return screenMove(x,y,screenHeading(this.game.camera.matrixWorld.elements),this.game.yaw);}
 // In a room the operator is where the device is, his eye at its height.
 deviceHeight(){return Math.max(EYE,this.game.camera.position.y);}
 placePlayer(){const g=this.game,p=g.player,c=g.camera.position;p.x=Math.max(-30.5,Math.min(30.5,c.x));p.z=Math.max(-30.5,Math.min(30.5,c.z));p.jump=this.deviceHeight()-EYE;p.vy=0;p.grounded=true;}
 muzzle(out){const m=this.avatar?.model,p=this.game.player;if(!m)return out.set(p?.x||0,1.5,p?.z||0);return (m.muzzleTip??m.flash).getWorldPosition(out);}
 // The table soldier's shot leaves his weapon, not the screen.
 shot(direction,end){
  const g=this.game;this.muzzle(hit);g.visuals.effects.muzzle(hit,direction,g.weapon.id);
  this.shots=(this.shots||0)+1;if(end&&this.shots%2)g.visuals.effects.tracer(hit,end);
 }
 // Heard from the table soldier's place, turned as the device is; in a
 // room, from the device.
 listener(){
  const g=this.game,p=g.player;if(!this.table||!p||g.state==='lobby')return g.camera;
  this.ear.position.set(p.x,1.7,p.z);this.ear.quaternion.copy(g.camera.quaternion);this.ear.updateMatrixWorld();return this.ear;
 }

 // The table player's soldier, animated as the others are from the
 // predicted movement, the aim and the weapon in hand.
 updateAvatar(dt){
  const g=this.game,p=g.player,show=this.kind==='table'&&g.state!=='lobby'&&!!p&&!!g.weapon;
  if(!show){if(this.avatar)this.avatar.model.root.visible=false;this.ring.visible=this.line.visible=false;return;}
  const team=p.team==='red'?'red':'blue';
  if(this.avatar?.team!==team){this.removeAvatar();const model=createSoldier(team,g.weapon.id);g.scene.add(model.root);g.visuals.warm(model.root);this.avatar={team,model,alive:true};}
  const a=this.avatar,m=a.model,v=g.velocity;m.root.visible=true;
  if(a.alive&&!p.alive)g.setFall({model:m},null);a.alive=p.alive;
  m.root.position.set(p.x,.15+(p.jump||0),p.z);m.root.rotation.y=g.yaw+Math.PI;m.root.scale.y=p.crouch?.65:1;m.root.updateMatrixWorld();
  animateSoldier(m,{alive:p.alive,speed:Math.hypot(v.x,v.z),moveX:v.x,moveZ:v.z,pitch:g.pitch,crouch:!!p.crouch,climbing:!!(p.climb||p.mantle),reload:g.reloadTime,reloadDuration:g.weapon.reload,weaponId:g.weapon.id,flashTime:g.flashTime},dt);
  m.flash.visible=p.alive&&(g.flashTime||0)>0;updateSoldierLOD(m,g.camera.position.distanceTo(m.root.position));
  this.ring.visible=p.alive;this.ring.position.set(p.x,.18,p.z);
  this.line.visible=p.alive&&g.state==='active';
  if(this.line.visible){const points=this.line.geometry.attributes.position;this.muzzle(hit);points.setXYZ(0,hit.x,hit.y,hit.z);points.setXYZ(1,target.x,target.y,target.z);points.needsUpdate=true;}
 }
 removeAvatar(){if(!this.avatar)return;this.game.disposeActor({model:this.avatar.model});this.avatar=null;}

 // MARK: room

 // Scan in progress: the plugin's grid, shown as it grows.
 onRoom(data){
  if(this.kind!=='room'||this.phase!=='scanning')return;
  const grid=decodeGrid(data);this.scan=grid&&{area:grid.area,walls:grid.walls,faces:grid.faces};if(grid)this.showGrid(grid);
 }
 // Free floor as flat green tiles, obstacles as orange blocks of their
 // height, walls as a low band (full height, they would hide the room):
 // one instanced draw, rectangles merged from the cells.
 showGrid(grid){
  const free=floorRects(grid),blocks=obstacleRects(grid),count=free.length+blocks.length,{cell,x0,z0}=grid;
  if(!this.cells||this.cells.instanceMatrix.count<count){
   this.clearPreview();
   this.cells=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({transparent:true,opacity:.3,depthWrite:false}),Math.max(256,Math.ceil(count*1.5)));
   this.cells.frustumCulled=false;this.cells.raycast=()=>{};this.preview.add(this.cells);
  }
  let i=0;const put=(r,height,color)=>{cellMatrix.makeScale(r.w*cell,height,r.h*cell).setPosition(x0+(r.c+r.w/2)*cell,height/2,z0+(r.r+r.h/2)*cell);this.cells.setMatrixAt(i,cellMatrix);this.cells.setColorAt(i,cellColor.copy(color));i++;};
  for(const r of free)put(r,.008,FREE_COLOR);for(const r of blocks)put(r,r.height>=1.5?.12:r.height,OBSTACLE_COLOR);
  this.cells.count=count;this.cells.instanceMatrix.needsUpdate=true;if(this.cells.instanceColor)this.cells.instanceColor.needsUpdate=true;
  this.previewGrid={floor:grid.floor,yaw:grid.yaw};
 }
 clearPreview(){if(!this.cells)return;this.preview.remove(this.cells);this.cells.geometry.dispose();this.cells.material.dispose();this.cells.dispose?.();this.cells=null;}
 // The scan sits in real metres while scanning, in game metres once the
 // arena is set (the inverse of its offset and scale).
 placePreview(){
  const p=this.preview,a=this.arena;
  if(a)p.matrix.copy(local.compose(offset.set(a.offset.x,a.offset.y,a.offset.z),still,size.setScalar(a.scale))).invert();
  else if(this.previewGrid)gridOrigin(p.matrix,this.previewGrid.floor,this.previewGrid.yaw);
  p.matrixWorldNeedsUpdate=true;
 }
 // CONFIRM ROOM: the final scan becomes the arena, or the scan goes on.
 async finish(){
  if(this.finishing)return;this.finishing=true;this.panelKey=null;
  try{
   const data=await native.finishScan(),grid=decodeGrid(data),arena=grid&&buildArena(grid);
   if(!arena){this.message(t('data.ar.error.floor',{area:MIN_AREA}));native.configure({scanning:true});return;}
   const mesh=data.mesh?.positions?{positions:new Float32Array(decodeCells(data.mesh.positions).buffer),indices:new Uint32Array(decodeCells(data.mesh.indices).buffer)}:null;
   gridOrigin(this.gridMatrix,grid.floor,grid.yaw);this.arena={...arena,mesh,obstacles:arena.world.solids.length};this.showGrid(grid);this.phase='ready';
  }catch(error){this.message(error?.message||t('data.ar.error.scan'));}
  finally{this.finishing=false;this.panelKey=null;}
 }
 rescan(){this.arena=null;this.scan=null;this.clearPreview();this.phase='scanning';native.configure({scanning:true});}
 // The room as the game's map: a shadow catcher on the real floor and the
 // real room, drawn into the depth buffer only, in front of the soldiers it
 // hides (the LiDAR mesh, or the walls as boxes).
 battlefield(root){
  const a=this.arena,mat={steel:new THREE.MeshStandardMaterial({color:'#5f6660',metalness:.5,roughness:.5})};
  const catcher=new THREE.Mesh(new THREE.PlaneGeometry(64,64),new THREE.ShadowMaterial({opacity:.3}));catcher.rotation.x=-Math.PI/2;catcher.position.y=FLOOR_Y+.01;catcher.receiveShadow=true;root.add(catcher);
  const occluder=new THREE.Mesh(this.occluderGeometry(),new THREE.MeshBasicMaterial({colorWrite:false}));occluder.renderOrder=-10;occluder.raycast=()=>{};root.add(occluder);
  return {arena:a,world:a.world,obstacles:a.world.solids,solidMeshes:[],mat,dust:new THREE.Object3D()};
 }
 occluderGeometry(){
  const a=this.arena;
  if(a.mesh){
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(a.mesh.positions.slice(),3));geometry.setIndex(new THREE.BufferAttribute(a.mesh.indices,1));
   this.anchorMatrix(table);return geometry.applyMatrix4(view.copy(table).invert());
  }
  const boxes=a.world.solids.map(b=>new THREE.BoxGeometry(b.maxX-b.minX,b.maxY-b.minY,b.maxZ-b.minZ).translate((b.minX+b.maxX)/2,(b.minY+b.maxY)/2,(b.minZ+b.maxZ)/2));
  const merged=boxes.length?mergeGeometries(boxes):new THREE.BufferGeometry();boxes.forEach(b=>b.dispose());return merged;
 }

 // MARK: overlay

 createLayer(){
  const layer=this.layer=document.createElement('div');layer.id='ar-layer';
  layer.innerHTML=`<div class="ar-status hidden" role="status"></div><div class="ar-message hidden" role="alert"></div>
<div class="ar-panel"><div class="eyebrow"><span></span><b class="ar-eyebrow">${t('data.ar.eyebrow')}</b></div><h3></h3><p></p><p class="ar-stats"></p>
<div class="ar-actions"><button type="button" class="outline-button" data-ar="exit">${t('data.ar.button.exit')}</button><button type="button" class="outline-button" data-ar="replace">${t('data.ar.button.replace')}</button><button type="button" class="outline-button" data-ar="rescan">${t('data.ar.button.rescan')}</button><button type="button" class="deploy-button compact" data-ar="place">${t('data.ar.button.place')} <b>↓</b></button><button type="button" class="deploy-button compact" data-ar="validate">${t('data.ar.button.validate')} <b>✓</b></button><button type="button" class="deploy-button compact" data-ar="deploy">${t('data.ar.button.deploy')} <b>→</b></button></div></div>`;
  document.body.append(layer);
  this.panel=layer.querySelector('.ar-panel');this.buttons=Object.fromEntries([...layer.querySelectorAll('[data-ar]')].map(b=>[b.dataset.ar,b]));
  this.panel.addEventListener('click',e=>{
   const action=e.target.closest('[data-ar]')?.dataset.ar;if(!action)return;this.game.audio.tone(480,.05,.03);
   if(action==='place'&&this.found){this.phase='placed';native.configure({placing:false});}
   if(action==='replace'){this.phase='placing';native.configure({placing:true});}
   if(action==='validate')this.finish();
   if(action==='rescan')this.rescan();
   if(action==='deploy')this.onDeploy?.(this.kind);
   if(action==='exit')this.stop().then(()=>this.onExit?.());
  });
  // Two fingers while placing: pinch to scale the map, turn to rotate it.
  layer.addEventListener('pointerdown',e=>{if(!layer.classList.contains('gestures')||e.target.closest('.ar-panel'))return;this.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});this.gesture=null;});
  layer.addEventListener('pointermove',e=>{
   const touch=this.touches.get(e.pointerId);if(!touch)return;touch.x=e.clientX;touch.y=e.clientY;if(this.touches.size!==2)return;
   const [a,b]=[...this.touches.values()],distance=Math.hypot(b.x-a.x,b.y-a.y),angle=Math.atan2(b.y-a.y,b.x-a.x);
   if(!this.gesture){this.gesture={distance,angle,scale:this.anchor.scale,yaw:this.anchor.yaw};return;}
   this.anchor.scale=clampScale(this.gesture.scale*distance/Math.max(1,this.gesture.distance));
   // Fingers turning clockwise on the screen turn the map clockwise seen from above.
   this.anchor.yaw=this.gesture.yaw-(angle-this.gesture.angle);
  });
  const up=e=>{if(this.touches.delete(e.pointerId))this.gesture=null;};
  layer.addEventListener('pointerup',up);layer.addEventListener('pointercancel',up);
  for(const type of ['touchmove','gesturestart'])layer.addEventListener(type,e=>{if(layer.classList.contains('gestures'))e.preventDefault();},{passive:false});
 }
 // Writes the DOM only on a change: Safari repaints any text written.
 overlay(){
  const lobby=this.game.state==='lobby';
  if(lobby!==this.lobbyShown){this.lobbyShown=lobby;document.body.classList.toggle('ar-lobby',lobby);}
  if(this.kind!==this.kindShown){this.kindShown=this.kind;document.body.classList.toggle('ar-room',this.kind==='room');}
  this.layer.classList.toggle('gestures',lobby&&this.kind==='table'&&this.phase==='placing');
  this.status(TRACKING[this.tracking]||'');
  const scan=this.scan,key=[this.phase,this.found,Math.round(1/this.anchor.scale),scan&&[scan.area.toFixed(1),scan.walls,scan.faces],this.finishing].join();
  if(lobby&&key!==this.panelKey){this.panelKey=key;this.renderPanel();}
 }
 renderPanel(){
  const phase=this.phase,scale=scaleLabel(this.anchor.scale),scan=this.scan,a=this.arena,lidar=this.lidar;
  const text={
   placing:this.found?[t('data.ar.placing.foundTitle'),t('data.ar.placing.foundText',{scale}),'']:[t('data.ar.placing.title'),t('data.ar.placing.text'),''],
   placed:[t('data.ar.placed.title'),t('data.ar.placed.text',{scale}),this.describe?.()||''],
   scanning:[t('data.ar.scanning.title'),t(lidar?'data.ar.scanning.textFull':'data.ar.scanning.textWalls'),
    this.finishing?t('data.ar.scanning.analyzing'):scan?t(scan.faces?'data.ar.scanning.statsMesh':'data.ar.scanning.stats',{area:formatArea(scan.area),n:scan.walls,faces:scan.faces?.toLocaleString(lang)}):t('data.ar.scanning.noFloor')],
   ready:[t('data.ar.ready.title'),a?t(a.mesh?'data.ar.ready.textFull':'data.ar.ready.textWalls'):'',a?t('data.ar.ready.stats',{area:formatArea(a.area),ratio:Math.round(1/a.scale),n:a.obstacles}):'']
  }[phase]||['','',''];
  this.panel.querySelector('.ar-eyebrow').textContent=t(this.kind==='room'?(lidar?'data.ar.eyebrow.roomFull':'data.ar.eyebrow.roomWalls'):this.kind==='table'?'data.ar.eyebrow.table':'data.ar.eyebrow');
  this.panel.querySelector('h3').textContent=text[0];this.panel.querySelector('p').textContent=text[1];
  const stats=this.panel.querySelector('.ar-stats');stats.textContent=text[2];stats.classList.toggle('hidden',!text[2]);
  const show={place:phase==='placing',replace:phase==='placed',validate:phase==='scanning',rescan:phase==='ready',deploy:phase==='placed'||phase==='ready'};
  for(const [name,on]of Object.entries(show))this.buttons[name].classList.toggle('hidden',!on);
  this.buttons.place.disabled=!this.found;this.buttons.validate.disabled=!!this.finishing||!(scan?.area>=MIN_AREA);
 }
 status(text){if(!this.layer||text===this.statusText)return;this.statusText=text;const el=this.layer.querySelector('.ar-status');el.textContent=text;el.classList.toggle('hidden',!text);}
 message(text){
  if(!this.layer)return;const el=this.layer.querySelector('.ar-message');el.textContent=t(text);el.classList.remove('hidden');
  clearTimeout(this.messageTimer);this.messageTimer=setTimeout(()=>el.classList.add('hidden'),6000);
 }
}
