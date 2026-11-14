import {WEAPONS,SIDEARMS,clamp,damageAtDistance,distance,moveSpeed,shotSpread} from '../rules.js';
import {DEATHMATCH,canDamage,shielded,engage} from '../deathmatch.js';
import {createWorld,clearShot} from '../world.js';
import {traverse} from '../traversal.js';
import {resetBot,updateBot,fireBot,grenadeBot} from './bots.js';
import {botLevel,validBotLevel} from '../bot-ai.js';
import {mapConfig,mapId as normalizeMap,validMap} from '../maps.js';
import {moveCharacter,setStance,updateVertical,separateCharacters,feet,circleBox} from '../collision.js';
import {traceShot} from '../combat.js';
import {grenadeOrigin,updateGrenade} from '../projectiles.js';
import {validMode,normalizeRules} from '../modes.js';
import {createModeLogic} from './modes.js';

// One authoritative simulation for every mode. The dedicated server ticks it
// for its WebSocket clients; solo games run the same room inside the page.
// Errors that refuse a player or a setting carry i18n keys (data.error.*):
// the server sends them as they are and clients translate them.
export const MAX_HUMANS=8;
let serial=0;
// Unique without crypto.randomUUID, which pages served over plain LAN HTTP lack.
const uid=()=>`${(++serial).toString(36)}-${Math.random().toString(36).slice(2,10)}`;
const damp=(a,b,lambda,dt)=>b+(a-b)*Math.exp(-lambda*dt);
// A fallen soldier leaves an ammunition box for this long; a human walking
// over it refills the reserve of both carried weapons.
export const AMMO_DROP={life:30,reach:1.2};
// Eye of a standing soldier above the ground: a free operator's device is
// his eye, the rest of his body hangs below it.
const EYE=.15+1.72;
const blankInput=()=>({forward:0,strafe:0,yaw:0,pitch:0,sprint:false,crouch:false,jump:false,aim:false,fire:false,seq:0});
export function safeName(value){return typeof value==='string'?value.normalize('NFKC').replace(/[^\p{L}\p{N} _.-]/gu,'').trim().slice(0,18):'';}
export class GameRoom {
  // arena: a world and map settings of its own (an augmented reality room,
  // see ar-room.js) in place of a map. Its humans are free: the device they
  // hold places them, without walking or colliding.
  constructor({random=Math.random,fillBots=true,botDifficulty=null,mapId=null,mode=null,rules=null,autoRestart=true,arena=null}={}){
    if(botDifficulty!==null&&!validBotLevel(botDifficulty))throw new Error('data.error.badBotLevel');
    if(mapId!==null&&!validMap(mapId))throw new Error('data.error.badMap');
    if(mode!==null&&!validMode(mode))throw new Error('data.error.badMode');
    this.random=random;this.fillBots=fillBots;this.autoRestart=autoRestart;this.players=new Map();this.redeployed=new Set();this.arena=arena;
    this.mapFixed=mapId!==null||!!arena;this.setMap(mapId);this.modeFixed=mode!==null;this.rulesFixed=rules!==null;this.setRules(mode??'tdm',rules);
    this.difficultyFixed=botDifficulty!==null;this.botDifficulty=botLevel(botDifficulty);
    this.clock=0;this.elapsed=0;this.remaining=this.rules.duration||0;this.scores={blue:0,red:0};this.phase='waiting';this.round=0;this.restartIn=0;this.result=null;this.resultReason=null;this.resultName=null;this.events=[];this.eventId=0;this.grenades=[];this.drops=[];
  }
  setMap(id){if(this.arena){this.mapId='room';this.mapConfig=this.arena.config;this.world=this.arena.world;this.navigation=null;return;}this.mapId=normalizeMap(id);this.mapConfig=mapConfig(this.mapId);this.world=createWorld(this.mapId);this.navigation=null;}
  setRules(mode,rules){this.rules=normalizeRules(mode,rules);this.logic=createModeLogic(this);}
  emit(type,data={}){this.events.push({id:++this.eventId,type,...data});}
  drainEvents(){return this.events.splice(0);}
  get actors(){return [...this.players.values()];}
  get humanCount(){let n=0;for(const p of this.players.values())if(!p.isBot)n++;return n;}
  // Each combatant carries the main weapon and the sidearm chosen on joining.
  createActor({name,team,weapon=0,sidearm=SIDEARMS[0],isBot=false,hostile=false,role=null}){
    const primary=Number.isInteger(weapon)&&WEAPONS[weapon]&&!WEAPONS[weapon].sidearm?weapon:0;
    return {id:uid(),name,team,isBot,hostile,role,weapon:primary,primary,sidearm:SIDEARMS.includes(sidearm)?sidearm:SIDEARMS[0],kills:0,deaths:0,captures:0,shots:0,hits:0,vx:0,vz:0,carrying:null,input:blankInput(),lastInput:this.clock,ack:0};
  }
  discard(p){this.logic.onRemove(p);this.players.delete(p.id);this.grenades=this.grenades.filter(g=>g.owner.id!==p.id);}
  // Squad bots (hostile:false) fill the slots the rules give each side;
  // co-op enemies (hostile:true) are spawned and removed by the mode itself.
  addBot(team,{hostile=false}={}){
    const names=new Set(this.actors.map(p=>p.name));let slot=1;while(names.has(this.logic.botName(team,slot,hostile)))slot++;
    const bot=this.createActor({name:this.logic.botName(team,slot,hostile),team,isBot:true,hostile,weapon:0,role:this.logic.botRole(team,slot)});
    this.players.set(bot.id,bot);this.spawn(bot);return bot;
  }
  syncBots(){
    if(!this.humanCount){for(const p of this.players.values())if(p.isBot)this.discard(p);return;}
    if(!this.fillBots)return;
    for(const [team,size]of Object.entries(this.logic.botSlots())){
      const members=()=>this.actors.filter(p=>p.team===team&&!p.hostile);
      while(members().length<size)this.addBot(team);
      let extra=members().length-size;for(const bot of members().filter(p=>p.isBot).sort((a,b)=>a.alive-b.alive)){if(extra<=0)break;this.discard(bot);extra--;}
    }
  }
  add({name,team='auto',weapon=0,sidearm,botDifficulty,mapId,mode,rules}={}){
    name=safeName(name);if(!name)throw new Error('data.error.badName');
    if(this.humanCount>=MAX_HUMANS)throw new Error('data.error.serverFull');
    if(!['auto','blue','red'].includes(team))throw new Error('data.error.badTeam');
    if(botDifficulty!==undefined&&!validBotLevel(botDifficulty))throw new Error('data.error.badBotLevel');
    if(mapId!==undefined&&!this.arena&&!validMap(mapId))throw new Error('data.error.badMap');
    if(mode!==undefined&&!validMode(mode))throw new Error('data.error.badMode');
    // The first human of an empty room configures it, unless the host fixed it.
    if(!this.humanCount){
      if(!this.mapFixed)this.setMap(mapId);
      if(!this.difficultyFixed)this.botDifficulty=botLevel(botDifficulty);
      this.setRules(this.modeFixed?this.rules.mode:mode??'tdm',this.rulesFixed?this.rules:rules);
    }
    team=this.logic.assignTeam(team);
    const replacement=this.actors.find(p=>p.isBot&&!p.hostile&&p.team===team);if(replacement)this.discard(replacement);
    const actor=this.createActor({name,team,weapon,sidearm});actor.free=!!this.arena;
    this.players.set(actor.id,actor);this.spawn(actor);this.syncBots();this.emit('join',{name,team});
    if(this.phase==='waiting'&&this.logic.ready())this.startRound();return actor;
  }
  remove(id){
    const p=this.players.get(id);if(!p)return;this.discard(p);this.syncBots();this.emit('leave',{name:p.name,team:p.team});
    if(!this.humanCount&&!this.difficultyFixed)this.botDifficulty='soldier';
    if(!this.logic.ready()){this.phase='waiting';this.result=null;this.restartIn=0;this.grenades=[];this.drops=[];for(const a of this.actors)if(a.hostile)this.discard(a);else this.spawn(a);}
  }
  // Weapons chosen while down or paused are carried from the next spawn on.
  spawn(p){
    const pos=this.logic.spawnPoint(p);if(p.nextPrimary!=null){p.primary=p.nextPrimary;p.nextPrimary=null;}if(p.nextSidearm!=null){p.sidearm=p.nextSidearm;p.nextSidearm=null;}
    Object.assign(p,pos,{weapon:p.primary,alive:true,health:100,jump:0,vy:0,vx:0,vz:0,crouch:false,climb:null,mantle:null,jumpHeld:false,carrying:null,protectedUntil:this.clock+DEATHMATCH.protection,respawnAt:0,discardAt:0,lastHit:this.clock,lastShot:-Infinity,cooldown:.25,sighted:0,reload:0,grenades:2,ammunition:WEAPONS.map(w=>({ammo:w.capacity,reserve:w.reserve}))});
    p.yaw=p.team==='blue'?0:p.team==='red'?Math.PI:Math.atan2(p.x,p.z);p.pitch=0;p.input={...blankInput(),yaw:p.yaw,seq:p.input?.seq||0};p.lastInput=this.clock;if(p.isBot)resetBot(this,p);
  }
  resupply(p){Object.assign(p,{health:100,grenades:2,reload:0,ammunition:WEAPONS.map(w=>({ammo:w.capacity,reserve:w.reserve}))});}
  startRound(){
    this.phase='active';this.round++;this.elapsed=0;this.remaining=this.rules.duration||0;this.scores={blue:0,red:0};this.result=this.resultReason=this.resultName=null;this.grenades=[];this.drops=[];
    for(const p of this.actors){if(p.hostile){this.discard(p);continue;}p.kills=p.deaths=p.captures=p.shots=p.hits=0;this.spawn(p);}
    this.logic.setup();this.emit('round',{round:this.round});
  }
  // Without an argument the mode decides whether the round is over.
  finish(outcome=this.logic.result()){
    if(!outcome||this.phase!=='active')return;
    this.phase='over';this.result=outcome.winner;this.resultReason=outcome.reason;this.resultName=this.players.get(outcome.winner)?.name||null;this.restartIn=10;this.redeployed.clear();
    for(const p of this.players.values())p.input=blankInput();this.emit('finished',{result:this.result,reason:this.resultReason});
  }
  input(id,message){
    const p=this.players.get(id);if(!p||p.isBot||!Number.isSafeInteger(message.seq)||message.seq<=p.input.seq||message.seq>1e9)return;
    if(!['forward','strafe','yaw','pitch'].every(key=>Number.isFinite(message[key])))return;
    p.input={forward:clamp(message.forward,-1,1),strafe:clamp(message.strafe,-1,1),yaw:message.yaw%(Math.PI*2),pitch:clamp(message.pitch,-1.45,1.45),seq:message.seq,...Object.fromEntries(['sprint','crouch','jump','aim','fire'].map(key=>[key,message[key]===true]))};p.lastInput=this.clock;
    // A free operator sends where his device is: x and z on the ground, y its height.
    if(p.free&&['x','y','z'].every(key=>Number.isFinite(message[key])))Object.assign(p.input,{x:clamp(message.x,-31,31),y:clamp(message.y,EYE,80),z:clamp(message.z,-31,31)});
  }
  action(id,message){
    const p=this.players.get(id);if(!p||p.isBot)return;
    // Between rounds, the break ends once every human asks for the next one.
    if(message.action==='redeploy'){if(this.phase==='over')this.redeployed.add(id);return;}
    if(message.action==='loadout'){const w=message.weapon;if(!Number.isInteger(w)||!WEAPONS[w])return;if(WEAPONS[w].sidearm)p.nextSidearm=w===p.sidearm?null:w;else p.nextPrimary=w===p.primary?null:w;return;}
    if(!p.alive)return;
    if(message.action==='weapon'&&(message.weapon===p.primary||message.weapon===p.sidearm)){p.weapon=message.weapon;p.reload=0;p.cooldown=.25;p.sighted=0;return;}
    if(this.phase!=='active')return;
    // Input and actions arrive in WebSocket order, possibly between ticks.
    // Use the latest validated mouse orientation for this trigger.
    p.yaw=p.input.yaw;p.pitch=p.input.pitch;setStance(p,p.input.crouch,this.world.solids);
    if(message.action==='fire')this.fire(p);
    if(message.action==='reload')this.reload(p);
    if(message.action==='grenade')this.throwGrenade(p);
  }
  reload(p){const w=WEAPONS[p.weapon],a=p.ammunition[p.weapon];if(p.reload>0||a.ammo===w.capacity||a.reserve<=0)return;p.reload=w.reload;}
  eye(p){return {x:p.x,y:.15+(p.crouch?1.12:1.72)+p.jump,z:p.z};}
  direction(p){const c=Math.cos(p.pitch);return {x:-Math.sin(p.yaw)*c,y:Math.sin(p.pitch),z:-Math.cos(p.yaw)*c};}
  // Humans fire along their view with the weapon spread; bots pass the
  // direction, damage scale and cadence chosen by fireBot.
  fire(p,aimed=null){
    if(!p.alive||p.cooldown>1e-6||p.reload>0||p.climb||p.mantle||this.phase!=='active')return false;
    const w=WEAPONS[p.weapon],ammo=p.ammunition[p.weapon];if(ammo.ammo<=0){this.reload(p);return false;}
    // The cooldown keeps the sub-tick remainder, so cadence does not depend on the tick rate.
    ammo.ammo--;p.shots++;if(!w.suppressed)p.lastShot=this.clock;p.cooldown+=aimed?.interval??w.interval;engage(p,this.clock);
    // Each pellet is traced on its own; a victim takes the sum in one hit.
    const origin=this.eye(p),view=aimed?.direction??this.direction(p),spread=aimed?.direction?0:shotSpread(w,p.sighted||0),traces=[],hits=new Map();
    for(let i=0;i<(w.pellets||1);i++){
      const direction={...view};
      if(spread){direction.x+=(this.random()-.5)*spread;direction.y+=(this.random()-.5)*spread;const length=Math.hypot(direction.x,direction.y,direction.z);for(const key of ['x','y','z'])direction[key]/=length;}
      const trace=traceShot(origin,direction,w.range,this.world.solids,this.actors,p),{victim,head}=trace;traces.push(trace);
      if(victim){const hit=hits.get(victim)??{amount:0,head:false};hit.amount+=damageAtDistance(w.damage*(aimed?.damageScale??1),trace.distance,w.falloff,head);hit.head||=head;hits.set(victim,hit);}
    }
    // A trace stopped by spawn protection names the shielded actor instead of a hit.
    let victim=null;const struck=new Set(),blocked=new Set();for(const [actor,hit]of hits)if(hit.amount>0){if(this.damage(actor,hit.amount,p,hit.head)){struck.add(actor);if(!victim||hit.amount>hits.get(victim).amount)victim=actor;}else if(shielded(p,actor,this.clock))blocked.add(actor);}
    if(victim)p.hits++;
    const shown=traces.find(t=>t.victim===victim)??traces[0],shield=t=>blocked.has(t.victim)?{shield:t.victim.id}:{};
    this.emit('shot',{actor:p.id,weapon:p.weapon,origin,end:shown.end,hit:victim?.id??null,head:!!victim&&hits.get(victim).head,...(victim?{}:shield(shown)),...(traces.length>1?{pellets:traces.map(t=>({end:t.end,hit:struck.has(t.victim)?t.victim.id:null,...shield(t)}))}:{})});return true;
  }
  // The kill event names the weapon (or 'grenade') and, for a shot, the range.
  damage(victim,amount,attacker,head=false,weapon=WEAPONS[attacker?.weapon]?.id??null){
    if(this.phase!=='active'||!canDamage(attacker,victim,this.clock))return false;
    victim.health=Math.max(0,victim.health-amount);victim.lastHit=this.clock;
    // A hit throws off a bot's aim for a moment. Shot by someone it cannot
    // see, the bot learns the rough direction (to the nearest four metres,
    // like a shot heard) and goes to look, instead of patrolling on while
    // a suppressed weapon picks it apart.
    if(victim.brain){const b=victim.brain;b.nextShot=Math.max(b.nextShot,this.clock+.18);
      if(attacker!==victim&&!b.visible){b.lastKnown={x:Math.round(attacker.x/4)*4,z:Math.round(attacker.z/4)*4};b.lastSeen=this.clock;b.mode='investigate';b.repathAt=0;}}
    if(victim.health<=0){
      Object.assign(victim,{alive:false,input:blankInput(),reload:0,climb:null,mantle:null,respawnAt:this.clock+DEATHMATCH.respawn});victim.deaths++;
      this.dropAmmo(victim);this.logic.onDeath(victim);const counted=this.logic.onKill(attacker,victim);
      this.emit('kill',{attacker:attacker.id,victim:victim.id,attackerName:attacker.name,victimName:victim.name,team:attacker.team,head,counted,weapon,range:weapon==='grenade'?null:Math.round(distance(attacker,victim))});this.finish();
    }
    return true;
  }
  // The box rests on the highest surface below the soldier's feet.
  dropAmmo(p){
    let y=.15;const r=.3;for(const b of this.world.solids)if(b.maxY<=feet(p)+.05&&b.maxY>y&&circleBox(p.x,p.z,r,b))y=b.maxY;
    this.drops.push({id:uid(),x:p.x,y,z:p.z,expires:this.clock+AMMO_DROP.life});
  }
  // Taken only when one of the carried weapons is short of its full reserve.
  pickAmmo(p){
    const carried=[p.primary,p.sidearm].filter(i=>p.ammunition[i]&&p.ammunition[i].reserve<WEAPONS[i].reserve);if(!carried.length)return;
    // A free operator only has to hold the device over the box.
    const i=this.drops.findIndex(d=>p.free?Math.hypot(d.x-p.x,d.z-p.z)<AMMO_DROP.reach*2.5:Math.hypot(d.x-p.x,d.z-p.z)<AMMO_DROP.reach&&Math.abs(d.y-feet(p))<1);if(i<0)return;
    const [drop]=this.drops.splice(i,1);for(const w of carried)p.ammunition[w].reserve=WEAPONS[w].reserve;this.emit('pickup',{actor:p.id,x:drop.x,y:drop.y,z:drop.z});
  }
  // A grenade as it leaves the hand; bots also use it to rehearse a throw.
  launchGrenade(p,direction){const origin=grenadeOrigin(this.eye(p),direction,this.world.solids);return {...origin,vx:direction.x*13,vy:direction.y*13+4,vz:direction.z*13,fuse:2.1};}
  throwGrenade(p,direction=this.direction(p)){if(p.grenades<=0)return;p.grenades--;engage(p,this.clock);this.grenades.push({id:uid(),owner:p,...this.launchGrenade(p,direction)});}
  explode(g){
    // A bot's grenade is scaled like its bullets: light in co-op, near full against humans.
    const scale=g.owner.isBot?this.logic.botDamage(g.owner):1;
    // A free operator is hit through the air to his device.
    const blocked=[];
    for(const p of this.players.values()){const d=p.free?Math.hypot(p.x-g.x,this.eye(p).y-g.y,p.z-g.z):distance(p,g);if(p.alive&&d<8&&clearShot({x:g.x,y:g.y+.4,z:g.z},{x:p.x,y:p.free?this.eye(p).y:1+p.jump,z:p.z},this.world.solids)&&!this.damage(p,Math.round(180*(1-d/9)*scale),g.owner,false,'grenade')&&shielded(g.owner,p,this.clock))blocked.push(p.id);}
    this.emit('explosion',{x:g.x,y:g.y,z:g.z,...(blocked.length?{shield:blocked}:{})});
  }
  tick(dt=1/30){
    this.clock+=dt;
    if(this.phase==='over'){if(!this.autoRestart)return;this.restartIn=[...this.players.values()].every(p=>p.isBot||this.redeployed.has(p.id))?0:Math.max(0,this.restartIn-dt);if(this.restartIn<=0){if(this.logic.ready())this.startRound();else this.phase='waiting';}return;}
    if(this.phase==='active'){this.elapsed+=dt;if(this.rules.duration)this.remaining=Math.max(0,this.remaining-dt);this.logic.tick(dt);this.finish();if(this.phase==='over')return;}
    const actors=this.actors;
    for(const p of actors){
      if(!p.alive){if(p.discardAt&&this.clock>=p.discardAt)this.discard(p);else if(this.clock>=p.respawnAt)this.spawn(p);continue;}
      if(p.isBot&&this.phase==='active')updateBot(this,p,dt);
      // Input older than half a second means the client stopped sending: stand still.
      const stale=this.clock-p.lastInput>=.5,input=stale?blankInput():p.input;p.ack=p.input.seq;p.yaw=p.input.yaw;p.pitch=p.input.pitch;setStance(p,input.crouch,this.world.solids);
      // Sights come up over the weapon's aim time and drop at once.
      p.sighted=input.aim?Math.min(1,(p.sighted||0)+dt/WEAPONS[p.weapon].aimTime):0;
      // Humans climb ladders and ledges; bots and flag carriers stay on the ground.
      const jumpPressed=input.jump&&!p.jumpHeld,traversal=p.isBot||p.carrying||p.free?null:traverse(p,{forward:input.forward,yaw:p.yaw,jumpPressed},dt,this.world);
      // A free operator is where his device is, his eye at its height.
      if(p.free){if(Number.isFinite(p.input.x)){p.x=p.input.x;p.z=p.input.z;p.jump=p.input.y-EYE;}p.vx=p.vz=p.vy=0;p.grounded=true;}
      else if(!traversal){
       const sprint=input.sprint&&input.forward>0&&!input.aim&&!p.carrying,speed=moveSpeed(p.isBot?null:WEAPONS[p.weapon],{crouch:p.crouch,sprint,aim:input.aim}),norm=Math.max(1,Math.hypot(input.forward,input.strafe)),forward=input.forward/norm,strafe=input.strafe/norm;
       const wantX=(-Math.sin(p.yaw)*forward+Math.cos(p.yaw)*strafe)*speed,wantZ=(-Math.cos(p.yaw)*forward-Math.sin(p.yaw)*strafe)*speed;
       // A heavy weapon slows humans only: bot routes and timings are tuned for full speed.
       // Humans accelerate like the client prediction: brief on the ground, little air control.
       // Bots carry more momentum, so they ease into and out of every move.
       if(stale){p.vx=p.vz=0;}else{const accel=p.grounded!==false||p.jump<=.01?(p.isBot?7:forward||strafe?15:16):1.6;p.vx=damp(p.vx,wantX,accel,dt);p.vz=damp(p.vz,wantZ,accel,dt);}
       const x=p.x,z=p.z;moveCharacter(p,p.vx*dt,p.vz*dt,this.world,actors);if(dt>0){p.vx=(p.x-x)/dt;p.vz=(p.z-z)/dt;}
       if(jumpPressed&&(p.grounded||p.jump===0))p.vy=5;updateVertical(p,dt,this.world.solids);
      }else p.vx=p.vz=0;
      p.jumpHeld=input.jump;p.cooldown-=dt;
      if(p.reload>0){p.reload=Math.max(0,p.reload-dt);if(p.reload===0){const a=p.ammunition[p.weapon],n=Math.min(WEAPONS[p.weapon].capacity-a.ammo,a.reserve);a.ammo+=n;a.reserve-=n;}}
      if(this.phase==='active'){if(p.isBot){fireBot(this,p);grenadeBot(this,p);}else if(input.fire&&WEAPONS[p.weapon].auto)while(p.cooldown<=1e-6&&this.fire(p));}
      if(p.cooldown<0)p.cooldown=0;
      if(!p.isBot&&this.drops.length)this.pickAmmo(p);
      if((!p.isBot||this.logic.pvp)&&this.clock-p.lastHit>6)p.health=Math.min(100,p.health+8*dt);
    }
    separateCharacters(this.actors,this.world);
    if(this.drops.length)this.drops=this.drops.filter(d=>d.expires>this.clock);
    for(let i=this.grenades.length-1;i>=0;i--){const g=this.grenades[i];g.fuse-=dt;updateGrenade(g,dt,this.world.solids);if(g.fuse<=0){this.explode(g);this.grenades.splice(i,1);}}
  }
  snapshot(id){
    const humans=this.humanCount;
    return {type:'snapshot',round:this.round,phase:this.phase,mode:this.rules.mode,rules:{...this.rules},modeFixed:this.modeFixed,rulesFixed:this.rulesFixed,mapId:this.mapId,mapFixed:this.mapFixed,botDifficulty:this.botDifficulty,difficultyFixed:this.difficultyFixed,fillBots:this.fillBots,humans,bots:this.players.size-humans,elapsed:this.elapsed,remaining:this.remaining,teamScores:{...this.scores},result:this.result,resultReason:this.resultReason,resultName:this.resultName,restartIn:this.restartIn,objective:this.logic.objective(),
      players:this.actors.map(p=>({id:p.id,name:p.name,team:p.team,isBot:p.isBot,hostile:p.hostile,x:p.x,z:p.z,yaw:p.yaw,pitch:p.pitch,jump:p.jump,vy:p.vy,crouch:p.crouch,climbing:!!(p.climb||p.mantle),carrying:p.carrying,health:p.health,alive:p.alive,kills:p.kills,deaths:p.deaths,captures:p.captures,weapon:p.weapon,reload:p.reload,protectedFor:Math.max(0,p.protectedUntil-this.clock),respawnIn:p.alive?0:p.respawnAt===Infinity?-1:Math.max(0,p.respawnAt-this.clock)})),
      self:this.players.has(id)?this.privateState(this.players.get(id)):null,grenades:this.grenades.map(g=>({id:g.id,x:g.x,y:g.y,z:g.z,owner:g.owner.id,team:g.owner.team})),
      drops:this.drops.map(d=>({id:d.id,x:d.x,y:d.y,z:d.z,expiresIn:Math.max(0,d.expires-this.clock)}))};
  }
  privateState(p){return {id:p.id,ack:p.ack,primary:p.primary,nextPrimary:p.nextPrimary??p.primary,sidearm:p.sidearm,nextSidearm:p.nextSidearm??p.sidearm,ammunition:p.ammunition.map(a=>({...a})),grenades:p.grenades,reload:p.reload,cooldown:p.cooldown,shots:p.shots,hits:p.hits};}
}
// Earlier releases exported the room under this name.
export {GameRoom as MultiplayerRoom};
