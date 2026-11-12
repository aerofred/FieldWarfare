import {collides} from './collision.js';
import {t} from './i18n.js';
export {collides,moveWithCollision} from './collision.js';
// spread / aimSpread: cone at the hip and fully aimed; aimTime: seconds to
// raise the sights; ready: delay before firing after a sprint; mobility:
// share of the walking speed; falloff: [full damage up to, lowest from,
// lowest share]; pellets: projectiles per shot, each dealing damage;
// suppressed: quiet report and small flash, not located by ear.
export const WEAPONS = [
  { id:'minimi',name:'LMG-5.56',short:'LMG-5.56',category:t('data.weapon.minimi.category'),caliber:'5.56 × 45 MM',capacity:100,reserve:200,damage:26,interval:.1,reload:4.5,spread:.016,aimSpread:.004,aimTime:.25,ready:.2,mobility:.9,range:100,falloff:[40,100,.7],recoil:.018,auto:true,stats:[52,78,74],description:t('data.weapon.minimi.description') },
  { id:'mag58',name:'MMG-7.62',short:'MMG-7.62',category:t('data.weapon.mag58.category'),caliber:'7.62 × 51 MM',capacity:100,reserve:200,damage:34,interval:.08,reload:5.5,spread:.05,aimSpread:.02,aimTime:.5,ready:.45,mobility:.8,range:90,falloff:[30,80,.6],recoil:.03,auto:true,stats:[72,92,30],description:t('data.weapon.mag58.description') },
  { id:'r870',name:'SG-12',short:'SG-12',category:t('data.weapon.r870.category'),caliber:t('data.weapon.r870.caliber'),capacity:6,reserve:30,damage:17,pellets:8,interval:.85,reload:3,spread:.09,aimSpread:.075,aimTime:.2,ready:.14,mobility:1,range:25,falloff:[6,25,0],recoil:.09,auto:false,stats:[96,22,15],description:t('data.weapon.r870.description') },
  { id:'hecate',name:'SR-12.7',short:'SR-12.7',category:t('data.weapon.hecate.category'),caliber:'12.7 × 99 MM',capacity:5,reserve:25,damage:120,interval:1.5,reload:3.8,spread:.06,aimSpread:.0004,aimTime:.4,ready:.3,mobility:.88,range:200,falloff:[200,200,1],recoil:.12,auto:false,scope:true,stats:[100,8,100],description:t('data.weapon.hecate.description') },
  { id:'mp5',name:'SMG-9S',short:'SMG-9S',category:t('data.weapon.mp5.category'),caliber:'9 × 19 MM',capacity:30,reserve:210,damage:21,interval:.068,reload:1.6,spread:.013,aimSpread:.0023,aimTime:.2,ready:.14,mobility:1,range:42,falloff:[0,42,.5],recoil:.016,auto:true,suppressed:true,stats:[45,95,68],description:t('data.weapon.mp5.description') },
  // Sidearms: every operator carries one of them besides the main weapon.
  { id:'revolver',name:'RV-357',short:'RV-357',category:t('data.weapon.revolver.category'),caliber:'.357 MAGNUM',capacity:6,reserve:36,damage:58,interval:.4,reload:2.7,spread:.007,aimSpread:.0013,aimTime:.2,ready:.14,mobility:1,range:50,falloff:[0,50,.5],recoil:.065,auto:false,sidearm:true,stats:[86,25,78],description:t('data.weapon.revolver.description') },
  { id:'ppk',name:'PST-380S',short:'PST-380S',category:t('data.weapon.ppk.category'),caliber:'.380 ACP',capacity:8,reserve:48,damage:30,interval:.17,reload:1.5,spread:.009,aimSpread:.0017,aimTime:.12,ready:.08,mobility:1,range:35,falloff:[0,35,.5],recoil:.026,auto:false,sidearm:true,suppressed:true,stats:[44,62,70],description:t('data.weapon.ppk.description') }
];
export const SIDEARMS=WEAPONS.flatMap((w,i)=>w.sidearm?[i]:[]);
export const RELAYS=[{x:-8,z:8,name:'A',label:t('data.map.factory.relay.A')},{x:12,z:-7,name:'B',label:t('data.map.factory.relay.B')},{x:-7,z:-23,name:'C',label:t('data.map.factory.relay.C')}];
export const SPAWNS=[{x:-23,z:-24},{x:24,z:-19},{x:23,z:5},{x:-25,z:-8},{x:8,z:-27},{x:27,z:19},{x:-18,z:16}];
export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
// In free-for-all every combatant carries the team 'ffa' and fights everyone.
export const hostile=(a,b)=>!!a&&!!b&&a!==b&&(a.id===undefined||a.id!==b.id)&&(a.team==='ffa'||a.team!==b.team);
export function findPath(start,end,obstacles){
  const step=2,size=31,cell=p=>({x:clamp(Math.round((p.x+30)/step),0,size-1),z:clamp(Math.round((p.z+30)/step),0,size-1)}),a=cell(start),b=cell(end),key=p=>p.z*size+p.x;
  const open=[{...a,g:0,f:0}],came=new Map(),costs=new Map([[key(a),0]]),closed=new Set();let closest=a,best=Infinity;
  for(let loop=0;open.length&&loop<650;loop++){open.sort((a,b)=>a.f-b.f);const n=open.shift(),nk=key(n);if(closed.has(nk))continue;closed.add(nk);const h=Math.hypot(n.x-b.x,n.z-b.z);if(h<best){best=h;closest=n;}if(nk===key(b)){closest=n;break;}for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const v={x:n.x+dx,z:n.z+dz};if(v.x<0||v.z<0||v.x>=size||v.z>=size||collides(v.x*step-30,v.z*step-30,.42,obstacles))continue;const vk=key(v),g=n.g+1;if(closed.has(vk)||g>=(costs.get(vk)??Infinity))continue;costs.set(vk,g);came.set(vk,n);open.push({...v,g,f:g+Math.hypot(v.x-b.x,v.z-b.z)});}}
  const path=[];let cursor=closest;while(key(cursor)!==key(a)&&path.length<100){path.unshift({x:cursor.x*step-30,z:cursor.z*step-30});cursor=came.get(key(cursor));if(!cursor)break;}return path;
}
export const captureStep=(p,dt,inside,contested)=>clamp(p+(inside&&!contested?dt/7:contested?-dt/15:-dt/25),0,1);
// Full damage up to falloff[0] metres, then linear down to the lowest share at falloff[1].
export function damageAtDistance(damage,d,falloff,head=false){const [full,far,low]=falloff,share=d<=full?1:d>=far?low:1-(1-low)*(d-full)/(far-full);return Math.round(damage*(head?2.2:1)*share);}
// Cone of a shot, from the hip (0) to fully aimed (1).
export const shotSpread=(weapon,aimed)=>weapon.spread+(weapon.aimSpread-weapon.spread)*clamp(aimed,0,1);
export const moveSpeed=(weapon,{crouch=false,sprint=false,aim=false}={})=>(crouch?2.2:sprint?7.5:aim?2.7:4.5)*(weapon?.mobility??1);
export function formatTime(s){return `${Math.floor(Math.max(0,s)/60).toString().padStart(2,'0')}:${Math.floor(Math.max(0,s)%60).toString().padStart(2,'0')}`;}
