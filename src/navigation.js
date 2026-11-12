import {collides,distance} from './rules.js';
import {CHARACTER_RADIUS} from './collision.js';

// Check the corridor as well as its endpoints: the factory has thin walls
// between grid cells that an endpoint-only path search would overlook.
export function walkable(a,b,obstacles,radius=CHARACTER_RADIUS+.01){
  const steps=Math.max(1,Math.ceil(distance(a,b)/.15));
  for(let i=0;i<=steps;i++){const t=i/steps;if(collides(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,radius,obstacles))return false;}
  return true;
}
// Only obstacles near the segment can block it: filtering first keeps long
// corridor checks cheap on maps with a hundred boxes.
const near=(a,b,obstacles,margin)=>{const minX=Math.min(a.x,b.x)-margin,maxX=Math.max(a.x,b.x)+margin,minZ=Math.min(a.z,b.z)-margin,maxZ=Math.max(a.z,b.z)+margin;return obstacles.filter(o=>o.maxX>=minX&&o.minX<=maxX&&o.maxZ>=minZ&&o.minZ<=maxZ);};
const clearCorridor=(a,b,obstacles)=>walkable(a,b,near(a,b,obstacles,1),CHARACTER_RADIUS+.04);

// Binary min-heap on f: keeps the open list O(log n) instead of sorting it.
// Ids and costs sit in two reused arrays: a search allocates no node objects.
class Heap{
  constructor(){this.ids=[];this.fs=[];}
  get size(){return this.ids.length;}
  clear(){this.ids.length=0;this.fs.length=0;}
  push(id,f){const ids=this.ids,fs=this.fs;ids.push(id);fs.push(f);let i=ids.length-1;while(i>0){const p=(i-1)>>1;if(fs[p]<=f)break;ids[i]=ids[p];fs[i]=fs[p];i=p;}ids[i]=id;fs[i]=f;}
  pop(){
    const ids=this.ids,fs=this.fs,top=ids[0],lastId=ids.pop(),lastF=fs.pop();
    if(ids.length){let i=0;for(;;){const l=i*2+1,r=l+1;let m=i,fm=lastF;if(l<ids.length&&fs[l]<fm){m=l;fm=fs[l];}if(r<ids.length&&fs[r]<fm){m=r;fm=fs[r];}if(m===i)break;ids[i]=ids[m];fs[i]=fs[m];i=m;}ids[i]=lastId;fs[i]=lastF;}
    return top;
  }
}
const DIRECTIONS=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]];
const octile=(a,b)=>{const dx=Math.abs(a.x-b.x),dz=Math.abs(a.z-b.z);return Math.max(dx,dz)+(Math.SQRT2-1)*Math.min(dx,dz);};

export function createNavigation(obstacles){
  const size=61,nodes=new Map(),key=(x,z)=>(z+30)*size+x+30;
  for(let z=-30;z<=30;z++)for(let x=-30;x<=30;x++)if(!collides(x,z,CHARACTER_RADIUS+.04,obstacles))nodes.set(key(x,z),{x,z,edges:[]});
  for(const node of nodes.values()){
    const local=near(node,node,obstacles,2);
    for(const [dx,dz,cost]of DIRECTIONS){
      const x=node.x+dx,z=node.z+dz;if(Math.abs(x)>30||Math.abs(z)>30)continue;
      const next=nodes.get(key(x,z));if(next&&walkable(node,next,local))node.edges.push({id:key(x,z),cost});
    }
  }
  const anchor=point=>{
    const candidates=[];
    for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){
      const x=Math.round(point.x)+dx,z=Math.round(point.z)+dz;if(Math.abs(x)>30||Math.abs(z)>30)continue;
      const node=nodes.get(key(x,z));if(node)candidates.push(node);
    }
    return candidates.sort((a,b)=>distance(a,point)-distance(b,point)).find(node=>walkable(point,node,obstacles));
  };
  // String pulling over a short look-ahead: bots walk straight across open
  // ground instead of following the grid's staircase.
  const smooth=path=>{
    if(path.length<3)return path;
    const result=[];let i=0;
    while(i<path.length-1){let j=Math.min(path.length-1,i+6);while(j>i+1&&!clearCorridor(path[i],path[j],obstacles))j--;result.push(path[j]);i=j;}
    return [path[0],...result];
  };
  // Per-search state, reused: a cell's cost, parent and closed flag count only
  // when stamped with the current search.
  const cells=size*size,cost=new Float64Array(cells),came=new Int32Array(cells),costRun=new Uint32Array(cells),closedRun=new Uint32Array(cells),open=new Heap();let run=0;
  return {findPath(start,end){
    const a=anchor(start),b=anchor(end);if(!a||!b)return [];
    const first=key(a.x,a.z),goal=key(b.x,b.z);run++;open.clear();
    cost[first]=0;costRun[first]=run;came[first]=-1;open.push(first,0);
    let closest=first,best=Infinity;
    while(open.size){
      const id=open.pop();if(closedRun[id]===run)continue;closedRun[id]=run;
      const node=nodes.get(id),h=octile(node,b);if(h<best){best=h;closest=id;}if(id===goal)break;
      const edges=node.edges;
      for(let i=0;i<edges.length;i++){const edge=edges[i],next=edge.id,g=cost[id]+edge.cost;if(closedRun[next]===run||g>=(costRun[next]===run?cost[next]:Infinity))continue;
        const p=nodes.get(next);cost[next]=g;costRun[next]=run;came[next]=id;open.push(next,g+octile(p,b));
      }
    }
    let path=[];let cursor=closest;
    while(cursor>=0){const node=nodes.get(cursor);path.unshift({x:node.x,z:node.z});if(cursor===first)break;cursor=came[cursor];}
    path=smooth(path);
    if(distance(start,path[0])<.1)path.shift();return path;
  }};
}
