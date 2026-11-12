import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {tintGeometry,finishGeometry,vertexFinish} from './model-batching.js';
import {WEAPON_ANCHORS} from './weapon-anchors.js';

// Third-person silhouettes, separate from the detailed view/showcase models.
// Static parts and the moving magazine each take one draw call. Templates
// share geometry/materials across soldiers and survive individual despawns.
const templates=new Map(),colour=new THREE.Color();
// Colour, roughness and metalness: the view models' materials, their
// roughness maps averaged since the silhouettes are untextured.
const GUN=['#48504e',.55,.85],BLACK=['#202625',.55,.35],WOOD=['#6e4a2c',.88,0],OLIVE=['#4f5a3c',.55,.4],SHELL=['#8e2a22',.93,0];
let material;
function buildWeapon(id){
 const group=new THREE.Group(),magazine=new THREE.Group(),parts=new Map([[group,[]],[magazine,[]]]);
 const add=(parent,geometry,x,y,z,[color,roughness,metalness],rx=0)=>{
  const pose=new THREE.Matrix4().makeRotationX(rx);pose.setPosition(x,y,z);geometry.applyMatrix4(pose);
  if(geometry.index){const indexed=geometry;geometry=indexed.toNonIndexed();indexed.dispose();}
  parts.get(parent).push(finishGeometry(tintGeometry(geometry,colour.set(color)),roughness,metalness));
 };
 const box=(p,w,h,d,x,y,z,c,rx=0)=>add(p,new THREE.BoxGeometry(w,h,d),x,y,z,c,rx);
 const tube=(p,r,len,x,y,z,c)=>add(p,new THREE.CylinderGeometry(r,r,len,8),x,y,z,c,Math.PI/2);
 const grip=()=>box(group,.05,.14,.068,0,-.12,.07,BLACK,-.3);
 if(id==='revolver'){
  box(group,.034,.062,.11,0,0,0,GUN);tube(group,.01,.13,0,.011,-.118,GUN);
  box(group,.02,.02,.105,0,-.005,-.12,GUN);box(group,.012,.008,.13,0,.022,-.118,GUN);
  box(group,.032,.105,.048,0,-.07,.074,WOOD,-.32);box(group,.009,.022,.014,0,.034,.054,BLACK);
  tube(magazine,.02,.046,.012,.026,0,GUN);
 }else if(id==='ppk'){
  box(group,.028,.04,.13,0,-.009,-.035,GUN);box(group,.03,.032,.15,0,.02,-.03,GUN);
  tube(group,.017,.16,0,.012,-.185,BLACK);box(group,.031,.1,.046,0,-.07,.074,BLACK,-.32);
  box(magazine,.022,.1,.034,0,-.004,0,GUN);box(magazine,.033,.01,.048,0,-.055,0,BLACK);
  magazine.rotation.x=-.32;
 }else{
  if(id!=='r870')grip();
  if(id==='minimi'){
   box(group,.084,.115,.36,0,.015,.01,GUN);box(group,.078,.085,.2,0,.03,-.27,BLACK);
   box(group,.032,.085,.035,0,-.045,-.3,BLACK);tube(group,.012,.2,0,.035,-.47,GUN);tube(group,.017,.06,0,.035,-.6,BLACK);
   box(group,.05,.085,.2,0,.025,.28,BLACK);box(group,.064,.13,.025,0,-.008,.38,BLACK);
   box(group,.066,.045,.12,0,.095,.005,BLACK);box(group,.07,.075,.045,0,.145,.005,BLACK);box(magazine,.03,.12,.062,0,-.06,-.004,GUN);
  }else if(id==='mag58'){
   box(group,.11,.125,.46,0,.035,0,GUN);box(group,.118,.04,.26,0,.11,-.04,BLACK);
   tube(group,.031,.38,0,.04,-.43,BLACK);tube(group,.022,.5,0,.04,-.87,GUN);tube(group,.03,.11,0,.04,-1.085,BLACK);
   box(group,.04,.08,.045,0,.105,-.99,BLACK);box(group,.072,.13,.34,0,-.005,.34,WOOD);box(group,.078,.17,.035,0,-.02,.52,BLACK);
   for(const s of [-1,1])tube(group,.009,.36,s*.022,-.035,-.62,BLACK);
   box(magazine,.1,.15,.18,0,-.035,0,OLIVE);box(magazine,.104,.024,.184,0,.05,0,BLACK);
  }else if(id==='mp5'){
   box(group,.074,.1,.38,0,.018,.01,GUN);box(group,.066,.075,.15,0,.03,-.25,BLACK);
   tube(group,.033,.33,0,.035,-.495,GUN);box(group,.058,.13,.2,0,-.015,.29,BLACK);
   box(group,.062,.15,.025,0,-.02,.39,BLACK);box(group,.066,.05,.1,0,.09,.005,BLACK);box(group,.07,.075,.045,0,.145,.005,BLACK);
   for(let i=0;i<3;i++)box(magazine,.042,.075,.036,0,-i*.065,-i*i*.009,BLACK,.08+i*.12);
  }else if(id==='r870'){
   box(group,.058,.08,.27,0,.025,0,GUN);tube(group,.018,.62,0,.052,-.44,GUN);
   tube(group,.014,.5,0,.012,-.38,GUN);box(group,.058,.055,.2,0,.012,-.3,WOOD);
   box(group,.042,.075,.12,0,-.02,.15,WOOD,.25);box(group,.05,.1,.24,0,-.045,.3,WOOD,.12);
   box(group,.054,.13,.025,0,-.06,.42,BLACK);tube(magazine,.011,.06,0,0,0,SHELL);
  }else if(id==='hecate'){
   box(group,.08,.12,.34,0,.015,0,GUN);box(group,.07,.075,.42,0,.03,-.4,BLACK);
   tube(group,.017,.36,0,.035,-.79,GUN);box(group,.05,.045,.11,0,.035,-1.02,BLACK);
   tube(group,.036,.3,0,.145,-.07,BLACK);tube(group,.045,.05,0,.145,-.195,BLACK);
   for(const z of [-.13,0])box(group,.06,.045,.03,0,.0925,z,BLACK);
   box(group,.05,.03,.3,0,.07,.27,BLACK);box(group,.05,.03,.24,0,-.07,.28,BLACK);box(group,.06,.16,.03,0,0,.42,BLACK);
   for(const s of [-1,1])tube(group,.006,.3,s*.016,-.025,-.45,BLACK);
   box(magazine,.034,.075,.074,0,-.0375,0,GUN);
  }
 }
 material??=vertexFinish(new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true}));
 for(const [parent,geometries]of parts){const mesh=new THREE.Mesh(mergeGeometries(geometries),material);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.shared=true;parent.add(mesh);geometries.forEach(g=>g.dispose());}
 const {muzzle,bore,magRest}=WEAPON_ANCHORS[id];magazine.position.set(...magRest);group.add(magazine);
 return{group,magazine,kind:id,magRest,muzzle,bore};
}
export function createSoldierWeapon(id){
 if(!templates.has(id))templates.set(id,buildWeapon(id));
 const proto=templates.get(id),group=proto.group.clone(true);
 return{...proto,group,magazine:group.children[proto.group.children.indexOf(proto.magazine)]};
}
