import {clamp,distance,collides,hostile} from './rules.js';
import {walkable} from './navigation.js';
import {t} from './i18n.js';

export const BOT_LEVELS=Object.freeze({
  // Spread, burst and pause are tuned together so each level deals about 2.6x
  // the damage per second of the one below (2, 5, 15, 40 at 20 m in solo).
  recruit:Object.freeze({label:t('data.bot.recruit.label'),description:t('data.bot.recruit.description'),reaction:.85,think:.5,accuracy:.08,turn:2.1,sight:28,fov:190,memory:2,hearing:12,speed:.55,burst:1,pause:1.1,strafe:0,tactics:false}),
  soldier:Object.freeze({label:t('data.bot.soldier.label'),description:t('data.bot.soldier.description'),reaction:.48,think:.32,accuracy:.065,turn:3.5,sight:34,fov:220,memory:4,hearing:17,speed:.66,burst:2,pause:1.1,strafe:.28,tactics:false}),
  veteran:Object.freeze({label:t('data.bot.veteran.label'),description:t('data.bot.veteran.description'),reaction:.28,think:.22,accuracy:.045,turn:5,sight:38,fov:250,memory:6,hearing:21,speed:.74,burst:3,pause:.9,strafe:.45,tactics:true}),
  elite:Object.freeze({label:t('data.bot.elite.label'),description:t('data.bot.elite.description'),reaction:.16,think:.15,accuracy:.03,turn:6.5,sight:42,fov:270,memory:8,hearing:25,speed:.82,burst:4,pause:.34,strafe:.65,tactics:true})
});
export const validBotLevel=value=>typeof value==='string'&&Object.hasOwn(BOT_LEVELS,value);
export const botLevel=value=>validBotLevel(value)?value:'soldier';
export const botProfile=value=>BOT_LEVELS[botLevel(value)];
const angle=value=>Math.atan2(Math.sin(value),Math.cos(value));
const patrol=[{x:-8,z:8},{x:12,z:-7},{x:-7,z:-23},{x:20,z:20},{x:-22,z:16},{x:0,z:23}];

export function resetBrain(now,random=Math.random){
  return {nextThink:0,nextShot:now+.6,targetId:null,lastKnown:null,lastSeen:-Infinity,visible:false,path:[],seed:random()*Math.PI*2,side:random()<.5?-1:1,patrol:Math.floor(random()*patrol.length),burst:0,mode:'patrol',wantsFire:false,repathAt:0,cover:null,coverUntil:0,
   pace:.92+random()*.16,turnRate:0,roaming:false,pauseUntil:0,pauseYaw:0,glance:0,glanceUntil:0,strafeSide:random()<.5?-1:1,strafeUntil:0};
}
// The grid node nearest the bot can lie behind it: skip leading waypoints
// that are already in reach so a fresh path never doubles back.
function trim(bot,path,obstacles){while(path.length>1&&walkable(bot,path[1],obstacles))path.shift();return path;}

function body(p){return {x:p.x,y:.15+(p.jump||0)+(p.crouch?.75:1.15),z:p.z};}
function sees(bot,target,env,profile){
  const d=distance(bot,target);if(d>profile.sight)return false;
  const bearing=Math.atan2(-(target.x-bot.x),-(target.z-bot.z));
  if(d>4&&Math.abs(angle(bearing-(bot.yaw||0)))>profile.fov*Math.PI/360)return false;
  return env.clear(env.eye(bot),body(target));
}
function allyInLine(bot,target,actors){
  const dx=target.x-bot.x,dz=target.z-bot.z,length=dx*dx+dz*dz;if(length<.01)return false;
  return actors.some(a=>{if(a===bot||!a.alive||hostile(bot,a))return false;const t=((a.x-bot.x)*dx+(a.z-bot.z)*dz)/length;return t>0&&t<1&&Math.hypot(a.x-bot.x-dx*t,a.z-bot.z-dz*t)<.65;});
}
function findCover(bot,threat,env){
  const candidates=[];
  for(const o of env.obstacles){
    if(distance(bot,{x:(o.minX+o.maxX)/2,z:(o.minZ+o.maxZ)/2})>10)continue;
    for(const p of [{x:o.minX-.8,z:(o.minZ+o.maxZ)/2},{x:o.maxX+.8,z:(o.minZ+o.maxZ)/2},{x:(o.minX+o.maxX)/2,z:o.minZ-.8},{x:(o.minX+o.maxX)/2,z:o.maxZ+.8}]){
      if(distance(bot,p)<1||distance(bot,p)>8||collides(p.x,p.z,.4,env.obstacles))continue;
      if(!env.clear({...threat,y:1.4},{...p,y:1.15}))candidates.push(p);
    }
  }
  candidates.sort((a,b)=>distance(bot,a)-distance(bot,b));
  for(const p of candidates.slice(0,8)){const path=env.navigation.findPath(bot,p);if(path.length&&distance(path.at(-1),p)<1.5)return {point:p,path};}
  return null;
}

// Pure decisions from visible enemies, remembered sightings and recent sounds.
// env supplies geometry and the clock; neither renderer nor network is required.
export function updateBrain(bot,env,dt){
  const profile=botProfile(env.difficulty),brain=bot.brain,now=env.now,random=env.random||Math.random;
  const route=env.patrol||patrol;
  const actors=env.actors,enemies=actors.filter(a=>a!==bot&&a.alive&&hostile(bot,a));
  if(now>=brain.nextThink){
    brain.nextThink=now+profile.think*(.9+random()*.2);
    const visible=enemies.filter(a=>sees(bot,a,env,profile));
    const current=visible.find(a=>a.id===brain.targetId),target=current||visible.sort((a,b)=>distance(bot,a)-distance(bot,b))[0];
    if(target){
      if(brain.targetId!==target.id||!brain.visible){brain.nextShot=Math.max(brain.nextShot,now+profile.reaction*(.9+random()*.2));brain.burst=profile.burst;}
      brain.targetId=target.id;brain.lastKnown={x:target.x,z:target.z};brain.lastSeen=now;brain.visible=true;
    }else{
      if(brain.visible)brain.repathAt=0;
      brain.visible=false;
      const sound=enemies.filter(a=>now-(a.lastShot??-Infinity)<.45&&distance(bot,a)<profile.hearing).sort((a,b)=>distance(bot,a)-distance(bot,b))[0];
      if(sound){brain.lastKnown={x:Math.round(sound.x/4)*4,z:Math.round(sound.z/4)*4};brain.lastSeen=now;brain.mode='investigate';}
      if(now-brain.lastSeen>profile.memory){brain.targetId=null;brain.lastKnown=null;}
    }
    const threatened=bot.health<45||(bot.health<100&&now-bot.lastHit<1.5)||bot.reload>0;
    if(profile.tactics&&threatened&&brain.lastKnown&&now>=brain.coverUntil){
      const cover=findCover(bot,brain.lastKnown,env);if(cover){brain.cover=cover.point;brain.path=trim(bot,cover.path,env.obstacles);brain.coverUntil=now+2.5;}
    }
    if(brain.cover&&now>=brain.coverUntil)brain.cover=null;
    if(brain.cover)brain.mode='cover';
    else if(brain.visible)brain.mode=profile.tactics?'flank':'engage';
    else if(brain.lastKnown)brain.mode='search';else brain.mode='patrol';
    if(!brain.cover&&now>=brain.repathAt){
      brain.repathAt=now+.65;
      // A mode goal (relay, flag, squad) replaces the patrol route; an urgent
      // one, such as carrying the flag home, also outranks the last sighting.
      const objective=typeof env.goal==='function'?env.goal(bot):env.goal,urgent=env.urgent?.(bot);
      let goal=urgent||brain.lastKnown;brain.roaming=!goal&&!objective;
      // A patrolling bot halts at each post and scans before moving on.
      if(!goal){goal=objective||route[brain.patrol%route.length];if(distance(bot,goal)<2){brain.patrol++;goal=objective||route[brain.patrol%route.length];if(brain.roaming){brain.pauseUntil=now+1+random()*2;brain.pauseYaw=bot.yaw||0;brain.glanceUntil=0;}}}
      if(brain.visible&&profile.tactics&&distance(bot,goal)>10){const dx=goal.x-bot.x,dz=goal.z-bot.z,d=Math.max(1,Math.hypot(dx,dz)),offset=brain.side*4;const flank={x:goal.x-dz/d*offset,z:goal.z+dx/d*offset};if(!collides(flank.x,flank.z,.4,env.obstacles))goal=flank;}
      const halted=brain.roaming&&brain.mode==='patrol'&&now<brain.pauseUntil;
      brain.path=goal&&!halted&&(!brain.visible||distance(bot,goal)>12)?trim(bot,env.navigation.findPath(bot,goal),env.obstacles):[];
    }
  }
  // A cached sighting never authorizes firing through a newly intervening wall.
  const target=actors.find(a=>a.id===brain.targetId),visible=brain.visible&&target?.alive&&sees(bot,target,env,profile);
  if(!visible)brain.visible=false;
  // Switch waypoints before reaching them so corners are rounded, not pivoted on.
  while(brain.path.length&&distance(bot,brain.path[0])<(brain.path[1]?.6:.15)&&(!brain.path[1]||walkable(bot,brain.path[1],env.obstacles)))brain.path.shift();
  const waypoint=brain.path[0],halted=!visible&&brain.roaming&&now<brain.pauseUntil;
  // Look toward the next leg of the path as a corner approaches.
  const ahead=waypoint&&brain.path[1]&&distance(bot,waypoint)<1.5?brain.path[1]:waypoint,look=visible?target:ahead||brain.lastKnown;
  // Off contact, the head keeps moving: short glances aside, a wider sweep when halted.
  if(visible||brain.cover)brain.glance=0;
  else if(now>=brain.glanceUntil){brain.glance=random()<(halted?.8:.4)?(random()-.5)*(halted?2.6:1.3):0;brain.glanceUntil=now+(halted?.8:1.2)+random()*(halted?1.2:2.4);}
  let yaw=bot.yaw||0,pitch=0,wanted=null;
  if(look)wanted=Math.atan2(-(look.x-bot.x),-(look.z-bot.z))+brain.glance;else if(halted)wanted=brain.pauseYaw+brain.glance;
  // Turns ease in and out; on a target the aim settles quickly but never exceeds the level's turn rate.
  const rate=wanted===null?0:clamp(angle(wanted-yaw)*(visible?12:5),-profile.turn,profile.turn);
  brain.turnRate=visible?rate:brain.turnRate+(rate-brain.turnRate)*(1-Math.exp(-8*dt));
  yaw+=brain.turnRate*dt;
  if(visible){
    pitch=clamp(Math.atan2(body(target).y-env.eye(bot).y,distance(bot,target)),-1.45,1.45);
    yaw+=Math.sin(now*2+brain.seed)*profile.accuracy*.25;
    pitch+=Math.cos(now*1.7+brain.seed)*profile.accuracy;
  }
  // Each bot has its own stride; it strolls on patrol, hurries to cover and
  // slows down as it arrives instead of stopping dead on the last waypoint.
  const pace=profile.speed*brain.pace*(brain.cover?1.25:brain.mode==='patrol'&&brain.roaming?.72:brain.mode==='search'?.9:1);
  let dx=0,dz=0;
  if(waypoint){const d=Math.max(.001,distance(bot,waypoint)),arrive=brain.path[1]?1:clamp(d/1.2,.35,1),s=Math.min(1,pace*arrive);dx=(waypoint.x-bot.x)/d*s;dz=(waypoint.z-bot.z)/d*s;}
  if(visible&&!brain.cover){
    const d=Math.max(.001,distance(bot,target)),tx=(target.x-bot.x)/d,tz=(target.z-bot.z)/d;
    if(d<7){dx=-tx*profile.speed;dz=-tz*profile.speed;}
    else if(d<16&&profile.strafe){
      // Sidesteps of uneven length with the odd pause, instead of a metronome.
      if(now>=brain.strafeUntil){const side=brain.strafeSide;brain.strafeSide=side?(random()<.25?0:-side):random()<.5?-1:1;brain.strafeUntil=now+(brain.strafeSide?.6+random()*1.4:.25+random()*.4);}
      dx=-tz*profile.strafe*brain.strafeSide;dz=tx*profile.strafe*brain.strafeSide;
    }
  }
  // A live enemy grenade close by outranks everything else: once the bot has
  // had its reaction time to notice it, it runs clear of the blast.
  const danger=(env.grenades||[]).filter(g=>g.age>=profile.reaction&&hostile(g.owner,bot)&&distance(bot,g)<6.5).sort((a,b)=>distance(bot,a)-distance(bot,b))[0];
  brain.evading=!!danger;
  if(danger){const d=distance(bot,danger),s=profile.speed*1.25,ex=d>.05?(bot.x-danger.x)/d:Math.sin(brain.seed),ez=d>.05?(bot.z-danger.z)/d:Math.cos(brain.seed);dx=ex*s;dz=ez*s;}
  // Steer around nearby bodies so teams can share doorways without stacking.
  for(const other of actors)if(other!==bot&&other.alive!==false){const ox=bot.x-other.x,oz=bot.z-other.z,d=Math.hypot(ox,oz);if(d>.001&&d<1.4){const push=(1.4-d)*.65;dx+=ox/d*push;dz+=oz/d*push;}}
  const aligned=visible&&Math.abs(angle(Math.atan2(-(target.x-bot.x),-(target.z-bot.z))-yaw))<.12;
  brain.wantsFire=!!(aligned&&!danger&&now>=brain.nextShot&&bot.reload<=0&&!allyInLine(bot,target,actors));
  return {forward:-Math.sin(yaw)*dx-Math.cos(yaw)*dz,strafe:Math.cos(yaw)*dx-Math.sin(yaw)*dz,yaw,pitch,aim:!!visible&&profile.tactics,crouch:!!brain.cover&&distance(bot,brain.cover)<1,sprint:false,jump:false,fire:false};
}

export function recordBotShot(bot,now,difficulty,random=Math.random){
  const profile=botProfile(difficulty),brain=bot.brain;brain.burst=Math.max(0,brain.burst-1);
  if(brain.burst>0)brain.nextShot=now+.12;
  else{brain.nextShot=now+profile.pause*(.85+random()*.3);brain.burst=profile.burst;}
}
