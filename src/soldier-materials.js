import * as THREE from 'three';

// Vertex colours retain uniforms, skin and team markings. Lambert lighting
// has no surface textures, normal maps or PBR reflections.
// Skinned bodies and rigid gear get separate instances: one material drawn
// by both kinds of mesh makes three.js swap its shader program, and rebuild
// the program key, at nearly every soldier part of every frame.
const simpleMaterials=new Map();
export function simpleSoldierMaterial(skinned=false){
 let m=simpleMaterials.get(skinned);
 if(!m)simpleMaterials.set(skinned,m=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true}));
 return m;
}

// Keep shared PBR materials intact so another soldier or quality profile
// can still use them. Only the mesh's material reference changes.
const detailedMaterials=new WeakMap();
export function setSoldierMaterials(root,simple){
 root.traverse(mesh=>{
  if(!mesh.isMesh)return;
  let detailed=detailedMaterials.get(mesh);
  if(simple){
   if(!detailed){if(!mesh.material.isMeshStandardMaterial)return;detailed=mesh.material;detailedMaterials.set(mesh,detailed);}
   mesh.material=simpleSoldierMaterial(!!mesh.isSkinnedMesh);
  }else if(detailed)mesh.material=detailed;
 });
}
