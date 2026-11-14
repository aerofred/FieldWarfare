import * as THREE from 'three';
import { createBattlefield } from './map.js';
import {mapId as normalizeMap,mapConfig} from './maps.js';
import {createWorld,clearShot} from './world.js';
import {moveCharacter,setStance,updateVertical,safeEyeHeight,feet} from './collision.js';
import {traverse} from './traversal.js';
import {createWeapon,createSoldier,animateWeapon} from './models.js';
import {Visuals,nativeAntialias} from './visuals.js';
import {MUZZLE} from './effects.js';
import { WEAPONS,SIDEARMS,clamp,distance,formatTime,hostile,moveSpeed,shotSpread } from './rules.js';
import { AudioEngine } from './audio.js';
import {botLevel,botProfile} from './bot-ai.js';
import {MODES,modeId,normalizeRules} from './modes.js';
import {LocalSession} from './network.js';
import {TouchControls} from './touch.js';
import {GamepadControls} from './gamepad.js';
import {AugmentedReality} from './ar.js';
import {t,lang} from './i18n.js';
// Writing a text or a style, even unchanged, makes Safari lay out and
// repaint it with its blurred shadow: the HUD only writes what differs.
const setText=(el,value)=>{value=String(value);if(el.textContent!==value)el.textContent=value;};
const setStyle=(el,property,value)=>{if(el.style[property]!==value)el.style[property]=value;};
import {AimAssist} from './aim-assist.js';
import {attachShield,disposeShield} from './spawn-shield.js';
import {actionMap,learnKey,normalizeBindings} from './keybindings.js';
const $=id=>document.getElementById(id);
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const vec=new THREE.Vector3(),dir=new THREE.Vector3(),target=new THREE.Vector3(),right=new THREE.Vector3(),up=new THREE.Vector3(),muzzle=new THREE.Vector3(),eject=new THREE.Vector3(),kick=new THREE.Vector3();
const damp=THREE.MathUtils.damp;
// Movement keys reach the server at once instead of waiting for the next input tick.
// Actions the room hears about at once, without waiting for the next tick.
const MOVE_ACTIONS=new Set(['forward','back','left','right','sprint','jump']);
// The turn keys turn the head (rad/s at sensitivity 1), from a slower start
// for fine aim to full speed once held a moment.
const KEY_TURN=2.2,KEY_TURN_START=.4,KEY_TURN_RAMP=.3,KEY_PITCH_RATE=7;
// Distance in CSS pixels kept between the objective marker's centre and the
// crosshair: half the marker plus the widest crosshair spread.
const MARKER_CLEARANCE=64;
const TEAM_NAME={blue:'ALPHA',red:'BRAVO'},TEAM_COLOR={blue:'#5fa8d8',red:'#d9744f'};
// Labels for the weapon a kill event names; unknown values show nothing.
// Size of the ejected case: shell, .50 BMG and 7.62 mm are larger than 5.56 mm.
const CASING={r870:1.5,hecate:1.8,mag58:1.3,mp5:.8,ppk:.7},PRIMARIES=WEAPONS.flatMap((w,i)=>w.sidearm?[]:[i]),CHOICES=[...PRIMARIES,...SIDEARMS],EJECT_PORT=[.017,.026,-.012];
// Ordinal category of a place (1st, 2nd…) for the result title.
const ordinal=new Intl.PluralRules(lang,{type:'ordinal'});
const killWeapon=id=>{if(id==='grenade')return {id,name:'GRENADE',short:'GREN.'};const w=WEAPONS.find(w=>w.id===id);return w?{id:w.id,name:w.name,short:w.short}:null;};
// Blast radius of a grenade (see GameRoom.explode), plus a step to get clear.
const GRENADE_ALERT=9;
// Field of view. The player sets it in horizontal degrees (settings.fov,
// FOV_MIN..FOV_MAX); without a choice the view keeps 78° vertical, so wider
// screens see more. The camera works in vertical degrees, converted with the
// screen's aspect. Aiming and sprinting zoom by a ratio of the view's
// tangent, so each keeps its feel at any setting; a headset stays at 78°.
export const DEFAULT_FOV=78,FOV_MIN=45,FOV_MAX=150;
const tanHalf=deg=>Math.tan(THREE.MathUtils.degToRad(deg)/2),fromTan=t=>THREE.MathUtils.radToDeg(2*Math.atan(t));
export const horizontalFov=(vertical,aspect)=>fromTan(tanHalf(vertical)*aspect);
export const verticalFov=(horizontal,aspect)=>fromTan(tanHalf(horizontal)/aspect);
export const fovSetting=value=>value==null||value===''||!Number.isFinite(Number(value))?null:clamp(Math.round(Number(value)),FOV_MIN,FOV_MAX);
const AIM_ZOOM=tanHalf(58)/tanHalf(DEFAULT_FOV),SPRINT_ZOOM=tanHalf(84)/tanHalf(DEFAULT_FOV);
const zoomFov=(fov,ratio)=>Math.min(170,fromTan(tanHalf(fov)*ratio));
// The Game renders a room it does not own: a LocalSession in solo, a
// NetworkSession online. It predicts the local player's movement, animates
// everyone else and turns the room's events into sound, effects and HUD.
export class Game {
 constructor(settings,onState){
  this.settings=settings;this.onState=onState;this.state='lobby';this.mode='assault';this.rules=normalizeRules('assault');this.selected=0;this.keys=new Set();settings.keys=normalizeBindings(settings.keys);this.keyActions=actionMap(settings.keys);this.mouseDown=false;this.aim=false;this.yaw=0;this.pitch=0;this.time=0;this.elapsed=0;this.remaining=0;this.recoil=0;this.bob=0;this.bots=[];this.notifyTime=0;this.lastFrame=0;this.uiTick=0;this.audio=new AudioEngine(settings.volume/100);
  this.punch={pitch:0,yaw:0};this.bloom=0;this.shake=0;this.sway={x:0,y:0};this.swayInput={x:0,y:0};this.velocity={x:0,z:0};this.breath=1;this.tilt=0;this.landKick=0;this.sprintBlend=0;this.sprintOut=0;this.equipTime=0;this.heartbeat=0;this.indicators=[];this.teamScores={blue:0,red:0};this.objective=null;
  this.canvas=$('world');this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:nativeAntialias(settings.quality),powerPreference:'high-performance'});this.renderer.setClearColor('#b0b7a5');this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.08;this.renderer.autoClear=false;
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#adb4a3');this.scene.fog=new THREE.FogExp2('#a6af9a',.014);
  this.camera=new THREE.PerspectiveCamera(78,innerWidth/innerHeight,.05,180);this.camera.rotation.order='YXZ';this.ambient=new THREE.HemisphereLight('#d4dfcb','#3c4233',2.1);this.scene.add(this.ambient);
  this.sun=new THREE.DirectionalLight('#ffe6b4',3.3);this.sun.position.set(-26,44,18);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-44,right:44,top:44,bottom:-44,near:.5,far:130});this.sun.shadow.bias=-.0003;this.sun.shadow.normalBias=.05;this.scene.add(this.sun);
  // One persistent blast light: adding lights at runtime would recompile every shader.
  this.blastLight=new THREE.PointLight('#ffbb65',0,16,2);this.blastLife=0;this.scene.add(this.blastLight);
  this.loadMap(settings.mapId);
  this.gunScene=new THREE.Scene();this.gunCamera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.01,10);this.gunScene.add(new THREE.HemisphereLight('#e2e9d7','#4c5540',2.4));const gunLight=new THREE.DirectionalLight('#ffedca',3);gunLight.position.set(-3,6,2);this.gunScene.add(gunLight);this.equip(0,true);
  const cloth=(color,group,x)=>{const flag=new THREE.Mesh(new THREE.PlaneGeometry(1.1,.65,8,1),new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,roughness:1}));flag.position.set(x,3,0);group.add(flag);return flag;};
  const pole=group=>{const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,3.5,8),this.map.mat.steel);mesh.position.set(0,1.75,0);mesh.castShadow=true;group.add(mesh);return mesh;};
  // Flat and depth-free: one pass draws what three.js's two-pass
  // transparent double-sided path would, without switching programs.
  const ring=(radius,color)=>{const mesh=new THREE.Mesh(new THREE.RingGeometry(radius,radius+.12,64),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false,forceSinglePass:true}));mesh.rotation.x=-Math.PI/2;return mesh;};
  this.relayObjects=this.relays.map(r=>{const group=new THREE.Group();group.position.set(r.x,.16,r.z);const zone=ring(3.2,'#d3f36a');group.add(zone);pole(group);const flag=cloth('#b7d75b',group,.55);this.scene.add(group);group.visible=false;return{group,ring:zone,flag,base:flag.geometry.attributes.position.array.slice()};});
  // Capture the flag: a base ring per team and a flag that can leave it.
  this.flagObjects=Object.fromEntries(['blue','red'].map(team=>{const base=ring(2.1,TEAM_COLOR[team]);base.position.y=.17;const carry=new THREE.Group(),flag=cloth(TEAM_COLOR[team],carry,.55);pole(carry);this.scene.add(base,carry);base.visible=carry.visible=false;return [team,{base,carry,flag,rest:flag.geometry.attributes.position.array.slice()}];}));
  this.visuals=new Visuals(this);this.ar=new AugmentedReality(this);this.touch=new TouchControls(this);this.gamepad=new GamepadControls(this);this.aimAssist=new AimAssist(this);this.bindInput();this.setQuality();this.resize();this.frame=this.frame.bind(this);requestAnimationFrame(this.frame);
 }
 get coop(){return !!MODES[this.mode]?.coop;}
 // Split screen for a Cardboard-style headset, while the operator plays:
 // death and the menus show the normal view, to be read out of it.
 get stereo(){return this.settings.display==='vr'&&isSecureContext&&this.touch.enabled&&this.state==='active'&&!!this.player?.alive&&!this.ar?.active;}
 get online(){return !!this.network?.online;}
 // 'room': the augmented reality room scanned (see ar.js), no map drawn.
 loadMap(value){
  const room=value==='room'&&!!this.ar?.arena,id=room?'room':normalizeMap(value);if(this.map&&this.mapId===id&&(!room||this.map.arena===this.ar.arena))return;
  if(this.mapRoot){
   const geometries=new Set(),materials=new Set(),textures=new Set();
   const collect=m=>{if(m.geometry)geometries.add(m.geometry);for(const material of Array.isArray(m.material)?m.material:[m.material])if(material){materials.add(material);for(const v of Object.values(material))if(v?.isTexture)textures.add(v);}};
   this.mapRoot.traverse(collect);this.map.solidMeshes.forEach(collect);this.scene.remove(this.mapRoot);
   geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());
  }
  this.mapId=id;this.mapConfig=room?this.ar.arena.config:mapConfig(id);this.relays=this.mapConfig.relays;this.minimapLayer=null;this.audio.setRoom(id);
  this.mapRoot=new THREE.Group();this.scene.add(this.mapRoot);this.map=room?this.ar.battlefield(this.mapRoot):createBattlefield(this.mapRoot,id);this.world=this.map.world||createWorld(id);
  this.scene.background=new THREE.Color(this.mapConfig.sky);this.scene.fog.color.set(this.mapConfig.fog);this.renderer.setClearColor(this.mapConfig.sky);this.sun.intensity=this.mapConfig.sun;
  this.visuals?.setMap(id);if(this.visuals)this.visuals.setQuality(this.settings.quality);
  this.relayObjects?.forEach((o,i)=>{o.group.position.set(this.relays[i].x,.16,this.relays[i].z);o.group.children[1].material=this.map.mat.steel;});
  if(this.flagObjects)for(const o of Object.values(this.flagObjects))o.carry.children[1].material=this.map.mat.steel;
  document.querySelector('.operation-label strong').textContent=this.mapConfig.operation;document.querySelector('.briefing-grid h3').textContent=this.mapConfig.name;document.querySelector('.briefing-grid p').textContent=t('game.briefing.text',{description:this.mapConfig.description});
  document.querySelector('.map-label small').textContent=this.mapConfig.sector;document.querySelector('.map-label strong').textContent=this.mapConfig.name.toUpperCase();document.querySelector('.map-label div>span').textContent=t('game.briefing.mapInfo');
 }
 setQuality(){this.visuals.setQuality(this.settings.quality);this.resize();}
 // iOS can fire resize mid-rotation with one stale dimension and no event
 // after it, so every frame also checks the size it last applied.
 // The view's resting field of view, in vertical degrees for this screen.
 baseFov(){const h=this.settings.fov;return h==null?DEFAULT_FOV:clamp(verticalFov(h,this.camera.aspect),10,170);}
 // A new setting or screen shape applies at once, not through the zoom.
 applyFov(){if(!this.stereo)this.camera.fov=this.baseFov();this.camera.updateProjectionMatrix();}
 resize(){this.viewSize=`${innerWidth}x${innerHeight}`;this.renderer.setSize(innerWidth,innerHeight);this.camera.aspect=this.gunCamera.aspect=innerWidth/innerHeight;if(this.aim)this.camera.updateProjectionMatrix();else this.applyFov();this.gunCamera.updateProjectionMatrix();this.visuals?.resize();}
 bindInput(){
  addEventListener('resize',()=>this.resize());
  // Keys go through the bindings chosen in the briefing (settings.keys).
  // Escape always pauses; while down, 1 to 5 pick the next main weapon.
  document.addEventListener('keydown',e=>{learnKey(e);if(this.state!=='active')return;if(e.code==='Escape'&&document.pointerLockElement!==this.canvas){this.pause();return;}const action=this.keyActions.get(e.code);if(action||['Tab','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(action==='scores')this.showScoreboard(true);if(!this.player.alive){if(/^Digit[1-9]$/.test(e.code)&&!e.repeat)this.chooseLoadout(CHOICES[Number(e.code.slice(-1))-1]);return;}this.keys.add(e.code);if(e.repeat)return;
   switch(action){case 'reload':this.reload();break;case 'grenade':this.throwGrenade();break;case 'fire':this.trigger(true);break;case 'aim':this.aimInput(true);break;case 'primary':this.equip(this.loadout()[0]);break;case 'secondary':this.equip(this.loadout()[1]);break;case 'jump':this.jumpQueued=true;this.crouchToggle=false;break;case 'crouch':this.crouchToggle=!this.crouchToggle;break;}
   if(MOVE_ACTIONS.has(action))this.network?.inputChanged?.();});
  // With two keys on one action, releasing one keeps it going.
  document.addEventListener('keyup',e=>{this.keys.delete(e.code);const action=this.keyActions.get(e.code);if(!action)return;if(this.state==='active')e.preventDefault();if(this.held(action))return;if(action==='scores')this.showScoreboard(false);if(action==='fire')this.trigger(false);if(action==='aim')this.aimInput(false);if(MOVE_ACTIONS.has(action))this.network?.inputChanged?.();});
  // The mouse takes the view back from keyboard-only play.
  document.addEventListener('mousemove',e=>{if(this.state!=='active'||!this.player.alive||document.pointerLockElement!==this.canvas)return;if(e.movementX||e.movementY)this.keyboardLook=false;this.turn(e.movementX,e.movementY);});
  // Mouse wheel cycles rifle ↔ revolver ↔ other weapons; one step per notch.
  // A trackpad swipe adds up to one step, and the swipe and its inertia must
  // stop for a moment before the next one.
  document.addEventListener('wheel',e=>{if(this.state!=='active'||!this.player||document.pointerLockElement!==this.canvas||!e.deltaY)return;e.preventDefault();const now=performance.now();
   if(this.settings.pointer==='trackpad'){if(now-(this.lastWheel||0)>250){this.wheelSum=0;this.wheelArmed=true;}this.lastWheel=now;if(!this.wheelArmed)return;this.wheelSum+=e.deltaY;if(Math.abs(this.wheelSum)<60)return;this.wheelArmed=false;this.cycleWeapon(Math.sign(this.wheelSum));return;}
   if(now-(this.lastWheel||0)<140)return;this.lastWheel=now;this.cycleWeapon(e.deltaY>0?1:-1);},{passive:false});
  document.addEventListener('mousedown',e=>{if(this.state!=='active'||!this.player.alive||document.pointerLockElement!==this.canvas)return;if(e.button===0)this.trigger(true);if(e.button===2)this.aimInput(true);});
  document.addEventListener('mouseup',e=>{if(e.button===0)this.trigger(false);if(e.button===2)this.aimInput(false);});
  this.canvas.addEventListener('contextmenu',e=>e.preventDefault());
  // Back to the mouse after playing with a controller: a click captures it.
  this.canvas.addEventListener('click',()=>{if(this.state==='active'&&!this.touch.enabled&&!this.gamepad.active&&document.pointerLockElement!==this.canvas)this.lock();});
  document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&this.state==='active')this.pause();});
  document.addEventListener('pointerlockerror',()=>{if(this.state==='active')this.pause();$('lock-help').textContent=t('game.pause.lockRefused');});
  addEventListener('blur',()=>{this.keys.clear();this.mouseDown=false;this.touch.reset();if(this.state==='active')this.pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.state==='active')this.pause();});
 }
 // View rotation in mouse counts; touch drags are scaled before they get here.
 // Sticks and touch pass assisted=true and get the aim assist friction.
 // A trackpad has its own sensitivity, apart from the mouse.
 // The view turns slower in the sights, slower still behind a scope.
 aimSlowdown(){return this.aim?(this.weapon.scope?.32:.56):1;}
 turn(dx,dy,assisted=false){const sensitivity=!assisted&&this.settings.pointer==='trackpad'?this.settings.trackpadSensitivity??1:this.settings.sensitivity,s=.0018*sensitivity*this.aimSlowdown()*(assisted?this.aimAssist.look():1);this.yaw-=dx*s;this.pitch=clamp(this.pitch-dy*s,-1.45,1.45);this.swayInput.x+=dx*s;this.swayInput.y+=dy*s;}
 // Gyroscope: the device's own turn in radians (left and up positive), at
 // its own sensitivity and never assisted. Not slowed in the sights: the
 // device keeps pointing where the view points, as a VR headset does.
 // In a headset the view turns exactly as the head does. Tilt aiming
 // passes turns already slowed in the sights.
 rotate(yaw,pitch){const s=this.stereo?1:this.settings.gyroSensitivity??1;this.yaw+=yaw*s;this.pitch=clamp(this.pitch+pitch*s,-1.45,1.45);this.swayInput.x-=yaw*s;this.swayInput.y-=pitch*s;}
 // Right button and E aim while held, or switch aiming on and off.
 aimInput(down){if(this.settings.aimMode==='toggle'){if(down)this.aim=!this.aim;}else this.aim=down;}
 trigger(down){if(down){this.mouseDown=true;this.fire(true);}else{this.mouseDown=false;this.network?.releaseFire();}}
 // Next or previous weapon, counted from a change still waiting for the room.
 // The main weapon and the sidearm chosen in the lobby: keys 1 and 2.
 loadout(){return [this.primary??0,this.sidearm??SIDEARMS[0]];}
 // While down or in the pause menu: the main weapon or the sidearm carried
 // from the next spawn on. The choice shows at once; the next snapshot
 // confirms it.
 chooseLoadout(index){
  if(!WEAPONS[index]||(this.player?.alive&&this.state!=='paused'))return;
  if(WEAPONS[index].sidearm)this.nextSidearm=index;else this.nextPrimary=index;
  this.pendingLoadoutAt=performance.now();this.network?.action('loadout',{weapon:index});this.renderLoadout();this.audio.tone(550,.06,.035);
 }
 // One row of main weapons, one of sidearms; keys 1 to 7 while down.
 renderLoadout(){
  const next=[this.nextPrimary??this.primary,this.nextSidearm??this.sidearm];
  for(const box of document.querySelectorAll('.loadout-choice')){
   if(!box.childElementCount){const row=list=>`<div>${list.map(i=>`<button type="button" data-loadout="${i}"><kbd class="desktop-only">${CHOICES.indexOf(i)+1}</kbd>${WEAPONS[i].short}</button>`).join('')}</div>`;box.innerHTML=row(PRIMARIES)+row(SIDEARMS);box.querySelectorAll('[data-loadout]').forEach(b=>b.addEventListener('click',()=>this.chooseLoadout(Number(b.dataset.loadout))));}
   box.querySelectorAll('[data-loadout]').forEach(b=>{const on=next.includes(Number(b.dataset.loadout));b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  }
 }
 cycleWeapon(step){if(!this.player?.alive){const n=PRIMARIES.length,current=PRIMARIES.indexOf(this.nextPrimary??this.primary??0);this.chooseLoadout(PRIMARIES[(Math.max(0,current)+step+n)%n]);return;}const now=performance.now(),slots=this.loadout(),n=slots.length,current=now-(this.pendingWeaponAt||0)<600&&this.pendingWeapon!==undefined?this.pendingWeapon:this.selected;this.equip(slots[(Math.max(0,slots.indexOf(current))+step+n)%n]);}
 // Whether a key bound to the action is down.
 held(action){const list=this.settings.keys[action];for(let i=0;i<list.length;i++)if(this.keys.has(list[i]))return true;return false;}
 bindingsChanged(){this.keyActions=actionMap(this.settings.keys);this.keys.clear();}
 // Keyboard and touch stick combined. Analog values stay within the unit
 // circle, which the room normalises the same way.
 moveInput(){
  // In an augmented reality room the operator walks for real.
  if(this.ar?.room)return {forward:0,strafe:0,sprint:false,jump:false};
  const t=this.touch;let forward=Number(this.held('forward'))-Number(this.held('back')),strafe=Number(this.held('right'))-Number(this.held('left'));
  for(const source of [t?.enabled&&t,this.gamepad?.active&&this.gamepad])if(source){forward=clamp(forward+source.move.y,-1,1);strafe=clamp(strafe+source.move.x,-1,1);}
  // Seen from outside, the stick pushes relative to the screen.
  if(this.ar?.table)({forward,strafe}=this.ar.move(strafe,forward));
  return {forward,strafe,sprint:this.held('sprint')||!!t?.sprint||!!this.gamepad?.sprint,jump:this.held('jump')||!!t?.jump||!!this.gamepad?.jump};
 }
 // Whether the player can steer right now: captured mouse, touch screen or
 // controller.
 inputCaptured(){return this.touch.enabled||this.gamepad.active||document.pointerLockElement===this.canvas;}
 // Raw mouse input when the browser offers it (no OS acceleration). Touch
 // screens have no pointer lock and steer through the touch controls; a
 // controller needs no capture either.
 async lock(){if(this.touch.enabled||this.gamepad.active){if(this.touch.enabled)this.touch.fullscreen();return;}try{await this.canvas.requestPointerLock({unadjustedMovement:this.settings.pointer!=='trackpad'});}catch{try{await this.canvas.requestPointerLock();}catch{this.pause();$('lock-help').textContent=t('game.pause.lockHelp');}}}
 transition(state){this.state=state;this.onState(state);if(state==='paused')this.renderLoadout();}
 localName(){try{return localStorage.getItem('fw-name')||'ALPHA 01';}catch{return 'ALPHA 01';}}
 // Without a session, start() opens a local room with the lobby settings;
 // the session then calls start() again with the room's actual mode.
 start(mode=this.mode,weapon=this.selected,network=null,mapId=this.settings.mapId,rules=null,sidearm=this.sidearm){
  if(!network){const id=modeId(mode),session=new LocalSession(this,{name:this.localName(),mode:id,rules:rules||this.settings.rules?.[id],weapon,sidearm,mapId,botDifficulty:this.settings.botDifficulty});if(mapId==='room')session.arena=this.ar.arena;session.connect();return session;}
  if(this.network&&this.network!==network)this.network.disconnect();this.network=network;this.primary=WEAPONS[weapon]&&!WEAPONS[weapon].sidearm?weapon:0;this.sidearm=SIDEARMS.includes(sidearm)?sidearm:SIDEARMS[0];this.nextPrimary=this.nextSidearm=undefined;
  this.cleanRound();this.loadMap(mapId);this.mode=modeId(mode);this.rules=normalizeRules(this.mode,rules);this.botDifficulty=botLevel(network.botDifficulty);this.objective=null;
  this.player={id:'local-player',...this.mapConfig.soloSpawn,jump:0,vy:0,health:100,lastHit:-10,alive:true,team:'blue',name:this.localName(),kills:0,deaths:0,captures:0,carrying:null,protectedUntil:0};this.yaw=0;this.pitch=0;this.elapsed=0;this.remaining=this.rules.duration||0;this.teamScores={blue:0,red:0};this.respawnTimer=0;this.cooldown=0;this.reloadTime=0;this.kills=0;this.shots=0;this.hits=0;this.resetCombat();this.grenadeCount=2;this.recoil=0;this.resultBase='';this.resetFeel();this.ammunition=WEAPONS.map(w=>({ammo:w.capacity,reserve:w.reserve}));this.equip(this.primary,true);
  this.transition('active');this.audio.start();$('network-hud').classList.toggle('hidden',!this.online);$('pause').querySelector('p').textContent=t(this.online?'game.pause.online':'game.pause.solo');
  const id=this.mode;this.relayObjects.forEach((o,i)=>{o.group.visible=id==='assault';o.ring.material.color.set(i===0?'#d3f36a':'#83937d');o.flag.material.color.set('#b7d75b');});
  for(const o of Object.values(this.flagObjects))o.base.visible=o.carry.visible=id==='ctf';
  $('capture-points').classList.toggle('hidden',id!=='assault');$('team-scores').classList.toggle('hidden',this.coop);$('team-scores').classList.toggle('ffa-scores',id==='ffa');
  $('blue-label').textContent=id==='ffa'?t('game.hud.you'):'ALPHA';$('red-label').textContent=id==='ffa'?t('game.hud.first'):'BRAVO';$('score-limit').innerHTML=`${this.rules.score}<br>${t(id==='ctf'?'game.stats.capturesShort':'game.stats.killsShort')}`;
  document.querySelector('.timer small').textContent=t(id==='survival'?'game.hud.timeElapsed':'game.hud.timeLeft');
  $('hud-mode').textContent=`${MODES[id].hud} / ${this.online?t('game.hud.online'):this.mapConfig.operation}`;
  if(!this.online)this.notify(this.introTitle(),this.goalText());
  this.updateHUD();if(!this.online)this.lock();
 }
 introTitle(){const r=this.rules,m=this.mode;return m==='assault'?t('game.intro.assault',{operation:this.mapConfig.operation}):m==='survival'?t('game.intro.survival'):m==='ffa'?t('game.result.ffaLabel',{n:r.players}):t(`game.intro.${m}`,{blue:r.blue,red:r.red});}
 goalText(){const n=this.rules.score;return this.mode==='assault'?t('game.goal.assault'):t({survival:'game.goal.survival',ctf:'game.goal.captures'}[this.mode]||'game.goal.kills',{n});}
 // Kills in a row without dying, quick successions and headshots, per round.
 resetCombat(){this.combat={streak:0,best:0,chain:0,lastKill:-Infinity,headshots:0};}
 resetFeel(){this.crouchToggle=false;this.jumpQueued=false;this.punch.pitch=this.punch.yaw=0;this.bloom=0;this.shake=0;this.sway.x=this.sway.y=0;this.swayInput.x=this.swayInput.y=0;this.velocity.x=this.velocity.z=0;this.breath=1;this.tilt=0;this.viewRoll=0;this.landKick=0;this.sprintBlend=0;this.sprintOut=0;this.sprinting=false;this.pendingShot=false;this.damageTime=0;this.hitTime=0;}
 disposeActor(b){disposeShield(b.model);b.model.skeleton?.dispose();b.model.flash.material.dispose();this.scene.remove(b.model.root);b.model.root.traverse(m=>{if(m.isMesh&&!m.userData.shared)m.geometry?.dispose();if(m.isSprite){m.material.map?.dispose();m.material.dispose();}});}
 cleanRound(){this.visuals?.resetImpacts();this.visuals?.effects.clear();this.visuals?.scope.restore();for(const b of this.bots)this.disposeActor(b);this.bots=[];this.blastLife=0;this.blastLight.intensity=0;this.clearIndicators();this.keys.clear();this.touch?.reset();this.gamepad?.release();this.mouseDown=false;this.aim=false;this.showScoreboard(false);$('killfeed').replaceChildren();$('notifications').textContent='';$('respawn-overlay').classList.add('hidden');$('reload-notice').classList.add('hidden');$('capture-notice').classList.add('hidden');$('grenade-warning').classList.add('hidden');this.grenadeAlerts=new Set();$('result-roster').replaceChildren();$('results').firstElementChild.classList.remove('tdm-results');}
 pause(){if(this.state!=='active')return;this.keys.clear();this.touch.reset();this.gamepad.release();this.mouseDown=false;this.aim=false;this.showScoreboard(false);document.body.classList.remove('aiming');this.transition('paused');this.network?.stopInput();if(document.pointerLockElement)document.exitPointerLock();}
 resume(){if(this.state!=='paused')return;this.audio.start();this.transition('active');this.lock();}
 lobby(){this.network?.disconnect();this.network=null;$('network-hud').classList.add('hidden');this.transition('lobby');if(document.pointerLockElement)document.exitPointerLock();this.cleanRound();this.loadMap(this.settings.mapId);for(const o of this.relayObjects)o.group.visible=false;for(const o of Object.values(this.flagObjects))o.base.visible=o.carry.visible=false;document.body.classList.remove('aiming');}
 // Weapon changes go through the room; the view model follows its answer.
 equip(index,fromServer=false){
  if(!fromServer&&index===this.selected&&this.weaponModel&&!(this.pendingWeapon!==undefined&&this.pendingWeapon!==index))return;
  if(this.network&&!fromServer){this.pendingWeapon=index;this.pendingWeaponAt=performance.now();this.network.action('weapon',{weapon:index});return;}
  if(this.weaponModel){this.visuals?.scope.restore();this.weaponModel.flash.material.dispose();this.gunScene.remove(this.weaponModel.group);this.weaponModel.group.traverse(m=>m.geometry?.dispose());}
  if(fromServer)this.pendingWeapon=undefined;this.selected=index;this.weapon=WEAPONS[index];this.weaponModel=createWeapon(this.weapon.id);this.ejectPending=0;this.gunScene.add(this.weaponModel.group);this.reloadTime=0;this.cooldown=.25;this.mouseDown=false;this.aim=false;this.equipTime=.3;this.bloom=0;this.heat=0;$('reload-notice').classList.add('hidden');if(this.ammunition){this.updateHUD();this.audio.reload();}
 }
 // The M14 scope animation costs two scene renders per frame on a phone:
 // touch devices switch straight in and out of the eyepiece.
 instantScope(){return !!this.touch?.enabled&&!!this.weapon?.scope;}
 lineOfSight(a,b){return clearShot(a,b,this.world.solids);}
 isEnemy(actor){return !!actor&&!!this.player&&hostile(this.player,actor);}
 // Spread grows while moving, airborne or firing in sustained bursts;
 // crouching and aiming tighten it.
 currentSpread(){const w=this.weapon,p=this.player;let s=shotSpread(w,this.aim?this.gunAim||0:0)*(1+this.bloom*.9);if(this.moving)s*=this.aim?1.4:1.7;if(p?.crouch)s*=.72;if(p&&!p.grounded&&p.jump>.05)s*=2.6;return s;}
 // Camera punch recovers on its own; a smaller share climbs permanently
 // and must be pulled down by the player, as with a real rifle.
 applyRecoil(){const w=this.weapon,steady=(this.player.crouch?.75:1)*(this.aim?.85:1);this.recoil=Math.min(.14,this.recoil+w.recoil);this.punch.pitch+=w.recoil*.55*steady*(.85+Math.random()*.3);this.punch.yaw+=(Math.random()-.42)*w.recoil*.5*steady;this.pitch=clamp(this.pitch+w.recoil*.22*steady,-1.45,1.45);this.yaw-=(Math.random()-.45)*w.recoil*.12*steady;this.bloom=Math.min(1,this.bloom+(w.auto?.16:.4));this.lastFired=this.time;this.flashTime=.045;if(this.weaponModel?.kind==='revolver')this.weaponModel.spin+=Math.PI/3;const heavy=w.recoil>=.08;this.gamepad?.rumble(w.auto?.12+w.recoil*3:.45,.4,heavy?110:55);this.shake=Math.max(this.shake,heavy?.16:w.auto?.04+w.recoil:.05);}
 // Points relative to the view: muzzle and ejection port for effects.
 viewPoint(forward,side,down,out){this.camera.updateMatrixWorld();right.setFromMatrixColumn(this.camera.matrixWorld,0);up.setFromMatrixColumn(this.camera.matrixWorld,1);this.camera.getWorldDirection(dir);return out.copy(this.camera.position).addScaledVector(dir,forward).addScaledVector(right,side).addScaledVector(up,-down);}
 muzzlePoint(out){const m=this.weaponModel;return this.viewModelPoint([0,m.flash.position.y,m.muzzle??m.flash.position.z],out);}
 // A point of the view model carried into the world: same screen point and
 // depth, although the gun camera has its own field of view.
 viewModelPoint([x,y,z],out){
  const m=this.weaponModel;m.group.updateMatrixWorld();out.set(x,y,z);m.group.localToWorld(out);const depth=-out.z;
  this.camera.updateMatrixWorld();this.camera.getWorldDirection(dir);out.project(this.gunCamera).unproject(this.camera).sub(this.camera.position);return out.multiplyScalar(depth/Math.max(.01,out.dot(dir))).add(this.camera.position);
 }
 // A hot barrel keeps smoking for a few seconds after the last shots.
 barrelSmoke(owner,dt,since,point){owner.heat=Math.max(0,(owner.heat||0)-dt*.22);if(owner.heat<.05||since<.12)return;owner.wisp=(owner.wisp||0)+dt*owner.heat*16;if(owner.wisp<1)return;owner.wisp%=1;this.visuals.effects.wisp(point(),owner.heat);}
 ownShotEffects(direction,end){
  if(this.ar?.table){this.ar.shot(direction,end);return;}
  const a=this.gunAim||0,fx=this.visuals.effects,revolver=this.weapon.id==='revolver';this.muzzlePoint(muzzle);fx.muzzle(muzzle,direction,this.weapon.id,1-a);this.heat=Math.min(1,(this.heat||0)+(MUZZLE[this.weapon.id]?.heat??.1));
  // A revolver keeps its empties in the cylinder until the reload; the
  // pistol throws them from the port of its slide.
  const pistol=this.weapon.id==='ppk';
  if(!revolver){if(pistol)this.viewModelPoint(EJECT_PORT,eject);else this.viewPoint(.32,.2-a*.15,.19-a*.1,eject);kick.copy(right).multiplyScalar((1.6+Math.random()*.8)*(pistol?.7:1)).addScaledVector(up,1.2+Math.random()*.8).addScaledVector(direction,-.4);fx.casing(eject,kick,CASING[this.weapon.id]??1,this.weapon.id==='r870'?'shell':'brass');}
  this.tracerCount=(this.tracerCount||0)+1;if(this.tracerCount%3===1&&end)fx.tracer(muzzle,end);
 }
 // The room traces the shot; recoil and effects follow its 'shot' event.
 fire(triggered=false){
  if(this.state!=='active'||!this.player.alive)return;
  if(this.sprinting){this.sprinting=false;this.sprintOut=this.weapon.ready;}
  if(this.sprintOut>0){if(triggered)this.pendingShot=true;return;}
  if(triggered&&!this.traversal)this.network?.fire();
 }
 // A hit the target's spawn shield took: the marker in the shield's colour, no damage sound.
 markBlocked(){this.hitTime=.12;const marker=$('hitmarker');marker.style.color='#5cc8ff';marker.classList.remove('kill');this.audio.shield();}
 markHit(head,kill){this.hitTime=kill?.3:.15;const marker=$('hitmarker');marker.style.color=kill?'#ef6a4b':head?'#d3f36a':'#f1f0e8';marker.classList.toggle('kill',kill);this.audio.hit(head);if(kill)this.audio.kill();}
 reload(){if(this.player.alive)this.network?.action('reload');}
 // Fall away from the shot or the blast that killed the soldier.
 setFall(actor,direction){if(!actor.model)return;if(!direction){actor.model.fall={x:0,z:Math.random()<.5?1:-1};return;}const y=actor.model.root.rotation.y,facing=Math.sin(y)*direction.x+Math.cos(y)*direction.z,side=Math.cos(y)*direction.x-Math.sin(y)*direction.z;actor.model.fall=Math.abs(facing)>=Math.abs(side)*.7?{x:facing>0?1:-1,z:(Math.random()-.5)*.5}:{x:(Math.random()-.5)*.4,z:side>0?-1:1};}
 // Screen-edge arcs pointing at whoever is shooting the player.
 addDamageIndicator(source){
  const layer=$('damage-indicators');if(!layer)return;let item=this.indicators.find(i=>i.life<=0)||this.indicators.reduce((a,b)=>a&&a.life<b.life?a:b,null);
  if(!item||this.indicators.length<4&&item.life>0){const el=document.createElement('i');layer.append(el);item={el,life:0};this.indicators.push(item);}
  Object.assign(item,{x:source.x,z:source.z,life:1.6});
 }
 updateIndicators(dt){for(const item of this.indicators){if(item.life<=0)continue;item.life-=dt;const bearing=Math.atan2(-(item.x-this.player.x),-(item.z-this.player.z)),relative=Math.atan2(Math.sin(bearing-this.yaw),Math.cos(bearing-this.yaw));item.el.style.transform=`rotate(${-relative}rad)`;item.el.style.opacity=Math.max(0,Math.min(1,item.life/.6));}}
 // Warning for the nearest live enemy grenade within blast range, placed
 // around the crosshair in its direction. Each new one also beeps once.
 updateGrenadeWarning(){
  const el=$('grenade-warning'),p=this.player,me=this.network?.id,list=p.alive&&this.network?.lastSnapshot?.grenades||[];let nearest=null,best=GRENADE_ALERT;
  for(const g of list){if(g.owner===me||g.team!==undefined&&g.team!=='ffa'&&g.team===p.team)continue;const d=Math.hypot(g.x-p.x,g.z-p.z);if(d<best){best=d;nearest=g;}if(d<GRENADE_ALERT&&!this.grenadeAlerts.has(g.id)){this.grenadeAlerts.add(g.id);this.audio.tone(1250,.09,.07,'square');}}
  if(this.grenadeAlerts.size>32)this.grenadeAlerts=new Set(list.map(g=>g.id));
  el.classList.toggle('hidden',!nearest);if(!nearest)return;
  const bearing=Math.atan2(-(nearest.x-p.x),-(nearest.z-p.z)),relative=Math.atan2(Math.sin(bearing-this.yaw),Math.cos(bearing-this.yaw)),radius=Math.min(150,innerHeight*.24);
  el.style.transform=`translate(${-Math.sin(relative)*radius}px,${-Math.cos(relative)*radius}px)`;el.classList.toggle('close',best<5);el.lastElementChild.textContent=`${Math.round(best)} M`;
 }
 clearIndicators(){for(const item of this.indicators){item.life=0;item.el.style.opacity=0;}}
 throwGrenade(){if(!this.player.alive||this.grenadeCount<=0||this.state!=='active')return;this.network?.action('grenade');this.audio.tone(500,.05,.04);this.equipTime=.25;}
 // Blast: effects, light and camera shake by distance; damage is the room's.
 blast(position){
  this.visuals.effects.explosion(position);this.audio.explosion(position);this.blastLight.position.copy(position).add(vec.set(0,.6,0));this.blastLife=.35;this.blastLight.intensity=170;
  const d=this.camera.position.distanceTo(position);this.shake=Math.max(this.shake,clamp(1.1-d/20,0,1));if(d<20)this.gamepad.rumble(clamp(1.1-d/15,0,1),clamp(1-d/20,0,1),320);
 }
 tracer(a,b){this.visuals.effects.tracer(a,b);}
 sparks(pos,count,color,explosion=false){if(explosion)this.blast(pos);else this.visuals.effects.sparks(pos,count);}
 onDeath(){this.keys.clear();this.touch.reset();this.gamepad.release();this.gamepad.rumble(1,.6,380);this.mouseDown=false;this.aim=false;this.reloadTime=0;this.flashTime=0;this.weaponModel.flash.visible=false;this.weaponModel.light.intensity=0;document.body.classList.remove('aiming');$('reload-notice').classList.add('hidden');$('grenade-warning').classList.add('hidden');$('respawn-killer').textContent=t('game.respawn.down');this.combat.streak=this.combat.chain=0;}
 onRespawn(){const p=this.player;p.jump=0;p.vy=0;p.climb=p.mantle=null;this.traversal=null;this.eyeHeight=1.72;this.recoil=0;this.resetFeel();this.keys.clear();this.mouseDown=false;this.aim=false;this.gunAim=0;this.clearIndicators();$('respawn-overlay').classList.add('hidden');$('reload-notice').classList.add('hidden');this.notify(t('game.notify.respawn'),t('game.notify.respawnSub'),2);}
 onPickup(){this.audio.reload();this.notify(t('game.notify.pickup'),t('game.notify.pickupSub'),1.5);this.updateHUD();}
 onKill(event,id){
  const weapon=killWeapon(event.weapon);
  this.addKillfeed(event.attackerName,event.victimName,event.team,event.head,weapon?.short);
  if(event.attacker===id&&event.victim!==id){this.markHit(!!event.head,true);
   // Kills less than four seconds apart chain into a multi-kill; a streak
   // counts kills since the last death.
   const c=this.combat;c.streak++;c.best=Math.max(c.best,c.streak);if(event.head)c.headshots++;c.chain=this.elapsed-c.lastKill<4?c.chain+1:1;c.lastKill=this.elapsed;
   const multi=c.chain>=2?(c.chain===2?t('game.notify.doubleKill'):c.chain===3?t('game.notify.tripleKill'):t('game.notify.multiKill',{count:c.chain})):'',streak=c.streak>=3&&(c.streak===3||c.streak%5===0)?t('game.notify.streak',{count:c.streak}):'';
   if(multi||streak){this.notify(multi||streak,multi&&streak?t('game.notify.streakAlive',{count:c.streak}):streak?t('game.notify.streakKills',{n:c.streak}):event.head?t('game.notify.lastHeadshot'):'',1.8);this.audio.tone(880+Math.min(c.chain,5)*110,.14,.06,'triangle');}
   else if(this.coop)this.notify(t(event.head?'game.notify.coopHeadshot':'game.notify.coopKill'),'',1.1);
   else this.notify(t(event.head?'game.notify.headshot':'game.notify.kill'),this.mode==='ffa'?t('game.notify.killGoal',{n:this.rules.score}):t('game.notify.team',{team:TEAM_NAME[this.player.team]}),1.1);}
  if(event.victim===id){
   this.combat.streak=this.combat.chain=0;
   // Who, with what and from how far: the range of a grenade means nothing.
   const detail=[weapon?.name,event.head?t('game.respawn.headshot'):'',weapon&&weapon.id!=='grenade'&&Number.isFinite(event.range)?`${Math.max(0,Math.round(event.range))} M`:''].filter(Boolean).join(' · ');
   $('respawn-killer').textContent=event.attacker===id?t('game.respawn.down'):t('game.respawn.killedBy',{name:event.attackerName})+(detail?' · '+detail:'');
  }
 }
 onFlag(event,id){
  const mine=event.team===this.player.team,self=event.actor===id;
  if(event.action==='taken'){this.notify(t(self?'game.flag.youCarry':mine?'game.flag.ownTaken':'game.flag.enemyTaken'),self?t('game.flag.youCarrySub'):t(mine?'game.flag.takenOwn':`game.flag.taken.${event.team}`,{name:event.name}),2.5);this.audio.tone(mine?260:620,.18,.08);}
  if(event.action==='dropped'){this.notify(t(mine?'game.flag.ownDropped':'game.flag.enemyDropped'),t(mine?'game.flag.ownDroppedSub':'game.flag.enemyDroppedSub'),2.5);this.audio.tone(420,.12,.06);}
  if(event.action==='returned'){this.notify(t(mine?'game.flag.ownReturned':'game.flag.enemyReturned'),event.name||t('game.flag.autoReturn'),2);this.audio.tone(mine?520:300,.15,.06);}
  if(event.action==='captured'){this.notify(t(mine?'game.flag.lost':'game.flag.captured'),t(mine?'game.flag.scoresEnemy':'game.flag.scoresTeam',{name:event.name}),3);if(!mine)this.audio.capture();else this.audio.tone(180,.4,.1);}
 }
 onObjective(event){
  if(event.action==='relay'){this.audio.capture();const o=this.relayObjects[event.index];o.ring.material.color.set('#79bcaa');o.flag.material.color.set('#79bcaa');if(this.relayObjects[event.index+1])this.relayObjects[event.index+1].ring.material.color.set('#d3f36a');this.notify(t('game.notify.relaySecured',{name:event.name}),t('game.notify.relaySecuredSub'));}
  if(event.action==='wave'){this.audio.capture();this.notify(t('game.hud.wave',{wave:event.wave,total:this.rules.score}),t('game.notify.waveSub',{n:event.size}));}
  if(event.action==='cleared')this.notify(t('game.notify.cleared'),t('game.notify.clearedSub'),5);
 }
 // Keyboard-only play: the turn keys turn the head, slowed in the sights as
 // the mouse is, and with the aim assist's friction. The keyboard cannot
 // look up or down, so the view height is set for it (settings.keyboardPitch):
 // auto follows the enemy ahead, level brings the view back to the horizon
 // while turning, keep leaves it where the mouse put it. Turning with the
 // keys starts keyboard play, the mouse ends it; a controller or a touch
 // screen has its own.
 keyTurn(dt){
  const dir=Number(this.held('turnLeft'))-Number(this.held('turnRight'));
  if(dir){this.keyboardLook=true;this.keyTurnTime=(this.keyTurnTime||0)+dt;const assist=this.aimAssist.enabled?this.aimAssist.look():1,d=dir*KEY_TURN*this.settings.sensitivity*this.aimSlowdown()*assist*Math.min(1,KEY_TURN_START+(1-KEY_TURN_START)*this.keyTurnTime/KEY_TURN_RAMP)*dt;this.yaw+=d;this.swayInput.x-=d;}else this.keyTurnTime=0;
  if(this.keyboardLook&&(this.gamepad.active||this.touch.enabled))this.keyboardLook=false;
  if(!this.keyboardLook)return;
  const mode=this.settings.keyboardPitch;
  if(mode==='auto'&&!this.traversal)this.pitch=damp(this.pitch,this.aimAssist.keyboardPitch(),KEY_PITCH_RATE,dt);
  else if(mode==='level'&&dir)this.pitch=damp(this.pitch,0,4,dt);
 }
 updatePlayer(dt){
  if(!this.player.alive){this.moving=false;return;}
  this.keyTurn(dt);
  const input=this.moveInput();let {forward,strafe}=input;this.moving=!!(forward||strafe);if(input.sprint&&forward>0)this.crouchToggle=false;// sprinting stands up
  setStance(this.player,!!this.crouchToggle,this.world.solids);const crouch=this.player.crouch,carrying=!!this.player.carrying;
  // Sprinting lowers the weapon; leaving it takes a moment before firing.
  const sprint=input.sprint&&forward>0&&!this.aim&&!crouch&&!this.mouseDown&&this.reloadTime<=0&&!carrying;if(this.sprinting&&!sprint)this.sprintOut=this.weapon.ready;this.sprinting=sprint;
  this.sprintOut=Math.max(0,this.sprintOut-dt);if(!this.sprintOut&&this.pendingShot){this.pendingShot=false;this.fire(true);}
  const speed=moveSpeed(this.weapon,{crouch,sprint,aim:this.aim}),grounded=this.player.grounded!==false||this.player.jump<=.01;
  const length=Math.max(1,Math.hypot(forward,strafe));forward/=length;strafe/=length;
  // Same acceleration as the room: short on the ground, limited air control.
  const wantX=(-Math.sin(this.yaw)*forward+Math.cos(this.yaw)*strafe)*speed,wantZ=(-Math.cos(this.yaw)*forward-Math.sin(this.yaw)*strafe)*speed,accel=grounded?(this.moving?15:16):1.6;
  this.velocity.x=damp(this.velocity.x,wantX,accel,dt);this.velocity.z=damp(this.velocity.z,wantZ,accel,dt);
  if(this.lastPosition&&Math.hypot(this.player.x-this.lastPosition.x,this.player.z-this.lastPosition.z)>1.5)this.velocity.x=this.velocity.z=0;// teleported or respawned
  // Ladders and ledges take over from walking and gravity while they last.
  const jumpPressed=!!this.jumpQueued;this.jumpQueued=false;const traversal=this.player.alive&&!carrying?traverse(this.player,{forward,yaw:this.yaw,jumpPressed},dt,this.world):null;
  if(traversal){this.aim=false;this.crouchToggle=false;if(traversal!==this.lastTraversal)this.audio.step(null,.08);if(traversal==='climb'){const rung=Math.floor(feet(this.player)/.3);if(rung!==this.lastRung){this.lastRung=rung;this.audio.step(null,.045);}}}
  else if(jumpPressed&&(this.player.grounded||this.player.jump<=.01)){this.player.vy=5;this.audio.step(null,.07);}
  this.lastTraversal=traversal;this.traversal=traversal;
  const before={x:this.player.x,z:this.player.z};if(!traversal)moveCharacter(this.player,this.velocity.x*dt,this.velocity.z*dt,this.world,this.bots);
  if(dt>0){this.velocity.x=(this.player.x-before.x)/dt;this.velocity.z=(this.player.z-before.z)/dt;}this.lastPosition={x:this.player.x,z:this.player.z};
  const fallSpeed=this.player.vy||0,wasAir=this.player.jump>.02;if(!traversal)updateVertical(this.player,dt,this.world.solids);
  // In an augmented reality room the device places the operator.
  if(this.ar?.room)this.ar.placePlayer();
  if(wasAir&&this.player.grounded&&fallSpeed<-3.5){this.landKick=Math.min(1,-fallSpeed/9);this.audio.land();}
  const moving=Math.hypot(this.velocity.x,this.velocity.z)>.6;
  if(moving&&this.player.grounded!==false){this.bob+=dt*(sprint?13:crouch?6.5:9);if(Math.floor(this.bob/Math.PI)!==this.lastStep){this.audio.step(null,crouch?.025:sprint?.075:.05);this.lastStep=Math.floor(this.bob/Math.PI);}}
  const height=crouch?1.12:1.72;this.eyeHeight=safeEyeHeight(this.player,damp(this.eyeHeight||height,height,14,dt),this.world.solids);
  this.cooldown=Math.max(0,this.cooldown-dt);this.recoil=damp(this.recoil,0,15,dt);this.landKick=damp(this.landKick,0,7,dt);this.equipTime=Math.max(0,this.equipTime-dt);
  if(this.time-(this.lastFired??-1)>.12)this.bloom=Math.max(0,this.bloom-dt*2.2);
  const firing=this.mouseDown&&this.weapon.auto&&this.time-(this.lastFired??-1)<.2;this.punch.pitch=damp(this.punch.pitch,0,firing?4.5:9,dt);this.punch.yaw=damp(this.punch.yaw,0,firing?4.5:9,dt);
  // Breathing sway while aiming; Shift holds the breath behind the M14 optic.
  const scoped=this.aim&&!!this.weapon.scope;let amplitude=this.aim?(scoped?.0042:.0011):0;amplitude*=(crouch?.55:1)*(moving?2:1);
  if(scoped&&(this.held('sprint')||this.gamepad.breath)&&this.breath>0){amplitude*=.12;this.breath=Math.max(0,this.breath-dt/4);}else{this.breath=Math.min(1,this.breath+dt/(scoped?6:2.5));if(scoped&&this.breath<.3)amplitude*=1.9;}
  this.breathAmp=damp(this.breathAmp||0,amplitude,4,dt);const t=this.time,swayYaw=(Math.sin(t*.83)+Math.sin(t*2.1+.7)*.35)*this.breathAmp,swayPitch=(Math.sin(t*1.27+1.3)*.8+Math.sin(t*2.9)*.25)*this.breathAmp;
  this.shake=damp(this.shake,0,5,dt);const shake=this.shake*this.shake*.035;
  this.tilt=damp(this.tilt,-strafe*.014*(sprint?1.4:1)*(this.aim?.4:1),7,dt);
  // The device rolls the view as it rolls, so the horizon stays level in
  // the world; once it stops steering, the view levels itself again.
  const roll=this.touch.viewRoll();this.viewRoll=roll==null?damp(this.viewRoll||0,0,8,dt):roll;
  const bobAmp=moving&&this.player.grounded!==false?(sprint?.034:crouch?.01:.018)*(this.aim?.3:1):0;this.bobAmp=damp(this.bobAmp||0,bobAmp,8,dt);
  // In augmented reality the device is the camera.
  if(!this.ar?.active){
  this.camera.position.set(this.player.x,this.eyeHeight+this.player.jump+.15+Math.sin(this.bob*2)*this.bobAmp-this.landKick*.11,this.player.z);
  this.camera.rotation.set(this.pitch+this.punch.pitch+swayPitch+(Math.random()-.5)*shake+this.landKick*-.02,this.yaw+this.punch.yaw+swayYaw+(Math.random()-.5)*shake,this.tilt+this.viewRoll+Math.sin(this.bob)*this.bobAmp*.25,'YXZ');
  // A headset keeps its field of view: zooming the view would sicken.
  const base=this.baseFov(),fov=this.stereo?DEFAULT_FOV:this.aim?zoomFov(base,AIM_ZOOM):sprint?zoomFov(base,SPRINT_ZOOM):base,nextFov=this.instantScope()?fov:damp(this.camera.fov,fov,12,dt);if(Math.abs(nextFov-this.camera.fov)>.001){this.camera.fov=nextFov;this.camera.updateProjectionMatrix();}
  }
  if(this.ejectPending&&this.reloadTime<this.weapon.reload*.75)this.ejectEmpties();
  if(this.reloadTime>0)this.reloadTime-=dt;
  if(this.mouseDown&&this.weapon.auto)this.fire();this.flashTime=Math.max(0,(this.flashTime||0)-dt);this.weaponModel.flash.visible=this.flashTime>0;this.weaponModel.flash.rotation.z=Math.random()*6;this.weaponModel.flash.scale.setScalar(.8+Math.random()*.5);this.weaponModel.light.intensity=this.flashTime>0?(this.weapon.suppressed?1.5:9):0;
  this.updateViewModel(dt,sprint||!!traversal,strafe);document.body.classList.toggle('aiming',this.aim);
  this.barrelSmoke(this,dt,this.time-(this.lastFired||0),()=>this.ar?.table?this.ar.muzzle(muzzle):this.muzzlePoint(muzzle));
  if(this.player.health<30){this.heartbeat-=dt;if(this.heartbeat<=0){this.audio.heartbeat();this.heartbeat=.5+this.player.health/30*.5;}}
  this.updateCrosshair();
 }
 // Revolver reload: the spent cases drop out of the open cylinder.
 ejectEmpties(){const count=this.ejectPending;this.ejectPending=0;if(this.ar?.table)return;for(let i=0;i<count;i++){this.viewPoint(.4,.02+Math.random()*.03,.12,eject);kick.copy(up).multiplyScalar(-.5-Math.random()*.6).addScaledVector(right,(Math.random()-.5)*.6);this.visuals.effects.casing(eject,kick,.9);}}
 // First-person weapon: lag behind mouse movement, strafe roll, sprint
 // carry, landing dip, equip raise and recoil kick.
 updateViewModel(dt,sprint,strafe){
  const w=this.weapon,m=this.weaponModel,aim=this.aim?1:0;this.gunAim=this.instantScope()?aim:damp(this.gunAim||0,aim,aim?3/w.aimTime:15,dt);const ga=this.gunAim;
  const lagX=clamp(-this.swayInput.x*2.4,-.07,.07),lagY=clamp(-this.swayInput.y*2.4,-.07,.07);this.swayInput.x=this.swayInput.y=0;this.sway.x=damp(this.sway.x,lagX,9,dt);this.sway.y=damp(this.sway.y,lagY,9,dt);
  this.sprintBlend=damp(this.sprintBlend,sprint?1:0,10,dt);const sb=this.sprintBlend,free=1-ga*.85,raise=Math.sin(Math.min(1,this.equipTime/.3)*Math.PI*.5);
  const bobX=Math.sin(this.bob)*(this.bobAmp||0)*.45,bobY=Math.cos(this.bob*2)*(this.bobAmp||0)*.28;
  const pose=w.sidearm?{x:.17,y:-.165,z:-.38,aimY:-m.sight,aimZ:-.36}:{x:.24,y:-.26,z:-.47,aimY:-m.sight,aimZ:-.47};
  m.group.position.set(THREE.MathUtils.lerp(pose.x,0,ga)+bobX*free+this.sway.x*.35*free-sb*.07,THREE.MathUtils.lerp(pose.y,pose.aimY,ga)+bobY*free+this.sway.y*.3*free-sb*.035-this.landKick*.045-raise*.22,THREE.MathUtils.lerp(pose.z,pose.aimZ,ga)+this.recoil*.7+sb*.02);
  m.group.rotation.set(this.recoil*.65+this.sway.y*.6*free-sb*.28+raise*-.5,this.sway.x*.9*free+sb*.55,-sb*.12+this.sway.x*.4*free-strafe*.04*free);
  this.gunCamera.fov=damp(this.gunCamera.fov,w.scope&&this.aim&&this.reloadTime<=0?28:62,15,dt);this.gunCamera.updateProjectionMatrix();
  animateWeapon(m,{reload:this.reloadTime,duration:w.reload,time:this.time,sprint:false,aim:ga,recoil:this.recoil,empty:this.reloadEmpty!==false,cycle:w.auto?1:clamp((this.time-(this.lastFired??-9))/w.interval,0,1)});
 }
 updateCrosshair(){const fovScale=Math.tan(THREE.MathUtils.degToRad(39))/Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)),gap=Math.round(4+this.currentSpread()*innerHeight*.55*fovScale+(this.sprinting?14:0));if(gap!==this.crosshairGap){this.crosshairGap=gap;$('crosshair').style.setProperty('--gap',gap+'px');}}
 // Audible footsteps let players hear who is coming round the corner.
 botFootsteps(b){const step=Math.floor(b.model.phase/Math.PI);if(step!==b.lastStep){b.lastStep=step;if(b.model.blend>.35&&b.alive&&distance(b,this.player)<20)this.audio.step({x:b.x,y:.3,z:b.z},b.crouch?.03:.07);}}
 createRemotePlayer(data){
  const model=createSoldier(data.team==='blue'?'blue':'red'),actor={...data,model,phase:0,flashTime:0,visible:false};model.root.position.set(data.x,.15,data.z);model.root.rotation.y=data.yaw+Math.PI;model.root.traverse(m=>{if(m.isMesh)m.userData.bot=actor;});attachShield(model,data.team==='blue'?'blue':'red');this.scene.add(model.root);
  // Co-op enemies stay anonymous; everyone else carries a name tag.
  if(!(this.coop&&data.hostile))this.addTeamMarker(actor);this.visuals?.warm(model.root);return actor;
 }
 addTeamMarker(bot){
  const ally=!this.isEnemy(bot),canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#101b17bb';ctx.fillRect(10,5,236,54);ctx.fillStyle=ally?'#86cbfa':'#eea080';ctx.font='bold 23px Arial';ctx.textAlign='center';ctx.fillText(`${ally?'◆':'▼'} ${bot.name}`,128,40);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const marker=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));marker.position.set(0,2.2,0);marker.scale.set(1.65,.42,1);marker.raycast=()=>{};bot.model.root.add(marker);bot.marker=marker;
 }
 addKillfeed(attacker,victim,team,head=false,weapon=''){const feed=document.createElement('div'),label=document.createElement('b');label.textContent=weapon||'⌁';feed.append(attacker,label,head?t('game.killfeed.head',{name:victim}):victim);feed.dataset.team=team;$('killfeed').prepend(feed);while($('killfeed').children.length>4)$('killfeed').lastChild.remove();}
 everyone(){return [this.player,...this.bots];}
 // Ranking by kills, then captures, then fewer deaths.
 ranked(list=this.everyone()){return [...list].sort((a,b)=>b.kills-a.kills||(b.captures||0)-(a.captures||0)||a.deaths-b.deaths);}
 rosterTable(list,caption,cls=''){
  const ctf=this.mode==='ctf';
  return `<section class="roster-team ${cls}"><table><caption>${caption}</caption><thead><tr><th>${t('game.roster.operator')}</th><th title="${t('game.stats.kills')}">${t('game.stats.killsShort')}</th>${ctf?`<th title="${t('game.stats.captures')}">${t('game.stats.capturesShort')}</th>`:''}<th>${t('game.stats.deaths')}</th></tr></thead><tbody>${this.ranked(list).map(a=>`<tr class="${a===this.player?'local-player':''}"><td>${a===this.player?t('game.roster.self',{name:escapeHtml(a.name)}):a.isBot?t('game.roster.bot',{name:escapeHtml(a.name)}):escapeHtml(a.name)}<small>${t(a.alive?'game.roster.alive':'game.roster.respawning')}</small></td><td>${a.kills}</td>${ctf?`<td>${a.captures||0}</td>`:''}<td>${a.deaths}</td></tr>`).join('')}</tbody></table></section>`;
 }
 rosterHTML(){
  const all=this.everyone();
  if(this.mode==='ffa')return this.rosterTable(all,`${t('game.roster.standings',{n:all.length})} <b>${this.rules.score}</b>`,'ffa');
  if(this.coop)return this.rosterTable(all.filter(a=>a.team==='blue'),`${t('game.roster.squad')} <b>${this.teamScores.blue}</b>`,'blue');
  return ['blue','red'].map(team=>this.rosterTable(all.filter(a=>a.team===team),`${t(team===this.player.team?'game.roster.allies':'game.roster.enemies',{team:TEAM_NAME[team]})} <b>${this.teamScores[team]}</b>`,team)).join('');
 }
 // Round result for every mode, from the room's final snapshot.
 showResult(snapshot){
  if(this.state==='lobby')return;
  const mode=this.mode,r=this.rules,result=snapshot.result,reason=snapshot.resultReason,me=this.player,s=this.teamScores,stat=(v,l)=>`<span>${v}<small>${l}</small></span>`,accuracy=`${this.shots?Math.round(this.hits/this.shots*100):0}%`;
  let label,title,description,won,stats;
  if(this.coop){
   won=result==='blue';const squad=this.everyone().filter(a=>a.team==='blue'&&!a.isBot).length>1;
   label=t(won?'game.result.extraction':'game.result.endTransmission');title=t(won?'game.result.accomplished':reason==='wiped'?(squad?'game.result.squadDown':'game.result.operatorDown'):'game.result.failed');
   description=won?(mode==='assault'?t('game.result.assaultWon'):t('game.result.survivalWon',{n:r.score})):reason==='time'?t('game.result.assaultTime'):mode==='assault'?t('game.result.assaultLost'):t('game.result.survivalLost',{wave:this.objective?.wave||1});
   stats=stat(this.kills,t('game.stats.kills'))+stat(accuracy,t('game.stats.accuracy'))+stat(this.combat.best,t('game.stats.bestStreak'))+stat(formatTime(this.elapsed),t('game.stats.missionTime'));
  }else if(mode==='ffa'){
   const rank=this.ranked().indexOf(me)+1;won=result===me.id;
   label=t('game.result.ffaLabel',{n:this.everyone().length});title=won?t('game.result.victory'):result==='draw'?t('game.result.draw'):t(`game.result.place.${ordinal.select(rank)}`,{rank});
   description=t('game.result.ffaLine',{outcome:result==='draw'?t('game.result.tiedFirst'):won?t('game.result.youWin'):snapshot.resultName?t('game.result.playerWins',{name:snapshot.resultName}):t('game.result.opponentWins'),reason:reason==='time'?t('game.result.timeUp'):t('game.result.killLimit',{n:r.score})});
   stats=stat(me.kills,t('game.stats.yourKills'))+stat(me.deaths,t('game.stats.yourDeaths'))+stat(this.combat.best,t('game.stats.bestStreak'))+stat(`${rank}/${this.everyone().length}`,t('game.stats.rank'));
  }else{
   won=result===me.team;label=t('game.result.teamLabel',{mode:MODES[mode].label.toUpperCase(),blue:r.blue,red:r.red});title=result==='draw'?t('game.result.draw'):t(won?'game.result.teamVictory':'game.result.teamDefeat',{team:TEAM_NAME[me.team]});
   description=`ALPHA ${s.blue} — ${s.red} BRAVO · ${reason==='time'?t('game.result.timeUp'):t(mode==='ctf'?'game.result.captureLimit':'game.result.killLimit',{n:r.score})}.`;
   stats=stat(me.kills,t('game.stats.yourKills'))+(mode==='ctf'?stat(me.captures||0,t('game.stats.yourCaptures')):'')+stat(me.deaths,t('game.stats.yourDeaths'))+stat(this.combat.best,t('game.stats.bestStreak'))+(mode==='ctf'?'':stat(formatTime(this.elapsed),t('game.stats.roundTime')));
  }
  this.mouseDown=false;this.aim=false;document.body.classList.remove('aiming');this.transition('ended');if(document.pointerLockElement)document.exitPointerLock();
  $('respawn-overlay').classList.add('hidden');$('result-label').textContent=label;$('result-title').textContent=title;$('result-description').textContent=this.resultBase=description;$('result-stats').innerHTML=stats;
  $('results').firstElementChild.classList.toggle('tdm-results',!this.coop);$('result-roster').innerHTML=this.coop&&this.everyone().filter(a=>a.team==='blue').length<2?'':this.rosterHTML();
  this.showRecord(mode);this.audio.tone(won?700:160,.6,.15);
 }
 // Personal bests per mode, kept on this device: kills in a round and longest streak.
 showRecord(mode){
  let records={};try{records=JSON.parse(localStorage.getItem('fw-records')||'{}')||{};}catch{}
  const old=records[mode]||{},kills=Math.max(0,Number(old.kills)||0),streak=Math.max(0,Number(old.streak)||0),beaten=this.kills>kills||this.combat.best>streak;
  records[mode]={kills:Math.max(kills,this.kills),streak:Math.max(streak,this.combat.best)};try{localStorage.setItem('fw-records',JSON.stringify(records));}catch{}
  const out=$('result-record'),label=MODES[mode].label.toUpperCase(),best=records[mode];out.classList.toggle('new',beaten);
  out.textContent=beaten?t('game.result.newRecord',{mode:label,n:best.kills,streak:best.streak}):kills||streak?t('game.result.record',{mode:label,n:kills,streak}):'';
 }
 // Between blasts the same light stands at the player's muzzle: each shot
 // throws its flash onto the nearby walls. Suppressed weapons show nothing.
 updateEffects(dt){
  if(this.blastLife>0){this.blastLife=Math.max(0,this.blastLife-dt);this.blastLight.intensity=170*Math.pow(this.blastLife/.35,2);return;}
  const lit=this.state==='active'&&!!this.player?.alive&&(this.flashTime||0)>0&&!this.weapon.suppressed&&!!this.weaponModel;
  this.blastLight.intensity=lit?(this.weapon.recoil>=.08?24:12):0;
  if(lit){if(this.ar?.table)this.ar.muzzle(this.blastLight.position);else this.blastLight.position.copy(this.muzzlePoint(muzzle)).addScaledVector(dir,.35);}
 }
 // Relay and team flags ripple in the wind; team flags follow their carrier.
 animateFlags(){
  if(this.state==='lobby')return;const wave=(o,base)=>{const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){const x=base[i*3]+.55;p.array[i*3+2]=Math.sin(this.time*5+x*4.5)*.07*x;}p.needsUpdate=true;};
  if(this.mode==='assault')for(const o of this.relayObjects)wave(o.flag,o.base);
  if(this.mode!=='ctf'||!this.objective?.flags)return;
  for(const [team,f]of Object.entries(this.objective.flags)){
   const o=this.flagObjects[team];o.base.position.set(f.base.x,.17,f.base.z);wave(o.flag,o.rest);
   const carrier=f.state==='carried'?this.bots.find(b=>b.id===f.carrier):null;
   o.carry.visible=f.state!=='carried'||!!carrier;
   // Slung across the carrier's back, below the name tag.
   if(carrier){const r=carrier.model.root;o.carry.position.set(r.position.x-Math.sin(r.rotation.y)*.26,r.position.y+.25,r.position.z-Math.cos(r.rotation.y)*.26);o.carry.rotation.set(0,r.rotation.y,.22);o.carry.scale.setScalar(.55);}
   else{o.carry.position.set(f.x,.16+(f.y||0),f.z);o.carry.rotation.set(0,0,f.state==='dropped'?1.2:0);o.carry.scale.setScalar(f.state==='dropped'?.7:1);}
  }
 }
 // A style written every frame costs a layout pass even when nothing changed.
 // Present only while it shows: a full-screen layer costs a blend of the
 // whole screen every frame, even when transparent.
 setDamageOverlay(opacity){const value=Math.round(opacity*100)/100;if(value===this.damageOpacity)return;this.damageOpacity=value;const el=$('damage-overlay');el.style.display=value>0?'block':'';el.style.opacity=value;}
 notify(title,sub='',duration=3.5){$('notifications').textContent=title;if(sub){const s=document.createElement('small');s.textContent=sub;$('notifications').append(s);}this.notifyTime=duration;}
 flagState(f){if(!f)return '';if(f.state==='home')return t('game.flag.atBase');if(f.state==='dropped')return t('game.flag.droppedState',{seconds:Math.ceil(f.returnIn)});const c=f.carrier===this.player.id?this.player:this.bots.find(b=>b.id===f.carrier);return c?.name?t('game.flag.carriedBy',{name:c.name}):t('game.flag.carriedUnknown');}
 updateHUD(){
  if(!this.player)return;setText(document.querySelector('.health small'),t('game.hud.operator',{name:this.player.name}));const a=this.ammunition[this.selected];setText($('health'),Math.ceil(this.player.health));setStyle($('health-bar'),'width',`${this.player.health}%`);setStyle($('health-bar'),'background',this.player.health<30?'#ed8b6d':'#d3f36a');setText($('ammo'),a.ammo);for(const el of document.querySelectorAll('.stereo-status'))setText(el,`✚ ${Math.ceil(this.player.health)} · ${a.ammo}/${a.reserve}`);$('ammo').classList.toggle('low',a.ammo<=Math.ceil(this.weapon.capacity*.25));setText($('reserve'),a.reserve);setText($('weapon-name'),this.weapon.name);setText($('fire-mode'),`${this.weapon.caliber} · ${t(this.weapon.auto?'game.hud.auto':'game.hud.semiAuto')}`);setText($('grenades'),this.grenadeCount);setText($('timer'),formatTime(this.mode==='survival'?this.elapsed:this.remaining));setText($('bearing'),(((Math.round(-this.yaw*180/Math.PI)%360)+360)%360).toString().padStart(3,'0'));
  const o=this.objective||{},r=this.rules,protectedNow=this.player.alive&&this.elapsed<this.player.protectedUntil,enemy=TEAM_NAME[this.player.team==='red'?'blue':'red'];let objective,sub;
  if(this.mode==='assault'){const i=Math.min(o.relay||0,2),relay=this.relays[i];objective=t('game.objective.captureRelay',{name:relay.name});sub=t('game.objective.captureRelaySub',{label:relay.label});[...$('capture-points').children].forEach((el,j)=>el.className=j<(o.relay||0)?'captured':j===(o.relay||0)?'current':'');
   const inside=this.player.alive&&distance(this.player,relay)<3.25;$('capture-notice').classList.toggle('hidden',!inside);setText($('capture-notice').firstElementChild,t(o.contested?'game.hud.contested':'game.hud.securing'));setStyle($('capture-progress'),'width',`${(o.capture||0)*100}%`);}
  else if(this.mode==='survival'){objective=t('game.hud.wave',{wave:o.wave||1,total:r.score});sub=o.waveDelay>0?t('game.objective.reinforcements',{n:Math.ceil(o.waveDelay)}):t('game.objective.hostilesLeft',{n:o.hostiles??0});}
  else if(this.mode==='ctf'){const own=o.flags?.[this.player.team];objective=this.player.carrying?t('game.objective.bringFlag'):own&&own.state!=='home'?t('game.objective.recoverFlag'):t('game.objective.captureFlag',{team:enemy});sub=protectedNow?t('game.objective.protected'):t('game.objective.ownFlag',{state:this.flagState(own)});}
  else if(this.mode==='ffa'){const ranking=this.ranked(),leader=ranking[0];objective=t('game.objective.ffa');sub=protectedNow?t('game.objective.protected'):t('game.objective.ffaSub',{rank:ranking.indexOf(this.player)+1,total:ranking.length,n:r.score});setText($('blue-score'),this.player.kills);setText($('red-score'),leader?.kills??0);setText($('red-label'),t(leader===this.player?'game.hud.firstYou':'game.hud.first'));}
  else{objective=t('game.objective.tdm',{team:enemy});sub=protectedNow?t('game.objective.protected'):t('game.objective.tdmSub',{n:r.score});}
  if(this.mode==='tdm'||this.mode==='ctf'){setText($('blue-score'),this.teamScores.blue);setText($('red-score'),this.teamScores.red);}
  if(this.mode!=='assault')$('capture-notice').classList.add('hidden');
  if(this.network?.phase==='waiting'){objective=t(this.mode==='ffa'?'game.objective.waitingOpponents':'game.objective.waitingOpponent');sub=t('game.objective.waitingSub');}
  setText($('hud-objective'),objective);setText($('hud-sub'),this.online?sub:t('game.hud.subAi',{sub,level:botProfile(this.botDifficulty).label}));
  if(!$('scoreboard').classList.contains('hidden'))this.showScoreboard(true);
  $('hud').classList.toggle('operator-down',!this.player.alive);this.network?.updateHUD();this.drawMinimap();
 }
 // Static layer (grid and obstacles) is drawn once per map; each refresh
 // only blits it and adds the moving markers.
 minimapBase(s){
  if(this.minimapLayer)return this.minimapLayer;const layer=document.createElement('canvas');layer.width=layer.height=180;const ctx=layer.getContext('2d');
  ctx.fillStyle='#17251cdd';ctx.fillRect(0,0,180,180);ctx.strokeStyle='#a5c18213';ctx.lineWidth=1;for(let i=0;i<=180;i+=22.5){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,180);ctx.moveTo(0,i);ctx.lineTo(180,i);ctx.stroke();}
  ctx.fillStyle='#77916a66';ctx.strokeStyle='#a9c08c40';for(const o of this.map.obstacles){ctx.fillRect((o.minX+32)*s,(o.minZ+32)*s,(o.maxX-o.minX)*s,(o.maxZ-o.minZ)*s);ctx.strokeRect((o.minX+32)*s+.5,(o.minZ+32)*s+.5,Math.max(0,(o.maxX-o.minX)*s-1),Math.max(0,(o.maxZ-o.minZ)*s-1));}
  ctx.fillStyle='#d3f36a';ctx.font='9px Arial';ctx.textAlign='left';ctx.fillText('N',7,12);return this.minimapLayer=layer;
 }
 drawMinimap(){
  const c=$('minimap'),ctx=this.minimapCtx??=c.getContext('2d'),s=180/64,o=this.objective||{};ctx.clearRect(0,0,180,180);ctx.drawImage(this.minimapBase(s),0,0);
  if(this.mode==='assault')this.relays.forEach((r,i)=>{ctx.fillStyle=i<(o.relay||0)?'#79bcaa':i===(o.relay||0)?'#d3f36a':'#899880';ctx.beginPath();ctx.arc((r.x+32)*s,(r.z+32)*s,6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#17251c';ctx.font='bold 8px Arial';ctx.textAlign='center';ctx.fillText(r.name,(r.x+32)*s,(r.z+32)*s+3);});
  if(this.mode==='ctf'&&o.flags)for(const [team,f]of Object.entries(o.flags)){ctx.strokeStyle=TEAM_COLOR[team];ctx.lineWidth=1.5;ctx.strokeRect((f.base.x+32)*s-5,(f.base.z+32)*s-5,10,10);ctx.fillStyle=TEAM_COLOR[team];ctx.beginPath();ctx.moveTo((f.x+32)*s-2,(f.z+32)*s+4);ctx.lineTo((f.x+32)*s-2,(f.z+32)*s-6);ctx.lineTo((f.x+32)*s+5,(f.z+32)*s-3);ctx.lineTo((f.x+32)*s-2,(f.z+32)*s);ctx.fill();}
  for(const b of this.bots){if(!b.alive)continue;const ally=!this.isEnemy(b),firing=!ally&&this.time-(b.lastShotTime??-Infinity)<1.2,carrier=this.mode==='ctf'&&b.carrying===this.player.team;if(!ally&&!b.visible&&!firing&&!carrier)continue;ctx.fillStyle=ally?'#86cbfa':'#e49a79';ctx.strokeStyle='#e49a79';ctx.beginPath();ctx.arc((b.x+32)*s,(b.z+32)*s,carrier?3.4:2.4,0,Math.PI*2);if(ally||b.visible||carrier)ctx.fill();else{ctx.lineWidth=1.2;ctx.stroke();}}
  ctx.save();ctx.translate((this.player.x+32)*s,(this.player.z+32)*s);ctx.rotate(-this.yaw);const cone=ctx.createRadialGradient(0,0,2,0,0,30);cone.addColorStop(0,'#edf5db40');cone.addColorStop(1,'#edf5db00');ctx.fillStyle=cone;ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,30,-Math.PI/2-.68,-Math.PI/2+.68);ctx.closePath();ctx.fill();ctx.fillStyle='#edf5db';ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(-4,4);ctx.lineTo(0,2);ctx.lineTo(4,4);ctx.closePath();ctx.fill();ctx.restore();
 }
 // Screen marker: the current relay, or in capture the flag the place that matters now.
 markerTarget(){
  const o=this.objective;
  if(this.mode==='assault'&&o&&o.relay<3){const r=this.relays[o.relay];return {x:r.x,y:3.9,z:r.z,label:r.name,color:'#d3f36a'};}
  if(this.mode!=='ctf'||!o?.flags)return null;
  const team=this.player.team,rival=team==='blue'?'red':'blue',own=o.flags[team],enemy=o.flags[rival];
  if(this.player.carrying)return {x:own.base.x,y:2.6,z:own.base.z,label:'⌂',color:TEAM_COLOR[team]};
  if(own.state==='dropped')return {x:own.x,y:1.6,z:own.z,label:'⚑',color:TEAM_COLOR[team]};
  if(own.state==='carried'){const c=this.bots.find(b=>b.id===own.carrier);if(c)return {x:c.x,y:2.8,z:c.z,label:'⚑',color:TEAM_COLOR[team]};}
  if(enemy.state==='carried'&&enemy.carrier!==this.player.id){const c=this.bots.find(b=>b.id===enemy.carrier);if(c)return {x:c.x,y:2.8,z:c.z,label:'◆',color:TEAM_COLOR[rival]};}
  return {x:enemy.x,y:3.6,z:enemy.z,label:'⚑',color:TEAM_COLOR[rival]};
 }
 updateMarker(){const el=$('objective-marker'),goal=this.player.alive&&this.markerTarget();if(!goal){el.classList.add('hidden');return;}target.set(goal.x,goal.y,goal.z);vec.subVectors(target,this.camera.position);this.camera.getWorldDirection(dir);const inFront=vec.dot(dir)>0;target.project(this.camera);const visible=inFront&&Math.abs(target.x)<.9&&Math.abs(target.y)<.85;el.classList.toggle('hidden',!visible);if(visible){
  // Centred on the objective but never over the crosshair: inside a ring
  // around the screen centre it slides out along its own direction.
  let x=(target.x*.5+.5)*innerWidth,y=(-target.y*.5+.5)*innerHeight;const cx=innerWidth/2,cy=innerHeight/2,d=Math.hypot(x-cx,y-cy);
  if(d<MARKER_CLEARANCE){if(d<1){x=cx;y=cy-MARKER_CLEARANCE;}else{x=cx+(x-cx)*MARKER_CLEARANCE/d;y=cy+(y-cy)*MARKER_CLEARANCE/d;}}
  // A transform moves it on its own layer, without layout or repaint.
  setStyle(el,'transform',`translate(${Math.round(x*10)/10}px, ${Math.round(y*10)/10}px) translate(-50%, -50%)`);setStyle(el,'color',goal.color);setStyle(el.firstElementChild,'borderColor',goal.color);setText(el.firstElementChild,goal.label);setText(el.lastElementChild,`${Math.round(distance(this.player,goal))} M`);}}
 showScoreboard(show){const roster=!!this.player&&(!this.coop||this.everyone().filter(a=>a.team==='blue').length>1);$('scoreboard').classList.toggle('hidden',!show);$('scoreboard').classList.toggle('team-scoreboard',show&&roster);if(!show||!this.player)return;$('scoreboard').querySelector('h2').textContent=this.player.name||'ALPHA 01';$('scoreboard-roster').innerHTML=roster?this.rosterHTML():'';const o=this.objective||{},third=this.mode==='assault'?[`${o.relay||0}/3`,t('game.stats.relays')]:this.mode==='survival'?[`${o.wave||0}/${this.rules.score}`,t('game.stats.waves')]:this.mode==='ctf'?[this.player.captures||0,t('game.stats.captures')]:[this.player.deaths,t('game.stats.deaths')];$('scoreboard-stats').innerHTML=`<span>${this.kills}<small>${t('game.stats.kills')}</small></span><span>${this.shots?Math.round(this.hits/this.shots*100):0}%<small>${t('game.stats.accuracy')}</small></span><span>${third[0]}<small>${third[1]}</small></span><span>${this.combat.streak}<small>${t('game.stats.streakMax',{best:this.combat.best})}</small></span>`;}
 snapshot(){
  const o=this.objective||{};
  return{state:this.state,mode:this.mode,rules:{...this.rules},mapId:this.mapId,botDifficulty:this.network?.lastSnapshot?.botDifficulty||this.botDifficulty||botLevel(this.settings.botDifficulty),weapon:this.weapon.id,touch:this.touch.enabled,gamepad:this.gamepad.active,aimAssist:{enabled:this.aimAssist.enabled,target:this.aimAssist.target?.actor.id??null},view:{yaw:this.yaw,pitch:this.pitch,roll:this.viewRoll||0,aim:!!this.aim,crouch:!!this.crouchToggle},player:this.player?{x:this.player.x,z:this.player.z,health:this.player.health,alive:this.player.alive,team:this.player.team,carrying:this.player.carrying}:null,kills:this.kills,shots:this.shots,ammo:this.ammunition?.[this.selected],bots:this.bots.filter(b=>b.alive&&this.isEnemy(b)).length,relay:o.relay??0,wave:o.wave??0,objective:this.objective,elapsed:this.elapsed,remaining:this.remaining,grenades:this.grenadeCount,online:this.online,local:!!this.network&&!this.online,phase:this.network?.phase,
   ...(this.network?{id:this.network.id,latency:this.network.latency}:{}),teamScores:{...this.teamScores},scoreLimit:this.rules.score,respawnTimer:this.respawnTimer,roster:this.player?this.everyone().map(a=>({id:a.id,name:a.name,team:a.team,isBot:!!a.isBot,hostile:!!a.hostile,x:a.x,z:a.z,kills:a.kills,deaths:a.deaths,captures:a.captures||0,alive:a.alive})):[]};
 }
 frame(now){
  requestAnimationFrame(this.frame);if(this.viewSize!==`${innerWidth}x${innerHeight}`)this.resize();// Movement and effects step at most 50 ms; the solo room catches up on real
  // time so a stutter does not slow its clock, its bots or the fire rate.
  const elapsed=Math.min((now-(this.lastFrame||now))/1000,.25),dt=Math.min(elapsed,.05);this.lastFrame=now;this.time+=dt;this.gamepad.update(dt);this.touch.tilt(dt);
  if(this.state==='lobby'){const t=this.time*.025;const view=this.mapConfig.lobby;this.camera.position.set(view.x+Math.sin(t)*2,view.y+Math.sin(t*.7)*.5,view.z);this.camera.lookAt(view.lookX,view.lookY,view.lookZ);}
  this.ar.update(dt);
  this.network?.update(dt,elapsed);
  if(this.state==='active'){
   this.updatePlayer(dt);if(!this.ar.active)this.aimAssist.update(dt);this.updateEffects(dt);this.uiTick+=dt;if(this.uiTick>.1){this.updateHUD();this.uiTick=0;}this.notifyTime-=dt;if(this.notifyTime<=0)$('notifications').textContent='';this.hitTime=Math.max(0,(this.hitTime||0)-dt);const hitOpacity=this.hitTime>0?1:0;if(hitOpacity!==this.hitOpacity){this.hitOpacity=hitOpacity;$('hitmarker').style.opacity=hitOpacity;}this.damageTime=Math.max(0,(this.damageTime||0)-dt);this.setDamageOverlay(Math.min(.55,this.damageTime));this.updateMarker();this.updateIndicators(dt);this.updateGrenadeWarning();
  }
  if(this.network&&this.state!=='active'){this.updateEffects(dt);if(this.online)this.updateHUD();this.setDamageOverlay(0);}
  this.animateFlags();
  document.body.classList.toggle('stereo',this.stereo);this.touch.update();this.map.dust.rotation.y=this.time*.002;this.map.update?.(dt,this.time);this.ar.beforeRender(dt);this.camera.updateMatrixWorld();this.audio.listen(this.ar.listener());this.visuals.update(dt);this.visuals.adapt(elapsed);this.visuals.render();this.ar.rendered();
 }
}
