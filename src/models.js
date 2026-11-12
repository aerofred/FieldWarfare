import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {pbrMaterial} from './materials.js';
import {tintGeometry,finishGeometry,vertexFinish} from './model-batching.js';
import {createSoldierWeapon} from './soldier-weapons.js';
import {setSoldierMaterials,simpleSoldierMaterial} from './soldier-materials.js';
import {WEAPON_ANCHORS} from './weapon-anchors.js';

let palette;
function getPalette(){return palette??={gun:pbrMaterial('#48504e','gun',{metalness:.85}),black:pbrMaterial('#202625','gun',{metalness:.35}),tan:pbrMaterial('#b3a17a','tan'),fabric:pbrMaterial('#65705a','fabric'),skin:new THREE.MeshStandardMaterial({color:'#b19679',roughness:.85}),enemy:pbrMaterial('#6f7661','enemy'),armor:pbrMaterial('#3d4841','armor'),red:pbrMaterial('#92775b','fabric'),lens:new THREE.MeshStandardMaterial({color:'#76b4a4',metalness:0,roughness:.2}),optic:new THREE.MeshStandardMaterial({color:'#8fb0b7',metalness:.2,roughness:.12,transparent:true,opacity:.14,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true}),dot:new THREE.MeshBasicMaterial({color:'#ff7755'}),blue:pbrMaterial('#70afcf','fabric'),teamRed:pbrMaterial('#bc7156','fabric'),wood:pbrMaterial('#6e4a2c','wood'),blued:pbrMaterial('#2e3437','gun',{metalness:.9}),brass:pbrMaterial('#b08d3c','gun',{metalness:.9}),olive:pbrMaterial('#4f5a3c','gun',{metalness:.4}),shell:pbrMaterial('#8e2a22','fabric'),tube:pbrMaterial('#202625','gun',{metalness:.35,side:THREE.DoubleSide})};}
const rounded=(w,h,d,r=.018)=>new RoundedBoxGeometry(w,h,d,1,Math.min(r,w/5,h/5,d/5));
function part(parent,w,h,d,x,y,z,mat){const m=new THREE.Mesh(rounded(w,h,d),mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
function barrel(parent,r,length,x,y,z,mat,open=false){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,length,16,1,open),mat);m.rotation.x=Math.PI/2;m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;}


function batchParts(parent,exclude=new Set()){
 const batches=new Map();
 for(const mesh of [...parent.children]){
  if(!mesh.isMesh||exclude.has(mesh))continue;
  mesh.updateMatrix();const original=mesh.geometry,g=original.index?original.toNonIndexed():original.clone();g.applyMatrix4(mesh.matrix);
  if(!batches.has(mesh.material))batches.set(mesh.material,[]);batches.get(mesh.material).push(g);parent.remove(mesh);original.dispose();
 }
 for(const [material,list]of batches){const mesh=new THREE.Mesh(mergeGeometries(list),material);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);list.forEach(g=>g.dispose());}
}

// Muzzle flash: a star facing down the bore and crossed flame tongues along
// it, drawn additively from one generated texture (star left, flame right).
// Sizes in metres: star half-width, flame length and half-width, side jets
// of a muzzle brake. The flash's origin is the muzzle; it points to -z.
const FLASHES={minimi:{star:.07,length:.2,width:.05},mag58:{star:.09,length:.34,width:.065},r870:{star:.13,length:.22,width:.11},hecate:{star:.05,length:.08,width:.04,brake:.2},mp5:{star:.025,length:.04,width:.015},revolver:{star:.08,length:.15,width:.06},ppk:{star:.02,length:.03,width:.012}};
let flashTexture;
function getFlashTexture(){
 if(flashTexture)return flashTexture;
 const size=64,data=new Uint8Array(size*2*size*4),mix=(a,b,t)=>a+(b-a)*t,clamp01=v=>Math.max(0,Math.min(1,v));
 for(let j=0;j<size;j++)for(let i=0;i<size*2;i++){
  let alpha,heat;
  if(i<size){const x=(i+.5)/size*2-1,y=(j+.5)/size*2-1,r=Math.hypot(x,y),a=Math.atan2(y,x);const rays=Math.pow(Math.abs(Math.cos(a*3+Math.sin(a*5)*.25)),10)*Math.pow(clamp01(1-r),1.2);alpha=clamp01(Math.pow(clamp01(1-r/.42),1.5)+rays*.9);heat=clamp01(r*1.5);}
  else{const x=((i-size)+.5)/size*2-1,y=(j+.5)/size,w=Math.pow(Math.sin(Math.PI*Math.min(1,y*1.15)),.6)*(1-y*.35)+.04;alpha=Math.pow(clamp01(1-Math.abs(x)/w),1.3)*Math.pow(1-y,.7)*(.8+.2*Math.cos(y*20));heat=clamp01(Math.abs(x)/w*.8+y*.6);}
  const k=(j*size*2+i)*4;data[k]=255;data[k+1]=Math.round(mix(245,135,heat));data[k+2]=Math.round(mix(215,40,heat));data[k+3]=Math.round(alpha*255);
 }
 flashTexture=new THREE.DataTexture(data,size*2,size);flashTexture.colorSpace=THREE.SRGBColorSpace;flashTexture.magFilter=flashTexture.minFilter=THREE.LinearFilter;flashTexture.needsUpdate=true;return flashTexture;
}
function flashGeometry(id){
 const f=FLASHES[id]??FLASHES.minimi,position=[],uv=[],index=[];
 const quad=(corners,uvs)=>{const v=position.length/3;corners.forEach(c=>position.push(...c));uvs.forEach(c=>uv.push(...c));index.push(v,v+1,v+2,v,v+2,v+3);};
 const S=f.star,star=[[0,0],[.5,0],[.5,1],[0,1]],flame=[[.5,0],[1,0],[1,1],[.5,1]];
 quad([[-S,-S,-S*.2],[S,-S,-S*.2],[S,S,-S*.2],[-S,S,-S*.2]],star);
 const L=f.length,W=f.width;quad([[-W,0,0],[W,0,0],[W,0,-L],[-W,0,-L]],flame);quad([[0,-W,0],[0,W,0],[0,W,-L],[0,-W,-L]],flame);
 // A muzzle brake throws its flame sideways.
 if(f.brake)for(const s of [-1,1]){const B=f.brake*s,w=f.brake*.3,z=-L*.6;quad([[0,-w,z],[0,w,z],[B,w,z],[B,-w,z]],flame);quad([[0,0,z-w],[0,0,z+w],[B,0,z+w],[B,0,z-w]],flame);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(index);return geometry;
}
// Depth-tested so the weapon in front of the muzzle hides it when aiming.
function muzzleFlash(id,depthTest=true){
 const flash=new THREE.Mesh(flashGeometry(id),new THREE.MeshBasicMaterial({map:getFlashTexture(),color:new THREE.Color(2.2,2,1.8),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,depthTest,side:THREE.DoubleSide,fog:false,forceSinglePass:true}));
 flash.visible=false;flash.frustumCulled=false;flash.renderOrder=5;return flash;
}

// .357 revolver: crane-mounted cylinder that swings out to reload,
// exposed hammer, ribbed barrel, wooden grip and a two-handed hold.
function createRevolver(hands=true){
 const m=getPalette(),group=new THREE.Group(),{muzzle,bore,magRest}=WEAPON_ANCHORS.revolver;
 part(group,.034,.062,.11,0,0,0,m.blued);part(group,.03,.012,.085,0,.031,-.012,m.blued);
 barrel(group,.0095,.13,0,.011,-.118,m.blued);part(group,.012,.008,.13,0,.022,-.118,m.blued);part(group,.02,.02,.105,0,-.005,-.12,m.blued);
 // Sights above the hammer: front blade with an orange insert, rear notch;
 // their tops make the sight line at y .056.
 part(group,.004,.03,.012,0,.04,-.176,m.blued);part(group,.0046,.006,.005,0,.052,-.171,m.dot);
 part(group,.022,.008,.01,0,.044,.042,m.black);for(const x of [-.0065,.0065])part(group,.005,.016,.01,x,.048,.042,m.black);
 const guard=new THREE.Mesh(new THREE.TorusGeometry(.022,.0035,6,14,Math.PI*1.2),m.blued);guard.rotation.set(0,Math.PI/2,Math.PI*.9);guard.position.set(0,-.045,.012);group.add(guard);
 const trigger=part(group,.006,.024,.008,0,-.04,.016,m.black);trigger.rotation.x=.3;
 const grip=part(group,.032,.105,.048,0,-.07,.074,m.wood);grip.rotation.x=-.32;part(group,.034,.012,.05,0,-.122,.09,m.blued).rotation.x=-.32;
 const magazine=new THREE.Group();magazine.position.set(...magRest);group.add(magazine);
 const cylinder=new THREE.Group();cylinder.position.set(.012,.026,0);magazine.add(cylinder);
 barrel(cylinder,.02,.046,0,0,0,m.blued);for(let i=0;i<6;i++){const a=i/6*Math.PI*2,flute=part(cylinder,.006,.006,.036,Math.cos(a)*.0195,Math.sin(a)*.0195,0,m.black);flute.rotation.z=a;}
 barrel(magazine,.004,.04,.012,.026,-.045,m.blued);
 const bolt=new THREE.Group();bolt.position.set(0,.026,.05);group.add(bolt);part(bolt,.009,.022,.014,0,.008,.004,m.blued);part(bolt,.012,.006,.012,0,.02,.01,m.black);
 // Gloved shooting hand round the grip, support hand cupping it.
 const left=new THREE.Group();left.position.set(-.03,-.08,.07);group.add(left);
 if(hands){
  const right=part(group,.058,.075,.07,.006,-.075,.082,m.black);right.rotation.x=-.32;
  const forearm=part(group,.1,.1,.3,.05,-.15,.28,m.fabric);forearm.rotation.set(-.3,-.12,-.2);
  part(left,.052,.07,.075,0,0,0,m.black);for(let i=0;i<3;i++)part(left,.016,.022,.05,.012,.03-i*.02,-.035,m.tan);
  const sleeve=part(left,.1,.1,.28,-.06,-.07,.17,m.fabric);sleeve.rotation.set(-.25,.45,.3);
 }
 const flash=muzzleFlash('revolver');flash.position.set(0,bore,muzzle);group.add(flash);
 const light=new THREE.PointLight('#ffc47a',0,3);light.position.copy(flash.position);group.add(light);
 batchParts(cylinder);batchParts(magazine);batchParts(left);batchParts(bolt);batchParts(group,new Set([flash]));
 return{group,flash,light,magazine,left,bolt,cylinder,scopeLens:null,kind:'revolver',spin:0,muzzle,sight:.056,bore,magRest};
}
// Compact .380 pistol with a screwed-on suppressor: the slide runs back on each shot
// and the magazine drops from the grip. Same grip and hands as the revolver;
// the sights stand clear of the suppressor, their tops make the line at .048.
function createPistol(hands=true){
 const m=getPalette(),group=new THREE.Group(),{muzzle,bore,magRest}=WEAPON_ANCHORS.ppk;
 part(group,.028,.03,.13,0,-.004,-.035,m.gun);part(group,.028,.022,.032,0,.002,.048,m.gun);
 // The frame runs down into the grip behind the trigger guard: no gap shows over the hands.
 part(group,.028,.034,.05,0,-.024,.05,m.gun);
 const bolt=new THREE.Group();bolt.position.set(0,.02,-.03);group.add(bolt);
 part(bolt,.03,.032,.15,0,0,0,m.blued);for(let i=0;i<5;i++)part(bolt,.032,.022,.003,0,-.002,.045+i*.007,m.black);part(bolt,.004,.012,.032,.0152,.006,.018,m.black);
 part(bolt,.004,.012,.008,0,.022,-.066,m.blued);part(bolt,.0046,.005,.004,0,.026,-.063,m.dot);for(const x of [-.0065,.0065])part(bolt,.005,.012,.008,x,.022,.068,m.black);
 barrel(group,.017,.16,0,.012,-.185,m.black);barrel(group,.0175,.006,0,.012,-.262,m.gun);barrel(group,.0125,.012,0,.012,-.104,m.gun);
 part(group,.008,.016,.012,0,.028,.06,m.blued);
 const guard=new THREE.Mesh(new THREE.TorusGeometry(.021,.0035,6,14,Math.PI*1.2),m.gun);guard.rotation.set(0,Math.PI/2,Math.PI*.9);guard.position.set(0,-.043,.008);group.add(guard);
 const trigger=part(group,.006,.022,.008,0,-.036,.012,m.black);trigger.rotation.x=.3;
 const grip=part(group,.031,.1,.046,0,-.07,.074,m.black);grip.rotation.x=-.32;const thumb=part(group,.034,.012,.03,0,-.032,.07,m.black);thumb.rotation.x=-.32;
 // Magazine along the grip: only its base plate shows until it drops.
 const magazine=new THREE.Group();magazine.position.set(...magRest);magazine.rotation.x=-.32;group.add(magazine);
 part(magazine,.022,.1,.034,0,-.004,0,m.gun);part(magazine,.033,.01,.048,0,-.055,0,m.black);
 const left=new THREE.Group();left.position.set(-.03,-.08,.07);group.add(left);
 if(hands){
  const right=part(group,.058,.075,.07,.006,-.075,.082,m.black);right.rotation.x=-.32;
  const forearm=part(group,.1,.1,.3,.05,-.15,.28,m.fabric);forearm.rotation.set(-.3,-.12,-.2);
  part(left,.052,.07,.075,0,0,0,m.black);for(let i=0;i<3;i++)part(left,.016,.022,.05,.012,.03-i*.02,-.035,m.tan);
  const sleeve=part(left,.1,.1,.28,-.06,-.07,.17,m.fabric);sleeve.rotation.set(-.25,.45,.3);
 }
 const flash=muzzleFlash('ppk');flash.position.set(0,bore,muzzle);group.add(flash);
 const light=new THREE.PointLight('#ffc47a',0,3);light.position.copy(flash.position);group.add(light);
 batchParts(magazine);batchParts(left);batchParts(bolt);batchParts(group,new Set([flash]));
 return{group,flash,light,magazine,left,bolt,scopeLens:null,kind:'ppk',muzzle,sight:.048,bore,magRest,boltRest:bolt.position.toArray()};
}

// Long guns share the pistol grip, the gloved hands and the muzzle flash.
// Each builder adds its own receiver, barrel, stock and feed, and returns
// where its sight line, magazine, charging handle and muzzle sit.
// pistolGrip=false for a hunting stock, held by its wrist.
function gripAndTrigger(group,m,pistolGrip=true){
 // The grip hangs from a block behind the trigger that meets the receiver,
 // so only the trigger guard stays open.
 if(pistolGrip){const grip=part(group,.05,.15,.068,0,-.13,.07,m.black);grip.rotation.x=-.3;part(group,.05,.055,.065,0,-.058,.056,m.black);}
 else part(group,.006,.03,.008,0,-.074,.054,m.black);
 part(group,.006,.008,.085,0,-.088,.015,m.black);part(group,.006,.03,.008,0,-.074,-.024,m.black);const trigger=part(group,.006,.026,.008,0,-.072,.012,m.gun);trigger.rotation.x=.25;
}
// wrist: the shooting hand wraps the wrist of a hunting stock instead of a pistol grip.
// A box stretched between two points: forearms run from the wrist to the elbow.
const limbAxis=new THREE.Vector3(0,0,1),limbDir=new THREE.Vector3();
function limb(group,from,to,w,h,mat){const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),mesh=part(group,w,h,a.distanceTo(b),0,0,0,mat);mesh.position.addVectors(a,b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(limbAxis,limbDir.subVectors(b,a).normalize());return mesh;}
function gunHands(group,left,m,wrist=false){
 if(wrist){
  // Shooting hand round the wrist of the stock: palm on the right, fingers
  // curled under and up the left side, index forward on the trigger; the
  // forearm leaves the back of the hand towards the elbow, out and down.
  const palm=part(group,.03,.075,.085,.03,-.03,.12,m.black);palm.rotation.x=.25;const back=part(group,.064,.026,.08,.006,-.064,.12,m.black);back.rotation.x=.25;
  for(let i=0;i<3;i++)part(group,.014,.04,.018,-.027,-.04,.1+i*.02,m.tan);part(group,.014,.014,.07,-.004,-.066,.05,m.tan);
  limb(group,[.03,-.05,.15],[.13,-.26,.4],.1,.095,m.fabric);
 }else{
  const right=part(group,.085,.1,.105,.015,-.16,.09,m.black);right.rotation.x=-.2;
  const forearm=part(group,.105,.11,.29,.065,-.22,.25,m.fabric);forearm.rotation.set(-.25,-.2,-.25);
  for(let i=0;i<4;i++)part(group,.02,.026,.06,-.02+i*.022,-.12,.06,m.tan);
 }
 // The support forearm runs from the hand back to the elbow, out of view.
 part(left,.09,.075,.12,0,0,0,m.black);limb(left,[-.02,-.045,.03],[-.3,-.22,.5],.11,.105,m.fabric);
 for(let i=0;i<4;i++)part(left,.018,.027,.08,-.04+i*.022,.026,-.015,m.tan);
}
// Hunting stocks: no pistol grip, the hand holds the wrist of the stock.
const WRIST_GRIP=new Set(['r870']);
// Red dot on a short rail; its glass centre is the sight line at y .15.
function redDot(group,m,railFront,railY=.1){
 const railBack=.15,railLength=railBack-railFront;part(group,.066,.022,railLength,0,railY,(railFront+railBack)/2,m.black);for(let i=0;i<Math.floor(railLength/.026);i++)part(group,.074,.01,.01,0,railY+.012,railBack-.015-i*.026,m.gun);
 part(group,.075,.013,.065,0,.12,.005,m.black);for(const x of [-.035,.035])part(group,.009,.065,.045,x,.15,.005,m.black);barrel(group,.009,.012,.045,.15,.005,m.black).rotation.set(0,0,Math.PI/2);part(group,.077,.009,.03,0,.184,.005,m.black);part(group,.057,.049,.003,0,.15,.004,m.optic);const dot=new THREE.Mesh(new THREE.SphereGeometry(.002,6,4),m.dot);dot.position.set(0,.15,-.025);group.add(dot);
}
// Compact straight box magazine, its origin at the top: the upper third
// sits inside the magazine well, so no gap shows under the receiver. The
// lower part curves slightly forward; ribs on the sides, a base plate.
function boxMagazine(magazine,m,{height=.12,width=.026,depth=.062}={}){
 const upper=height*.55,lower=height-upper;
 part(magazine,width,upper,depth,0,-upper/2,0,m.gun);
 const low=part(magazine,width,lower+.012,depth*.97,0,-upper-lower/2+.006,-.006,m.gun);low.rotation.x=.14;
 for(const z of [-depth*.22,depth*.22])part(magazine,width+.003,upper*.8,.006,0,-upper*.55,z,m.black);
 const base=part(magazine,width+.005,.01,depth*1.06,0,-height+.002,-.016,m.black);base.rotation.x=.14;
}
// Magazine well under the receiver, open at the bottom.
function magazineWell(group,m,y,z,width=.044,depth=.078){part(group,width,.05,depth,0,y,z,m.gun);part(group,width+.006,.008,depth+.006,0,y-.025,z,m.black);}
function foldedBipod(group,m,y,z,length){for(const s of [-1,1])barrel(group,.006,length,s*.016,y,z,m.black);part(group,.034,.022,.03,0,y+.008,z-length/2,m.black);}

// Light machine gun, short commando-style version: short barrel and flash hider, quad
// rail with a vertical grip, sliding stock on a buffer tube.
function buildMinimi(group,magazine,m){
 part(group,.084,.085,.36,0,.03,.01,m.gun);part(group,.08,.05,.2,0,-.03,.05,m.gun);part(group,.09,.026,.2,0,.087,-.02,m.black);part(group,.018,.03,.1,-.05,.035,-.08,m.gun);
 const guard=.2,guardZ=-.27;part(group,.078,.085,guard,0,.03,guardZ,m.black);
 for(let i=0;i<Math.floor(guard/.032);i++){const z=guardZ+guard/2-.02-i*.032;for(const s of [-1,1])part(group,.008,.04,.014,s*.042,.03,z,m.black);}
 part(group,.032,.085,.035,0,-.045,-.3,m.black);
 barrel(group,.012,.2,0,.035,-.47,m.gun);barrel(group,.017,.06,0,.035,-.6,m.black);for(const s of [-1,1])part(group,.005,.007,.03,s*.015,.035,-.6,m.gun);
 redDot(group,m,-.36);
 barrel(group,.018,.2,0,.035,.25,m.black);part(group,.05,.075,.13,0,.02,.31,m.black);part(group,.05,.028,.11,0,.066,.3,m.black);part(group,.064,.13,.025,0,-.008,.38,m.black);
 magazineWell(group,m,-.033,-.085);boxMagazine(magazine,m);
 const bolt=part(group,.03,.02,.04,.05,.03,-.06,m.gun);
 return {bolt,sight:.15,boltHand:[.068,.03,-.06]};
}
// 7.62 medium machine gun: tall riveted receiver, thick barrel in a ventilated jacket, big
// gas block and front sight, wooden stock, steel ammunition can on the left.
// Iron sights: the rear notch and the front post tip mark the sight line.
function buildMag58(group,magazine,m){
 part(group,.11,.125,.46,0,.035,0,m.gun);for(let i=0;i<4;i++)for(const s of [-1,1])part(group,.006,.012,.012,s*.056,.06,-.15+i*.1,m.black);
 part(group,.1,.06,.22,0,-.045,.06,m.gun);part(group,.118,.04,.26,0,.11,-.04,m.black);
 barrel(group,.031,.38,0,.04,-.43,m.black);for(let i=0;i<6;i++)for(const s of [-1,1])part(group,.004,.018,.03,s*.031,.04,-.27-i*.06,m.gun);
 barrel(group,.022,.5,0,.04,-.87,m.gun);barrel(group,.016,.66,0,-.012,-.57,m.gun);part(group,.05,.07,.07,0,.005,-.9,m.gun);
 part(group,.04,.035,.045,0,.08,-.99,m.black);part(group,.007,.06,.007,0,.13,-.99,m.black);for(const s of [-1,1])part(group,.006,.05,.022,s*.02,.12,-.99,m.black);
 barrel(group,.03,.11,0,.04,-1.085,m.black);
 part(group,.025,.07,.035,-.065,.08,-.42,m.black);part(group,.022,.022,.18,-.085,.12,-.42,m.wood);
 for(const s of [-1,1])barrel(group,.009,.36,s*.022,-.035,-.62,m.black);part(group,.05,.03,.04,0,-.025,-.8,m.black);
 part(group,.05,.022,.035,0,.13,.12,m.black);for(const s of [-1,1])part(group,.008,.03,.012,s*.014,.145,.12,m.black);
 const stock=part(group,.072,.13,.34,0,-.005,.34,m.wood);stock.rotation.x=.05;part(group,.078,.17,.035,0,-.02,.52,m.black);
 part(magazine,.1,.15,.18,0,-.035,0,m.olive);part(magazine,.104,.024,.184,0,.05,0,m.black);part(magazine,.03,.012,.06,0,.068,0,m.black);for(let i=0;i<6;i++)part(magazine,.024,.014,.036,.04+i*.009,.07+i*.014,0,m.brass);
 const bolt=part(group,.04,.03,.045,.065,0,-.1,m.gun);
 return {bolt,sight:.16,boltHand:[.09,0,-.1]};
}
// Suppressed 9 mm SMG: one stamped receiver tube, integral suppressor, drum rear sight
// and hooded front sight, fixed stock, strongly curved 9 mm magazine.
function buildMp5(group,magazine,m){
 part(group,.074,.1,.38,0,.018,.01,m.gun);part(group,.068,.05,.17,0,-.05,.07,m.black);barrel(group,.012,.3,0,.078,-.27,m.gun);part(group,.022,.012,.016,-.022,.078,-.37,m.black);part(group,.012,.02,.012,-.033,.078,-.37,m.black);part(group,.05,.06,.05,0,-.06,-.088,m.gun);
 part(group,.066,.075,.15,0,.03,-.25,m.black);
 barrel(group,.033,.33,0,.035,-.495,m.gun);barrel(group,.035,.025,0,.035,-.66,m.black);barrel(group,.035,.02,0,.035,-.34,m.black);
 redDot(group,m,-.12,.085);
 barrel(group,.018,.024,0,.112,.13,m.black).rotation.set(0,0,Math.PI/2);part(group,.03,.018,.03,0,.088,-.405,m.black);part(group,.01,.03,.01,0,.11,-.405,m.black);for(const x of [-.015,.015])part(group,.006,.034,.022,x,.11,-.405,m.black);
 part(group,.05,.075,.12,0,.01,.24,m.black);part(group,.058,.13,.1,0,-.015,.33,m.black);part(group,.062,.15,.025,0,-.02,.39,m.black);
 // Strips follow an arc so the curve stays continuous, ending on a floor plate.
 const count=5,curve=.075,width=.042,depth=.036,step=.04;let y=0,z=0,angle=.06;
 for(let i=0;i<=count;i++){
  if(i===count){const plate=part(magazine,width+.008,.014,depth+.008,0,y+step/2-.004,z,m.black);plate.rotation.x=angle-curve;break;}
  const strip=part(magazine,width,step+.006,depth,0,y,z,m.black);strip.rotation.x=angle;for(const x of [-width/2,width/2])part(magazine,.003,step*.7,depth*.66,x,y,z,m.gun).rotation.x=angle;
  angle+=curve;y-=step*Math.cos(angle-curve/2);z-=step*Math.sin(angle-curve/2);
 }
 const bolt=part(group,.013,.025,.06,.043,.018,.015,m.gun);part(group,.012,.02,.05,-.043,.04,.05,m.gun);
 return {bolt,sight:.15,boltHand:[-.05,.07,-.36]};
}
// Pump shotgun: wooden pump on the magazine tube, bead front sight. Its
// "magazine" is the shell carried in the hand while loading the tube.
function buildR870(group,magazine,m){
 part(group,.058,.08,.27,0,.025,0,m.blued);part(group,.004,.025,.06,.03,.035,0,m.black);part(group,.03,.012,.08,0,-.02,-.05,m.black);
 // Trigger plate under the receiver, down to the guard.
 part(group,.044,.042,.12,0,-.036,.01,m.black);
 // A wide 12-gauge bore over a thick magazine tube; the bead rides on the muzzle band.
 barrel(group,.018,.62,0,.052,-.44,m.blued);barrel(group,.021,.03,0,.052,-.735,m.blued);part(group,.007,.009,.007,0,.076,-.735,m.gun);barrel(group,.014,.5,0,.012,-.38,m.blued);barrel(group,.016,.02,0,.012,-.64,m.blued);
 const bolt=new THREE.Group();bolt.position.set(0,.012,-.3);group.add(bolt);part(bolt,.058,.055,.2,0,0,0,m.wood);for(let i=0;i<6;i++)part(bolt,.061,.006,.012,0,-.012,-.07+i*.028,m.black);
 const wrist=part(group,.042,.075,.12,0,-.02,.15,m.wood);wrist.rotation.x=.25;const stock=part(group,.05,.1,.24,0,-.045,.3,m.wood);stock.rotation.x=.12;part(group,.054,.13,.025,0,-.06,.42,m.black);
 barrel(magazine,.0105,.06,0,0,0,m.shell);barrel(magazine,.011,.016,0,0,.035,m.brass);
 return {bolt,sight:.08,boltHand:[-.018,-.062,-.26]};
}
// 12.7 mm sniper rifle: bolt action, free-float handguard, large muzzle
// brake, skeleton stock and a long scope whose ocular lens is the eyepiece.
function buildHecate(group,magazine,m){
 part(group,.075,.075,.34,0,.03,0,m.gun);part(group,.08,.06,.26,0,-.03,.03,m.black);
 part(group,.07,.075,.42,0,.03,-.4,m.black);for(let i=0;i<5;i++)for(const s of [-1,1])part(group,.004,.03,.05,s*.036,.03,-.25-i*.075,m.gun);
 barrel(group,.017,.36,0,.035,-.79,m.gun);part(group,.05,.045,.11,0,.035,-1.02,m.black);for(let i=0;i<3;i++)for(const s of [-1,1])part(group,.006,.03,.02,s*.026,.035,-.99-i*.03,m.gun);
 foldedBipod(group,m,-.025,-.45,.3);
 // Open scope tube, double-sided so its inside reads from the eyepiece.
 barrel(group,.036,.2,0,.145,-.07,m.tube,true);barrel(group,.045,.05,0,.145,-.195,m.tube,true);barrel(group,.039,.035,0,.145,.048,m.tube,true);
 for(const [z,r,t] of [[-.22,.045,.004],[.065,.039,.004],[-.17,.039,.003],[.03,.039,.003]]){const rim=new THREE.Mesh(new THREE.TorusGeometry(r,t,6,24),m.black);rim.position.set(0,.145,z);group.add(rim);}
 let scopeLens=null;for(const z of [-.217,.062]){const lens=new THREE.Mesh(new THREE.CircleGeometry(z>0?.036:.04,24),m.optic);lens.position.set(0,.145,z);if(z>0)scopeLens=lens;else lens.rotation.y=Math.PI;group.add(lens);}
 barrel(group,.013,.03,0,.19,-.07,m.black).rotation.set(0,0,0);barrel(group,.013,.03,.045,.145,-.07,m.black).rotation.set(0,0,Math.PI/2);
 for(const z of [-.13,-.0])part(group,.06,.04,.03,0,.1,z,m.black);
 const dot=new THREE.Mesh(new THREE.SphereGeometry(.0017,6,4),m.dot);dot.position.set(0,.145,-.2);group.add(dot);
 part(group,.05,.03,.3,0,.07,.27,m.black);part(group,.05,.03,.24,0,-.07,.28,m.black);part(group,.06,.16,.03,0,0,.42,m.black);part(group,.045,.03,.12,0,.1,.24,m.black);
 magazineWell(group,m,-.07,-.075,.048,.084);boxMagazine(magazine,m,{height:.075,width:.034,depth:.074});
 // Bolt handle on the right: lifts about the bore and runs back to cycle.
 const bolt=new THREE.Group();bolt.position.set(.035,.035,.05);group.add(bolt);barrel(bolt,.006,.07,.035,0,0,m.gun).rotation.set(0,0,Math.PI/2);part(bolt,.024,.024,.024,.07,0,0,m.black);
 return {bolt,scopeLens,sight:.145,boltHand:[.105,.035,.05]};
}
const BUILDERS={minimi:buildMinimi,mag58:buildMag58,r870:buildR870,hecate:buildHecate,mp5:buildMp5};

// hands:false gives the bare weapon for the lobby showcase.
// Ammunition box left by a fallen soldier. Every box shares one template;
// clones keep its geometry and materials, so removing one disposes nothing.
let ammoBox;
export function createAmmoBox(){
 if(!ammoBox){
  ammoBox=new THREE.Group();const olive=pbrMaterial('#4d5734','green',{metalness:.4}),stripe=new THREE.MeshStandardMaterial({color:'#d3b545',roughness:.6,emissive:'#3a3010'}),gun=getPalette().gun;
  part(ammoBox,.46,.26,.24,0,.13,0,olive);part(ammoBox,.48,.04,.26,0,.27,0,olive);part(ammoBox,.47,.05,.245,0,.18,0,stripe);
  part(ammoBox,.18,.025,.04,0,.3,0,gun);part(ammoBox,.04,.08,.03,.2,.22,.13,gun);
  ammoBox.traverse(m=>{if(m.isMesh)m.userData.shared=true;});
 }
 return ammoBox.clone();
}
export function createWeapon(id='minimi',{hands=true}={}){
 if(id==='revolver')return createRevolver(hands);
 if(id==='ppk')return createPistol(hands);
 const m=getPalette(),kind=BUILDERS[id]?id:'minimi',group=new THREE.Group(),magazine=new THREE.Group(),left=new THREE.Group(),{muzzle,bore,magRest}=WEAPON_ANCHORS[kind];
 gripAndTrigger(group,m,!WRIST_GRIP.has(id));
 const spec=BUILDERS[kind](group,magazine,m);magazine.position.set(...magRest);group.add(magazine);
 left.position.set(...LEFT_REST);group.add(left);if(hands)gunHands(group,left,m,WRIST_GRIP.has(id));
 const flash=muzzleFlash(kind);flash.position.set(0,bore,muzzle);group.add(flash);
 const light=new THREE.PointLight('#ffc47a',0,3);light.position.copy(flash.position);group.add(light);
 const {bolt,scopeLens=null}=spec;
 batchParts(magazine);batchParts(left);if(bolt.isGroup)batchParts(bolt);batchParts(group,new Set([flash,bolt,scopeLens]));
 return{group,flash,light,magazine,left,bolt,scopeLens,kind,sight:spec.sight,magRest,boltHand:spec.boltHand,muzzle,bore,boltRest:bolt.position.toArray()};
}

// Keyframe tracks: [[time, value], ...] eased with smoothstep between keys.
// Values are arrays so one helper drives positions, rotations and scalars.
function keyed(keys,p,out=[]){
 let i=0;while(i<keys.length-2&&p>keys[i+1][0])i++;
 const [t0,a]=keys[i],[t1,b]=keys[i+1],t=THREE.MathUtils.clamp((p-t0)/Math.max(1e-6,t1-t0),0,1),e=t*t*(3-2*t);
 for(let j=0;j<a.length;j++)out[j]=a[j]+(b[j]-a[j])*e;return out;
}
const ZERO6=[0,0,0,0,0,0];
// First-person reload choreography, as fractions of the reload time. Sounds
// in audio.reload() land on the same beats: release .12, seat .58, bolt .84.
const RIFLE_GUN={
 empty:[[0,ZERO6],[.1,[-.11,.12,.05,.32,.16,-.6]],[.3,[-.12,.13,.05,.34,.18,-.62]],[.55,[-.11,.12,.05,.3,.16,-.58]],[.58,[-.11,.102,.062,.24,.16,-.54]],[.63,[-.11,.12,.05,.3,.16,-.58]],[.8,[-.07,.08,.03,.2,.1,-.4]],[.84,[-.07,.066,.046,.14,.1,-.35]],[.88,[-.06,.074,.035,.18,.08,-.32]],[1,ZERO6]],
 tactical:[[0,ZERO6],[.1,[-.11,.12,.05,.32,.16,-.6]],[.3,[-.12,.13,.05,.34,.18,-.62]],[.55,[-.11,.12,.05,.3,.16,-.58]],[.58,[-.11,.102,.062,.24,.16,-.54]],[.64,[-.1,.11,.05,.28,.15,-.55]],[.86,[-.03,.03,.01,.08,.04,-.15]],[1,ZERO6]]
};
const LEFT_REST=[-.018,-.062,-.26],MAG_REST=[0,-.1,-.09];
// The hand path is drawn for a magazine at MAG_REST and follows the model's own.
function rifleHand(model,empty){
 const key=empty?'emptyHand':'tacticalHand';if(model[key])return model[key];
 const [dx,dy,dz]=model.magRest.map((v,i)=>v-MAG_REST[i]),at=(x,y,z)=>[x+dx,y+dy,z+dz];
 const grip=at(-.045,-.19,-.1),press=at(-.045,-.215,-.095),pouch=[-.13,-.56,.06],under=at(-.035,-.37,-.11),seat=at(-.04,-.2,-.1),bolt=model.boltHand,push=[bolt[0],bolt[1]-.012,bolt[2]+.012];
 return model[key]=empty?[[0,LEFT_REST],[.1,grip],[.14,press],[.3,pouch],[.37,pouch],[.52,under],[.58,seat],[.72,bolt],[.82,bolt],[.85,push],[.97,LEFT_REST],[1,LEFT_REST]]
  :[[0,LEFT_REST],[.1,grip],[.14,press],[.3,pouch],[.37,pouch],[.52,under],[.58,seat],[.64,seat],[.84,LEFT_REST],[1,LEFT_REST]];
}
// Shotgun: the gun rolls to show the loading port; four times the hand takes
// a shell from the belt and thumbs it into the tube, then racks the pump.
const SHOTGUN_GUN=[[0,ZERO6],[.1,[-.04,.06,.02,.2,.1,.5]],[.8,[-.04,.06,.02,.2,.1,.5]],[.9,[-.02,.03,.01,.1,.05,.2]],[1,ZERO6]];
const SHELL_POUCH=[-.12,-.42,.08],SHELL_PORT=[-.01,-.1,-.06],SHELL_PUSH=[-.01,-.08,-.09];
const SHOTGUN_HAND=[[0,LEFT_REST],[.12,SHELL_POUCH],...[0,1,2,3].flatMap(i=>[[.12+i*.17+.08,SHELL_PORT],[.12+i*.17+.1,SHELL_PUSH],[.12+i*.17+.17,SHELL_POUCH]]),[.86,LEFT_REST],[1,LEFT_REST]];
const PUMP_RELOAD=[[0,[0]],[.86,[0]],[.9,[.09]],[.95,[0]],[1,[0]]];
// After each shot: the pump runs back and forward; the sniper rifle bolt lifts,
// runs back, returns and locks. Times are shares of the weapon interval.
const PUMP_CYCLE=[[0,[0]],[.28,[0]],[.37,[.09]],[.45,[.09]],[.53,[0]],[1,[0]]];
const BOLT_LIFT=[[0,[0]],[.22,[0]],[.27,[1.1]],[.6,[1.1]],[.64,[0]],[1,[0]]],BOLT_SLIDE=[[0,[0]],[.3,[0]],[.38,[.1]],[.48,[.1]],[.56,[0]],[1,[0]]];
// The bolt sits under the scope: the gun cants and dips so the stroke reads.
const BOLT_GUN=[[0,ZERO6],[.18,ZERO6],[.28,[.03,-.04,.03,.1,0,-.3]],[.58,[.03,-.04,.03,.1,0,-.3]],[.7,ZERO6],[1,ZERO6]];
const REVOLVER_GUN=[[0,ZERO6],[.1,[-.035,.04,0,.35,0,.5]],[.18,[-.03,.07,.01,.95,0,.35]],[.32,[-.03,.07,.01,.95,0,.35]],[.42,[-.04,.03,0,-.22,0,.45]],[.6,[-.04,.03,0,-.22,0,.45]],[.63,[-.04,.022,.008,-.18,0,.42]],[.8,[-.03,.025,0,-.12,0,.4]],[.86,[-.02,.02,0,-.05,0,.12]],[1,ZERO6]];
const REVOLVER_HAND=[[0,[-.03,-.08,.07]],[.1,[-.025,-.005,-.01]],[.22,[-.02,.0,.01]],[.36,[-.15,-.5,.15]],[.44,[-.15,-.5,.15]],[.55,[-.02,.035,.05]],[.62,[-.02,.03,.035]],[.72,[-.035,.0,-.005]],[.86,[-.03,-.03,.03]],[1,[-.03,-.08,.07]]];
const REVOLVER_CRANE=[[0,[0]],[.08,[0]],[.12,[1.25]],[.82,[1.25]],[.86,[0]],[1,[0]]];
// Pistol: the gun cants to show the grip, the magazine drops, the hand
// brings a fresh one from the belt, seats it and racks the slide.
const PISTOL_GUN=[[0,ZERO6],[.08,[-.02,.05,0,.3,0,.35]],[.66,[-.02,.05,0,.3,0,.35]],[.74,[-.01,.04,0,.2,0,.2]],[.84,[-.01,.03,0,.15,0,.12]],[1,ZERO6]];
const PISTOL_REST=[-.03,-.08,.07],PISTOL_HAND=[[0,PISTOL_REST],[.08,PISTOL_REST],[.2,[-.15,-.45,.15]],[.34,[-.15,-.45,.15]],[.5,[0,-.21,.11]],[.58,[0,-.16,.1]],[.64,[0,-.16,.1]],[.72,[-.006,.05,.06]],[.78,[-.006,.05,.095]],[.8,[-.006,.05,.095]],[.92,PISTOL_REST],[1,PISTOL_REST]];
const scratch=[],handScratch=[];
// model.group must already hold this frame's pose: reload offsets add to it.
export function animateWeapon(model,{reload=0,duration=2,time=0,sprint=false,aim=0,recoil=0,empty=true,cycle=1}){
 const p=reload>0?THREE.MathUtils.clamp(1-reload/duration,0,1):0,g=model.group;
 const offset=p>0?keyed(model.kind==='revolver'?REVOLVER_GUN:model.kind==='ppk'?PISTOL_GUN:model.kind==='r870'?SHOTGUN_GUN:empty?RIFLE_GUN.empty:RIFLE_GUN.tactical,p,scratch):model.kind==='hecate'&&cycle<1?keyed(BOLT_GUN,cycle,scratch):ZERO6;
 g.position.x+=offset[0];g.position.y+=offset[1];g.position.z+=offset[2];g.rotation.x+=offset[3];g.rotation.y+=offset[4];g.rotation.z+=offset[5];
 if(model.kind==='revolver'){
  model.magazine.rotation.z=p>0?keyed(REVOLVER_CRANE,p,scratch)[0]:0;model.cylinder.rotation.z=model.spin;
  const hand=p>0?keyed(REVOLVER_HAND,p,handScratch):REVOLVER_HAND[0][1];model.left.position.set(hand[0],hand[1],hand[2]);model.left.rotation.x=p>.26&&p<.5?-.6*Math.sin(Math.PI*(p-.26)/.24):0;
  model.bolt.rotation.x=-Math.min(1,recoil*9)*.5;
 }else if(model.kind==='ppk'){
  const mag=model.magazine,rest=model.magRest,hand=p>0?keyed(PISTOL_HAND,p,handScratch):PISTOL_REST,seconds=(p-.1)*duration;
  model.left.position.set(hand[0],hand[1],hand[2]);model.left.rotation.x=0;
  // Dropped down the grip, then carried up from the belt and seated.
  if(p>.1&&p<.34){mag.position.set(rest[0],rest[1]-4.9*seconds*seconds-.3*seconds,rest[2]+.1*seconds);mag.visible=mag.position.y>-.8;}
  else if(p>=.34&&p<.58){mag.position.set(hand[0]+.03,hand[1]+.06,hand[2]-.005);mag.visible=true;}
  else{mag.position.set(...rest);mag.visible=true;}
  // The slide runs back on each shot, stays open on an empty magazine until racked.
  const locked=empty&&p>0&&p<.74,racked=p>=.74&&p<.8;
  model.bolt.position.z=model.boltRest[2]+(racked?.035:locked?.03:Math.min(.03,recoil*1.2));
 }else if(model.kind==='r870'){
  // The shell rides in the hand from the belt to the port, then vanishes in the tube.
  const pump=(p>0?keyed(PUMP_RELOAD,p,scratch):keyed(PUMP_CYCLE,cycle,scratch))[0],hand=p>0&&p<.86?keyed(SHOTGUN_HAND,p,handScratch):LEFT_REST;
  model.bolt.position.set(model.boltRest[0],model.boltRest[1],model.boltRest[2]+pump);model.left.position.set(hand[0],hand[1],hand[2]+(hand===LEFT_REST?pump:0));model.left.rotation.x=0;
  const step=(p-.12)/.17,carried=p>.12&&p<.8&&step-Math.floor(step)<.1/.17;model.magazine.visible=carried;if(carried)model.magazine.position.set(hand[0]+.02,hand[1]+.06,hand[2]-.02);
 }else{
  // The empty magazine drops free on release; the fresh one rides in the hand.
  const mag=model.magazine,released=p>.12&&p<.37,seconds=(p-.12)*duration;
  const rest=model.magRest;
  if(p<=.12){mag.position.set(...rest);mag.rotation.set(0,0,0);mag.visible=true;}
  else if(released){mag.position.set(rest[0]-.02*seconds*3,rest[1]-4.9*seconds*seconds-.3*seconds,rest[2]+.1*seconds);mag.rotation.set(seconds*2.2,0,seconds*1.4);mag.visible=mag.position.y>-.8;}
  const hand=p>0?keyed(rifleHand(model,empty),p,handScratch):LEFT_REST;model.left.position.set(hand[0],hand[1],hand[2]);
  model.left.rotation.x=p>0?-.55*Math.sin(Math.PI*THREE.MathUtils.clamp((p-.12)/.4,0,1)):0;
  if(p>=.37){if(p<.58){const tilt=THREE.MathUtils.clamp((.58-p)/.21,0,1);mag.position.set(hand[0]+.045,hand[1]+.1,hand[2]+.01);mag.rotation.set(.3*tilt,0,0);}else{mag.position.set(...model.magRest);mag.rotation.set(0,0,0);}mag.visible=true;}
  // Bolt locks back on an empty magazine and slams home on the release.
  const locked=empty&&p>0&&p<.84,boltZ=model.boltRest[2];
  if(model.kind==='hecate'){model.bolt.rotation.z=locked?1.1:keyed(BOLT_LIFT,cycle,scratch)[0];model.bolt.position.z=boltZ+(locked?.1:keyed(BOLT_SLIDE,cycle,scratch)[0]);}
  else model.bolt.position.z=boltZ+(locked?.045:0)+recoil*.18;
 }
 g.rotation.y+=Math.sin(time*1.6)*.002*(1-aim);g.position.y+=Math.sin(time*1.8)*.0015*(1-aim);if(sprint)g.rotation.x-=.2;
}

// Grip coordinates stay identical to the view models; the third-person
// weapon silhouettes use their own much smaller shared templates.
const SOLDIER_HOLD={
 minimi:{scale:.8,butt:.38,right:[0,-.105,.075],left:[0,-.06,-.3],bolt:[.06,.03,-.06]},
 mag58:{scale:.8,butt:.52,right:[0,-.105,.075],left:[0,-.045,-.24],bolt:[.065,0,-.1]},
 r870:{scale:.8,butt:.42,right:[0,-.05,.115],left:[0,-.02,-.3],bolt:[0,-.02,-.3]},
 mp5:{scale:.8,butt:.4,right:[0,-.105,.075],left:[0,-.04,-.25],bolt:[-.035,.078,-.39]},
 hecate:{scale:.8,butt:.42,right:[0,-.105,.075],left:[0,-.01,-.32],bolt:[.1,.035,.05]},
 revolver:{scale:.9,right:[0,-.07,.074],left:[-.024,-.088,.066],bolt:[-.02,0,-.01]},
 ppk:{scale:.9,right:[0,-.07,.074],left:[-.024,-.088,.066],bolt:[0,.03,.03]}
};
const HANDGUNS=new Set(['revolver','ppk']);
// Swap the carried weapon (online players change theirs).
export function equipSoldier(m,id='minimi'){
 if(!SOLDIER_HOLD[id])id='minimi';if(m.weaponId===id)return;
 if(m.weapon)m.rifle.remove(m.weapon.group);
 const hold=SOLDIER_HOLD[id],w=createSoldierWeapon(id),s=hold.scale;w.group.scale.setScalar(s);w.group.rotation.y=Math.PI;
 // Rifles pivot on the butt in the shoulder pocket, handguns on their grip.
 if(HANDGUNS.has(id))w.group.position.set(0,-hold.right[1]*s,hold.right[2]*s);else w.group.position.set(0,0,hold.butt*s);
 m.rifle.add(w.group);m.weapon=w;m.weaponId=id;m.hold=hold;
 if(m.simpleMaterials)setSoldierMaterials(w.group,true);
 if(m.castsShadow===false)castShadows(w.group,false);
 // The world flash starts at the muzzle, a little larger to read at range.
 w.group.add(m.flash);m.flash.geometry.dispose();m.flash.geometry=flashGeometry(id);m.flash.position.set(0,w.bore,w.muzzle);m.flash.scale.setScalar(1.4/s);
 // Smoke leaves from the barrel's end.
 m.muzzleTip??=new THREE.Object3D();w.group.add(m.muzzleTip);m.muzzleTip.position.set(0,m.flash.position.y,w.muzzle);
}
// Parts are batched by texture set (cloth, metal, untextured). Colour,
// roughness and metalness move to the vertices, so every part of a batch
// keeps its own source material's finish.
const soldierMaterials=new Map(),soldierBodies=new Map();
function soldierMaterial(source){
 const key=source.map??null;
 if(!soldierMaterials.has(key)){
  const material=vertexFinish(source.clone());material.color.set(0xffffff);material.vertexColors=true;
  soldierMaterials.set(key,material);
 }
 return soldierMaterials.get(key);
}
export const SOLDIER_LOD_DISTANCES=Object.freeze([14,30]);
export function createSoldier(team='red',weaponId='minimi'){
 const m=getPalette(),root=new THREE.Group(),body=new THREE.Group();root.add(body);
 const bones=[],joints={};
 function bone(name,parent,x,y,z){const b=new THREE.Bone();b.name=name;b.position.set(x,y,z);parent.add(b);bones.push(b);joints[name]=b;return b;}
 const pelvis=bone('pelvis',body,0,.82,0),spine=bone('spine',pelvis,0,.3,0),head=bone('head',spine,0,.49,0);
 const legs=[],knees=[],arms=[],elbows=[];
 for(const side of [-1,1]){const leg=bone('thigh'+side,pelvis,side*.14,0,0),knee=bone('knee'+side,leg,0,-.4,0),foot=bone('foot'+side,knee,0,-.35,.04);legs.push(leg);knees.push(knee);const arm=bone('arm'+side,spine,side*.29,.2,.04),elbow=bone('elbow'+side,arm,0,-.3,.02);arms.push(arm);elbows.push(elbow);}
 body.updateMatrixWorld(true);
 // All levels use the same bones, so a change of geometry keeps the exact
 // pose, death animation and hand placement. Rest-pose buffers are shared.
 const bodyKey=team==='blue'?'blue':'red';
 if(!soldierBodies.has(bodyKey))soldierBodies.set(bodyKey,[0,1,2].map(detail=>{
 const batches=new Map();
 function skin(geometry,b,source,x=0,y=0,z=0){if(geometry.index){const original=geometry;geometry=geometry.toNonIndexed();original.dispose();}geometry.translate(x,y,z);geometry.applyMatrix4(b.matrixWorld);const count=geometry.attributes.position.count,indices=new Uint16Array(count*4),weights=new Float32Array(count*4);for(let i=0;i<count;i++){indices[i*4]=bones.indexOf(b);weights[i*4]=1;}geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));tintGeometry(geometry,source.color);finishGeometry(geometry,source.roughness,source.metalness);const material=soldierMaterial(source);if(!batches.has(material))batches.set(material,[]);batches.get(material).push(geometry);}
 const box=(b,w,h,d,x,y,z,mat)=>skin(detail?new THREE.BoxGeometry(w,h,d):rounded(w,h,d),b,mat,x,y,z);
 const capsule=(b,r,len,x,y,z,mat,sx=1,sz=1)=>{const g=new THREE.CapsuleGeometry(r,len,detail===0?4:1,detail===0?8:detail===1?6:4);g.scale(sx,1,sz);skin(g,b,mat,x,y,z);};
 capsule(spine,.21,.19,0,0,0,m.enemy,1.13,.7);box(spine,.44,.44,.33,0,.035,.023,m.armor);box(pelvis,.4,.12,.3,0,0,0,m.black);box(spine,.28,.34,.16,0,.02,-.23,m.tan);
 if(detail<2)for(const x of [-.15,0,.15]){box(spine,.105,.17,.065,x,-.065,.21,m.tan);if(!detail)box(spine,.085,.025,.014,x,-.005,.25,m.black);}
 if(!detail){for(const y of [-.11,-.04,.03])box(spine,.34,.014,.015,0,y,.196,m.fabric);
  box(spine,.08,.16,.065,-.18,.16,-.19,m.black);box(spine,.008,.2,.008,-.18,.31,-.19,m.black);}
 const face=new THREE.SphereGeometry(.18,detail===0?16:detail===1?12:6,detail===0?12:detail===1?8:4);face.scale(.85,1.12,.85);skin(face,head,m.skin);
 // The middle level keeps a round helmet and the ear cups: with fewer
 // facets the goggles sink into the shell.
 skin(new THREE.SphereGeometry(.195,detail===0?16:detail===1?12:6,detail===0?10:detail===1?6:4,0,Math.PI*2,0,Math.PI*.61),head,m.armor,0,.05,0);
 if(detail<2){box(head,.29,.065,.075,0,.04,.143,m.black);box(head,.235,.037,.017,0,.04,.19,m.lens);}
 if(detail<2)for(const x of [-.19,.19])box(head,.045,.1,.11,x,0,0,m.black);
 for(let i=0;i<2;i++){const side=i===0?-1:1,leg=legs[i],knee=knees[i];capsule(leg,.096,.2,0,-.2,0,m.enemy,1,1.08);box(leg,.16,.12,.055,0,-.34,.11,m.armor);capsule(knee,.083,.18,0,-.16,0,m.enemy,1,1.08);box(joints['foot'+side],.2,.14,.32,0,-.01,0,m.black);box(joints['foot'+side],.205,.035,.33,0,-.075,0,m.gun);
  capsule(arms[i],.085,.16,0,-.14,0,m.enemy,1,1.1);box(arms[i],.17,.075,.19,0,-.07,.01,team==='blue'?m.blue:m.teamRed);capsule(elbows[i],.066,.17,0,-.13,0,m.enemy);box(elbows[i],.08,.1,.11,0,-.27,.01,m.black);
 }
 box(spine,.27,.065,.022,0,.24,.2,team==='blue'?m.blue:m.teamRed);
 const parts=[...batches].map(([material,geometries])=>{const geometry=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());return{material,geometry};});
 // Performance draws the whole body in one call: a single untextured
 // material needs neither UVs nor per-vertex finishes.
 const plain=parts.map(({geometry})=>{const g=geometry.clone();g.deleteAttribute('uv');g.deleteAttribute('finish');return g;}),simple=mergeGeometries(plain);plain.forEach(g=>g.dispose());
 return{parts,simple};
 }));
 const skeleton=new THREE.Skeleton(bones);
 // A fixed bound covering every pose lets off-screen soldiers be culled
 // without recomputing skinned bounds each frame.
 const bodyLevels=soldierBodies.get(bodyKey).map(({parts,simple},detail)=>{
  const group=new THREE.Group();group.visible=detail===0;body.add(group);
  const add=(geometry,material,isSimple)=>{const mesh=new THREE.SkinnedMesh(geometry,material);mesh.bind(skeleton);mesh.customDepthMaterial=skinnedDepthMaterial();mesh.castShadow=mesh.receiveShadow=true;mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,.95,0),1.45);mesh.visible=!isSimple;mesh.userData.shared=true;mesh.userData.simple=isSimple;group.add(mesh);};
  for(const {material,geometry}of parts)add(geometry,material,false);add(simple,simpleSoldierMaterial(true),true);return group;
 });
 // The weapon hangs from a holder at the shoulder pocket; the hands are
 // placed on it each frame by two-bone IK.
 const rifle=new THREE.Group();body.add(rifle);
 const flash=muzzleFlash(weaponId);
 const model={root,body,bodyLevels,detailLevel:0,scopeDetail:0,shownDetail:0,simpleMaterials:false,legs,knees,arms,elbows,head,torso:spine,spine,pelvis,flash,skeleton,rifle,phase:0,blend:0,run:0,flinch:0,fall:{x:0,z:1}};equipSoldier(model,weaponId);animateSoldier(model,{alive:true,speed:0},1);return model;
}

// Performance shows each level's merged body and gives the weapon the
// simple material; the other profiles show the textured batches.
// The shadow pass draws every caster with one depth material. Shared by
// skinned bodies and rigid props it swaps shader program at each switch,
// so skinned bodies get their own, set up like three.js's.
let skinnedDepth;
function skinnedDepthMaterial(){return skinnedDepth??=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});}
export function setSoldierQuality(model,quality){
 const simple=quality==='low';if(model.simpleMaterials===simple)return;
 for(const level of model.bodyLevels)for(const mesh of level.children)mesh.visible=mesh.userData.simple===simple;
 setSoldierMaterials(model.rifle,simple);model.simpleMaterials=simple;
}

// Ten percent hysteresis prevents geometry flicker around a threshold.
// Distance is adjusted by the viewing camera's magnification by the caller.
export function soldierDetail(detail,distance){
 while(detail<2&&distance>SOLDIER_LOD_DISTANCES[detail]*1.1)detail++;
 while(detail>0&&distance<SOLDIER_LOD_DISTANCES[detail-1]*.9)detail--;
 return detail;
}
// Every level shares the bones, so showing another keeps the exact pose.
export function showSoldierDetail(model,detail){
 if(model.shownDetail===detail)return;
 model.bodyLevels[model.shownDetail].visible=false;model.bodyLevels[detail].visible=true;model.shownDetail=detail;
}
// The world view's level; the scope keeps its own in model.scopeDetail.
export function updateSoldierLOD(model,distance){
 model.detailLevel=soldierDetail(model.detailLevel,distance);showSoldierDetail(model,model.detailLevel);
}
// A distant soldier's shadow is a few texels of the sun's map, but every
// skinned batch is drawn again for it. Each mesh remembers whether it cast
// one to begin with, so the muzzle flash never starts to.
function castShadows(object,cast){
 object.traverse(o=>{if(!o.isMesh)return;o.userData.shadowCaster??=o.castShadow;o.castShadow=cast&&o.userData.shadowCaster;});
}
export function castSoldierShadow(model,cast){
 if((model.castsShadow??true)===cast)return;
 castShadows(model.root,cast);model.castsShadow=cast;
}

const UPPER=new THREE.Vector3(0,-.3,.02).normalize(),LOWER=new THREE.Vector3(0,-1,0),UPPER_LENGTH=Math.hypot(.3,.02),FORE_LENGTH=.27;
// Elbow hints in spine space: the firing elbow out and down, the support elbow under the gun.
const POLES=[new THREE.Vector3(-.75,-1,-.2).normalize(),new THREE.Vector3(.3,-1,-.05).normalize()];
const ik={dir:new THREE.Vector3(),bend:new THREE.Vector3(),elbow:new THREE.Vector3(),tmp:new THREE.Vector3(),inverse:new THREE.Quaternion(),right:new THREE.Vector3(),left:new THREE.Vector3(),pouch:new THREE.Vector3()};
// Two-bone IK in spine space: aim the upper arm at the solved elbow, then the forearm at the hand.
function reachArm(arm,elbow,target,pole){
 const S=arm.position,dir=ik.dir.subVectors(target,S),d=THREE.MathUtils.clamp(dir.length(),.08,(UPPER_LENGTH+FORE_LENGTH)*.999);dir.normalize();
 const cos=THREE.MathUtils.clamp((UPPER_LENGTH**2+d*d-FORE_LENGTH**2)/(2*UPPER_LENGTH*d),-1,1),sin=Math.sqrt(1-cos*cos);
 const bend=ik.bend.copy(pole).addScaledVector(dir,-pole.dot(dir)).normalize(),E=ik.elbow.copy(S).addScaledVector(dir,UPPER_LENGTH*cos).addScaledVector(bend,UPPER_LENGTH*sin);
 arm.quaternion.setFromUnitVectors(UPPER,ik.tmp.subVectors(E,S).normalize());
 const fore=ik.tmp.copy(S).addScaledVector(dir,d).sub(E).normalize().applyQuaternion(ik.inverse.copy(arm.quaternion).invert());elbow.quaternion.setFromUnitVectors(LOWER,fore);
}
// Weapon-local point to spine space.
function toSpine(m,point,out){return m.spine.worldToLocal(m.weapon.group.localToWorld(out.set(point[0],point[1],point[2])));}
// Third-person reload: cant the gun, strip the magazine, fetch a fresh one
// from the chest pouch, seat it, run the bolt, back on target.
const SOLDIER_RIFLE_GUN=[[0,ZERO6],[.1,[.07,-.17,.03,-.32,0,.62]],[.62,[.07,-.17,.03,-.32,0,.62]],[.65,[.07,-.15,.04,-.24,0,.56]],[.7,[.06,-.16,.03,-.3,0,.52]],[.84,[.03,-.09,.01,-.18,0,.25]],[1,ZERO6]];
const SOLDIER_PISTOL_GUN=[[0,ZERO6],[.1,[.04,-.12,-.12,-.3,0,.3]],[.84,[.04,-.12,-.12,-.3,0,.3]],[1,ZERO6]];
const SOLDIER_REVOLVER_GUN=[[0,ZERO6],[.1,[.04,-.12,-.12,-.6,0,.3]],[.32,[.04,-.12,-.12,-.9,0,.3]],[.45,[.04,-.14,-.12,.3,0,.3]],[.84,[.04,-.14,-.12,.3,0,.3]],[1,ZERO6]];
const soldierScratch=[],soldierHand=[];
function soldierReloadHand(m,p,revolver){
 const hold=m.hold,rest=hold.left,pouch=m.weapon.group.worldToLocal(m.spine.localToWorld(ik.pouch.set(.13,-.06,.28))),P=[pouch.x,pouch.y,pouch.z];
 if(m.weaponId==='ppk'){const under=[0,-.17,.1],seat=[0,-.14,.095];return keyed([[0,rest],[.12,under],[.22,P],[.4,P],[.55,under],[.62,seat],[.75,rest],[1,rest]],p,soldierHand);}
 if(revolver){const cylinder=[-.02,.005,-.005];return keyed([[0,rest],[.12,cylinder],[.3,cylinder],[.42,P],[.55,P],[.68,cylinder],[.86,cylinder],[1,rest]],p,soldierHand);}
 const grip=[-.03,-.19,-.09],strip=[-.03,-.3,-.05],under=[-.03,-.34,-.1],seat=[-.03,-.2,-.09],bolt=hold.bolt,push=[bolt[0],bolt[1]-.015,bolt[2]+.02];
 return keyed([[0,rest],[.12,grip],[.2,strip],[.3,P],[.42,P],[.56,under],[.64,seat],[.72,bolt],[.8,bolt],[.84,push],[.97,rest],[1,rest]],p,soldierHand);
}
export function animateSoldier(m,state,dt){
 const alive=state.alive!==false;
 // Fall away from the shot: forwards or backwards, with a sideways twist.
 if(!alive){const f=m.fall||{x:0,z:1};m.body.rotation.x=THREE.MathUtils.damp(m.body.rotation.x,f.x*1.45,8,dt);m.body.rotation.z=THREE.MathUtils.damp(m.body.rotation.z,f.z*1.5,8,dt);m.body.position.y=THREE.MathUtils.damp(m.body.position.y,Math.abs(f.x)>Math.abs(f.z)?.06:.12,10,dt);m.knees.forEach(k=>k.rotation.x=THREE.MathUtils.damp(k.rotation.x,.75,6,dt));m.arms.forEach((a,i)=>a.rotation.set(THREE.MathUtils.damp(a.rotation.x,-.3-i*.5,5,dt),THREE.MathUtils.damp(a.rotation.y,0,5,dt),THREE.MathUtils.damp(a.rotation.z,0,5,dt)));m.elbows.forEach(e=>e.rotation.set(THREE.MathUtils.damp(e.rotation.x,-.4,5,dt),THREE.MathUtils.damp(e.rotation.y,0,5,dt),THREE.MathUtils.damp(e.rotation.z,0,5,dt)));m.head.rotation.x=THREE.MathUtils.damp(m.head.rotation.x,-f.x*.4,6,dt);m.rifle.rotation.x=THREE.MathUtils.damp(m.rifle.rotation.x,-f.x*1.3,6,dt);return;}
 m.body.rotation.set(0,0,0);m.body.position.y=0;if(state.weaponId)equipSoldier(m,state.weaponId);
 // On a ladder or a ledge: weapon slung across the back, hands alternating on the rungs.
 if(state.climbing){
  m.climbPhase=(m.climbPhase||0)+dt*5;const swing=Math.sin(m.climbPhase);
  m.pelvis.rotation.set(0,0,0);m.spine.rotation.set(.12,0,0);m.head.rotation.set(-.25,0,0);
  for(let i=0;i<2;i++){const s=i?-swing:swing;m.legs[i].rotation.x=-.55-.35*s;m.knees[i].rotation.x=.9+.4*s;}
  m.rifle.position.set(.05,1.3,-.24);m.rifle.rotation.set(-1.25,0,.55);m.weapon.magazine.visible=m.weaponId!=='r870';m.weapon.magazine.position.set(...m.weapon.magRest);
  m.body.updateMatrixWorld(true);
  reachArm(m.arms[0],m.elbows[0],ik.right.set(-.2,.36+.12*swing,.45),POLES[0]);reachArm(m.arms[1],m.elbows[1],ik.left.set(.2,.36-.12*swing,.45),POLES[1]);
  return;
 }
 const speed=Math.min(8,state.speed||0);m.blend=THREE.MathUtils.damp(m.blend,speed>.15?Math.min(1,speed/1.5):0,12,dt);const gait=m.blend;m.clock=(m.clock||0)+dt;
 // The legs follow the actual motion: the hips turn into a sidestep and the
 // stride runs in reverse when backing off, while the chest stays on the aim.
 const yaw=m.root.rotation.y,mx=state.moveX||0,mz=state.moveZ||0,heading=Math.atan2(Math.cos(yaw)*mx-Math.sin(yaw)*mz,Math.sin(yaw)*mx+Math.cos(yaw)*mz),side=Math.abs(heading);
 if(speed>.3){if(side>1.75)m.back=true;else if(side<1.4)m.back=false;}
 m.hip=THREE.MathUtils.damp(m.hip||0,speed>.3?THREE.MathUtils.clamp(m.back?Math.atan2(-Math.sin(heading),-Math.cos(heading)):heading,-.9,.9):0,8,dt);
 // Cadence and stride both grow with speed, so the feet do not skate.
 if(speed>.15)m.phase+=dt*Math.PI*(1.4+.4*speed)*(m.back?-1:1);const stride=Math.min(.6,.18+.12*speed);
 m.flinch=Math.max(0,(m.flinch||0)-dt*5);const flinch=Math.sin(Math.min(1,m.flinch)*Math.PI*.5);
 const handgun=HANDGUNS.has(m.weaponId),revolver=m.weaponId==='revolver',pitch=state.pitch||0,p=state.reload>0?THREE.MathUtils.clamp(1-state.reload/(state.reloadDuration||2),0,1):0;
 // Running carries the weapon at low ready; standing, it is shouldered.
 m.run=THREE.MathUtils.damp(m.run||0,speed>4.2&&p===0?1:0,6,dt);const run=m.run;
 // Bladed stance: hips and shoulders turned so the support side leads, the
 // head turned back onto the sights and leaning into the stock.
 const blade=(handgun?.16:.62)*(1-gait*.45);
 m.pelvis.position.y=.82+Math.cos(m.phase*2)*.013*gait;m.pelvis.rotation.set(0,-blade*.5+m.hip,0);
 m.spine.rotation.set((state.crouch?.06:0)+.06+gait*.04+run*.05-flinch*.32,-blade*.5-m.hip+Math.sin(m.phase)*.025*gait,flinch*.12);
 for(let i=0;i<2;i++){const phase=m.phase+i*Math.PI;m.legs[i].rotation.x=Math.sin(phase)*stride*gait+(i?-.12:.1)*(1-gait);m.knees[i].rotation.x=Math.max(0,-Math.sin(phase))*stride*1.2*gait+(state.crouch?.12:0)+.05*(1-gait);}
 const look=p>0?Math.sin(Math.PI*Math.min(1,p/.92))*.4:0;
 m.head.rotation.set(-pitch*.5+(handgun?.03:.12)*(1-run)+look,blade+Math.sin(m.clock*1.36)*.015*(1-gait),handgun?0:.14*(1-run)*(1-look));
 // Weapon holder: pitch with the aim, dip and cant through the reload, climb on a shot.
 const breath=Math.sin(m.clock*2)*.004*(1-gait),base=handgun?[-.06,1.44,.45]:[-.1,1.37,.07];
 let px=base[0]+run*.03,py=base[1]+breath-run*(handgun?.16:.07),pz=base[2]-run*(handgun?.12:.03),rx=-pitch*.9+run*(handgun?.9:.55),rz=run*.12;
 if(p>0){const o=keyed(revolver?SOLDIER_REVOLVER_GUN:handgun?SOLDIER_PISTOL_GUN:SOLDIER_RIFLE_GUN,p,soldierScratch);px+=o[0];py+=o[1];pz+=o[2];rx+=o[3];rz+=o[5];}
 if(state.flashTime>0){rx-=.07;pz-=.025;}
 m.rifle.position.set(px,py,pz);m.rifle.rotation.set(rx,0,rz);
 m.body.updateMatrixWorld(true);
 // Magazine: stripped with the hand, stowed, the fresh one rides up to the well.
 const hold=m.hold,mag=m.weapon.magazine;let left=hold.left;
 if(p>0)left=soldierReloadHand(m,p,revolver);
 if(revolver)mag.rotation.z=p>0?keyed(REVOLVER_CRANE,p,soldierScratch)[0]:0;
 else if(handgun){mag.visible=!(p>.12&&p<.4);if(p>=.4&&p<.62)mag.position.set(left[0]+.02,left[1]+.05,left[2]);else mag.position.set(...m.weapon.magRest);}
 else{
  // A shotgun shows only the shell in the hand; a magazine is always somewhere.
  const carried=(p>.12&&p<.26)||(p>.42&&p<.64);mag.visible=m.weaponId==='r870'?p>.42&&p<.64:!(p>=.26&&p<=.42);if(carried)mag.position.set(left[0]+.03,left[1]+.1,left[2]);else mag.position.set(...m.weapon.magRest);}
 reachArm(m.arms[0],m.elbows[0],toSpine(m,hold.right,ik.right),POLES[0]);
 reachArm(m.arms[1],m.elbows[1],toSpine(m,left,ik.left),POLES[1]);
}
