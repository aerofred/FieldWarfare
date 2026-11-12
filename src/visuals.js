import * as THREE from 'three';
import {ScopeView,overlayFov,SCOPE_RADIUS} from './scope.js';
import {updateSoldierLOD,soldierDetail,showSoldierDetail,setSoldierQuality,castSoldierShadow} from './models.js';
import {Sky} from './sky.js';
import {t} from './i18n.js';
import {Effects} from './effects.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {Pass} from 'three/addons/postprocessing/Pass.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';

// shadow: map size (0 disables them); filter: hard-edged PCF on the balanced
// profile, the softer and dearer PCFSoft on the high one; shadowEvery: frames
// between two sun shadow redraws; farShadows: soldiers at the coarsest level
// still cast one; lights: map lamps and the blast/muzzle light are drawn;
// clouds: sky noise octaves.
export const QUALITY=Object.freeze({low:{label:t('game.quality.low'),ratio:.85,shadow:0,filter:THREE.PCFShadowMap,shadowEvery:1,farShadows:false,lights:false,post:false,bloom:false,clouds:3},medium:{label:t('game.quality.medium'),ratio:1.15,shadow:1024,filter:THREE.PCFShadowMap,shadowEvery:2,farShadows:false,lights:true,post:true,bloom:false,clouds:5},high:{label:t('game.quality.high'),ratio:1.6,shadow:2048,filter:THREE.PCFSoftShadowMap,shadowEvery:1,farShadows:true,lights:true,post:true,bloom:true,clouds:5}});
// Tile-based GPUs (iPhone, iPad, Apple silicon, Android) resolve
// multisampling on chip, almost for free. Desktop Intel, AMD and NVIDIA
// chips write every sample to memory: there, Performance starts without it
// and smooths edges with FXAA instead. Unknown chips keep it, as before.
// Adaptive resolution. Every change reallocates the canvas and every render
// target, a stutter of its own on older devices, so changes are few: a
// drop goes straight to the scale the frame time asks for, assuming the
// cost follows the pixel count, and is undone if frames did not get faster
// (the limit is then elsewhere: no new drop for a minute).
export const MIN_SCALE=.65;
export const adaptState=()=>({trial:null,blockDown:-Infinity,blockUp:-Infinity,lastChange:-Infinity});
export function adaptStep(a,frame,clock,scale){
 if(a.trial){
  if(clock-a.trial.at<3)return scale;
  const {from,before}=a.trial;a.trial=null;
  if(frame>before*.9){a.blockDown=clock+60;a.lastChange=clock;return from;}
  return scale;
 }
 if(frame>1/50&&scale>MIN_SCALE&&clock>=a.blockDown){
  const wanted=Math.round(scale*Math.sqrt(1/55/frame)*20)/20,next=Math.max(MIN_SCALE,Math.min(scale-.05,wanted));
  // Dropping right after a rise means the rise was too much: hold for a while.
  if(clock-a.lastChange<4)a.blockUp=clock+30;
  a.trial={from:scale,before:frame,at:clock};a.lastChange=clock;return next;
 }
 if(frame<1/57&&scale<1&&clock>=a.blockUp&&clock-a.lastChange>=4){a.lastChange=clock;return Math.min(1,Math.round((scale+.1)*20)/20);}
 return scale;
}
export const desktopRenderer=name=>/intel|amd|\bati\b|radeon|nvidia|geforce|quadro/i.test(name);
let gpu;
export function gpuName(){
 if(gpu!==undefined)return gpu;
 try{const gl=document.createElement('canvas').getContext('webgl'),info=gl.getExtension('WEBGL_debug_renderer_info');gpu=String(gl.getParameter(info?info.UNMASKED_RENDERER_WEBGL:gl.RENDERER));gl.getExtension('WEBGL_lose_context')?.loseContext();}
 catch{gpu='';}
 return gpu;
}
export const desktopGPU=()=>desktopRenderer(gpuName());
// Fixed when the WebGL context is created: a new profile applies it at the next launch.
export const nativeAntialias=(quality,onDesktop=desktopGPU())=>!(quality==='low'&&onDesktop);
// Draws the weapon over the world inside the composer, before FXAA.
// RenderPass clears depth before binding its target, hence this pass.
class WeaponPass extends Pass{
 constructor(scene,camera){super();this.scene=scene;this.camera=camera;this.needsSwap=false;}
 render(renderer,writeBuffer,readBuffer){renderer.setRenderTarget(readBuffer);renderer.clearDepth();renderer.render(this.scene,this.camera);}
}
// Distance between the pupils, in metres: the two views of the stereo mode.
const EYE_SEPARATION=.064;
// Apparent size relative to the default 78° view, for soldier detail.
const fovScale=fov=>Math.tan(THREE.MathUtils.degToRad(fov/2))/Math.tan(THREE.MathUtils.degToRad(39));
// Places an eye camera beside a mono camera, side -1 for the left eye.
function placeEye(eye,camera,side,aspect){
 eye.position.copy(camera.position);eye.quaternion.copy(camera.quaternion);eye.translateX(side*EYE_SEPARATION/2);eye.updateMatrixWorld();
 if(eye.fov!==camera.fov||eye.aspect!==aspect||eye.near!==camera.near||eye.far!==camera.far){eye.fov=camera.fov;eye.aspect=aspect;eye.near=camera.near;eye.far=camera.far;eye.updateProjectionMatrix();}
}
const moods={
 factory:{sky:'#aeb7b8',fog:'#b2b9b2',zenith:'#7f8f99',clouds:'#d9dcd6',cover:.72,density:.009,sun:'#ffe1b3',power:3,ambient:1.65,ground:'#42483e',position:[-26,44,18],exposure:1.02},
 gardens:{sky:'#b8d5e5',fog:'#c4d7dd',zenith:'#4f86bd',clouds:'#ffffff',cover:.38,density:.006,sun:'#fff0ce',power:3.5,ambient:1.8,ground:'#626855',position:[-30,48,24],exposure:1.05},
 railway:{sky:'#b8c7d4',fog:'#c6c6c0',zenith:'#6585a6',clouds:'#f3e6d6',cover:.5,density:.008,sun:'#ffd2a1',power:2.9,ambient:1.7,ground:'#4b535b',position:[-35,28,-22],exposure:1.02},
 desert:{sky:'#e9dcc0',fog:'#e2cfa6',zenith:'#4f8cc6',clouds:'#fff8ec',cover:.16,density:.0065,sun:'#fff0cf',power:4.3,ambient:1.55,ground:'#a68559',position:[-18,62,14],exposure:1},
 market:{sky:'#e9a87e',fog:'#b98e85',zenith:'#33416f',clouds:'#f3ad7f',cover:.42,density:.013,sun:'#ffa865',power:2.3,ambient:1.15,ground:'#3b3542',position:[-44,11,-20],exposure:1.08},
 harbor:{sky:'#b7c3cc',fog:'#bcc6cd',zenith:'#6f8396',clouds:'#e3e8ec',cover:.85,density:.0105,sun:'#f3ecdf',power:2.2,ambient:1.75,ground:'#8a949a',position:[-22,40,30],exposure:.98}
};
// Colour grade, applied last on the tone-mapped sRGB image: slight contrast
// and saturation, vignette, then low-health desaturation and a red pulse at
// the screen edges when hit. A half-step dither hides the banding of fog
// and sky gradients once the frame is quantised to eight bits.
const grade={uniforms:{tDiffuse:{value:null},strength:{value:1},damage:{value:0},wounded:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:`
uniform sampler2D tDiffuse;uniform float strength;uniform float damage;uniform float wounded;varying vec2 vUv;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
 vec4 c=texture2D(tDiffuse,vUv);float l=dot(c.rgb,vec3(.2126,.7152,.0722));
 c.rgb=mix(vec3(l),c.rgb,1.06-wounded*.7);
 c.rgb=(c.rgb-.46)*(1.+.05*strength)+.46;
 vec2 p=vUv-.5;float r=dot(p,p);c.rgb*=1.-r*.2*strength;
 float edge=smoothstep(.06,.42,r);c.rgb=mix(c.rgb,vec3(l*.9+.03,l*.08,l*.06),edge*clamp(damage*.32+wounded*.4,0.,.6));
 c.rgb+=(hash(gl_FragCoord.xy)-.5)/255.;
 gl_FragColor=vec4(clamp(c.rgb,0.,1.),c.a);
}`};

export class Visuals{
 constructor(game){this.game=game;this.scope=new ScopeView(game);game.renderer.info.autoReset=false;const generator=new THREE.PMREMGenerator(game.renderer),room=new RoomEnvironment();this.environment=generator.fromScene(room,.06);room.dispose();generator.dispose();game.scene.environment=this.environment.texture;game.scene.environmentIntensity=.3;game.gunScene.environment=this.environment.texture;game.gunScene.environmentIntensity=.5;
  this.sky=new Sky(game.scene);this.effects=new Effects(game.scene);this.scale=1;this.frameAvg=1/60;this.adaptTimer=0;this.adaptState=adaptState();this.windowTime=0;this.windowFrames=0;this.clock=0;
  this.multisampled=game.renderer.getContextAttributes().antialias;
  // Bloom works on the linear HDR frame; tone mapping and the sRGB transfer
  // come next, so the anti-aliasing reads display luma as FXAA expects and
  // the grade's dither lands on the final eight-bit values.
  this.composer=new EffectComposer(game.renderer);this.renderPass=new RenderPass(game.scene,game.camera);this.composer.addPass(this.renderPass);this.bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.32,.45,.92);this.composer.addPass(this.bloom);this.weaponPass=new WeaponPass(game.gunScene,game.gunCamera);this.weaponPass.enabled=false;this.composer.addPass(this.weaponPass);this.output=new OutputPass();this.composer.addPass(this.output);this.fxaa=new ShaderPass(FXAAShader);this.composer.addPass(this.fxaa);this.grade=new ShaderPass(grade);this.composer.addPass(this.grade);this.split=false;this.eyes=[-1,1].map(side=>({side,world:new THREE.PerspectiveCamera(),gun:new THREE.PerspectiveCamera()}));this.createImpacts();this.setMap(game.mapId);
 }
 // A new shadow filter is baked into every lit shader: recompile them once.
 recompile(){const touch=o=>{for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)m.needsUpdate=true;};this.game.scene.traverse(touch);this.game.gunScene.traverse(touch);}
 setMap(id){if(this.impacts)this.resetImpacts();const g=this.game,m=moods[id]||moods.factory;g.scene.background.set(m.fog);g.scene.fog.color.set(m.fog);g.scene.fog.density=m.density;g.renderer.setClearColor(m.fog);g.renderer.toneMappingExposure=m.exposure;g.sun.color.set(m.sun);g.sun.intensity=m.power;g.sun.position.set(...m.position);g.sun.shadow.radius=3;g.ambient.color.set(m.sky);g.ambient.groundColor.set(m.ground);g.ambient.intensity=m.ambient;this.mood=m;this.sky?.set(m);this.effects?.setMap(id);}
 createImpacts(){
  const size=64,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const dx=(x-32)/32,dy=(y-32)/32,r=Math.hypot(dx,dy),edge=.72+Math.sin(Math.atan2(dy,dx)*9)*.07,alpha=r<edge?Math.max(0,1-r/edge):0,rim=r>.28&&r<.52?85:20;data.set([rim,rim*.9,rim*.75,Math.round(alpha*230)],(y*size+x)*4);}
  const texture=new THREE.DataTexture(data,size,size);texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
  this.impacts=new THREE.InstancedMesh(new THREE.PlaneGeometry(.14,.14),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),96);this.impacts.count=0;this.impacts.frustumCulled=false;this.impacts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.game.scene.add(this.impacts);this.impactIndex=0;this.impactRay=new THREE.Raycaster();
  this.marker=new THREE.Object3D();this.normalMatrix=new THREE.Matrix3();this.forward=new THREE.Vector3(0,0,1);
 }
 resetImpacts(){this.impacts.count=0;this.impactIndex=0;}
 // Bullet hole plus dust, debris and sparks along the surface normal.
 impact(origin,end){
  const a=new THREE.Vector3(origin.x,origin.y,origin.z),b=new THREE.Vector3(end.x,end.y,end.z),direction=b.clone().sub(a),distance=direction.length();if(distance<.02)return null;
  this.impactRay.set(a,direction.normalize());this.impactRay.far=distance+.12;const hit=this.impactRay.intersectObjects(this.game.map.solidMeshes,false)[0];let normal;
  if(hit&&hit.point.distanceTo(b)<.13){normal=hit.face.normal.clone().applyNormalMatrix(this.normalMatrix.getNormalMatrix(hit.object.matrixWorld)).normalize();b.copy(hit.point);}else if(Math.abs(b.y-.1)<.03)normal=new THREE.Vector3(0,1,0);else{this.effects?.impact(b,direction.clone().negate(),false);return null;}
  const marker=this.marker;marker.position.copy(b).addScaledVector(normal,.008);marker.quaternion.setFromUnitVectors(this.forward,normal);marker.rotateZ(Math.random()*Math.PI*2);marker.updateMatrix();this.impacts.setMatrixAt(this.impactIndex++%96,marker.matrix);this.impacts.count=Math.min(96,this.impacts.count+1);this.impacts.instanceMatrix.needsUpdate=true;
  this.effects?.impact(b,normal);return {point:b,normal};
 }
 setQuality(value){this.quality=QUALITY[value]?value:'medium';const g=this.game,p=QUALITY[this.quality];this.scale=1;this.adaptState=adaptState();this.applyPixelRatio();g.renderer.shadowMap.enabled=!!p.shadow;
  if(p.shadow&&g.sun.shadow.mapSize.x!==p.shadow){g.sun.shadow.map?.dispose();g.sun.shadow.map=null;g.sun.shadow.mapSize.set(p.shadow,p.shadow);g.sun.shadow.needsUpdate=true;}
  if(p.shadow&&g.renderer.shadowMap.type!==p.filter){g.renderer.shadowMap.type=p.filter;this.recompile();}
  // A new map or profile always gets a fresh shadow map on its first frame.
  g.sun.shadow.autoUpdate=false;g.sun.shadow.needsUpdate=true;this.shadowFrame=0;
  this.sky.setDetail(p.clouds);
  this.grade.uniforms.strength.value=this.quality==='high'?1:.55;this.grade.enabled=p.post;this.fxaa.enabled=true;this.bloom.enabled=p.bloom;g.mapRoot.traverse(o=>{if(o.userData.detail)o.visible=this.quality!=='low';});this.setLights(p.lights);this.resize();
 }
 // Every point light is evaluated for each lit pixel, even at zero
 // intensity: Performance leaves them out, the lamps keep their emissive
 // glow. A change in the light count recompiles the lit shaders, so this
 // only runs with the quality profile: on a map load or from the settings.
 setLights(on){const g=this.game;g.blastLight.visible=on;g.mapRoot.traverse(o=>{if(o.isPointLight){o.visible=on;o.castShadow=false;}});}
 // The sun's shadow camera is fixed over the whole map, where only soldiers,
 // flags and grenades move: the balanced profile redraws it every other frame.
 // The first pass of a frame to need shadows consumes the request, as before.
 scheduleShadows(){const every=QUALITY[this.quality]?.shadowEvery||1;this.shadowFrame=((this.shadowFrame||0)+1)%every;if(this.shadowFrame===0)this.game.sun.shadow.needsUpdate=true;}
 applyPixelRatio(){const p=QUALITY[this.quality]||QUALITY.medium;this.game.renderer.setPixelRatio(Math.min(devicePixelRatio,p.ratio)*this.scale);}
 // In stereo the post-processing works on one eye's half of the screen.
 resize(){const g=this.game,ratio=g.renderer.getPixelRatio(),width=this.split?innerWidth/2:innerWidth;this.composer.setPixelRatio(ratio);this.composer.setSize(width,innerHeight);this.fxaa.material.uniforms.resolution.value.set(1/(width*ratio),1/(innerHeight*ratio));}
 // Dynamic resolution: see adaptStep. Checked every 1.5 s.
 adapt(dt){
  this.clock+=dt;if(this.game.state!=='active'){this.adaptTimer=0;return;}
  // dt is the real frame time: a clamped one would hide any gain above it.
  const a=this.adaptState;this.frameAvg+=(dt-this.frameAvg)*.05;this.adaptTimer+=dt;
  // Frames right after a change carry the stutter of the resize: skipped.
  if(this.clock-a.lastChange>.5){this.windowTime+=dt;this.windowFrames++;}
  // Each decision reads the mean of its own window: the 1.5 s since the
  // last one, or the whole trial after a change.
  if(this.adaptTimer<1.5||this.windowFrames<5)return;this.adaptTimer=0;
  const scale=adaptStep(a,this.windowTime/this.windowFrames,this.clock,this.scale);
  if(!a.trial||a.lastChange===this.clock){this.windowTime=0;this.windowFrames=0;}
  if(scale!==this.scale){this.scale=scale;this.applyPixelRatio();this.resize();}
 }
 update(dt){
  const g=this.game,u=this.grade.uniforms,health=g.player&&g.state!=='lobby'?g.player.health:100;
  u.damage.value=Math.min(1,(g.damageTime||0)*1.4);u.wounded.value=g.player?.alive===false?0:THREE.MathUtils.clamp((40-health)/40,0,1);
  this.sky.update(g.camera,this.clock);this.effects.update(dt,(p,bounce,size,kind,speed)=>g.audio.casing(p,{bounce,size,kind,speed}));
 }
 // Select geometry from its apparent size. The world view follows the
 // camera's zoom; the eyepiece keeps its own level for the scope's real
 // magnification, so aiming does not refine soldiers outside the lens.
 // The quality profile is applied here too, before a new soldier's first frame.
 updateSoldiers(){
  const g=this.game,c=g.camera.position,scoped=this.scope.scoped(),world=fovScale(g.camera.fov),lens=scoped?fovScale(overlayFov(g.camera.fov,SCOPE_RADIUS)):0,far=!!QUALITY[this.quality]?.farShadows;
  for(const b of g.bots){const m=b.model,p=m.root.position,distance=Math.hypot(p.x-c.x,p.y+1-c.y,p.z-c.z);setSoldierQuality(m,this.quality);updateSoldierLOD(m,distance*world);castSoldierShadow(m,far||m.detailLevel<2);if(scoped)m.scopeDetail=soldierDetail(m.scopeDetail,distance*lens);}
 }
 // The eyepiece pass draws soldiers at the scope's level, then the world's returns.
 renderScope(mainRendered){
  const bots=this.scope.scoped()?this.game.bots:[];
  for(const b of bots)showSoldierDetail(b.model,b.model.scopeDetail);
  try{this.scope.render(this.quality,mainRendered);}finally{for(const b of bots)showSoldierDetail(b.model,b.model.detailLevel);}
 }
 // A new soldier's hidden parts (other detail levels, muzzle flash, spare
 // magazine, name tag) would upload their geometry and compile their
 // shaders the first time they show, mid-fight. They are drawn once, all
 // shown, through the real passes so the same shader variants compile, in
 // a pass the frame then paints over: only its last drawing is displayed.
 warm(root){(this.warmRoots??=[]).push(root);}
 renderWarm(roots){
  const shadow=this.game.sun.shadow,needs=shadow.needsUpdate,frame=this.shadowFrame,changed=[];
  // Settle the detail levels first, so the pass changes no state but its own.
  this.updateSoldiers();
  for(const root of roots)if(root.parent)root.traverse(o=>{if(o.isLight)return;changed.push(o,o.visible,o.frustumCulled);o.visible=true;o.frustumCulled=false;});
  // The shadow map keeps its schedule and never sees the extra parts.
  shadow.needsUpdate=false;this.scheduleShadows=()=>{};
  try{this.renderFrame();}
  finally{for(let i=0;i<changed.length;i+=3){changed[i].visible=changed[i+1];changed[i].frustumCulled=changed[i+2];}delete this.scheduleShadows;shadow.needsUpdate=needs;this.shadowFrame=frame;}
 }
 render(){
  if(this.warmRoots?.length){const roots=this.warmRoots;this.warmRoots=[];this.renderWarm(roots);}
  this.renderFrame();
 }
 renderFrame(){const g=this.game,covered=this.scope.covers();this.updateSoldiers();this.scheduleShadows();g.renderer.info.reset();g.renderer.setRenderTarget(null);g.renderer.clear();
  if(!!g.stereo!==this.split){this.split=!!g.stereo;this.resize();}
  // Augmented reality draws the world over the camera image, without
  // post-processing (it would fill the transparent background). In a room
  // the operator holds his weapon, as in normal play.
  if(g.ar?.active){g.renderer.render(g.scene,g.camera);if(g.ar.room&&g.state!=='lobby'&&g.player?.alive){g.renderer.clearDepth();g.renderer.render(g.gunScene,g.gunCamera);}return;}
  if(this.split){this.renderStereo(covered);return;}
  const gun=g.state!=='lobby'&&g.player?.alive&&this.scope.fade<1;
  // Without multisampling every profile goes through the composer and the
  // weapon joins the frame before FXAA; the lens view it carries comes first.
  if(!this.multisampled&&!covered){this.renderScope(false);this.weaponPass.enabled=gun;this.composer.render();}
  else{
   // A full eyepiece hides the world view entirely: only the lens is drawn.
   if(!covered){if(QUALITY[this.quality]?.post)this.composer.render();else g.renderer.render(g.scene,g.camera);}
   this.renderScope(!covered);if(gun){g.renderer.setRenderTarget(null);g.renderer.clearDepth();g.renderer.render(g.gunScene,g.gunCamera);}
  }
  this.scope.draw();}
 // Cardboard-style headset: each eye gets half of the screen, the world
 // and the weapon seen from a pupil apart. The scope view is rendered once
 // and its eyepiece drawn in both halves; the shadow maps are drawn once.
 renderStereo(covered){
  const g=this.game,r=g.renderer,width=innerWidth/2,height=innerHeight,shadows=r.shadowMap.autoUpdate;this.weaponPass.enabled=false;
  this.renderScope(false);const gun=g.player?.alive&&this.scope.fade<1;
  r.setScissorTest(true);
  try{for(const eye of this.eyes){
   const x=eye.side<0?0:width;r.setViewport(x,0,width,height);r.setScissor(x,0,width,height);r.shadowMap.autoUpdate=shadows&&eye.side<0&&!this.scope.active;
   placeEye(eye.world,g.camera,eye.side,g.camera.aspect/2);
   if(!covered){if(QUALITY[this.quality]?.post){this.renderPass.camera=eye.world;this.composer.render();}else{r.setRenderTarget(null);r.render(g.scene,eye.world);}}
   if(gun){placeEye(eye.gun,g.gunCamera,eye.side,g.gunCamera.aspect/2);r.setRenderTarget(null);r.clearDepth();r.render(g.gunScene,eye.gun);}
   this.scope.draw(width/height);
  }}
  finally{r.shadowMap.autoUpdate=shadows;r.setScissorTest(false);r.setViewport(0,0,innerWidth,innerHeight);this.renderPass.camera=g.camera;}
 }
}
