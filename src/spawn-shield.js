import * as THREE from 'three';

// Spawn protection seen from outside: a shell of light around a combatant who
// has just come back and cannot be hurt yet. It pulses while it lasts, flares
// when it stops a shot or a blast, and fades through its last moments, so a
// shooter sees at once why his hits do nothing and when they will count.
export const SHIELD_FADE=.45;
const COLORS={blue:'#5cc8ff',red:'#ff6a4f'};
const CENTRE=1.05,RADIUS=.82,HEIGHT=1.14;
const geometry=new THREE.SphereGeometry(1,28,18);
const vertexShader=`
varying vec3 vNormal;varying vec3 vView;varying float vHeight;
void main(){vec4 view=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vView=normalize(-view.xyz);vHeight=position.y;gl_Position=projectionMatrix*view;}`;
const fragmentShader=`
uniform vec3 uColor;uniform float uOpacity;uniform float uFlash;uniform float uTime;
varying vec3 vNormal;varying vec3 vView;varying float vHeight;
void main(){
 float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),2.4);
 float bands=.5+.5*sin(vHeight*22.-uTime*5.);
 float alpha=uOpacity*(rim*(.75+.25*bands)+.05)+uFlash*(.2+rim*.8);
 gl_FragColor=vec4(uColor*(1.+uFlash*1.6),clamp(alpha,0.,1.));
}`;

// The shell rides on the model's root, so it follows moves, jumps and crouches.
export function attachShield(model,team){
 const material=new THREE.ShaderMaterial({vertexShader,fragmentShader,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  uniforms:{uColor:{value:new THREE.Color(COLORS[team]??COLORS.blue)},uOpacity:{value:0},uFlash:{value:0},uTime:{value:0}}});
 const mesh=new THREE.Mesh(geometry,material);mesh.name='spawn-shield';mesh.userData.shared=true;mesh.castShadow=mesh.receiveShadow=false;mesh.renderOrder=5;
 mesh.position.y=CENTRE;mesh.scale.set(RADIUS,HEIGHT,RADIUS);mesh.visible=false;model.root.add(mesh);model.shield={mesh,material,flash:0,level:0};
 return model.shield;
}
export function disposeShield(model){if(!model.shield)return;model.shield.mesh.removeFromParent();model.shield.material.dispose();model.shield=null;}
// A blocked hit makes the shell flare.
export function flashShield(model){if(model.shield)model.shield.flash=1;}
// remaining: seconds of protection left (0 once it is over or broken).
export function updateShield(model,remaining,dt,time){
 const s=model.shield;if(!s)return;
 const target=remaining>0?Math.min(1,remaining/SHIELD_FADE):0;
 // Comes up quickly; a broken shield collapses faster than it rose.
 s.level+=(target-s.level)*(1-Math.exp(-(target>s.level?14:20)*dt));s.flash=Math.max(0,s.flash-dt*3.5);
 const shown=s.level>.01||s.flash>.01;s.mesh.visible=shown;if(!shown)return;
 const u=s.material.uniforms;u.uTime.value=time;u.uFlash.value=s.flash*Math.max(s.level,.35);u.uOpacity.value=s.level*(.75+.25*Math.sin(time*7));
}
