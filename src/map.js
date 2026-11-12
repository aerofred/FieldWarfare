import * as THREE from 'three';
import {createWorld} from './world.js';
import {createExtraMap} from './extra-map.js';
import {pbrMaterial,worldUV} from './materials.js';
import {addDecor} from './decor.js';
import {addLadders} from './ladder-mesh.js';
import {laddersFor} from './ladders.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
let seed=715;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
export function createBattlefield(scene,id='factory'){return id==='factory'?createFactory(scene):createExtraMap(scene,id);}
export function createFactory(scene){
 const obstacles=createWorld().obstacles,solidMeshes=[];
 const mat={};for(const [name,color]of Object.entries({concrete:'#98998b',brick:'#8c7967',floor:'#787d72',steel:'#54625c',rust:'#8d6247',green:'#5b6b54',red:'#956950',yellow:'#c6ac62',dark:'#303a36'}))mat[name]=pbrMaterial(color,name);mat.glass=new THREE.MeshStandardMaterial({color:'#7a9c90',roughness:.3,metalness:.4,transparent:true,opacity:.27,side:THREE.DoubleSide});mat.light=new THREE.MeshBasicMaterial({color:'#ffe2a1'});
 const boxGeo=new THREE.BoxGeometry(1,1,1);
 function box(w,h,d,x,y,z,material=mat.concrete,solid=false,shadow=true){const m=new THREE.Mesh(boxGeo,material);m.scale.set(w,h,d);m.position.set(x,y,z);m.castShadow=shadow;m.receiveShadow=true;scene.add(m);if(solid){solidMeshes.push(m);}return m;}
 function cylinder(r,h,x,y,z,material=mat.rust,r2=r,segments=12){const m=new THREE.Mesh(new THREE.CylinderGeometry(r2,r,h,segments),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;}
 function pipe(a,b,r,material=mat.rust){const v=new THREE.Vector3().subVectors(b,a),m=cylinder(r,v.length(),0,0,0,material,r,8);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return m;}
 function sign(text,x,y,z,w=3,rotation=0,color='#d6c28f'){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=160;const c=canvas.getContext('2d');c.fillStyle='#303b30';c.fillRect(0,0,512,160);c.strokeStyle='#88937a';c.lineWidth=5;c.strokeRect(10,10,492,140);c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';c.font='bold 58px Arial';c.fillText(text,256,82,460);const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;const m=new THREE.Mesh(new THREE.PlaneGeometry(w,w/3.2),new THREE.MeshStandardMaterial({map:t,roughness:.8}));m.position.set(x,y,z);m.rotation.y=rotation;scene.add(m);return m;}
 box(150,.3,150,0,-.25,0,mat.floor,false,false);box(35,.14,39,0,.02,-5,mat.concrete,false,false);
 for(const[w,d,x,z]of[[64,1,0,-32],[64,1,0,32],[1,64,-32,0],[1,64,32,0]])box(w,3.4,d,x,1.7,z,mat.brick,true);
 for(let i=-30;i<33;i+=6){box(.35,4,.35,i,2,-31.5,mat.steel);box(.35,4,.35,31.5,2,i,mat.steel);}
 box(13,8,.65,-10,4,-19,mat.brick,true);box(9,8,.65,12,4,-19,mat.brick,true);box(5,2,.8,1.5,1,-19,mat.concrete,true);box(5,1.1,.8,1.5,7.5,-19,mat.concrete);
 box(.7,6,12,-17,3,-11,mat.concrete,true);box(.7,3.8,7,-17,1.9,8.5,mat.brick,true);box(.7,7,15,18,3.5,-11,mat.brick,true);box(.7,2.2,7,18,1.1,10,mat.concrete,true);
 for(const x of[-16,1,17])for(const z of[-18,-5,12]){box(.48,10.5,.48,x,5.25,z,mat.steel,true);box(.8,.35,.8,x,.25,z,mat.concrete);}
 for(const z of[-18,-5,12]){box(34,.35,.35,.5,10,z,mat.steel);box(34,.18,.25,.5,8.8,z,mat.rust);for(let x=-15;x<17;x+=4){pipe(new THREE.Vector3(x,8.8,z),new THREE.Vector3(x+2,10,z),.07);pipe(new THREE.Vector3(x+2,10,z),new THREE.Vector3(x+4,8.8,z),.07);}}
 for(const x of[-16,-8,1,9,17])box(.15,.2,31,x,10,-3,mat.rust);
 box(9,.15,13,-12,10.25,-11,mat.green);box(7,.15,9,13,10.25,7,mat.green);box(5,.15,13,3,10.25,-12,mat.rust);
 for(let x=-15;x<-4;x+=2.1){box(1.9,3,.08,x,5.4,-18.63,mat.dark);for(let y=4.1;y<7;y+=1.25){box(1.8,1.1,.05,x,y,-18.56,mat.glass,false,false);box(1.9,.06,.09,x,y+.6,-18.49,mat.steel);}box(.07,3.6,.12,x,5.6,-18.45,mat.steel);}
 sign('FONDERIE 07',7.7,7.5,-18.6,8);sign('ZONE A',-16.6,2.7,9,2.5,Math.PI/2);sign('DANGER',17.6,4,-8,3,-Math.PI/2,'#e0ab57');
 box(33,.6,1.15,0,8.6,-4,mat.yellow);box(3,.8,2.1,5,8.1,-4,mat.dark);pipe(new THREE.Vector3(5,8,-4),new THREE.Vector3(5,4.2,-4),.04,mat.steel);const hook=new THREE.Mesh(new THREE.TorusGeometry(.24,.06,6,12,Math.PI*1.6),mat.rust);hook.position.set(5,4.2,-4);scene.add(hook);for(let i=-15;i<15;i+=1.2)box(.45,.1,1.2,i,8.96,-4,mat.dark,false,false).rotation.y=.55;
 for(const[x,z,r]of[[-10,-7,0],[7,-11,0],[-5,0,Math.PI/2]]){const w=r?4.2:2.2,d=r?2.2:4.2;box(w,1.1,d,x,.55,z,mat.green,true);box(w*.75,.65,d*.65,x,1.42,z,mat.steel);box(1.3,2.4,1.1,x-.25,1.2,z-1.1,mat.green);const wheel=new THREE.Mesh(new THREE.TorusGeometry(.48,.065,6,16),mat.rust);wheel.position.set(x+w/2+.05,1.15,z);wheel.rotation.y=Math.PI/2;scene.add(wheel);cylinder(.4,1.5,x,1.8,z,mat.dark);}
 box(3.8,1.5,2.2,10,.75,3,mat.concrete,true);box(4.3,.25,2.6,10,1.63,3,mat.steel);
 for(const x of[-12,-10.5,-9]){cylinder(.57,2.4,x,1.2,-14);pipe(new THREE.Vector3(x,2.4,-14),new THREE.Vector3(x,5.6,-14),.15);pipe(new THREE.Vector3(x,5.6,-14),new THREE.Vector3(x,5.6,-18),.15);}
 function container(x,z,rot,color){const w=rot?2.8:7,d=rot?7:2.8;box(w,2.9,d,x,1.45,z,color,true);box(w+.12,.1,d+.12,x,2.95,z,mat.rust);for(let i=0;i<16;i++){const t=(i/15-.5)*6.8;if(rot){box(.05,2.65,.06,x+1.42,1.5,z+t,mat.steel);box(.05,2.65,.06,x-1.42,1.5,z+t,mat.steel);}else{box(.06,2.65,.05,x+t,1.5,z+1.42,mat.steel);box(.06,2.65,.05,x+t,1.5,z-1.42,mat.steel);}}for(const o of[-.65,.65])if(rot)box(.07,2.7,.08,x+o,1.4,z+3.52,mat.steel);else box(.08,2.7,.07,x+3.52,1.4,z+o,mat.steel);}
 container(24,12,true,mat.green);container(-24,1,true,mat.red);container(5,22,false,mat.green);container(-14,24,false,mat.red);container(24,-25,false,mat.rust);sign('N° 047 — LOGISTICS',5,1.6,23.44,4.3);
 function barricade(x,z,rot=false){box(rot?.9:4,1.05,rot?4:.9,x,.525,z,mat.dark,true);for(let row=0;row<3;row++)for(let j=0;j<5;j++){const t=(j-2)*.78+(row%2)*.2,m=box(rot?.8:.75,.32,rot?.75:.8,rot?x:x+t,.18+row*.31,rot?z+t:z,mat.concrete);m.rotation.y=(random()-.5)*.1;}}
 barricade(-5,15);barricade(10,13);barricade(25,-6,true);barricade(-23,14);barricade(5,-25);
 for(const[x,z]of[[-5,-11],[14,7],[-12,15],[20,-15],[-21,-23],[1,7]]){box(1.5,1.4,1.5,x,.7,z,mat.green,true);for(const o of[-.5,.5]){box(.12,1.45,1.54,x+o,.73,z,mat.rust);box(1.54,1.45,.12,x,.73,z+o,mat.rust);}box(1.45,.95,1.45,x+.2,1.9,z+.1,mat.green);}
 for(const[x,z]of[[-2,12],[-1,13],[15,-14],[16,-13],[26,4],[-21,-13]]){cylinder(.48,.95,x,.5,z);cylinder(.5,.06,x,.96,z,mat.steel);}
 for(const[x,z,h]of[[-24,-26,17],[-20,-27,13],[27,-12,14]]){cylinder(1.8,h,x,h/2,z,mat.concrete);cylinder(1.95,.3,x,h-1,z);cylinder(1.95,.3,x,3,z);}
 for(const[x,z,h]of[[-24,-41,38],[5,-47,45],[26,-45,31]]){cylinder(1.3,h,x,h/2,z,mat.brick,1.05);for(let y=5;y<h;y+=6)cylinder(1.36,.2,x,y,z,mat.dark);box(7,9,9,x,4.5,z+3,mat.brick);}
 for(let i=0;i<8;i++)box(10,7+random()*7,12,-53+i*15,3,-48,mat.green);
 pipe(new THREE.Vector3(-28,5,-20),new THREE.Vector3(-28,5,23),.35);pipe(new THREE.Vector3(-28,5,23),new THREE.Vector3(-28,.3,23),.35);for(let z=-20;z<=23;z+=8){box(.3,5,.3,-28,2.5,z,mat.steel);box(1.6,.1,.3,-28,4.5,z,mat.steel);}
 const marking=new THREE.MeshStandardMaterial({color:'#c7b467',roughness:1});for(let z=-29;z<30;z+=4){box(.1,.014,2,20,.17,z,marking,false,false);box(.1,.014,2,-19,.17,z,marking,false,false);}for(const x of[-1.25,1.25])box(.07,.06,47,x,.18,-6,mat.rust,false,false);for(let z=-28;z<17;z+=1.6)box(3.2,.04,.18,0,.14,z,mat.dark,false,false);
 const rubble=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),mat.concrete,240),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),scale=new THREE.Vector3();for(let i=0;i<240;i++){const s=.06+random()*.24;p.set((random()-.5)*58,s*.35,(random()-.5)*58);q.setFromEuler(new THREE.Euler(random()*3,random()*3,0));scale.set(s*2,s*.6,s);matrix.compose(p,q,scale);rubble.setMatrixAt(i,matrix);}rubble.receiveShadow=true;scene.add(rubble);
 const blade=new THREE.BufferGeometry();blade.setAttribute('position',new THREE.Float32BufferAttribute([-.1,0,0,.07,.5,0,0,.8,.04,.1,0,0,-.05,.45,.02,0,.8,.04],3));blade.computeVertexNormals();const weeds=new THREE.InstancedMesh(blade,new THREE.MeshStandardMaterial({color:'#586746',side:THREE.DoubleSide,roughness:1}),650);for(let i=0;i<650;i++){const side=random()>.5?-1:1;let x=side*(18+random()*12),z=(random()-.5)*60;if(i%3===0){x=(random()-.5)*60;z=side*(27+random()*4);}p.set(x,.05,z);q.setFromEuler(new THREE.Euler(0,random()*Math.PI,random()*.3));scale.setScalar(.4+random());matrix.compose(p,q,scale);weeds.setMatrixAt(i,matrix);}scene.add(weeds);
 for(const[x,z]of[[-8,-5],[9,-5],[-8,11]]){pipe(new THREE.Vector3(x,9,z),new THREE.Vector3(x,7.4,z),.025,mat.dark);cylinder(.35,.25,x,7.3,z,mat.dark,.08);cylinder(.25,.03,x,7.16,z,mat.light);const l=new THREE.PointLight('#ffd39b',13,10,2);l.position.set(x,6.9,z);scene.add(l);}
 box(3.2,3.4,2.4,13,1.7,-16,mat.dark,true);box(1.4,.8,.1,13,1.1,-14.76,new THREE.MeshBasicMaterial({color:'#c97631'}));const fl=new THREE.PointLight('#ff913e',22,9,2);fl.position.set(13,1.4,-13.6);scene.add(fl);
 const particles=new Float32Array(240*3);for(let i=0;i<particles.length;i+=3){particles[i]=(random()-.5)*64;particles[i+1]=random()*13;particles[i+2]=(random()-.5)*64;}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(particles,3));const dust=new THREE.Points(geo,new THREE.PointsMaterial({color:'#d8d4ab',size:.035,transparent:true,opacity:.35,depthWrite:false}));scene.add(dust);
 // Batch the static factory by material. Keep original collision meshes out of
 // the render tree, with their world matrices intact for accurate ray casting.
 scene.updateMatrixWorld(true);const batches=new Map();
 for(const m of [...scene.children])if(m.isMesh&&!m.isInstancedMesh){const key=m.material.uuid+':'+m.castShadow+':'+m.receiveShadow;if(!batches.has(key))batches.set(key,{material:m.material,cast:m.castShadow,receive:m.receiveShadow,geometries:[]});batches.get(key).geometries.push(worldUV(m.geometry.clone().applyMatrix4(m.matrixWorld)));scene.remove(m);}
 for(const batch of batches.values()){const geometry=mergeGeometries(batch.geometries);const mesh=new THREE.Mesh(geometry,batch.material);mesh.castShadow=batch.cast;mesh.receiveShadow=batch.receive;scene.add(mesh);batch.geometries.forEach(g=>g.dispose());}
 addDecor(scene,'factory',mat);addLadders(scene,laddersFor('factory'));
 return{obstacles,solidMeshes,mat,dust,box,sign};
}
