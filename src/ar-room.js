import {collides} from './rules.js';
import {t} from './i18n.js';

// The scanned room as a game world, apart from three.js and the native
// plugin so the server-side simulation and the tests can use it.
//
// The plugin sends a height grid of 10 cm cells, turned to follow the walls
// (see native/ar RoomScan): 0 unknown, 1 free floor, 2 and above an obstacle
// of (value - 1) cm. The largest connected stretch of floor becomes the
// arena, centred on the game's origin. Soldiers are at ROOM_SCALE (1:8, some
// 22 cm tall): a 4 × 5 m room makes a 32 × 40 m battlefield, close to the
// usual maps, so distances, sight and weapons keep their balance; a sofa is
// a wall six metres high. A larger room grows the soldiers so the arena
// still fits the navigation grid (±30 m).

export const ROOM_SCALE=1/8,MAX_HALF=29,MIN_AREA=1.5;
// Feet stand at y = 0.15 in the game: the real floor is there.
export const FLOOR_Y=.15;
const MIN_OBSTACLE=.08,HEIGHT_STEP=.05;
export const cellHeight=v=>v>=2?(v-1)/100:0;
// Free floor, a bump too low to stop a soldier included.
const isFree=v=>v===1||v>=2&&cellHeight(v)<MIN_OBSTACLE;

export function decodeCells(text){const raw=atob(text),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;}
// The plugin's grid with its cells decoded; null without a floor.
export function decodeGrid(data){
 if(!data||!Number.isFinite(data.floor)||!(data.cols>0)||!(data.rows>0)||typeof data.cells!=='string')return null;
 const cells=decodeCells(data.cells);if(cells.length!==data.cols*data.rows)return null;
 return {floor:data.floor,yaw:data.yaw||0,x0:data.x0,z0:data.z0,cell:data.cell||.1,cols:data.cols,rows:data.rows,cells,area:data.area||0,walls:data.walls||0,faces:data.faces||0,lidar:!!data.lidar};
}

// Greedy rectangles over the cells sharing a key (null: left out): a run
// along the row, then grown down while the next row matches.
export function mergeCells(cols,rows,key){
 const done=new Uint8Array(cols*rows),rects=[];
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
  const i=r*cols+c;if(done[i])continue;const k=key(i);if(k==null){done[i]=1;continue;}
  let w=1;while(c+w<cols&&!done[i+w]&&key(i+w)===k)w++;
  let h=1;grow:while(r+h<rows){for(let x=0;x<w;x++){const j=(r+h)*cols+c+x;if(done[j]||key(j)!==k)break grow;}h++;}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)done[(r+y)*cols+c+x]=1;
  rects.push({c,r,w,h,key:k});
 }
 return rects;
}
// Obstacle heights grouped by 5 cm, so neighbouring cells merge.
const heightKey=v=>v>=2&&cellHeight(v)>=MIN_OBSTACLE?Math.round(cellHeight(v)/HEIGHT_STEP):null;
export const obstacleRects=grid=>mergeCells(grid.cols,grid.rows,i=>heightKey(grid.cells[i])).map(r=>({...r,height:r.key*HEIGHT_STEP}));
export const floorRects=grid=>mergeCells(grid.cols,grid.rows,i=>isFree(grid.cells[i])?1:null);

// The largest stretch of free floor joined edge to edge.
function mainFloor(grid){
 const {cols,rows,cells}=grid,seen=new Uint8Array(cols*rows),queue=new Int32Array(cols*rows);let best=null;
 for(let start=0;start<cells.length;start++){
  if(!isFree(cells[start])||seen[start])continue;let head=0,tail=0;queue[tail++]=start;seen[start]=1;
  while(head<tail){const i=queue[head++],c=i%cols,r=(i-c)/cols;for(const [n,ok]of [[i-1,c>0],[i+1,c<cols-1],[i-cols,r>0],[i+cols,r<rows-1]])if(ok&&!seen[n]&&isFree(cells[n])){seen[n]=1;queue[tail++]=n;}}
  if(!best||tail>best.length)best=queue.slice(0,tail);
 }
 return best||new Int32Array(0);
}

// Points spread over the floor: each next one as far as possible from those
// already taken, starting from the first given.
function spread(points,count,first){
 const chosen=[first];const d=points.map(p=>Math.hypot(p.x-first.x,p.z-first.z));
 while(chosen.length<count){let k=-1;for(let i=0;i<points.length;i++)if(k<0||d[i]>d[k])k=i;if(k<0||d[k]<2)break;const p=points[k];chosen.push(p);for(let i=0;i<points.length;i++)d[i]=Math.min(d[i],Math.hypot(points[i].x-p.x,points[i].z-p.z));}
 return chosen.map(p=>({x:p.x,z:p.z}));
}

// Arena from a decoded grid: the world (walking obstacles, solids for shots
// and sight), the map settings the modes and bots read, and where it stands
// in the grid's frame (offset and scale). Null if the floor is too small.
export function buildArena(grid,{scale:wanted=ROOM_SCALE}={}){
 const {cols,rows,cells,cell,x0,z0}=grid,floor=mainFloor(grid);
 const area=floor.length*cell*cell;if(area<MIN_AREA)return null;
 let c0=Infinity,c1=-Infinity,r0=Infinity,r1=-Infinity;
 for(const i of floor){const c=i%cols,r=(i-c)/cols;c0=Math.min(c0,c);c1=Math.max(c1,c);r0=Math.min(r0,r);r1=Math.max(r1,r);}
 // Centre and scale: the arena's half size fits within MAX_HALF game metres.
 const cx=x0+(c0+c1+1)/2*cell,cz=z0+(r0+r1+1)/2*cell,half=Math.max(c1-c0+1,r1-r0+1)*cell/2,scale=Math.max(wanted,half/MAX_HALF);
 const gx=c=>(x0+c*cell-cx)/scale,gz=r=>(z0+r*cell-cz)/scale;
 const box=(r,extra)=>({minX:gx(r.c),maxX:gx(r.c+r.w),minZ:gz(r.r),maxZ:gz(r.r+r.h),...extra});
 const solids=obstacleRects(grid).map(r=>box(r,{minY:0,maxY:FLOOR_Y+r.height/scale}));
 // Everything around the main floor that is no obstacle (unknown ground,
 // floor out of reach) blocks walking only: bullets fly over it.
 const inFloor=new Uint8Array(cols*rows);for(const i of floor)inFloor[i]=1;
 const margin=1,mc0=Math.max(0,c0-margin),mc1=Math.min(cols-1,c1+margin),mr0=Math.max(0,r0-margin),mr1=Math.min(rows-1,r1+margin);
 const blocked=mergeCells(cols,rows,i=>{const c=i%cols,r=(i-c)/cols;if(c<mc0||c>mc1||r<mr0||r>mr1)return null;return inFloor[i]||heightKey(cells[i])!=null?null:1;}).map(r=>box(r,{}));
 // And a fence beyond the arena's bounds, to the edge of the world.
 const left=gx(mc0),right=gx(mc1+1),top=gz(mr0),bottom=gz(mr1+1),E=40;
 const fence=[{minX:-E,maxX:left,minZ:-E,maxZ:E},{minX:right,maxX:E,minZ:-E,maxZ:E},{minX:left,maxX:right,minZ:-E,maxZ:top},{minX:left,maxX:right,minZ:bottom,maxZ:E}].filter(b=>b.maxX>b.minX&&b.maxZ>b.minZ);
 const obstacles=[...solids.map(({minY,maxY,...b})=>b),...blocked,...fence];

 // Spawns, patrols and the rest on free cells clear of every obstacle.
 const open=[];for(let k=0;k<floor.length;k+=2){const i=floor[k],c=i%cols,r=(i-c)/cols,p={x:gx(c+.5),z:gz(r+.5)};if(!collides(p.x,p.z,.5,obstacles))open.push(p);}
 if(open.length<4)return null;
 const centre=open.reduce((a,b)=>Math.hypot(a.x,a.z)<=Math.hypot(b.x,b.z)?a:b),far=open.reduce((a,b)=>Math.hypot(a.x,a.z)>=Math.hypot(b.x,b.z)?a:b);
 const enemySpawns=spread(open,16,far),patrol=spread(open,6,centre).slice(1),near=[...open].sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z)).slice(0,4).map(p=>({...p}));
 if(patrol.length<2)patrol.push(...enemySpawns.slice(0,2));
 const relays=[0,1,2].map(i=>({...patrol[i%patrol.length],name:'ABC'[i]}));
 const config={name:t('data.map.room.name'),operation:t('data.map.room.operation'),sector:t('data.map.room.sector'),description:t('data.map.room.description'),sky:'#a7aea4',fog:'#a7aea4',sun:3,
  soloSpawn:{...centre},teamSpawns:{blue:near,red:enemySpawns.slice(0,4)},enemySpawns,patrol,relays,flags:{blue:{...centre},red:{...far}},lobby:{x:0,y:12,z:24,lookX:0,lookY:0,lookZ:0}};
 return {world:{obstacles,solids,ladders:[]},config,offset:{x:cx,y:-FLOOR_Y*scale,z:cz},scale,area,lidar:grid.lidar};
}
