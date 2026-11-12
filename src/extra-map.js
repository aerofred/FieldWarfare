import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createWorld} from './world.js';
import {pbrMaterial,worldUV} from './materials.js';
import {addDecor} from './decor.js';
import {addLadders} from './ladder-mesh.js';
import {MORE_COLORS,MORE_KINDS,dressMoreMap} from './more-map.js';

export function createExtraMap(scene,id){
 const world=createWorld(id),solidMeshes=[],colors={concrete:'#8a8c7f',grass:'#829461',lawn:'#759950',asphalt:'#535b60',pavement:'#b6b6a6',yellow:'#d9c269',white:'#e6dfca',wood:'#8d7354',ochre:'#d2ae63',teal:'#609e99',cream:'#e2d5b7',roof:'#645e57',sofa:'#647d75',cabinet:'#7f8979',rug:'#b0886b',shed:'#81927b',hedge:'#5f7f49',trunk:'#72604b',leaves:'#607e52',bus:'#c4a55a',carGlass:'#415d66',red:'#a35f4d',rubber:'#333c3b',steel:'#717c7f',gravel:'#83847b',ballast:'#636969',rust:'#7d6756',green:'#596e60',brick:'#916f5c',signal:'#e2ad55',...MORE_COLORS};
 const mat={};for(const [name,color]of Object.entries(colors))mat[name]=name==='carGlass'?new THREE.MeshStandardMaterial({color,roughness:.18,metalness:.8}):pbrMaterial(color,MORE_KINDS[name]||name);
 const unit=new THREE.BoxGeometry(1,1,1),batches=new Map();
 for(const b of world.boxes){
  const geometry=b.material==='leaves'||b.material==='palm'?new THREE.SphereGeometry(.5,12,8):unit;const mesh=new THREE.Mesh(geometry,mat[b.material]||mat.concrete);mesh.position.set(b.x,b.y,b.z);mesh.scale.set(b.w,b.h,b.d);mesh.rotation.z=b.rotation;mesh.updateMatrixWorld(true);
  if(b.solid)solidMeshes.push(mesh);
  if(b.material==='rubber'&&id==='gardens'){continue;} // Replaced by round tyres in addDecor.
  if(b.material==='tank'||b.material==='carHit')continue;// Collision only: drawn round or detailed in more-map.js.
  const bevel=['sofa','cabinet','shed','bus','red','green','carGlass','car','van','dumpster','containerRed','containerBlue','fishCrate'].includes(b.material)&&b.w>.2&&b.d>.2;
  const visual=bevel?new RoundedBoxGeometry(b.w,b.h,b.d,1,Math.min(.07,b.w/8,b.h/8,b.d/8)):geometry.clone();
  if(bevel){const matrix=new THREE.Matrix4().compose(mesh.position,mesh.quaternion,new THREE.Vector3(1,1,1));visual.applyMatrix4(matrix);}else visual.applyMatrix4(mesh.matrixWorld);
  if(!batches.has(mesh.material))batches.set(mesh.material,[]);batches.get(mesh.material).push(worldUV(visual.index?visual.toNonIndexed():visual));if(visual.index)visual.dispose();if(geometry!==unit)geometry.dispose();
 }
 for(const [material,geometries]of batches){const mesh=new THREE.Mesh(mergeGeometries(geometries),material);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);for(const g of geometries)g.dispose();}
 function sign(text,x,y,z,width=4,rotation=0){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#243c35';ctx.fillRect(0,0,512,128);ctx.strokeStyle='#d4d6b0';ctx.lineWidth=6;ctx.strokeRect(6,6,500,116);ctx.fillStyle='#ede9c9';ctx.font='bold 52px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,64,490);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,width/4),new THREE.MeshStandardMaterial({map:texture,roughness:.8}));mesh.position.set(x,y,z);mesh.rotation.y=rotation;scene.add(mesh);
 }
 if(id==='gardens'){
  for(const z of [-14,14])for(const face of [-1,1]){
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-7.4,3.52,0,7.4,3.52,0,0,5.24,0],3));geometry.computeVertexNormals();
   const material=new THREE.MeshStandardMaterial({color:z>0?'#d2ae63':'#609e99',roughness:.9,side:THREE.DoubleSide});const gable=new THREE.Mesh(geometry,material);gable.position.set(0,0,z+face*5.4);gable.castShadow=true;scene.add(gable);
  }
  sign('17 / ALPHA' ,-3.8,2.8,8.78,2.8,Math.PI);sign('24 / BRAVO',3.8,2.8,-8.78,2.8);
  for(const z of [-14,14]){const light=new THREE.PointLight('#fff0c4',8,11);light.position.set(0,2.9,z);scene.add(light);}
  sign('RUE DES JARDINS',-22,2.8,-5,4.2);sign('ZONE D’EXERCICE',0,2.7,-31.7,7);
 }else if(id==='railway'){
  sign('ATELIER / 07',-16.77,3.2,-3,5,Math.PI/2);sign('FRET / BUREAU',24,2.7,-5.78,4);sign('DÉPÔT FERROVIAIRE',0,3,-31.7,11);
  for(const z of [-12,12])sign('047 / FRET',-6.97,2,z,3,Math.PI/2);
  const light=new THREE.PointLight('#ffe0aa',12,16);light.position.set(-23,3.5,-3);scene.add(light);
 }
 addDecor(scene,id,mat);addLadders(scene,world.ladders);const dressing=dressMoreMap(scene,id,mat,sign);
 const dust=new THREE.Group();scene.add(dust);
 return {obstacles:world.obstacles,solidMeshes,mat,dust,world,update:dressing.update};
}
