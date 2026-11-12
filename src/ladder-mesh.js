import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {pbrMaterial} from './materials.js';

// Steel ladders bolted to the faces listed in ladders.js: two rails with grab
// handles above the roof edge and round rungs every 30 cm, merged in one mesh.
export function addLadders(scene,ladders){
 if(!ladders.length)return null;
 const parts=[];
 for(const l of ladders){
  const angle=Math.atan2(l.nx,l.nz),place=g=>{g.rotateY(angle);g.translate(l.x+l.nx*.08,0,l.z+l.nz*.08);const flat=g.index?g.toNonIndexed():g;if(flat!==g)g.dispose();parts.push(flat);};
  for(const side of [-.23,.23]){
   place(new THREE.BoxGeometry(.05,l.top+.85,.05).translate(side,(l.top+.85)/2,0));
   place(new THREE.BoxGeometry(.05,.05,.2).translate(side,l.top+.83,-.08));// handle bends back over the roof
   for(const y of [.35,l.top-.35])place(new THREE.BoxGeometry(.04,.04,.1).translate(side,y,-.05));// wall brackets
  }
  for(let y=.3;y<l.top+.05;y+=.3)place(new THREE.CylinderGeometry(.018,.018,.46,6).rotateZ(Math.PI/2).translate(0,y,0));
 }
 const mesh=new THREE.Mesh(mergeGeometries(parts),pbrMaterial('#5e6a63','steel',{metalness:.7}));parts.forEach(g=>g.dispose());
 mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);return mesh;
}
