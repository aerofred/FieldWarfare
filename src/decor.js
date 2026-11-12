import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {worldUV} from './materials.js';

// Details remain inside existing solid footprints or are thin surface dressing.
// Collision geometry stays in the shared world, used by both client and server.
export function addDecor(scene,id,mat){
 const batches=new Map();
 const material=name=>mat[name]||mat.steel||mat.concrete;
 function add(geometry,x,y,z,name,rx=0,ry=0,rz=0){const mesh=new THREE.Mesh(geometry,material(name));mesh.position.set(x,y,z);mesh.rotation.set(rx,ry,rz);mesh.updateMatrixWorld(true);geometry.applyMatrix4(mesh.matrixWorld);worldUV(geometry);if(!batches.has(mesh.material))batches.set(mesh.material,[]);batches.get(mesh.material).push(geometry);}
 const box=(w,h,d,x,y,z,name,ry=0)=>add(new RoundedBoxGeometry(w,h,d,1,Math.min(.025,w/6,h/6,d/6)),x,y,z,name,0,ry);
 const cylinder=(r,len,x,y,z,name,rx=0,rz=0)=>add(new THREE.CylinderGeometry(r,r,len,12).toNonIndexed(),x,y,z,name,rx,0,rz);
 const cable=(points,r=.025,name='dark')=>{const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));add(new THREE.TubeGeometry(path,24,r,5,false).toNonIndexed(),0,0,0,name);};
 if(id==='gardens'){
  for(const side of [-1,1]){const z=side*14;
   for(const face of [-1,1]){const wz=z+face*5.22;
    for(const x of [-4.2,4.2]){box(5.4,.09,.08,x,2.34,wz,'white');for(const dx of [-2.5,2.5])box(.09,1.25,.08,x+dx,1.67,wz,'white');box(5.4,.045,.08,x,1.68,wz,'white');}
    box(14.8,.12,.12,0,3.42,z+face*5.5,'steel');
   }
   for(const x of [-7.22,7.22])cylinder(.055,3.4,x,1.7,z+4.9,'steel');
   // Cushions, piping and cabinet handles sit on the existing furniture.
   for(const dx of [-.95,0,.95]){box(.86,.12,.85,-4+dx,.9,z-side*2.7,'sofa');box(.85,.32,.13,-4+dx,1.02,z-side*3.15,'sofa');}
   for(const y of [.55,1.1,1.6]){box(1.2,.025,.035,-5.7,y,z+side*3.81,'steel');box(.22,.035,.05,-5.7,y+.1,z+side*3.83,'steel');}
   box(1.2,.012,.7,4,1.012,z+side*2.5,'cream');box(.3,.02,.38,4.4,1.035,z+side*2.4,'rug');
   // Flower beds hug the solid hedges, keeping all paths clear.
   for(let i=0;i<18;i++){const x=-14.5+(i%9)*.36,zz=side*24+(Math.floor(i/9)-.5)*.5;cylinder(.013,.2,x,.9,zz,'green');add(new THREE.IcosahedronGeometry(.055,0),x,1.02,zz,i%3?'yellow':'white');}
   for(const x of [-19,19])for(let zz=side*20-9;zz<=side*20+9;zz+=1.4)box(.11,1.5,.1,x,.75,zz,'white');
   box(3.6,.05,.07,13,2.45,side*25+1.53,'white');box(.08,2.1,.06,13,1.1,side*25+1.54,'white');
  }
  for(const [x,z,length]of [[-3,0,7.8],[12,1,4.6]]){
   for(const dx of [-length*.32,length*.32])for(const dz of [-1.14,1.14]){cylinder(.34,.22,x+dx,.4,z+dz,'rubber',Math.PI/2);cylinder(.19,.235,x+dx,.4,z+dz,'steel',Math.PI/2);cylinder(.08,.24,x+dx,.4,z+dz,'rubber',Math.PI/2);}
   for(const side of [-1,1]){box(.07,.12,1.65,x+side*(length/2+.02),.64,z,'steel');for(const dz of [-.72,.72])box(.08,.2,.3,x+side*(length/2+.04),.85,z+dz,side<0?'yellow':'red');}
   for(const dx of [-length*.22,0,length*.22])box(.08,.58,1.97,x+dx,1.36,z,'steel');
  }
 }else if(id==='railway'){
  for(const [x,z]of [[-9,-16],[-9,11],[9,-9],[9,19]]){
   for(const dz of [-3.8,3.8])for(const dx of [-1.85,1.85]){cylinder(.46,.19,x+dx,.48,z+dz,'steel',0,Math.PI/2);cylinder(.2,.23,x+dx,.48,z+dz,'rubber',0,Math.PI/2);}
   for(const side of [-1,1]){const xx=x+side*2.055;box(.06,.1,10.8,xx,.8,z,'steel');box(.06,.1,10.8,xx,3.28,z,'steel');box(.065,2.3,2.6,xx,2,z,'rust');box(.08,.12,.35,xx+side*.035,2,z+.95,'steel');}
   for(const dz of [-5.53,5.53]){box(.5,.17,.28,x,.4,z+dz,'steel');for(const dx of [-1.4,1.4])cylinder(.035,2.6,x+dx,1.95,z+dz,'steel');for(let y=.7;y<3;y+=.35)box(2.8,.035,.035,x,y,z+dz,'steel');}
  }
  for(const [x,z]of [[-2,-22],[3,14],[23,8],[-23,19],[24,-23]]){
   for(let i=0;i<6;i++)box(.25,.07,2.45,x-1.15+i*.46,1.36,z,'wood');for(const dx of [-1.3,1.3])for(const dz of [-1.15,1.15])box(.06,1.2,.06,x+dx,.65,z+dz,'steel');
  }
  for(const z of [-11,5]){box(1.7,.12,2.7,-26,1.36,z,'steel');for(const y of [.5,1,1.5])box(1.35,.025,.055,-19.23,y,z,'steel');}
  cable([[-28.6,3.8,-14],[-28.6,3.55,-3],[-28.6,3.8,8]],.035,'steel');
  for(const x of [-27,-23,-19])box(2,.025,.3,x,3.94,-3,'yellow');
 }else if(id==='factory'){
  // Rust seams, rivets and suspended cables on the existing industrial structures.
  for(const z of [-31.44,31.44])for(let x=-29;x<=29;x+=3)box(.08,2.9,.035,x,1.65,z,'rust');
  cable([[-19,6.6,-28],[-9,5.7,-28],[0,6.5,-28]],.035,'dark');
  cable([[0,6.5,-28],[10,5.3,-28],[21,6.7,-28]],.035,'dark');
  for(const [x,z]of [[-26,-24],[26,23]])for(let i=0;i<8;i++)box(.3,.06,1.7,x-.8+i*.23,.1,z,'rust');
 }
 // Surface wear and contact darkening: flush decals do not introduce hidden obstacles.
 const aoMat=new THREE.MeshBasicMaterial({map:contactTexture(),transparent:true,opacity:.2,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
 const spots={gardens:[[-3,0,8,3],[12,1,5,3],[-13,24,4,2],[-13,-24,4,2]],railway:[[-9,-16,5,12],[-9,11,5,12],[9,-9,5,12],[9,19,5,12]],factory:[[-14,-9,5,5],[20,20,6,5]],desert:[[-8,20,5,3],[24,-6,5,3],[-24,12,3,5],[8,-24,3,5],[0,0,3.4,3.4]],market:[[27,-2,3.6,9],[-27,-16,3,6]],harbor:[[20,12,6,16],[2,-2,10,10]]}[id]||[];
 for(const [x,z,w,d]of spots){const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,d),aoMat);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.135,z);scene.add(mesh);}
 for(const [material,list]of batches){const merged=mergeGeometries(list),mesh=new THREE.Mesh(merged,material);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.detail=true;scene.add(mesh);list.forEach(g=>g.dispose());}
}
function contactTexture(){const size=64,data=new Uint8Array(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const a=Math.max(0,1-Math.pow(Math.max(Math.abs(x-size/2),Math.abs(y-size/2))/(size/2),3));data.set([12,17,18,Math.round(a*255)],(y*size+x)*4);}const t=new THREE.DataTexture(data,size,size);t.magFilter=THREE.LinearFilter;t.needsUpdate=true;return t;}
