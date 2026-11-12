import * as THREE from 'three';

// Procedural sky dome: gradient, sun halo and drifting clouds in one draw.
// The horizon matches the fog colour so distant geometry melts into it.
const VERTEX=`varying vec3 vDir;void main(){vDir=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`;
const FRAGMENT=`
uniform vec3 zenith;uniform vec3 horizon;uniform vec3 ground;uniform vec3 sunDir;uniform vec3 sunColor;uniform vec3 cloudColor;uniform float cover;uniform float time;
varying vec3 vDir;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<OCTAVES;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
void main(){
 vec3 d=normalize(vDir);float h=d.y;
 vec3 col=mix(horizon,zenith,pow(clamp(h,0.,1.),.5));
 col=mix(col,ground,smoothstep(0.,-.08,h));
 float s=max(dot(d,sunDir),0.);
 col+=sunColor*(pow(s,6.)*.18+pow(s,90.)*.5);
 col+=sunColor*smoothstep(.99955,.9998,s)*(1.-cover*.7)*6.;
 if(h>0.){
  vec2 uv=d.xz/(h+.15)*1.2+vec2(time*.006,time*.0025);
  float c=fbm(uv);c=smoothstep(1.-cover-.12,1.-cover+.32,c);
  float fade=smoothstep(.0,.22,h);
  float lit=.75+.35*pow(s,4.)-fbm(uv*1.7+.4)*.3;
  col=mix(col,cloudColor*lit,c*fade*.88);
 }
 gl_FragColor=vec4(col,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

export class Sky{
 constructor(scene){
  this.material=new THREE.ShaderMaterial({defines:{OCTAVES:5},uniforms:{zenith:{value:new THREE.Color()},horizon:{value:new THREE.Color()},ground:{value:new THREE.Color()},sunDir:{value:new THREE.Vector3(0,1,0)},sunColor:{value:new THREE.Color()},cloudColor:{value:new THREE.Color()},cover:{value:.5},time:{value:0}},vertexShader:VERTEX,fragmentShader:FRAGMENT,side:THREE.BackSide,depthWrite:false,fog:false});
  this.mesh=new THREE.Mesh(new THREE.SphereGeometry(150,40,20),this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=-10;scene.add(this.mesh);
 }
 set(mood){
  const u=this.material.uniforms;u.zenith.value.set(mood.zenith);u.horizon.value.set(mood.fog);u.ground.value.set(mood.ground).lerp(u.horizon.value,.5);
  u.sunDir.value.set(...mood.position).normalize();u.sunColor.value.set(mood.sun).multiplyScalar(.9);u.cloudColor.value.set(mood.clouds);u.cover.value=mood.cover;
 }
 // Cloud detail: octaves of noise per sky pixel. The sky fills much of the
 // screen, so the performance profile draws it with fewer.
 setDetail(octaves){const n=Math.max(1,Math.round(octaves));if(this.material.defines.OCTAVES===n)return;this.material.defines.OCTAVES=n;this.material.needsUpdate=true;}
 update(camera,time){this.mesh.position.copy(camera.position);this.material.uniforms.time.value=time;}
 dispose(){this.mesh.geometry.dispose();this.material.dispose();this.mesh.removeFromParent();}
}
