import {distance,collides,captureStep,hostile} from '../rules.js';
import {chooseTeamSpawn,chooseFreeSpawn,awardTeamKill} from '../deathmatch.js';
import {clearShot} from '../world.js';

// Mode rules plug into the shared room through these hooks: team choice, bot
// slots, spawns, scoring, objectives, bot goals and the end of the round.
// Refusals carry i18n keys (data.error.*) that clients translate.
const other=team=>team==='blue'?'red':'blue';
class Mode {
  constructor(room){this.room=room;this.rules=room.rules;this.outcome=null;}
  get pvp(){return true;}
  // Bots never fire faster than this; co-op enemies are slowed down further.
  get botInterval(){return 0;}
  get map(){return this.room.mapConfig;}
  living(filter=()=>true){return this.room.actors.filter(p=>p.alive&&filter(p));}
  exposed(){return (a,b)=>clearShot({...a,y:1.6},{...b,y:1.6},this.room.world.solids);}
  assignTeam(team){
    const humans=t=>this.room.actors.filter(p=>!p.isBot&&p.team===t).length,full=t=>humans(t)>=this.rules[t];
    if(team==='auto'){team=humans('blue')<=humans('red')?'blue':'red';if(full(team))team=other(team);if(full(team))throw new Error('data.error.teamsFull');}
    if(full(team))throw new Error('data.error.teamFull');
    return team;
  }
  botSlots(){return {blue:this.rules.blue,red:this.rules.red};}
  botName(team,slot){return `BOT ${team==='blue'?'A':'B'}${slot}`;}
  botRole(){return null;}
  botDamage(){return .8;}
  ready(){const a=this.room.actors;return a.some(p=>p.team==='blue')&&a.some(p=>p.team==='red');}
  spawnPoint(p){return chooseTeamSpawn(p.team,this.room.actors.filter(a=>a!==p),this.room.world.obstacles,this.exposed(),this.map.teamSpawns);}
  setup(){this.outcome=null;}
  tick(){}
  onDeath(){}
  onRemove(){}
  onKill(attacker,victim){if(!awardTeamKill(this.room.scores,attacker,victim))return false;attacker.kills++;return true;}
  result(){
    const s=this.room.scores,limit=this.rules.score;
    if(s.blue<limit&&s.red<limit&&this.room.remaining>0)return null;
    return {winner:s.blue===s.red?'draw':s.blue>s.red?'blue':'red',reason:s.blue>=limit||s.red>=limit?'score':'time'};
  }
  goal(){return undefined;}
  urgent(){return null;}
  objective(){return null;}
}
class TeamDeathmatch extends Mode {}

class FreeForAll extends Mode {
  assignTeam(){if(this.room.humanCount>=this.rules.players)throw new Error('data.error.matchFull');return 'ffa';}
  botSlots(){return {ffa:this.rules.players};}
  botName(team,slot){return `BOT ${String(slot).padStart(2,'0')}`;}
  ready(){return this.room.players.size>=2;}
  spawnPoint(p){const m=this.map;return chooseFreeSpawn(p,this.room.actors,this.room.world.obstacles,this.exposed(),[...m.teamSpawns.blue,...m.teamSpawns.red,...m.enemySpawns,...m.patrol],this.room.random);}
  onKill(attacker,victim){if(!attacker||attacker===victim)return false;attacker.kills++;return true;}
  result(){
    const actors=this.room.actors,top=Math.max(0,...actors.map(p=>p.kills));
    if(top<this.rules.score&&this.room.remaining>0)return null;
    const leaders=actors.filter(p=>p.kills===top);
    return {winner:leaders.length===1?leaders[0].id:'draw',reason:top>=this.rules.score?'score':'time'};
  }
}

class CaptureTheFlag extends Mode {
  constructor(room){super(room);this.flags=this.home();}
  home(){return Object.fromEntries(['blue','red'].map(team=>{const base=this.map.flags[team];return [team,{team,base:{...base},state:'home',x:base.x,z:base.z,y:0,carrier:null,returnAt:0}];}));}
  // Two attackers for each defender.
  botRole(team,slot){return slot%3===2?'defend':'attack';}
  setup(){super.setup();this.flags=this.home();}
  reset(flag){Object.assign(flag,{state:'home',x:flag.base.x,z:flag.base.z,y:0,carrier:null});for(const p of this.room.players.values())if(p.carrying===flag.team)p.carrying=null;}
  drop(flag,carrier){
    if(carrier){flag.x=carrier.x;flag.z=carrier.z;flag.y=carrier.jump||0;carrier.carrying=null;}
    Object.assign(flag,{state:'dropped',carrier:null,returnAt:this.room.clock+20});this.room.emit('flag',{action:'dropped',team:flag.team,name:carrier?.name||''});
  }
  onDeath(p){if(p.carrying)this.drop(this.flags[p.carrying],p);}
  onRemove(p){if(p.carrying)this.drop(this.flags[p.carrying],p);}
  onKill(attacker,victim){if(!attacker||!hostile(attacker,victim))return false;attacker.kills++;return true;}
  tick(){
    const room=this.room;
    for(const flag of Object.values(this.flags)){
      if(flag.state==='carried'){const c=room.players.get(flag.carrier);if(c?.alive){flag.x=c.x;flag.z=c.z;flag.y=c.jump||0;continue;}this.drop(flag,c);}
      if(flag.state==='dropped'&&room.clock>=flag.returnAt){this.reset(flag);room.emit('flag',{action:'returned',team:flag.team,name:''});continue;}
      const touch=this.living(p=>distance(p,flag)<1.3&&Math.abs((p.jump||0)-flag.y)<1.2).sort((a,b)=>distance(a,flag)-distance(b,flag));
      const defender=touch.find(p=>p.team===flag.team),raider=touch.find(p=>p.team!==flag.team&&!p.carrying);
      if(flag.state==='dropped'&&defender){this.reset(flag);room.emit('flag',{action:'returned',team:flag.team,name:defender.name});}
      else if(raider){Object.assign(flag,{state:'carried',carrier:raider.id});raider.carrying=flag.team;room.emit('flag',{action:'taken',team:flag.team,name:raider.name,actor:raider.id});}
    }
    // A capture counts only while the scoring team still holds its own flag.
    for(const p of this.living(p=>p.carrying)){
      const own=this.flags[p.team];if(own.state!=='home'||distance(p,own.base)>2.2)continue;
      const flag=this.flags[p.carrying];room.scores[p.team]++;p.captures++;this.reset(flag);room.emit('flag',{action:'captured',team:flag.team,name:p.name,actor:p.id});
    }
  }
  // Carriers head home, defenders chase a stolen flag and attackers keep
  // pushing to the enemy flag instead of hunting the last enemy they saw.
  urgent(bot){
    const own=this.flags[bot.team],enemy=this.flags[other(bot.team)];
    if(bot.carrying)return own.base;
    if(bot.role==='defend')return own.state!=='home'?{x:own.x,z:own.z}:null;
    return enemy.state!=='carried'?{x:enemy.x,z:enemy.z}:null;
  }
  goal(bot){
    const own=this.flags[bot.team],enemy=this.flags[other(bot.team)];
    if(own.state!=='home'&&(bot.role==='defend'||distance(bot,own)<distance(bot,enemy)))return {x:own.x,z:own.z};
    if(bot.role==='defend'){const a=bot.brain?.seed||0;return {x:own.base.x+Math.cos(a)*4,z:own.base.z+Math.sin(a)*3};}
    if(enemy.state==='carried'){const c=this.room.players.get(enemy.carrier);if(c)return {x:c.x,z:c.z};}
    return {x:enemy.x,z:enemy.z};
  }
  objective(){return {flags:Object.fromEntries(Object.entries(this.flags).map(([team,f])=>[team,{state:f.state,x:f.x,z:f.z,y:f.y,base:{...f.base},carrier:f.carrier,returnIn:f.state==='dropped'?Math.max(0,f.returnAt-this.room.clock):0}]))};}
}

// Co-op against the AI: humans and squad bots are Alpha, enemies Bravo.
class Coop extends Mode {
  get pvp(){return false;}
  get botInterval(){return .25;}
  assignTeam(){if(this.room.humanCount>=this.rules.blue)throw new Error('data.error.squadFull');return 'blue';}
  botSlots(){return {blue:this.rules.blue};}
  botName(team,slot,hostileBot){return hostileBot?`HOSTILE ${String(slot).padStart(2,'0')}`:`ALPHA ${String(slot+1).padStart(2,'0')}`;}
  // Enemies keep the light damage of the original solo missions.
  botDamage(bot){return bot.hostile?.28:.8;}
  ready(){return this.room.humanCount>0;}
  spawnPoint(p){
    if(!p.hostile)return super.spawnPoint(p);
    const squad=this.living(a=>a.team==='blue'),obstacles=this.room.world.obstacles,points=this.map.enemySpawns.filter(s=>!collides(s.x,s.z,.4,obstacles));
    const far=points.filter(s=>squad.every(a=>distance(s,a)>14)),pool=far.length?far:points;
    return {...pool[Math.floor(this.room.random()*pool.length)]};
  }
  hostiles(){return this.living(p=>p.hostile);}
  spawnHostiles(count){for(let i=0;i<count;i++)this.room.addBot('red',{hostile:true});}
  resupplySquad(revive=false){for(const p of this.room.players.values())if(p.team==='blue'){if(p.alive)this.room.resupply(p);else if(revive)this.room.spawn(p);}}
  onDeath(p){if(p.hostile){p.discardAt=this.room.clock+5;p.respawnAt=Infinity;}else p.respawnAt=this.room.clock+10;}
  onKill(attacker,victim){if(!attacker||!hostile(attacker,victim))return false;attacker.kills++;if(attacker.team==='blue')this.room.scores.blue++;return true;}
  // The mission fails when every human of the squad is down at once.
  result(){
    if(this.outcome)return this.outcome;
    const humans=this.room.actors.filter(p=>!p.isBot);
    if(humans.length&&humans.every(p=>!p.alive))return {winner:'red',reason:'wiped'};
    if(this.rules.duration&&this.room.remaining<=0)return {winner:'red',reason:'time'};
    return null;
  }
}
class Assault extends Coop {
  setup(){super.setup();this.relay=0;this.capture=0;this.contested=false;this.reinforcement=20;this.spawnHostiles(this.rules.red);}
  get relays(){return this.map.relays;}
  tick(dt){
    const r=this.relays[this.relay],inside=this.living(p=>p.team==='blue'&&distance(p,r)<3.25).length>0;
    this.contested=this.hostiles().some(p=>distance(p,r)<4.5);this.capture=captureStep(this.capture,dt,inside,this.contested);
    if(this.capture>=1){
      this.relay++;this.capture=0;this.resupplySquad();this.room.emit('objective',{action:'relay',name:r.name,index:this.relay-1});
      if(this.relay>=this.relays.length){this.outcome={winner:'blue',reason:'objective'};return;}
      this.spawnHostiles(2);
    }
    this.reinforcement-=dt;if(this.reinforcement<=0){this.reinforcement=24;if(this.hostiles().length<this.rules.red)this.spawnHostiles(2);}
  }
  goal(){return this.relays[Math.min(this.relay,this.relays.length-1)];}
  objective(){return {relay:this.relay,relays:this.relays.length,capture:this.capture,contested:this.contested};}
}
class Survival extends Coop {
  setup(){super.setup();this.wave=0;this.waveDelay=0;this.nextWave();}
  // Squad members that fell come back with the next wave.
  onDeath(p){super.onDeath(p);if(!p.hostile)p.respawnAt=Infinity;}
  waveSize(){return Math.min(16,this.rules.red+2*(this.wave-1));}
  nextWave(){this.wave++;this.waveDelay=0;this.resupplySquad(true);this.spawnHostiles(this.waveSize());this.room.emit('objective',{action:'wave',wave:this.wave,size:this.waveSize()});}
  tick(dt){
    if(this.hostiles().length)return;
    if(this.wave>=this.rules.score){this.outcome={winner:'blue',reason:'objective'};return;}
    if(!this.waveDelay){this.waveDelay=6;this.resupplySquad(true);this.room.emit('objective',{action:'cleared',wave:this.wave});}
    else{this.waveDelay=Math.max(0,this.waveDelay-dt);if(this.waveDelay<=0)this.nextWave();}
  }
  // Hostiles close in on the squad; allies stay near a human.
  goal(bot){
    const targets=this.living(p=>p.team!==bot.team&&(bot.hostile||!p.isBot));if(!targets.length)return undefined;
    const t=targets.reduce((a,b)=>distance(bot,a)<distance(bot,b)?a:b),a=bot.brain?.seed||0;
    return bot.hostile?{x:t.x+Math.cos(a)*5,z:t.z+Math.sin(a)*5}:{x:t.x+Math.cos(a)*2.5,z:t.z+Math.sin(a)*2.5};
  }
  objective(){return {wave:this.wave,waves:this.rules.score,waveDelay:this.waveDelay,hostiles:this.hostiles().length};}
}
const LOGIC={tdm:TeamDeathmatch,ffa:FreeForAll,ctf:CaptureTheFlag,assault:Assault,survival:Survival};
export const createModeLogic=room=>new LOGIC[room.rules.mode](room);
