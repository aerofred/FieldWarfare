import * as THREE from 'three';

// Original, tileable PBR assets. Generated once per surface family, with no
// network dependency: a texture depends only on the kind of surface, never
// on the colour, so every material of a family shares one set of maps. A
// map keeps about forty materials, but only eight families of textures.
const METAL=new Set(['steel','metal','rust','gun','green','red','yellow','bus','cabinet','shed']),WOOD=new Set(['wood','roof']),FABRIC=new Set(['fabric','tan','armor','enemy','sofa','rug']),GRASS=new Set(['grass','lawn','leaves','hedge']),FLOOR=new Set(['floor','pavement','concrete']);
export const surfaceFamily=kind=>METAL.has(kind)?(kind==='rust'?'rust':'metal'):WOOD.has(kind)?'wood':FABRIC.has(kind)?'fabric':GRASS.has(kind)?'grass':kind==='brick'?'brick':FLOOR.has(kind)?'floor':'plain';
const cache=new Map();
export function surfaceMaps(kind='concrete',size=128){
 const family=surfaceFamily(kind),key=`${family}:${size}`;if(cache.has(key))return cache.get(key);
 const heights=new Float32Array(size*size),colors=new Uint8Array(size*size*4),rough=new Uint8Array(size*size*4),normal=new Uint8Array(size*size*4);
 const hash=(x,y)=>{let n=Math.imul(x+197,374761393)^Math.imul(y+331,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;};
 const noise=(x,y,period)=>{const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),v=(xx,yy)=>hash((xx+period)%period,(yy+period)%period);return THREE.MathUtils.lerp(THREE.MathUtils.lerp(v(xi,yi),v(xi+1,yi),sx),THREE.MathUtils.lerp(v(xi,yi+1),v(xi+1,yi+1),sx),sy);};
 const metal=family==='metal'||family==='rust',wood=family==='wood',fabric=family==='fabric',grass=family==='grass',brick=family==='brick',floor=family==='floor';
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=y*size+x,n=hash(x,y),cloud=noise(x/size*4,y/size*4,4)*.65+noise(x/size*13,y/size*13,13)*.35;
  let h=.48+n*.028+cloud*.025;
  if(brick){const row=Math.floor(y/32),edge=y%32<3||(x+(row%2)*32)%64<3;h=edge?.14:.63+n*.08;}
  else if(wood)h=.45+Math.sin(x*.32+Math.sin(y*.035)*2)*.05+n*.06-(x%32<2?.16:0);
  else if(fabric)h=.45+((x%4<2)===(y%4<2)?.08:-.02)+n*.03;
  else if(metal)h=.5+n*.012-(x%64<2?.07:0)+(hash(x,Math.floor(y/28))>.99?.06:0);
  else if(grass)h=.45+n*.07;
  else if(floor)h-=x%64<1||y%64<1?.08:0;
  heights[i]=h;const v=Math.round(255*(.79+(n-.5)*.12+(cloud-.5)*.09-(brick&&h<.3?.25:0))),r=Math.round(255*(metal?.43+cloud*.24:fabric?.93:.8+n*.16));
  colors.set([v,v,Math.round(v*(family==='rust'?.94:1)),255],i*4);rough.set([r,r,r,255],i*4);
 }
 // Normals from the height field, without allocating a vector per texel.
 const strength=metal?1.2:2.4,h=(xx,yy)=>heights[((yy+size)%size)*size+(xx+size)%size];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const nx=(h(x-1,y)-h(x+1,y))*strength,ny=(h(x,y-1)-h(x,y+1))*strength,length=Math.hypot(nx,ny,1),k=(y*size+x)*4;
  normal[k]=Math.round((nx/length*.5+.5)*255);normal[k+1]=Math.round((ny/length*.5+.5)*255);normal[k+2]=Math.round((1/length*.5+.5)*255);normal[k+3]=255;
 }
 const texture=(data,colorSpace=THREE.NoColorSpace)=>{const t=new THREE.DataTexture(data,size,size);t.colorSpace=colorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=4;t.needsUpdate=true;return t;};
 const maps={map:texture(colors,THREE.SRGBColorSpace),normalMap:texture(normal),roughnessMap:texture(rough)};cache.set(key,maps);return maps;
}
export function pbrMaterial(color,kind='concrete',options={}){
 return new THREE.MeshStandardMaterial({color,...surfaceMaps(kind),normalScale:new THREE.Vector2(.45,.45),roughness:1,metalness:METAL.has(kind)?.65:0,...options});
}
// World-space UV scale keeps brick, timber and concrete consistent across large/small boxes.
export function worldUV(geometry,scale=2){
 const p=geometry.attributes.position,n=geometry.attributes.normal,uv=new Float32Array(p.count*2);
 for(let i=0;i<p.count;i++){const x=Math.abs(n.getX(i)),y=Math.abs(n.getY(i)),z=Math.abs(n.getZ(i));uv[i*2]=(x>y&&x>z?p.getZ(i):p.getX(i))/scale;uv[i*2+1]=(y>x&&y>z?p.getZ(i):p.getY(i))/scale;}
 geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));return geometry;
}
