import * as THREE from 'three';

export const SCOPE_MAGNIFICATION=4;
// Radius of the full-screen eyepiece, in half screen heights.
export const SCOPE_RADIUS=.92;
// Field of view that shows `magnification` times the world camera inside a
// circle covering `projectedRadius` half screen heights.
export function overlayFov(worldFov,projectedRadius,magnification=SCOPE_MAGNIFICATION){
 return THREE.MathUtils.radToDeg(2*Math.atan(projectedRadius*Math.tan(THREE.MathUtils.degToRad(worldFov/2))/magnification));
}
// Match angular magnification inside the lens, independent of screen size/DPR.
export function scopeFov(worldFov,gunFov,radius,distance,magnification=SCOPE_MAGNIFICATION){
 return overlayFov(worldFov,radius/(distance*Math.tan(THREE.MathUtils.degToRad(gunFov/2))),magnification);
}

// Looking through the M14 scope: the screen goes black except the eyepiece,
// which shows the magnified scene, a mil-dot reticle, the eye-relief shadow
// at its rim and a little colour fringing. Recoil shifts the eyepiece.
export class ScopeView{
 constructor(game){
  this.game=game;this.camera=new THREE.PerspectiveCamera(5,1,.05,180);this.active=false;this.fade=0;
  this.material=new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,uniforms:{view:{value:null},aspect:{value:1},radius:{value:SCOPE_RADIUS},offset:{value:new THREE.Vector2()},fade:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`
   uniform sampler2D view;uniform float aspect;uniform float radius;uniform vec2 offset;uniform float fade;varying vec2 vUv;
   void main(){
    vec2 s=(vUv-.5)*2.*vec2(aspect,1.)-offset;vec2 p=s/radius*.5;float r=length(p)*2.;
    vec2 uv=p+.5,dir=p*smoothstep(.75,1.,r)*.012;
    vec3 color=vec3(texture2D(view,uv+dir).r,texture2D(view,uv).g,texture2D(view,uv-dir).b);
    float line=1.-smoothstep(.0018,.0035,min(abs(p.x),abs(p.y)));
    float post=1.-smoothstep(.006,.008,min(abs(p.x),abs(p.y)));post*=step(.3,max(abs(p.x),abs(p.y)));
    float gap=smoothstep(.018,.025,length(p));
    float dots=0.;for(int i=1;i<=3;i++){float d=float(i)*.07;dots=max(dots,1.-smoothstep(.004,.006,min(length(p-vec2(d,0.)),min(length(p+vec2(d,0.)),min(length(p-vec2(0.,d)),length(p+vec2(0.,d)))))));}
    color=mix(color,vec3(.008),max(max(line*gap,post),dots)*.94);
    float center=1.-smoothstep(.003,.005,length(p));color=mix(color,vec3(.7,.035,.012),center);
    color*=1.-smoothstep(.62,1.,r)*.85;
    float inside=1.-smoothstep(.985,1.,r);
    gl_FragColor=vec4(color*inside,fade);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`});
  this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);this.quad.frustumCulled=false;this.overlay=new THREE.Scene();this.overlay.add(this.quad);this.screen=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
 }
 // The lens glass is never replaced any more; kept so callers can reset safely.
 restore(){if(this.surface)this.surface.material=this.originalMaterial;this.surface=null;this.active=false;this.fade=0;}
 scoped(){const g=this.game;return g.state==='active'&&!!g.player?.alive&&!!g.weapon.scope&&!!g.aim&&g.reloadTime<=0&&!!g.weaponModel?.scopeLens;}
 // Fully opaque eyepiece: nothing of the world view shows around it.
 covers(){return this.scoped()&&(this.game.gunAim??1)>=.92;}
 // mainRendered=false when the world pass was skipped: the lens pass then
 // updates the shadows itself. Touch devices use a smaller lens texture.
 render(quality,mainRendered=true){
  const g=this.game,aim=g.gunAim??1;
  if(!this.scoped()||aim<.7){this.restore();return;}
  this.fade=THREE.MathUtils.smoothstep(aim,.7,.92);
  const renderer=g.renderer,height=renderer.getDrawingBufferSize(this.size??=new THREE.Vector2()).y,size=Math.max(256,Math.min(2048,Math.ceil(SCOPE_RADIUS*height*({low:.6,medium:.85,high:1}[quality]??.85)*(g.touch?.enabled?.6:1))));
  if(!this.target){this.target=new THREE.WebGLRenderTarget(size,size,{type:THREE.HalfFloatType});this.material.uniforms.view.value=this.target.texture;}
  else if(this.target.width!==size)this.target.setSize(size,size);
  this.camera.fov=overlayFov(g.camera.fov,SCOPE_RADIUS);
  this.camera.position.copy(g.camera.position);this.camera.quaternion.copy(g.camera.quaternion);this.camera.updateProjectionMatrix();
  const previous=renderer.getRenderTarget(),shadows=renderer.shadowMap.autoUpdate;
  // Reuse the main pass shadows; only the eyepiece needs a second scene view.
  try{renderer.shadowMap.autoUpdate=shadows&&!mainRendered;renderer.setRenderTarget(this.target);renderer.clear();renderer.render(g.scene,this.camera);}
  finally{renderer.setRenderTarget(previous);renderer.shadowMap.autoUpdate=shadows;}
  this.active=true;
 }
 // Drawn last, over the world and the weapon, in the current viewport.
 draw(aspect=innerWidth/innerHeight){
  if(!this.active)return;const g=this.game,u=this.material.uniforms,punch=g.punch??{pitch:0,yaw:0};
  u.aspect.value=aspect;u.fade.value=this.fade;u.offset.value.set(THREE.MathUtils.clamp(-punch.yaw*2.5,-.2,.2),THREE.MathUtils.clamp(-punch.pitch*3,-.25,.25));
  const r=g.renderer,clear=r.autoClear;r.autoClear=false;r.setRenderTarget(null);r.render(this.overlay,this.screen);r.autoClear=clear;
 }
}
