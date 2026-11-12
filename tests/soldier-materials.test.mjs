import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSoldier,equipSoldier,setSoldierQuality,updateSoldierLOD} from '../src/models.js';
import {Visuals} from '../src/visuals.js';
import {WEAPONS} from '../src/rules.js';

// Only what is drawn: Performance hides the textured batches.
const surfaces=model=>{const meshes=[];model.body.traverseVisible(o=>{if(o.isMesh&&o!==model.flash)meshes.push(o);});return meshes;};
function assertSimple(model){
 for(const mesh of surfaces(model)){
  const material=mesh.material;assert.ok(material.isMeshLambertMaterial);assert.ok(material.vertexColors);
  for(const key of ['map','normalMap','roughnessMap','metalnessMap','envMap'])assert.ok(!material[key],key+' is disabled');
  assert.equal(mesh.geometry.attributes.color.count,mesh.geometry.attributes.position.count);
 }
}

test('Performance draws one simple body mesh per soldier while preserving shared detailed materials',()=>{
 const model=createSoldier('blue'),other=createSoldier('blue'),originals=new Map(surfaces(model).map(mesh=>[mesh,mesh.material])),flash=model.flash.material;
 const bodies=()=>surfaces(model).filter(mesh=>mesh.isSkinnedMesh);
 setSoldierQuality(model,'low');assertSimple(model);assert.equal(model.flash.material,flash,'muzzle effects keep their additive material');
 assert.equal(bodies().length,1,'one body draw call');
 for(const mesh of surfaces(other))assert.ok(mesh.material.isMeshStandardMaterial,'another soldier keeps its own quality');
 for(const distance of [20,40,0]){updateSoldierLOD(model,distance);assertSimple(model);assert.equal(bodies().length,1);}
 const team=new THREE.Color('#70afcf'),colours=bodies()[0].geometry.attributes.color;let teamFound=false;
 for(let i=0;i<colours.count&&!teamFound;i++)teamFound=Math.abs(colours.getX(i)-team.r)<1e-6&&Math.abs(colours.getY(i)-team.g)<1e-6&&Math.abs(colours.getZ(i)-team.b)<1e-6;
 assert.ok(teamFound,'team colours remain intact');
 for(const quality of ['medium','low','high']){
  setSoldierQuality(model,quality);
  if(quality==='low')assertSimple(model);else{assert.deepEqual(surfaces(model),[...originals.keys()],'the textured batches return');for(const [mesh,original]of originals)assert.equal(mesh.material,original,'restore the original PBR material');}
 }
});

test('every weapon equipped in Performance immediately uses simple materials and can restore PBR',()=>{
 const model=createSoldier();setSoldierQuality(model,'low');
 for(const {id}of WEAPONS){equipSoldier(model,id);assertSimple(model);assert.equal(model.flash.material.isMeshBasicMaterial,true);}
 setSoldierQuality(model,'medium');for(const mesh of surfaces(model))assert.ok(mesh.material.isMeshStandardMaterial);
});

test('new soldiers inherit Performance before rendering and follow later profile changes',()=>{
 const model=createSoldier(),visual=Object.create(Visuals.prototype);
 visual.game={camera:new THREE.PerspectiveCamera(78,1,.05,180),bots:[{model}]};visual.scope={scoped:()=>false};
 visual.quality='low';visual.updateSoldiers();assertSimple(model);
 visual.quality='high';visual.updateSoldiers();for(const mesh of surfaces(model))assert.ok(mesh.material.isMeshStandardMaterial);
});
