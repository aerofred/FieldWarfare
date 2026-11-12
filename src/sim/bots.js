import {createNavigation} from '../navigation.js';
import {clearShot} from '../world.js';
import {WEAPONS,distance} from '../rules.js';
import {updateGrenade} from '../projectiles.js';
import {resetBrain,updateBrain,recordBotShot,botProfile} from '../bot-ai.js';

// In an augmented reality room the device is in view from everywhere: only
// crouching behind real furniture hides it. Enemies there deal this share
// of their usual damage.
export const ARENA_DAMAGE=.35;
export function resetBot(room,bot){bot.brain=resetBrain(room.clock,room.random);}
export function updateBot(room,bot,dt=1/30){
  room.navigation??=createNavigation(room.world.obstacles);
  const grenades=room.grenades.map(g=>({x:g.x,z:g.z,age:2.1-g.fuse,owner:g.owner}));
  const input=updateBrain(bot,{actors:[...room.players.values()],patrol:room.mapConfig.patrol,now:room.clock,difficulty:room.botDifficulty,random:room.random,navigation:room.navigation,obstacles:room.world.obstacles,eye:p=>room.eye(p),clear:(a,b)=>clearShot(a,b,room.world.solids),goal:b=>room.logic.goal(b),urgent:b=>room.logic.urgent(b),grenades},dt);
  bot.input={...bot.input,...input};bot.lastInput=room.clock;
}
// Bots aim at the centre of the body with a spread set by their level; the
// mode scales their damage (light in co-op, near full against humans).
export function fireBot(room,bot){
  const brain=bot.brain,target=room.players.get(brain.targetId);
  if(!brain.wantsFire||!target?.alive||bot.cooldown>1e-6||bot.reload>0)return false;
  const from=room.eye(bot),spread=botProfile(room.botDifficulty).accuracy;
  let x=target.x-from.x,y=.15+(target.jump||0)+(target.crouch?.75:1.15)-from.y,z=target.z-from.z,l=Math.hypot(x,y,z)||1;
  x=x/l+(room.random()-.5)*spread;y=y/l+(room.random()-.5)*spread;z=z/l+(room.random()-.5)*spread;l=Math.hypot(x,y,z)||1;
  const fired=room.fire(bot,{direction:{x:x/l,y:y/l,z:z/l},damageScale:room.logic.botDamage(bot)*(room.arena?ARENA_DAMAGE:1),interval:Math.max(WEAPONS[bot.weapon].interval,room.logic.botInterval)});
  if(fired)recordBotShot(bot,room.clock,room.botDifficulty,room.random);
  return fired;
}
// Seconds between two grenades of one bot; recruits never throw.
export const GRENADE_COOLDOWN=Object.freeze({recruit:0,soldier:40,veteran:26,elite:16});
// A target that has just ducked out of sight, 8 to 24 m away, is flushed out
// with a grenade. The bot rehearses a few arcs with the real projectile
// physics, bounces included, and throws only one that lands within 3 m.
export function grenadeBot(room,bot){
  const brain=bot.brain,goal=brain.lastKnown,cooldown=GRENADE_COOLDOWN[room.botDifficulty],now=room.clock;
  // In a room the target is a device held in the air: no grenade reaches it.
  if(!cooldown||room.arena||bot.grenades<=0||!goal||brain.visible||brain.evading||bot.reload>0)return false;
  brain.nextGrenade??=now+cooldown*(.3+room.random()*.7);
  const since=now-brain.lastSeen,range=distance(bot,goal);
  if(now<brain.nextGrenade||since<.6||since>3.5||range<8||range>24)return false;
  brain.nextGrenade=now+2;
  // Only the walls around the throw can deflect it.
  const margin=6,minX=Math.min(bot.x,goal.x)-margin,maxX=Math.max(bot.x,goal.x)+margin,minZ=Math.min(bot.z,goal.z)-margin,maxZ=Math.max(bot.z,goal.z)+margin;
  const solids=room.world.solids.filter(b=>b.maxX>=minX&&b.minX<=maxX&&b.maxZ>=minZ&&b.minZ<=maxZ);
  const yaw=Math.atan2(-(goal.x-bot.x),-(goal.z-bot.z));let best=null;
  // From a throw at the ground to a high lob over cover.
  for(let pitch=-.7;pitch<1.45&&!(best?.miss<1);pitch+=.15){
   const c=Math.cos(pitch),direction={x:-Math.sin(yaw)*c,y:Math.sin(pitch),z:-Math.cos(yaw)*c},g=room.launchGrenade(bot,direction);
   for(let t=0;t<g.fuse;t+=1/30)updateGrenade(g,1/30,solids);
   const miss=distance(g,goal);if(!best||miss<best.miss)best={miss,direction};
  }
  if(best.miss>3)return false;
  room.throwGrenade(bot,best.direction);brain.nextGrenade=now+cooldown*(.8+room.random()*.4);
  return true;
}
