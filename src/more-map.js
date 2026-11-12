import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {worldUV} from './materials.js';

// Colours and surface kinds for the desert, market and harbour boxes.
export const MORE_COLORS={sand:'#cdb284',dirt:'#a88a62',stone:'#a59a86',adobe:'#c49a6c',adobeDark:'#9e7550',tank:'#8b8f86',tin:'#9aa0a0',crate:'#9a7a52',sandbag:'#b5a37c',palmTrunk:'#8a7155',palm:'#6f8a43',awning:'#b8553d',
 cobble:'#77736d',tiles:'#a98d74',iron:'#3d4544',stall:'#7a5a3d',plaster:'#d8c4a4',plasterBlue:'#8fa3ad',counter:'#6e5640',dumpster:'#3f6650',van:'#d8d7cf',car:'#7a3a32',
 snow:'#c7cfd3',quay:'#9a9e9e',panel:'#b8c2c6',hull:'#2f4f63',keel:'#5a4a3a',hullTop:'#a33a2c',cabin:'#e8e4da',crane:'#c9a23a',craneCab:'#e3b33d',grating:'#5c6466',containerRed:'#9b4335',containerBlue:'#355f87',fishCrate:'#3e7fa0',bollard:'#2f3333',fence:'#8c9496'};
export const MORE_KINDS={tin:'steel',tank:'steel',iron:'steel',dumpster:'green',van:'bus',car:'red',hull:'steel',panel:'steel',grating:'steel',bollard:'steel',fence:'steel',containerRed:'red',containerBlue:'steel',crane:'yellow',craneCab:'yellow',cobble:'pavement',tiles:'pavement',adobe:'concrete',adobeDark:'concrete',plaster:'concrete',plasterBlue:'concrete',snow:'concrete',quay:'concrete',stone:'concrete',stall:'wood',counter:'wood',crate:'wood',palmTrunk:'wood',fishCrate:'shed',palm:'leaves',sandbag:'fabric',awning:'fabric',sand:'concrete',dirt:'concrete',keel:'wood',hullTop:'red',cabin:'concrete'};

// Signs, lights, glowing shop fronts, the sea and falling snow. Nothing here
// collides: the playable volumes all come from more-worlds.js.
export function dressMoreMap(scene,id,mat,sign){
 const batches=new Map(),glow={};
 const glowMaterial=color=>glow[color]??=new THREE.MeshBasicMaterial({color,toneMapped:false});
 function add(geometry,x,y,z,material,rx=0,ry=0,rz=0){const m=new THREE.Object3D();m.position.set(x,y,z);m.rotation.set(rx,ry,rz);m.updateMatrixWorld(true);geometry.applyMatrix4(m.matrixWorld);const flat=geometry.index?geometry.toNonIndexed():geometry;if(flat!==geometry)geometry.dispose();worldUV(flat);if(!batches.has(material))batches.set(material,[]);batches.get(material).push(flat);}
 const box=(w,h,d,x,y,z,name,rx=0,ry=0,rz=0)=>add(new THREE.BoxGeometry(w,h,d),x,y,z,typeof name==='string'?mat[name]||mat.steel:name,rx,ry,rz);
 const cylinder=(r,len,x,y,z,name,rx=0,rz=0,top=r)=>add(new THREE.CylinderGeometry(top,r,len,12),x,y,z,typeof name==='string'?mat[name]||mat.steel:name,rx,0,rz);
 const sphere=(r,x,y,z,material)=>add(new THREE.SphereGeometry(r,8,6),x,y,z,material);
 const light=(color,intensity,distance,x,y,z)=>{const l=new THREE.PointLight(color,intensity,distance,2);l.position.set(x,y,z);scene.add(l);};
 // Hanging bulbs along a sagging line between two points.
 const garland=(a,b,count,colors)=>{for(let i=0;i<=count;i++){const t=i/count,y=a[1]+(b[1]-a[1])*t-Math.sin(t*Math.PI)*.6;sphere(.07,a[0]+(b[0]-a[0])*t,y,a[2]+(b[2]-a[2])*t,glowMaterial(colors[i%colors.length]));}};
 let update=null;
 if(id==='desert'){
  sign('HANGAR 3',-17,3.6,-16.79,4);sign('ÉPICERIE',5,2.82,7.3,2.3,Math.PI);sign('CAFÉ',-5,2.82,-7.3,2.3);sign('MIRAGE',0,2.75,-31.7,6);
  // Palm fronds, shutters, hangar ribs and the tower's tank bands.
  for(const [x,z]of [[-27,-27],[27,26],[-27,6],[27,-12]])for(let i=0;i<8;i++){const a=i/8*Math.PI*2+x;box(3,.05,.55,x+Math.cos(a)*1.45,4.3,z+Math.sin(a)*1.45,'palm',0,-a,-.42);}
  for(const [x,z,w,d]of [[-12,8,8,6],[16,-16,8,6],[-22,-2,6,8],[22,6,6,8]])for(const side of [-1,1]){if(w>d)box(1,1.1,.06,x+side*2,1.9,z+d/2+.03,'wood');else box(.06,1.1,1,x+w/2+.03,1.9,z+side*2,'wood');}
  for(let x=-22.7;x<=-11.3;x+=.6)box(.06,4.4,.05,x,2.2,-25.2,'steel');
  for(const y of [7.4,9.6])cylinder(2.62,.14,14,y,-4,'steel');cylinder(2.55,3,14,8.5,-4,'tank');
  for(const [x,z]of [[-6,-3.5],[6,-3.5]])for(let i=0;i<5;i++)box(.6,.02,2.2,x-1.25+i*.62,2.65,z,i%2?'sand':'awning');
  const motes=new Float32Array(300*3);for(let i=0;i<motes.length;i+=3){motes[i]=(Math.random()-.5)*64;motes[i+1]=Math.random()*6;motes[i+2]=(Math.random()-.5)*64;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(motes,3));const points=new THREE.Points(g,new THREE.PointsMaterial({color:'#e8d2a2',size:.05,transparent:true,opacity:.5,depthWrite:false}));scene.add(points);
  update=(dt,time)=>{points.position.x=Math.sin(time*.15)*2;points.position.z=time*.4%8;};
  light('#ffd7a0',10,12,-17,3.8,-21);
 }else if(id==='market'){
  const names=['BOULANGERIE','PHARMACIE','CAFÉ DU MARCHÉ','LIBRAIRIE','FLEURISTE','BOUCHERIE','QUINCAILLERIE','TABAC'],tints=['#ffd59a','#9fe8ff','#ffb08a','#ffe7b0'];let n=0;
  for(const sx of [-1,1])for(const sz of [-1,1]){
   const z=16*sz,face=-sx,x=8*sx+face*.2;
   for(const dz of [-2.5,2.5]){sign(names[n],x,3.25,z+dz,2.6,face>0?Math.PI/2:-Math.PI/2);box(.04,1.5,.95,x,1.6,z+dz+(dz>0?1.55:-1.55),glowMaterial(tints[n%tints.length]));n++;}
   box(.04,.18,10,x,2.75,z,'awning');
  }
  sign('MARCHÉ COUVERT',0,5.1,8.22,6);sign('MARCHÉ COUVERT',0,5.1,-8.22,6,Math.PI);sign('RUE DES HALLES',-7.8,3.5,24,3.2,Math.PI/2);
  // Iron trusses under the hall roof and lamps along the street.
  for(const z of [-6,-2,2,6]){box(20,.12,.12,0,5.85,z,'iron');for(let x=-9;x<9;x+=2)box(.08,1.1,.08,x+1,5.4,z,'iron',0,0,(x/2%2?.7:-.7));}
  for(const [x,z]of [[-7,-14],[7,-20],[-7,20],[7,14],[-7,-26],[7,26]]){cylinder(.07,4.2,x,2.1,z,'iron');box(.5,.1,.5,x,4.25,z,'iron');sphere(.22,x,4.05,z,glowMaterial('#ffe3a8'));}
  for(const z of [11,-11])garland([-8,4.2,z],[8,4.2,z],16,['#ffd28a','#ff9fbf','#9fe0ff']);
  garland([-3,3.1,-27],[3,3.1,-21],8,['#ffe3a8']);garland([3,3.1,-27],[-3,3.1,-21],8,['#ffe3a8']);
  cylinder(3.6,1.2,0,3.85,-24,'roof',0,0,.2);
  // Parked cars: body, glasshouse, roof, wheels and lights over their collision box.
  for(const [x,z]of [[-5,15],[5,-15],[-5,-18],[5,18]]){
   const front=z>0?-1:1;box(2.05,.62,4.35,x,.62,z,'car');box(1.8,.5,2.2,x,1.18,z+front*.25,mat.carGlass);box(1.84,.07,2.1,x,1.46,z+front*.25,'car');
   for(const dx of [-.92,.92])for(const dz of [-1.35,1.35])cylinder(.34,.26,x+dx,.34,z+dz,'bollard',0,Math.PI/2);
   for(const dx of [-.7,.7]){box(.36,.14,.05,x+dx,.78,z+front*2.18,glowMaterial('#fff4d6'));box(.32,.12,.05,x+dx,.78,z-front*2.18,glowMaterial('#ff4b3a'));}
  }
  for(const dz of [-3,0,3])for(const dx of [-1.32,1.32])cylinder(.48,.3,27+dx,.48,-2+dz,'bollard',0,Math.PI/2);
  for(const [x,z]of [[-7.8,-2],[7.8,2],[-2.5,-5.5],[2.5,5.5],[-7.8,3.2],[7.8,-3.2]])for(let i=0;i<6;i++)sphere(.14,x-1.1+i*.44,1.13,z+(i%2?.2:-.2),i%3?(i%3===1?mat.awning:mat.palm||mat.awning):mat.crate);
  light('#ffd29a',18,18,0,5,0);light('#ffcf8f',8,10,0,2.6,-24);light('#ffc68a',7,12,0,4,22);
 }else if(id==='harbor'){
  const water=new THREE.Mesh(new THREE.PlaneGeometry(120,220,1,1),new THREE.MeshStandardMaterial({color:'#3b5260',roughness:.18,metalness:.25}));water.rotation.x=-Math.PI/2;water.position.set(91.5,-.9,0);water.receiveShadow=true;scene.add(water);
  box(1,1.1,64,31.5,-.45,0,'quay');box(.2,.08,64,31.05,.12,0,'yellow');
  // Boats moored outside the arena and a distant light.
  for(const [x,z,len]of [[38,-14,12],[40,13,9]]){box(4,1.6,len,x,-.2,z,'hull');box(4.1,.2,len+.1,x,.65,z,'hullTop');box(2.4,1.8,3,x,1.6,z+len*.15,'cabin');}
  cylinder(1.2,14,72,6,-48,'cabin');cylinder(1.25,2,72,10,-48,'hullTop');sphere(.6,72,13.6,-48,glowMaterial('#fff1c2'));
  sign('LA MOUETTE · LO 412',17.43,1.9,12,4.4,-Math.PI/2);sign('LA MOUETTE · LO 412',22.57,1.9,12,4.4,Math.PI/2);sign('CRIÉE',-18,3.5,21.42,3);sign('FRIGO 2',-18,3.6,-8.79,3);sign('BRISE-GLACE',0,2.6,-31.7,6);
  // Wheelhouse glass, crane bracing, lifebuoys and nets.
  for(const z of [14,16])box(.04,.8,1.2,18.06,4.1,z,mat.carGlass||'cabin');box(2.6,.8,.04,20,4.1,17.15,mat.carGlass||'cabin');
  for(const dx of [-4,4])for(const tilt of [-1,1])box(.12,12,.12,2+dx,4.5,-2,'crane',tilt*Math.atan2(8,9));
  for(const [x,z]of [[17.38,10],[22.62,15]])cylinder(.38,.12,x,2.1,z,'hullTop',0,Math.PI/2);
  for(const [x,z]of [[-14,-4],[24,-8],[-26,4]])box(1.6,.25,1.6,x,.98,z,'grating');
  for(let i=0;i<8;i++)box(.3,.06,1.5,19+i*.3,2.68,6,'fence');
  // Pointed bow beyond the hull box: both sides close in to the stem, ahead
  // of the wheelhouse; a deck in narrowing strips covers it. Handrails on the walkway.
  for(const side of [-1,1]){box(.3,2,3.4,20+side*1.25,1.6,20.8,'hull',0,-side*.62);box(.3,.25,3.5,20+side*1.3,2.65,20.8,'hullTop',0,-side*.62);}
  for(let i=0;i<4;i++)box(4.3*(1-(i+.5)/4),.1,.75,20,2.55,19.5+i*.75+.375,'hull');
  for(const side of [-1,1]){const x=-5.5+side*.95;for(const y of [3.75,4.3])box(.05,.05,20,x,y,0,'yellow');for(let z=-10;z<=10;z+=2)box(.05,1.05,.05,x,3.78,z,'yellow');}
  // Falling snow wraps around the arena volume.
  const count=1800,flakes=new Float32Array(count*3),speed=new Float32Array(count);for(let i=0;i<count;i++){flakes[i*3]=(Math.random()-.5)*70;flakes[i*3+1]=Math.random()*22;flakes[i*3+2]=(Math.random()-.5)*70;speed[i]=.8+Math.random()*.9;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(flakes,3));const snow=new THREE.Points(g,new THREE.PointsMaterial({color:'#ffffff',size:.07,transparent:true,opacity:.85,depthWrite:false}));snow.frustumCulled=false;scene.add(snow);
  update=(dt,time)=>{const p=g.attributes.position.array;for(let i=0;i<count;i++){p[i*3+1]-=speed[i]*dt;p[i*3]+=Math.sin(time*.7+i)*.25*dt;if(p[i*3+1]<0)p[i*3+1]+=22;}g.attributes.position.needsUpdate=true;};
  light('#e8f2ff',12,16,-18,4.6,-15);light('#ffe2b5',8,12,-18,3.6,16);light('#ffe9c0',6,9,20,4.5,15);
 }
 for(const [material,list]of batches){const mesh=new THREE.Mesh(mergeGeometries(list),material);mesh.castShadow=!material.isMeshBasicMaterial;mesh.receiveShadow=true;mesh.userData.detail=true;scene.add(mesh);list.forEach(g=>g.dispose());}
 return {update};
}
