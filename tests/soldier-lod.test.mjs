import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSoldier,animateSoldier,equipSoldier,updateSoldierLOD,createWeapon,castSoldierShadow} from '../src/models.js';
import {createSoldierWeapon} from '../src/soldier-weapons.js';
import {vertexFinish} from '../src/model-batching.js';
import {Visuals,QUALITY} from '../src/visuals.js';
import {Game} from '../src/game.js';
import {WEAPONS} from '../src/rules.js';

// Box of a weapon's own surfaces, without its muzzle flash.
const extent=(group,skip)=>{const box=new THREE.Box3(),part=new THREE.Box3();group.updateMatrixWorld(true);group.traverse(o=>{if(o.isMesh&&o!==skip){o.geometry.computeBoundingBox();box.union(part.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));}});return box;};
const triangles=group=>{let count=0;group.traverseVisible(o=>{if(o.isMesh)count+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});return count;};

test('third-person weapons keep their muzzle and magazine anchors with a small geometry budget',()=>{
 const model=createSoldier(),position=new THREE.Vector3(),firstPersonTriangles=triangles(createWeapon().group);
 for(const {id}of WEAPONS){
  equipSoldier(model,id);const reference=createWeapon(id,{hands:false}),weapon=model.weapon;
  assert.equal(weapon.muzzle,reference.muzzle,id);assert.equal(weapon.bore,reference.bore,id);
  assert.deepEqual(weapon.magRest,reference.magRest??[-.012,-.022,-.004],id);
  animateSoldier(model,{alive:true,weaponId:id,reload:1,reloadDuration:2},1/60);model.root.updateMatrixWorld(true);
  model.muzzleTip.getWorldPosition(position);assert.ok(position.toArray().every(Number.isFinite),id);
  assert.ok(triangles(weapon.group)<600,id+' third-person geometry budget');
  let meshes=0;weapon.group.traverseVisible(o=>{if(o.isMesh&&o!==model.flash)meshes++;});assert.ok(meshes<=2,id);
 }
 assert.equal(triangles(createWeapon().group),firstPersonTriangles,'first-person geometry is unchanged by soldier construction');
});

// Width is not compared: bolt handles and side rails are left off the silhouettes.
test('third-person silhouettes keep the length and height of their view models',()=>{
 for(const {id}of WEAPONS){
  const reference=createWeapon(id,{hands:false}),view=extent(reference.group,reference.flash),silhouette=extent(createSoldierWeapon(id).group);
  for(const [axis,tolerance]of [['z',.02],['y',.025]])for(const end of ['min','max'])assert.ok(Math.abs(view[end][axis]-silhouette[end][axis])<tolerance,`${id} ${axis} ${end}: ${view[end][axis]} / ${silhouette[end][axis]}`);
 }
});

test('soldier batches retain team and skin colours with three materials and one merged body per level',()=>{
 for(const [team,hex]of [['blue','#70afcf'],['red','#bc7156']]){
  const model=createSoldier(team),teamColour=new THREE.Color(hex),skinColour=new THREE.Color('#b19679');
  for(const level of model.bodyLevels){
   assert.equal(level.children.filter(mesh=>!mesh.userData.simple).length,3);assert.equal(level.children.filter(mesh=>mesh.userData.simple).length,1);
   let teamFound=false,skinFound=false;
   for(const mesh of level.children){
    assert.ok(mesh.material.vertexColors);const colours=mesh.geometry.attributes.color;
    assert.equal(colours.count,mesh.geometry.attributes.position.count);
    for(let i=0;i<colours.count;i++){
     const matches=c=>Math.abs(colours.getX(i)-c.r)<1e-6&&Math.abs(colours.getY(i)-c.g)<1e-6&&Math.abs(colours.getZ(i)-c.b)<1e-6;
     teamFound||=matches(teamColour);skinFound||=matches(skinColour);
    }
   }
   assert.ok(teamFound,team+' remains identifiable');assert.ok(skinFound,'face retains its colour');
  }
 }
});

test('distance LOD reduces triangles, keeps the same pose and avoids threshold flicker',()=>{
 const model=createSoldier(),counts=[],vertex=new THREE.Vector3();
 animateSoldier(model,{alive:true,speed:3,pitch:.3,reload:.8,reloadDuration:2},1/60);
 const rotations=model.skeleton.bones.map(b=>b.quaternion.toArray());
 for(const [distance,expected]of [[0,0],[20,1],[40,2],[30,2],[26,1],[14,1],[12,0]]){
  updateSoldierLOD(model,distance);assert.equal(model.detailLevel,expected);
  assert.equal(model.bodyLevels.filter(l=>l.visible).length,1);
  if(counts.length<3)counts.push(triangles(model.root));
  model.root.updateMatrixWorld(true);model.skeleton.update();
  for(const mesh of model.bodyLevels[expected].children)for(const i of [0,Math.floor(mesh.geometry.attributes.position.count/2),mesh.geometry.attributes.position.count-1]){
   mesh.getVertexPosition(i,vertex);assert.ok(vertex.toArray().every(Number.isFinite));
  }
 }
 assert.ok(counts[1]<counts[0]*.4,JSON.stringify(counts));assert.ok(counts[2]<counts[1]*.8,JSON.stringify(counts));
 assert.deepEqual(model.skeleton.bones.map(b=>b.quaternion.toArray()),rotations);
});

test('zoomed and scoped targets use the geometry their apparent size requires, the lens only inside the scope',()=>{
 const model=createSoldier(),camera=new THREE.PerspectiveCamera(78,1,.05,180);camera.position.y=1;
 model.root.position.z=-60;let scoped=false,lensDetail;
 const shown=()=>model.bodyLevels.findIndex(l=>l.visible);
 const visual=Object.create(Visuals.prototype);visual.game={camera,bots:[{model}]};visual.scope={scoped:()=>scoped,render:()=>{lensDetail=shown();}};
 visual.updateSoldiers();assert.equal(model.detailLevel,2);
 scoped=true;camera.fov=58;visual.updateSoldiers();assert.equal(model.scopeDetail,0,'4x scope restores close geometry');assert.equal(model.detailLevel,2,'the world around the lens stays coarse');
 visual.renderScope(true);assert.equal(lensDetail,0,'the lens pass draws the scope level');assert.equal(shown(),2,'the world level returns after it');
 scoped=false;camera.fov=78;model.root.position.z=-18;visual.updateSoldiers();assert.equal(model.detailLevel,1);
 camera.fov=50;visual.updateSoldiers();assert.equal(model.detailLevel,0,'iron-sight zoom is included');
});

test('batched parts keep their own roughness and metalness',()=>{
 const finishes=mesh=>{const f=mesh.geometry.attributes.finish,out=new Set();for(let i=0;i<f.count;i++)out.add(f.getX(i).toFixed(2)+'/'+f.getY(i).toFixed(2));return [...out];};
 const body=new Set(createSoldier().bodyLevels[0].children.filter(mesh=>!mesh.userData.simple).flatMap(finishes));
 for(const finish of ['0.20/0.00','1.00/0.85','1.00/0.35','0.85/0.00','1.00/0.00'])assert.ok(body.has(finish),finish+' (lens, gun, black, skin, cloth)');
 const r870=new Set(createSoldierWeapon('r870').group.children.filter(o=>o.isMesh).flatMap(finishes));
 assert.ok(r870.has('0.88/0.00'),'the wooden stock is not metallic');assert.ok(r870.has('0.55/0.85'),'the barrel is');
 const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
 vertexFinish(new THREE.MeshStandardMaterial()).onBeforeCompile(shader);
 assert.match(shader.vertexShader,/vFinish=finish;/);assert.match(shader.fragmentShader,/roughnessFactor\*=vFinish\.x;/);assert.match(shader.fragmentShader,/metalnessFactor\*=vFinish\.y;/);
});

test('shared body and weapon buffers survive despawning another soldier',()=>{
 const a=createSoldier(),b=createSoldier();assert.notEqual(a.skeleton,b.skeleton);
 const geometry=b.bodyLevels[0].children[0].geometry,weaponGeometry=b.weapon.group.children[0].geometry;
 assert.equal(geometry,a.bodyLevels[0].children[0].geometry);assert.equal(weaponGeometry,a.weapon.group.children[0].geometry);
 let disposed=0;geometry.addEventListener('dispose',()=>disposed++);weaponGeometry.addEventListener('dispose',()=>disposed++);
 const scene=new THREE.Scene();scene.add(a.root,b.root);Game.prototype.disposeActor.call({scene},{model:a});
 assert.equal(disposed,0);assert.ok(scene.children.includes(b.root));
 animateSoldier(b,{alive:true,speed:3},1/60);b.root.updateMatrixWorld(true);b.skeleton.update();
});

test('soldiers at the coarsest level stop casting shadows on the balanced profile only',()=>{
 const casters=m=>{let n=0;m.root.traverse(o=>{if(o.isMesh&&o.castShadow)n++;});return n;};
 const model=createSoldier(),camera=new THREE.PerspectiveCamera(78,1,.05,180),all=casters(model);camera.position.y=1;
 const visual=Object.create(Visuals.prototype);visual.game={camera,bots:[{model}]};visual.scope={scoped:()=>false};
 assert.equal(model.flash.castShadow,false);
 for(const [quality,z,expected]of [['medium',-60,0],['medium',-10,all],['high',-60,all],['low',-60,0]]){
  visual.quality=quality;model.root.position.z=z;visual.updateSoldiers();
  assert.equal(casters(model),expected,`${quality} at ${-z} m`);
 }
 visual.quality='medium';model.root.position.z=-60;visual.updateSoldiers();equipSoldier(model,'hecate');
 assert.equal(casters(model),0,'a weapon picked up at range casts no shadow');
 castSoldierShadow(model,true);assert.ok(casters(model)>0);assert.equal(model.flash.castShadow,false,'the muzzle flash never casts one');
 assert.equal(QUALITY.high.farShadows,true);
});

test('Performance leaves out every point light and the balanced profile redraws the sun shadow every other frame',()=>{
 const mapRoot=new THREE.Group(),lamp=new THREE.PointLight(),nested=new THREE.PointLight(),blastLight=new THREE.PointLight(),post=new THREE.Group();
 post.add(nested);mapRoot.add(lamp,post);lamp.castShadow=true;
 const visual=Object.create(Visuals.prototype);visual.game={mapRoot,blastLight};
 visual.setLights(QUALITY.low.lights);for(const l of [lamp,nested,blastLight])assert.equal(l.visible,false);assert.equal(lamp.castShadow,false);
 visual.setLights(QUALITY.medium.lights);for(const l of [lamp,nested,blastLight])assert.equal(l.visible,true);
 const shadow={needsUpdate:false},redraws=quality=>{visual.quality=quality;visual.shadowFrame=0;let n=0;for(let i=0;i<10;i++){visual.scheduleShadows();if(shadow.needsUpdate)n++;shadow.needsUpdate=false;}return n;};
 visual.game.sun={shadow};assert.equal(redraws('medium'),5);assert.equal(redraws('high'),10);
});
