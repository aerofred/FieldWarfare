import * as THREE from 'three';
import {botProfile,botLevel} from './bot-ai.js';
import {mapConfig} from './maps.js';
import {moveCharacter} from './collision.js';
import {animateSoldier,createAmmoBox} from './models.js';
import {WEAPONS} from './rules.js';
import {MUZZLE} from './effects.js';
import {updateShield,flashShield} from './spawn-shield.js';
import {MODES,modeId,normalizeRules} from './modes.js';
import {GameRoom} from './sim/room.js';
import {t} from './i18n.js';
const $=id=>document.getElementById(id);
const muzzle=new THREE.Vector3(),eye=new THREE.Vector3(),near=new THREE.Vector3(),shot=new THREE.Vector3(),frustum=new THREE.Frustum(),viewProjection=new THREE.Matrix4(),bounds=new THREE.Sphere(new THREE.Vector3(),2.4);
// Soldiers out of the camera's view animate every third frame; those within
// this distance always animate, so a flanker stepping into view is never
// caught mid-pose.
const LOD_NEAR=7,LOD_STEP=3;
const finitePlayer=p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&['blue','red','ffa'].includes(p.team)&&['x','z','jump','yaw','pitch','health'].every(k=>Number.isFinite(p[k]));

export function socketAddress(value){
  const url=new URL(value||location.origin);if(!['http:','https:','ws:','wss:'].includes(url.protocol)||url.username||url.password)throw new Error(t('game.net.badAddress'));
  url.protocol=['https:','wss:'].includes(url.protocol)?'wss:':'ws:';url.pathname='/multiplayer';url.search='';url.hash='';return url.href;
}
// Client side of a game room: turns snapshots and events into what the Game
// shows. NetworkSession carries them over a WebSocket; LocalSession runs the
// same room inside the page for solo play.
class Session {
  constructor(game,{name,team='auto',weapon=0,sidearm,botDifficulty='soldier',mapId='factory',mode='tdm',rules=null,onDisconnect=()=>{}}){this.game=game;this.name=name;this.team=team;this.weapon=weapon;this.sidearm=sidearm;this.mapId=mapId;this.botDifficulty=botLevel(botDifficulty);this.mode=modeId(mode);this.rules=normalizeRules(this.mode,rules);this.onDisconnect=onDisconnect;this.ready=false;this.intentional=false;this.seq=0;this.inputTime=0;this.pingTime=0;this.latency=0;this.lastEvent=0;this.phase='waiting';this.round=null;this.overRound=null;this.visualGrenades=new Map();this.visualDrops=new Map();}
  get online(){return true;}
  joinMessage(){return {type:'join',name:this.name,team:this.team,weapon:this.weapon,sidearm:this.sidearm,botDifficulty:this.botDifficulty,mapId:this.mapId,mode:this.mode,rules:this.rules};}
  welcome(message){const s=message.snapshot;this.id=message.id;this.ready=true;this.game.start(modeId(s.mode),this.weapon,this,s.mapId||'factory',s.rules,s.self?.sidearm??this.sidearm);this.apply(s,true);}
  dispose(){for(const mesh of this.visualGrenades.values()){this.game.scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}this.visualGrenades.clear();for(const box of this.visualDrops.values())this.game.scene.remove(box);this.visualDrops.clear();}
  apply(snapshot,initial=false){
    if(!Array.isArray(snapshot.players)||!snapshot.players.every(finitePlayer)||!snapshot.self)return;
    const g=this.game,own=snapshot.players.find(p=>p.id===this.id);if(!own)return;const newRound=this.round!==null&&this.round!==snapshot.round,wasAlive=g.player.alive,oldHealth=g.player.health;
    this.round=snapshot.round;this.phase=snapshot.phase;this.lastSnapshot=snapshot;g.elapsed=snapshot.elapsed;g.remaining=snapshot.remaining;g.teamScores={...snapshot.teamScores};g.objective=snapshot.objective;g.rules=snapshot.rules||g.rules;g.botDifficulty=snapshot.botDifficulty||g.botDifficulty;
    const teleport=initial||newRound||!wasAlive||Math.hypot(g.player.x-own.x,g.player.z-own.z)>3;
    this.authoritative={x:own.x,z:own.z};if(teleport){g.player.x=own.x;g.player.z=own.z;g.yaw=own.yaw;g.pitch=own.pitch;g.keys.clear();g.mouseDown=false;g.aim=false;}
    Object.assign(g.player,{id:own.id,name:own.name,team:own.team,health:own.health,alive:own.alive,kills:own.kills,deaths:own.deaths,captures:own.captures||0,carrying:own.carrying||null,jump:own.jump,vy:own.vy||0,protectedUntil:g.elapsed+own.protectedFor});
    g.lastOnlineCrouch=own.crouch;g.kills=own.kills;g.shots=snapshot.self.shots;g.hits=snapshot.self.hits;g.ammunition=snapshot.self.ammunition.map(a=>({...a}));g.grenadeCount=snapshot.self.grenades;g.respawnTimer=own.respawnIn;
    if(g.selected!==own.weapon)g.equip(own.weapon,true);
    // The weapons carried, and those chosen for the next life unless a choice is on its way.
    g.primary=snapshot.self.primary??g.primary;g.sidearm=snapshot.self.sidearm??g.sidearm;if(performance.now()-(g.pendingLoadoutAt||0)>600){g.nextPrimary=snapshot.self.nextPrimary??g.primary;g.nextSidearm=snapshot.self.nextSidearm??g.sidearm;}if(!own.alive||g.state==='paused')g.renderLoadout?.();
    if(snapshot.self.reload>0&&g.reloadTime<=0){g.aim=false;g.reloadEmpty=(g.ammunition[g.selected]?.ammo??0)===0;g.audio.reload(snapshot.self.reload,g.weapon.id,g.reloadEmpty);g.ejectPending=g.weapon.id==='revolver'?g.weapon.capacity-(g.ammunition[g.selected]?.ammo??0):0;}g.reloadTime=snapshot.self.reload;$('reload-notice').classList.toggle('hidden',g.reloadTime<=0||!own.alive);
    if(oldHealth>own.health&&own.alive){g.gamepad?.rumble(.7,.35,160);g.damageTime=.55;g.audio.hurt();g.shake=Math.max(g.shake||0,.18+(oldHealth-own.health)/120);}
    if(!initial&&wasAlive&&!own.alive)g.onDeath();
    if(!initial&&!wasAlive&&own.alive)g.onRespawn();
    $('respawn-overlay').classList.toggle('hidden',own.alive||snapshot.phase==='over');$('respawn-countdown').textContent=own.respawnIn<0?'—':Math.ceil(own.respawnIn);$('respawn-help').textContent=t(own.respawnIn<0?'game.respawn.nextWave':'game.respawn.auto');
    const remoteIds=new Set(snapshot.players.filter(p=>p.id!==this.id).map(p=>p.id));
    for(let i=g.bots.length-1;i>=0;i--)if(!remoteIds.has(g.bots[i].id)){g.disposeActor(g.bots[i]);g.bots.splice(i,1);}
    for(const p of snapshot.players)if(p.id!==this.id){
      let b=g.bots.find(b=>b.id===p.id);
      if(!b){b=g.createRemotePlayer(p);g.bots.push(b);}
      if(b.alive&&!p.alive)g.setFall(b,b.lastHitDir);if(p.health<b.health&&p.alive)b.model.flinch=1;
      const respawn=!b.alive&&p.alive;if(respawn||newRound||Math.hypot(b.x-p.x,b.z-p.z)>3){b.x=p.x;b.z=p.z;if(respawn||newRound){b.model.body.rotation.set(0,0,0);b.model.body.position.y=0;}}
      Object.assign(b,{name:p.name,team:p.team,isBot:!!p.isBot,hostile:!!p.hostile,health:p.health,alive:p.alive,kills:p.kills,deaths:p.deaths,captures:p.captures||0,carrying:p.carrying||null,weapon:p.weapon,reload:p.reload||0,pitch:p.pitch,targetX:p.x,targetZ:p.z,targetYaw:p.yaw,targetJump:p.jump,crouch:p.crouch,climbing:!!p.climbing,protectedUntil:p.alive?g.time+(p.protectedFor||0):0});
    }
    const ids=new Set(snapshot.grenades.map(p=>p.id));for(const [id,mesh]of this.visualGrenades)if(!ids.has(id)){g.scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();this.visualGrenades.delete(id);}
    for(const grenade of snapshot.grenades){let mesh=this.visualGrenades.get(grenade.id);if(!mesh){mesh=new THREE.Mesh(new THREE.SphereGeometry(.13,8,6),new THREE.MeshStandardMaterial({color:'#464e32'}));mesh.castShadow=true;g.scene.add(mesh);this.visualGrenades.set(grenade.id,mesh);}mesh.position.set(grenade.x,grenade.y,grenade.z);}
    // Ammunition boxes on the ground; they blink through their last five seconds.
    const drops=Array.isArray(snapshot.drops)?snapshot.drops:[],dropIds=new Set(drops.map(d=>d.id));for(const [id,box]of this.visualDrops)if(!dropIds.has(id)){g.scene.remove(box);this.visualDrops.delete(id);}
    for(const drop of drops){let box=this.visualDrops.get(drop.id);if(!box){box=createAmmoBox();box.position.set(drop.x,drop.y,drop.z);box.rotation.y=Math.random()*Math.PI;g.scene.add(box);this.visualDrops.set(drop.id,box);}box.visible=drop.expiresIn>5||Math.floor(drop.expiresIn*4)%2===0;}
    if(snapshot.phase==='waiting'&&g.state==='ended')g.transition('paused');
    if(newRound){this.overRound=null;g.resetCombat();g.transition(g.inputCaptured()?'active':'paused');g.notify(t('game.net.newRound'),g.goalText());}
    if(snapshot.phase==='over'&&this.overRound!==snapshot.round){this.overRound=snapshot.round;if(g.state==='paused')g.state='active';g.showResult(snapshot);}
  }
  createInput(stopped=false){
    const g=this.game,move=g.moveInput?.()||{forward:0,strafe:0,sprint:false,jump:false},active=!stopped&&g.state==='active'&&g.player?.alive;
    // In an augmented reality room the device places the operator.
    const device=g.ar?.room&&g.player?{x:g.player.x,y:g.ar.deviceHeight(),z:g.player.z}:null;
    return {type:'input',seq:++this.seq,forward:active?move.forward:0,strafe:active?move.strafe:0,yaw:g.yaw+(g.punch?.yaw||0),pitch:Math.max(-1.45,Math.min(1.45,g.pitch+(g.punch?.pitch||0))),sprint:active&&(g.sprinting??move.sprint),crouch:active&&!!g.crouchToggle,jump:active&&move.jump,aim:active&&g.aim,fire:active&&g.mouseDown&&!(g.sprintOut>0),...device};
  }
  stopInput(){if(this.ready)this.send(this.createInput(true));}
  action(action,extra={}){if(action==='fire'||action==='grenade')this.send(this.createInput());this.send({type:'action',action,...extra});}
  fire(){if(this.phase==='active')this.action('fire');}
  // Asks for the next round; alone, it starts right away.
  redeploy(){if(this.phase!=='over')return;this.action('redeploy');if((this.lastSnapshot?.humans||1)>1)this.game.notify(t('game.net.waitingPlayers'),t('game.net.nextRound',{seconds:Math.ceil(this.lastSnapshot.restartIn)}));}
  releaseFire(){this.send(this.createInput());}
  event(event){
    const g=this.game;
    if(event.type==='shot'){
      const local=event.actor===this.id,weapon=WEAPONS[event.weapon]?.id||WEAPONS[0].id,origin=new THREE.Vector3(event.origin.x,event.origin.y,event.origin.z),end=new THREE.Vector3(event.end.x,event.end.y,event.end.z),direction=end.clone().sub(origin).normalize();
      g.audio.shot(weapon,!local,local?null:origin);
      if(local){g.applyRecoil();g.ownShotEffects(direction,end);if(event.hit)g.markHit(!!event.head,false);}
      else{const actor=g.bots.find(b=>b.id===event.actor);if(actor){actor.flashTime=.08;actor.model.flash.rotation.z=Math.random()*6;actor.lastShotTime=g.time;(actor.model.muzzleTip??actor.model.flash).getWorldPosition(muzzle);g.visuals.effects.muzzle(muzzle,direction,weapon);actor.heat=Math.min(1,(actor.heat||0)+(MUZZLE[weapon]?.heat??.1));actor.shotCount=(actor.shotCount||0)+1;if(actor.shotCount%2)g.tracer(muzzle,end);}
       if(event.hit===this.id)g.addDamageIndicator(origin);
       else if(g.player.alive&&g.isEnemy(actor)){const cam=g.camera.position,d=shot.subVectors(end,origin),t=Math.max(0,Math.min(1,eye.subVectors(cam,origin).dot(d)/Math.max(1e-6,d.lengthSq())));near.copy(origin).addScaledVector(d,t);if(near.distanceTo(cam)<1.8&&!WEAPONS[event.weapon]?.suppressed){g.audio.whiz(near);g.shake=Math.max(g.shake||0,.08);}}}
      // A shotgun blast lists every pellet; a bullet is its own single trace.
      // A shot stopped by spawn protection flares the shield instead of marking a wall.
      if(local&&!event.hit&&(event.pellets??[event]).some(trace=>trace.shield))g.markBlocked();
      for(const trace of event.pellets??[event]){if(trace.hit){const victim=g.bots.find(b=>b.id===trace.hit);if(victim){victim.lastHitDir=direction;victim.model.flinch=1;}}else if(trace.shield){const victim=g.bots.find(b=>b.id===trace.shield);if(victim){flashShield(victim.model);g.visuals.effects.sparks(new THREE.Vector3(trace.end.x,trace.end.y,trace.end.z),5,3);}}else g.visuals.impact(event.origin,trace.end);}
    }
    if(event.type==='kill')g.onKill(event,this.id);
    if(event.type==='flag')g.onFlag(event,this.id);
    if(event.type==='pickup'&&event.actor===this.id)g.onPickup();
    if(event.type==='objective')g.onObjective(event);
    if(event.type==='explosion'){g.blast(new THREE.Vector3(event.x,event.y,event.z));for(const id of event.shield??[]){const b=g.bots.find(b=>b.id===id);if(b)flashShield(b.model);}}
    if(event.type==='join'&&!this.lastSnapshot?.players.some(p=>p.id===this.id&&p.name===event.name))g.notify(t('game.net.joined'),event.name,2);
    if(event.type==='leave')g.notify(t('game.net.left'),event.name,2);
  }
  // Prediction correction for the local player and smoothing of the others.
  interpolate(dt){
    const g=this.game;
    if(this.authoritative&&g.player.alive&&!g.ar?.room){const amount=1-Math.exp(-7*dt);moveCharacter(g.player,(this.authoritative.x-g.player.x)*amount,(this.authoritative.z-g.player.z)*amount,g.world);if(g.state!=='active'){g.eyeHeight=g.lastOnlineCrouch?1.12:1.72;g.camera.position.set(g.player.x,g.eyeHeight+.15+g.player.jump,g.player.z);}}
    const amount=1-Math.exp(-16*dt);
    // The camera pose of the last frame is close enough to cull animation.
    viewProjection.multiplyMatrices(g.camera.projectionMatrix,g.camera.matrixWorldInverse);frustum.setFromProjectionMatrix(viewProjection);this.lodFrame=(this.lodFrame||0)+1;
    for(let i=0;i<g.bots.length;i++){const b=g.bots[i],oldX=b.x,oldZ=b.z;g.botFootsteps(b);b.jump=b.targetJump||0;moveCharacter(b,(b.targetX-b.x)*amount,(b.targetZ-b.z)*amount,g.world);const angle=Math.atan2(Math.sin(b.targetYaw-b.model.root.rotation.y-Math.PI),Math.cos(b.targetYaw-b.model.root.rotation.y-Math.PI));b.model.root.rotation.y+=angle*amount;b.model.root.position.set(b.x,.15+(b.targetJump||0),b.z);b.model.root.scale.y=b.crouch?.65:1;
      // Snapshots land in steps: a smoothed velocity drives the gait without jitter.
      if(dt>0){const k=1-Math.exp(-10*dt);b.moveX=(b.moveX||0)+((b.x-oldX)/dt-(b.moveX||0))*k;b.moveZ=(b.moveZ||0)+((b.z-oldZ)/dt-(b.moveZ||0))*k;}
      // Skinning and arm IK only matter on screen: elsewhere the pose catches
      // up every few frames with the time it skipped.
      bounds.center.set(b.x,1.1+(b.targetJump||0),b.z);b.animTime=(b.animTime||0)+dt;
      if(Math.hypot(b.x-g.player.x,b.z-g.player.z)<LOD_NEAR||frustum.intersectsSphere(bounds)||(this.lodFrame+i)%LOD_STEP===0){animateSoldier(b.model,{...b,speed:Math.hypot(b.moveX||0,b.moveZ||0),reloadDuration:WEAPONS[b.weapon]?.reload||2,weaponId:WEAPONS[b.weapon]?.id},b.animTime);b.animTime=0;}
      b.flashTime=Math.max(0,(b.flashTime||0)-dt);b.model.flash.visible=b.alive&&b.flashTime>0;updateShield(b.model,b.alive?Math.max(0,(b.protectedUntil||0)-g.time):0,dt,g.time);b.visible=b.alive&&g.lineOfSight(g.camera.position,eye.set(b.x,1.5+(b.targetJump||0),b.z));
      if(b.visible&&b.model.muzzleTip)g.barrelSmoke(b,dt,g.time-(b.lastShotTime||0),()=>b.model.muzzleTip.getWorldPosition(muzzle));else b.heat=0;
      if(b.marker)b.marker.visible=b.alive&&(!g.isEnemy(b)||!g.coop&&b.visible&&Math.hypot(b.x-g.player.x,b.z-g.player.z)<25);
    }
  }
  update(dt){
    if(!this.ready)return;this.inputTime+=dt;this.pingTime+=dt;
    if(this.inputTime>=1/30){this.inputTime=0;this.send(this.createInput());}
    if(this.pingTime>2){this.pingTime=0;this.send({type:'ping',time:performance.now()});}
    this.interpolate(dt);this.updateHUD();
  }
  updateHUD(){
    const g=this.game,s=this.lastSnapshot;$('network-hud').classList.remove('hidden');$('network-hud').textContent=t('game.net.hud',{humans:s?.humans??1,bots:s?.bots??0,level:botProfile(s?.botDifficulty).label.toUpperCase(),ping:this.latency});
    if(this.phase==='over'&&g.resultBase)$('result-description').textContent=t('game.net.resultNextRound',{result:g.resultBase,seconds:Math.ceil(s.restartIn)});
  }
}

export class NetworkSession extends Session {
  constructor(game,options){super(game,options);this.address=socketAddress(options.address);}
  connect(){return new Promise((resolve,reject)=>{
    this.resolve=resolve;this.reject=reject;this.socket=new WebSocket(this.address);this.deadline=setTimeout(()=>{this.fail(t('game.net.timeout'));this.disconnect();},7000);
    this.socket.onopen=()=>this.send(this.joinMessage());
    this.socket.onmessage=event=>{try{this.message(JSON.parse(event.data));}catch(error){const wasReady=this.ready;this.fail(t('game.net.invalidResponse'));this.disconnect();if(wasReady){this.game.network=null;this.game.lobby();this.onDisconnect(t('game.net.invalidResponseInGame'));}console.error(error);}};
    this.socket.onerror=()=>{if(!this.ready)this.fail(t('game.net.unreachable'));};
    this.socket.onclose=()=>{clearTimeout(this.deadline);if(!this.ready)this.fail(t(this.intentional?'game.net.cancelled':'game.net.interrupted'));if(this.ready&&!this.intentional){this.game.network=null;this.dispose();this.game.lobby();this.onDisconnect(t('game.net.lost'));}this.ready=false;};
  });}
  inputChanged(){if(this.ready){this.inputTime=0;this.send(this.createInput());}}
  fail(message){if(this.reject){this.reject(new Error(message));this.reject=null;this.resolve=null;}}
  send(message){if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(message));}
  disconnect(){this.intentional=true;clearTimeout(this.deadline);this.socket?.close();this.dispose();this.ready=false;}
  message(message){
    // The server's reason is a catalog key (older servers send French text,
    // shown as is: an unknown key comes back unchanged).
    if(message.type==='error'){this.fail(t(message.message||'game.net.refused',message.vars));return;}
    if(message.type==='welcome'){
      if(this.ready)return;clearTimeout(this.deadline);this.welcome(message);this.game.pause();
      const s=message.snapshot,joined=modeId(s.mode);
      this.game.notify(t('game.net.connected'),joined!==this.mode?t('game.net.currentRoom',{mode:MODES[joined].label,map:mapConfig(s.mapId).name}):t(this.game.gamepad.active?'game.net.enterGamepad':this.game.touch.enabled?'game.net.enterTouch':'game.net.enterClick'));
      const resolve=this.resolve;this.resolve=null;this.reject=null;resolve?.(this);return;
    }
    if(message.type==='snapshot'&&this.ready)this.apply(message);
    if(message.type==='events'&&this.ready)for(const event of message.events||[])if(event.id>this.lastEvent){this.lastEvent=event.id;this.event(event);}
    if(message.type==='pong'&&Number.isFinite(message.time))this.latency=Math.round(performance.now()-message.time);
  }
}

// Solo play: the page owns the room, ticks it at 60 Hz while the game is
// active (pausing freezes the battle) and receives its events immediately.
export class LocalSession extends Session {
  get online(){return false;}
  connect(){
    const {type,...join}=this.joinMessage();
    // An augmented reality room brings its own world in place of a map.
    // The room refuses with a catalog key (see the error message above).
    let actor;try{this.room=new GameRoom({autoRestart:false,arena:this.arena||null});actor=this.room.add(join);}catch(error){throw new Error(t(error.message));}this.accumulator=0;
    this.welcome({id:actor.id,snapshot:this.room.snapshot(actor.id)});this.flush();return Promise.resolve(this);
  }
  send(message){
    if(!this.room)return;
    if(message.type==='input')this.room.input(this.id,message);
    if(message.type==='action'){this.room.action(this.id,message);this.flush();}
  }
  flush(){for(const event of this.room.drainEvents()){this.lastEvent=event.id;this.event(event);}}
  disconnect(){this.intentional=true;this.dispose();this.ready=false;this.room=null;}
  update(dt,elapsed=dt){
    if(!this.ready)return;
    if(this.game.state==='active'){
      this.send(this.createInput());this.accumulator=Math.min(this.accumulator+elapsed,.25);
      while(this.accumulator>=1/60){this.room.tick(1/60);this.accumulator-=1/60;}
      this.apply(this.room.snapshot(this.id));if(this.room)this.flush();
    }
    if(this.ready)this.interpolate(dt);
  }
  updateHUD(){$('network-hud').classList.add('hidden');}
}
