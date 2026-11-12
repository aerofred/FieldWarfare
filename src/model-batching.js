import * as THREE from 'three';

// Material colours are already linear: keep them in vertex colours when
// combining parts, so colour changes do not require another draw call.
export function tintGeometry(geometry,color){
 const values=new Float32Array(geometry.attributes.position.count*3);
 for(let i=0;i<values.length;i+=3){values[i]=color.r;values[i+1]=color.g;values[i+2]=color.b;}
 geometry.setAttribute('color',new THREE.BufferAttribute(values,3));return geometry;
}

// Roughness and metalness per vertex, for the same reason: wood, cloth,
// lenses and steel keep their own finish inside one batch.
export function finishGeometry(geometry,roughness,metalness){
 const values=new Float32Array(geometry.attributes.position.count*2);
 for(let i=0;i<values.length;i+=2){values[i]=roughness;values[i+1]=metalness;}
 geometry.setAttribute('finish',new THREE.BufferAttribute(values,2));return geometry;
}
// The material's own factors become 1; its roughness map, if any, still
// modulates the vertex values as it modulated the original materials'.
export function vertexFinish(material){
 material.roughness=material.metalness=1;
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 finish;\nvarying vec2 vFinish;').replace('#include <begin_vertex>','#include <begin_vertex>\nvFinish=finish;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vFinish;').replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor*=vFinish.x;').replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor*=vFinish.y;');
 };
 material.customProgramCacheKey=()=>'vertex-finish';
 return material;
}
