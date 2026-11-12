import {t,LANGUAGES,chosenLanguage,setLanguage,translatePage} from './i18n.js';
import { Game,DEFAULT_FOV,horizontalFov,fovSetting } from './game.js';
import {nativeAntialias} from './visuals.js';
import {NetworkSession} from './network.js';
import { WEAPONS,SIDEARMS,formatTime } from './rules.js';
import {WeaponShowcase} from './showcase.js';
import {botLevel,botProfile} from './bot-ai.js';
import {mapId,mapConfig} from './maps.js';
import {MODES,MODE_IDS,modeId,normalizeRules,ruleLabel,ruleValue,rulesSummary} from './modes.js';
import {touchDevice,stickMode,gyroMode,touchLayout} from './touch.js';
import {aimAssistLevel} from './aim-assist.js';
import {ACTIONS,RESERVED,bind,bindingText,defaultBindings,keyName,learnKey,learnLayout,normalizeBindings} from './keybindings.js';
import {VERSION,defaultAddress,localServer,startNativeHost,watchLan} from './platform.js';
import {arSupported,arCapabilities,reloadWith,takeBoot} from './ar.js';
const $=id=>document.getElementById(id);
// The static markup is English; it takes the interface language before
// anything reads or writes its text.
translatePage();
let stored={};try{stored=JSON.parse(localStorage.getItem('fw-settings')||'{}');}catch{}
const settings={sensitivity:1,trackpadSensitivity:1,gyroSensitivity:1,volume:60,quality:touchDevice()?'low':'medium',...stored};settings.quality=['low','medium','high'].includes(settings.quality)?settings.quality:'medium';settings.pointer=settings.pointer==='trackpad'?'trackpad':'mouse';settings.aimMode=settings.aimMode==='toggle'?'toggle':'hold';settings.keyboardPitch=['auto','level','keep'].includes(stored.keyboardPitch)?stored.keyboardPitch:stored.arrowRecenter===false?'keep':'auto';delete settings.arrowRecenter;settings.keys=normalizeBindings(stored.keys);settings.botDifficulty=botLevel(settings.botDifficulty);settings.aimAssist=aimAssistLevel(settings.aimAssist);settings.stickMode=stickMode(settings.stickMode);settings.gyro=gyroMode(settings.gyro);settings.gyroNeutral=Number.isFinite(settings.gyroNeutral?.pitch)&&Number.isFinite(settings.gyroNeutral?.roll)?{pitch:settings.gyroNeutral.pitch,roll:settings.gyroNeutral.roll}:null;settings.fov=fovSetting(settings.fov);settings.mapId=mapId(settings.mapId);
settings.touchLayout=touchLayout(stored.touchLayout);
// Mode, venue and one set of rules per mode are remembered on this device.
settings.mode=MODE_IDS.includes(stored.mode)?stored.mode:'assault';settings.venue=stored.venue==='online'?'online':'local';settings.display=['vr','table','room'].includes(stored.display)?stored.display:stored.stereo===true?'vr':'normal';delete settings.stereo;settings.rules=Object.fromEntries(MODE_IDS.map(id=>[id,normalizeRules(id,stored.rules?.[id])]));
let selected=0,sidearm=SIDEARMS[0],game,pendingConnection;
// What the online server runs, polled while the lobby is open. A game in
// progress, or a setting the server imposes, takes the place of the local
// choice: the lobby shows it and joining sends it.
let room=null,roomError=false,roomTimer=0;
// The view, on touch devices: normal play, the split screen of a VR
// headset (the gyroscope needs HTTPS), and in the iOS app the map as a
// model on a table or the player's room. A room plays Survival, solo: the
// lobby shows it so.
let arInfo=null;
const arReady=()=>arSupported()&&arInfo?.supported!==false;
const display=()=>{const v=settings.display;return v==='vr'?(isSecureContext?v:'normal'):(v==='table'||v==='room')&&arReady()?v:'normal';},inRoom=()=>display()==='room';
const online=()=>settings.venue==='online'&&!inRoom(),live=()=>online()&&room?.players>0;
const imposed=key=>online()&&!!room&&(room.players>0||!!room[key+'Fixed']);
const mode=()=>inRoom()?'survival':imposed('mode')?modeId(room.mode):settings.mode,rules=()=>imposed('rules')?normalizeRules(mode(),room.rules):settings.rules[mode()];
const map=()=>imposed('map')?mapId(room.mapId):settings.mapId,level=()=>imposed('difficulty')?botLevel(room.botDifficulty):settings.botDifficulty;
function renderDifficulty(){const locked=imposed('difficulty');$('bot-difficulty').value=level();$('bot-difficulty').disabled=locked;$('bot-difficulty-description').textContent=`${botProfile(level()).description} ${t(locked?(live()?'ui.difficulty.live':'ui.difficulty.imposed'):'ui.difficulty.onlineNote')}`;}
function renderMap(){$('map-choice').value=inRoom()?'room':map();$('map-choice').disabled=imposed('map')||inRoom();$('map-description').textContent=inRoom()?t('ui.map.roomDescription'):mapConfig(map()).description;game.loadMap(map());}
function saveSettings(){try{localStorage.setItem('fw-settings',JSON.stringify(settings));}catch{}}
// Keyboard bindings: the briefing manual and the HUD hints name the keys
// chosen; the key window edits them.
const keysOf=(id,slot)=>{const code=settings.keys[id][slot];return code?keyName(code):'';};
const joinKeys=(...parts)=>parts.filter(Boolean).join(' ');
const MANUAL={
 move:()=>[joinKeys(...['forward','left','back','right'].map(id=>keysOf(id,0))),joinKeys(...['forward','left','back','right'].map(id=>keysOf(id,1)))].filter(Boolean).join(' · ')||'—',
 turn:()=>[t('ui.manual.mouse'),joinKeys(keysOf('turnLeft',0),keysOf('turnRight',0)),joinKeys(keysOf('turnLeft',1),keysOf('turnRight',1))].filter(Boolean).join(' · '),
 aim:()=>[t('ui.manual.rightClick'),settings.keys.aim.length&&bindingText(settings.keys,'aim')].filter(Boolean).join(` ${t('ui.key.or')} `),
 fire:()=>[t('ui.manual.leftClick'),settings.keys.fire.length&&bindingText(settings.keys,'fire')].filter(Boolean).join(` ${t('ui.key.or')} `),
 weapons:()=>[joinKeys(keysOf('primary',0),keysOf('secondary',0)),t('ui.manual.wheel')].filter(Boolean).join(' · '),
 pause:()=>keyName('Escape'),
 breath:()=>t('ui.manual.breathKey',{key:bindingText(settings.keys,'sprint')}),
};
function renderKeyNames(){
 for(const el of document.querySelectorAll('[data-manual]'))el.textContent=el.dataset.manual.split(' ').map(id=>MANUAL[id]?.()??bindingText(settings.keys,id)).join(' / ');
 for(const el of document.querySelectorAll('[data-hint]'))el.dataset.key=el.dataset.hint.split(' ').map(id=>settings.keys[id][0]?keyName(settings.keys[id][0]):'—').join(' · ');
 game?.gamepad.labels();
}
// The release of the key just chosen must not press the focused slot again
// (Space and Enter click a button).
let listening=null,swallowKeyup=null;
function renderKeys(){
 const list=$('keys-list');list.replaceChildren();
 for(const a of ACTIONS){
  const label=document.createElement('span');label.textContent=a.label;if(a.mouse){const small=document.createElement('small');small.textContent=t('ui.keys.orMouse',{button:a.mouse});label.append(small);}list.append(label);
  for(const slot of [0,1]){const code=settings.keys[a.id][slot],button=document.createElement('button');button.type='button';button.dataset.action=a.id;button.dataset.slot=slot;button.textContent=code?keyName(code):'—';button.classList.toggle('empty',!code);button.setAttribute('aria-label',t('ui.keys.slot',{action:a.label,slot:slot+1,key:code?keyName(code):t('ui.keys.none')}));list.append(button);}
 }
 renderKeyNames();
}
function listenKey(button){
 stopListening();listening={action:button.dataset.action,slot:Number(button.dataset.slot)};
 button.classList.add('listening');button.textContent=t('ui.keys.press');$('keys-note').textContent='';
}
function stopListening(){if(!listening)return;listening=null;renderKeys();}
function focusSlot(action,slot){$('keys-list').querySelector(`[data-action="${action}"][data-slot="${slot}"]`)?.focus();}
function captureKey(e){
 if(!listening)return;e.preventDefault();e.stopImmediatePropagation();swallowKeyup=e.code;
 const {action,slot}=listening,label=ACTIONS.find(a=>a.id===action).label;
 if(e.code==='Escape'){stopListening();focusSlot(action,slot);return;}
 if(e.code==='Backspace'||e.code==='Delete'){listening=null;bind(settings.keys,action,slot,null);}
 else if(RESERVED.has(e.code)||!e.code){$('keys-note').textContent=t('ui.keys.reserved',{action:label});return;}
 else{learnKey(e);listening=null;const previous=bind(settings.keys,action,slot,e.code);$('keys-note').textContent=previous?t('ui.keys.moved',{key:keyName(e.code),action:ACTIONS.find(a=>a.id===previous).label}):'';}
 saveSettings();game.bindingsChanged();renderKeys();focusSlot(action,Math.min(slot,settings.keys[action].length));
}
function showKeys(){$('keys').classList.remove('hidden');$('keys-note').textContent='';renderKeys();focusSlot(ACTIONS[0].id,0);learnLayout().then(changed=>{if(changed&&!listening)renderKeys();});}
function closeKeys(){stopListening();$('keys').classList.add('hidden');$('keys-button').focus();}
function renderDeploy(){
 const net=online(),view={vr:'ui.deploy.vr',table:'ui.deploy.table',room:'ui.deploy.room'}[display()];
 $('deploy-description').textContent=[view&&t(view),...(net?[t(live()?'ui.deploy.joinGame':'ui.deploy.joinServer'),MODES[mode()].label.toUpperCase()]:[rulesSummary(rules())])].filter(Boolean).join(' · ');
 $('profile-label').firstChild.textContent=t(net?'ui.profile.online':'ui.profile.local');$('profile-sub').textContent=t(net?'ui.profile.onlineSub':'ui.profile.localSub');
 document.querySelectorAll('[data-venue]').forEach(el=>{const active=el.dataset.venue===(net?'online':'local');el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));el.disabled=inRoom()&&!active;});
 renderDisplay();
}
let displayMarkup='';
function renderDisplay(){
 const view=display(),options=[['normal',t('ui.display.normal')],['vr',t(isSecureContext?'ui.display.vr':'ui.display.vrHttps'),!isSecureContext]];
 if(arReady())options.push(['table',t('ui.display.table')],['room',t(arInfo?.lidar?'ui.display.roomLidar':'ui.display.room')]);
 const markup=options.map(([value,label,off])=>`<option value="${value}"${off?' disabled':''}>${label}</option>`).join('');
 if(markup!==displayMarkup){displayMarkup=markup;$('display-choice').innerHTML=markup;}$('display-choice').value=view;
 const denied=game.touch.motion==='denied'?t('ui.motion.denied'):'';
 const note=view==='vr'?[t('ui.display.noteVr'),denied].filter(Boolean).join(' '):view==='table'?t('ui.display.noteTable'):view==='room'?t(arInfo?.lidar?'ui.display.noteRoomLidar':'ui.display.noteRoom'):'';
 $('display-note').textContent=note;$('display-note').classList.toggle('hidden',!note);
}
// What the AR panel will launch, under the placed map.
const summary=()=>`${MODES[mode()].label.toUpperCase()} · ${mapConfig(map()).name.toUpperCase()} · ${t(online()?'ui.venue.online':'ui.venue.local')}`;
// One stepper per adjustable rule of the current mode.
function renderRules(){
 const id=mode(),r=rules(),fields=MODES[id].fields,locked=imposed('rules');$('rules-mode').textContent=MODES[id].hud;$('rules-reset').disabled=locked;
 $('rules-list').innerHTML=Object.keys(fields).map(key=>{const [,min,max]=fields[key];return `<div class="rule"><span>${ruleLabel(id,key)}</span><button type="button" data-rule="${key}" data-step="-1" aria-label="${t('ui.rules.less',{rule:ruleLabel(id,key)})}" ${locked||r[key]<=min?'disabled':''}>−</button><output id="rule-${key}">${ruleValue(id,key,r[key])}</output><button type="button" data-rule="${key}" data-step="1" aria-label="${t('ui.rules.more',{rule:ruleLabel(id,key)})}" ${locked||r[key]>=max?'disabled':''}>+</button></div>`;}).join('');
 const note=locked?(live()?'ui.rules.live':'ui.rules.imposed'):online()?'ui.rules.onlineNote':null;$('rules-note').textContent=[MODES[id].description,note&&t(note)].filter(Boolean).join(' ');
 renderDeploy();
}
function renderModes(){
 const locked=imposed('mode')||inRoom();
 document.querySelectorAll('[data-mode]').forEach(el=>{const active=el.dataset.mode===mode();el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));el.disabled=locked&&!active;});
 renderRules();
}
function setMode(id){if(imposed('mode')||inRoom())return;settings.mode=modeId(id);saveSettings();renderModes();}
// The running game, summed up above the settings it imposes.
function renderRoom(){
 const out=$('live-room');out.classList.toggle('hidden',!online());if(!online())return;out.classList.toggle('idle',!live());
 if(!room){out.innerHTML=`<strong><i></i>${t(roomError?'ui.room.unreachable':'ui.room.searching')}</strong>${roomError?`<span>${t('ui.room.unreachableNote')}</span>`:''}`;return;}
 const id=modeId(room.mode),r=normalizeRules(id,room.rules);
 if(!live()){out.innerHTML=`<strong><i></i>${t('ui.room.empty')}</strong><span>${t(['mode','map','difficulty'].some(k=>room[k+'Fixed'])?'ui.room.emptyNoteFixed':'ui.room.emptyNote')}</span>`;return;}
 // Any address can be typed in, so only numbers and known labels reach the markup.
 const n=value=>Math.max(0,Math.floor(Number(value)||0));
 const versus=!MODES[id].coop&&id!=='ffa'?` · <b class="blue">${t('ui.room.blue',{n:n(room.scores?.blue)})}</b> – <b class="red">${t('ui.room.red',{n:n(room.scores?.red)})}</b>`:'';
 const clock=room.phase==='waiting'?t('ui.room.waiting'):room.phase==='over'?t('ui.room.over'):r.duration?t('ui.room.remaining',{time:formatTime(n(room.remaining))}):t('ui.room.elapsed',{time:formatTime(n(room.elapsed))});
 out.innerHTML=`<strong><i></i>${t('ui.room.live',{mode:MODES[id].label.toUpperCase()})}</strong><span>${t('ui.room.mapBots',{map:mapConfig(room.mapId).name,level:botProfile(room.botDifficulty).label})}</span><span>${t('ui.room.counts',{players:n(room.players),capacity:n(room.capacity),bots:n(room.bots),clock})}${versus}</span>`;
}
function renderLobby(){renderDifficulty();renderMap();renderModes();renderRoom();syncLan();}
// iOS: the server built into the app starts only for online play. Its port
// may differ from the planned one when that one is taken.
async function startHost(){
 const planned=defaultAddress();if(!await startNativeHost()||defaultAddress()===planned)return;
 if($('online-address').value===planned){$('online-address').value=defaultAddress();describeRoom();}renderLan();
}
async function pollRoom(){
 clearTimeout(roomTimer);if(!online()||game?.state!=='lobby')return;
 await startHost();if(!online()||game.state!=='lobby')return;
 try{const answer=await(await fetch(new URL('/api/server',$('online-address').value||defaultAddress()),{cache:'no-store'})).json();room=answer&&typeof answer==='object'?answer:null;roomError=!room;}catch{room=null;roomError=true;}
 if(online()&&game.state==='lobby')renderLobby();clearTimeout(roomTimer);roomTimer=setTimeout(pollRoom,4000);
}
function saveSettingsSoon(){clearTimeout(saveSettingsSoon.timer);saveSettingsSoon.timer=setTimeout(saveSettings,150);}
function changeView(view){document.querySelectorAll('.lobby-view').forEach(el=>el.classList.toggle('hidden',el.id!==`${view}-view`));document.querySelectorAll('.nav').forEach(el=>el.classList.toggle('active',el.dataset.view===view));}
function updateSound(){const muted=game.audio.muted||settings.volume===0;$('sound-toggle').innerHTML=`${muted?'◖×':'◖))'} <span>${t(muted?'ui.sound.off':'ui.sound.on')}</span>`;$('sound-toggle').setAttribute('aria-label',t(muted?'ui.sound.unmute':'ui.sound.mute'));}
// The trackpad sensitivity is only shown while the trackpad is chosen.
function renderPointer(){$('trackpad-sensitivity-setting').classList.toggle('hidden',settings.pointer!=='trackpad');}
// Likewise the gyroscope sensitivity, while the gyroscope aims, and the
// calibration of tilt aiming. Over plain HTTP the browser hides the device
// motion: the setting says so.
function renderGyro(){
 const insecure=!isSecureContext,denied=game.touch.motion==='denied';
 $('gyro').disabled=insecure;if(insecure)$('gyro').value='off';
 $('gyro-sensitivity-setting').classList.toggle('hidden',insecure||settings.gyro==='off');
 $('gyro-note').textContent=insecure?t('ui.settings.gyroHttps'):denied?t('ui.motion.denied'):'';
 $('gyro-note').classList.toggle('hidden',!insecure&&!denied);
 $('gyro-calibration').classList.toggle('hidden',insecure||settings.gyro!=='tilt');
 $('gyro-calibrate').disabled=denied||!!calibration;$('gyro-calibrate').textContent=t(settings.gyroNeutral?'ui.settings.recalibrate':'ui.settings.calibrate');
 if(!calibration)$('gyro-calibration-note').textContent=t(settings.gyroNeutral?'ui.settings.calibrated':'ui.settings.notCalibrated');
}
// Tilt aiming leans from a neutral position: the player holds the device
// there, still, through a short countdown, and its lean then becomes zero.
// A calibration that gets no reading keeps the previous one.
let calibration=null;
function calibrate(){
 stopCalibration();let left=3;
 const tick=()=>{
  if(left>0){$('gyro-calibration-note').textContent=t('ui.settings.calibrating',{n:left--});return;}
  stopCalibration();const neutral=game.touch.neutral();if(neutral){settings.gyroNeutral=neutral;saveSettings();}
  renderGyro();if(!neutral)$('gyro-calibration-note').textContent=t('ui.settings.noMotion');
 };
 calibration=setInterval(tick,1000);tick();renderGyro();
}
function stopCalibration(){clearInterval(calibration);calibration=null;}
// Multisampling is chosen with the WebGL context: say when it waits for a relaunch.
function qualityNote(){$('quality-note').classList.toggle('hidden',nativeAntialias(settings.quality)===game.visuals.multisampled);}
// The field of view, in horizontal degrees. Without a choice it shows what
// the default view spans on this screen.
function renderFov(){const value=settings.fov??Math.round(horizontalFov(DEFAULT_FOV,innerWidth/innerHeight));$('fov').value=value;$('fov-value').textContent=settings.fov==null?t('ui.settings.fovDefault',{value}):value+'°';$('fov-reset').classList.toggle('hidden',settings.fov==null);}
function showSettings(){$('settings').classList.remove('hidden');showServerPort();renderFov();$('sensitivity').value=settings.sensitivity;$('volume').value=settings.volume;$('quality').value=settings.quality;qualityNote();$('aim-assist').value=settings.aimAssist;$('stick-mode').value=settings.stickMode;$('gyro').value=settings.gyro;$('gyro-sensitivity').value=settings.gyroSensitivity;$('gyro-sensitivity-value').textContent=Number(settings.gyroSensitivity).toFixed(1);renderGyro();$('pointer').value=settings.pointer;$('aim-mode').value=settings.aimMode;$('keyboard-pitch').value=settings.keyboardPitch;$('trackpad-sensitivity').value=settings.trackpadSensitivity;$('trackpad-sensitivity-value').textContent=Number(settings.trackpadSensitivity).toFixed(1);renderPointer();$('sensitivity-value').textContent=Number(settings.sensitivity).toFixed(1);$('volume-value').textContent=t('ui.settings.percent',{n:settings.volume});$('language').value=chosenLanguage()||'auto';$('close-settings').focus();}
// Desktop app only: the port of its built-in game server. Applying it
// restarts the server and reloads the page at the new address; a taken port
// changes nothing.
const desktop=window.fieldWarfareDesktop;
async function showServerPort(){
 if(!desktop)return;$('server-port-setting').classList.remove('hidden');
 try{const {port,configured}=await desktop.serverPort();$('server-port').value=configured;$('server-port-note').textContent=`${port===configured?t('ui.settings.portListening',{port}):t('ui.settings.portBusy',{port,configured})} ${t('ui.settings.portWarning')}`;}catch{}
}
async function applyServerPort(){
 const port=Number($('server-port').value),note=$('server-port-note');note.textContent=t('ui.settings.restarting');
 try{const result=await desktop.setServerPort(port);note.textContent=result.ok?t('ui.settings.portSaved',{port:result.port}):t(result.error,result.vars);}catch(error){note.textContent=t(error.message);}
}
function closeSettings(){const language=$('language').value==='auto'?null:$('language').value;if(language!==chosenLanguage()){setLanguage(language);location.reload();return;}stopCalibration();$('settings').classList.add('hidden');if(game.state==='paused')$('resume').focus();else $('settings-button').focus();}
function stateChanged(state){
 if(showcase)showcase.paused=state!=='lobby';
 $('lobby').classList.toggle('hidden',state!=='lobby');$('hud').classList.toggle('hidden',!['active','paused'].includes(state));$('pause').classList.toggle('hidden',state!=='paused');$('results').classList.toggle('hidden',state!=='ended');document.body.classList.toggle('playing',state==='active');
 if(state==='ended')$('retry').focus();if(state==='paused')$('resume').focus();if(state==='lobby')pollRoom();syncLan();
}
// Studio renders of the in-game models replace flat silhouettes; the lobby
// keeps working without them if a second WebGL context is refused.
let showcase=null;
const RIFLES=WEAPONS.filter(w=>!w.sidearm).map(w=>w.id),PISTOLS=SIDEARMS.map(i=>WEAPONS[i].id);
function preview(canvas,id,live=false,group){if(showcase&&canvas)showcase.attach(canvas,id,{live,group});}
function renderArsenal(){
 $('weapon-cards').innerHTML=WEAPONS.map((w,i)=>w.sidearm?'':`<button class="weapon-card ${selected===i?'selected':''}" data-weapon="${i}" aria-pressed="${selected===i}"><small>0${i+1} / ${w.category}</small><h3>${w.name}</h3><canvas class="weapon-render" data-render="${w.id}" aria-hidden="true"></canvas><div class="weapon-specs"><span>${w.caliber}</span><span>${t('ui.arsenal.rpm',{rate:Math.round(60/w.interval)})}</span><span>${w.range} M</span></div><p>${w.description}</p>${[t('ui.arsenal.damage'),t('ui.arsenal.rate'),t('ui.arsenal.accuracy')].map((name,j)=>`<div class="stat"><span>${name}</span><div><i style="width:${w.stats[j]}%"></i></div></div>`).join('')}<div class="weapon-selection">${t(selected===i?'ui.arsenal.equipped':'ui.arsenal.equip')} <span style="float:right">${w.capacity} + ${w.reserve}</span></div></button>`).join('');
 document.querySelectorAll('[data-weapon]').forEach(button=>{const i=Number(button.dataset.weapon),canvas=button.querySelector('canvas');preview(canvas,WEAPONS[i].id,selected===i,RIFLES);
  button.addEventListener('pointerenter',()=>showcase?.setLive(canvas,true));button.addEventListener('pointerleave',()=>showcase?.setLive(canvas,selected===i));
  button.addEventListener('click',()=>{selected=i;$('lobby-weapon').textContent=WEAPONS[selected].name;$('lobby-class').textContent=WEAPONS[selected].category;renderArsenal();preview($('loadout-render'),WEAPONS[selected].id);game.audio.tone(550,.06,.035);});});
 // Sidearms: a row of compact cards under the main weapons.
 $('sidearm-cards').innerHTML=SIDEARMS.map(i=>{const w=WEAPONS[i];return `<button class="sidearm-card ${sidearm===i?'selected':''}" data-sidearm="${i}" aria-pressed="${sidearm===i}"><canvas aria-hidden="true"></canvas><span><strong>${sidearm===i?'✓ ':''}${w.name}</strong><small>${w.category} · ${w.caliber} · ${w.capacity} + ${w.reserve}</small><span>${w.description}</span></span></button>`;}).join('');
 document.querySelectorAll('[data-sidearm]').forEach(button=>{const i=Number(button.dataset.sidearm),canvas=button.querySelector('canvas');preview(canvas,WEAPONS[i].id,sidearm===i,PISTOLS);
  button.addEventListener('pointerenter',()=>showcase?.setLive(canvas,true));button.addEventListener('pointerleave',()=>showcase?.setLive(canvas,sidearm===i));
  button.addEventListener('click',()=>{sidearm=i;renderArsenal();game.audio.tone(550,.06,.035);});});
}
// Augmented reality (iOS app): with the view on Tabletop or Room, DEPLOY
// starts the camera and the lobby gives way to placing the map or scanning
// the room; the AR panel's own DEPLOY launches the mission.
// Its LOBBY button reloads the page (see ar.js), weapons kept.
const boot=takeBoot();
if(Number.isInteger(boot?.primary)&&WEAPONS[boot.primary]&&!WEAPONS[boot.primary].sidearm)selected=boot.primary;
if(SIDEARMS.includes(boot?.sidearm))sidearm=boot.sidearm;
function deploy(){
 const view=display();if((view==='table'||view==='room')&&!game.ar.active&&!(game.network&&game.state==='paused')){game.ar.start(view);return;}
 launch();
}
function launch(){
 if(online()){openOnline();return;}if(game.network&&game.state==='paused'){game.resume();return;}
 if(game.ar.room)game.start('survival',selected,null,'room',rules(),sidearm);else game.start(mode(),selected,null,map(),rules(),sidearm);
}
// What the server is running, so a player knows whether their rules apply.
async function describeRoom(){
 const out=$('online-room');out.textContent='';let url;try{url=new URL('/api/server',$('online-address').value);}catch{return;}
 try{
  const room=await(await fetch(url,{cache:'no-store'})).json();if(!room||typeof room!=='object')return;const name=MODES[modeId(room.mode)].label,map=mapConfig(room.mapId).name;
  out.textContent=room.players>0?t('ui.online.roomLive',{mode:name,map,players:room.players,capacity:room.capacity}):t(room.modeFixed?(room.mapFixed?'ui.online.roomEmptyModeMap':'ui.online.roomEmptyMode'):room.mapFixed?'ui.online.roomEmptyMap':'ui.online.roomEmpty',{mode:name,map});
 }catch{out.textContent='';}
}
// Games of the local network, listed in the lobby while playing online: this
// device's own server first, then those announced by other players. Choosing
// one fills in the address.
let stopLan=null,lastLan=null,lanMarkup='';
const escapeHTML=text=>String(text).replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`);
function renderLan(lan=lastLan){
 lastLan=lan;const own=localServer(),box=$('lan');box.classList.toggle('hidden',!stopLan||!lan&&!own);
 const current=$('online-address').value.trim().replace(/\/+$/,''),n=value=>Math.max(0,Math.floor(Number(value)||0));
 const row=(address,title,detail)=>`<button type="button" class="lan-game${address===current?' selected':''}" data-address="${escapeHTML(address)}" aria-pressed="${address===current}"><strong><i></i>${escapeHTML(title)}</strong><span>${escapeHTML(detail)}</span></button>`;
 const markup=(own?row(own,t('ui.lan.thisDevice'),t('ui.lan.hostHere')):'')+(lan?.servers||[]).map(s=>row(s.address,t('ui.lan.hostGame',{host:s.host.toUpperCase()}),t(s.version&&s.version!==VERSION?'ui.lan.detailVersion':'ui.lan.detail',{mode:MODES[modeId(s.room.mode)].label,map:mapConfig(s.room.mapId).name,players:n(s.room.players),capacity:n(s.room.capacity),version:s.version}))).join('')+(lan&&!lan.servers.length?`<p class="lan-empty">${t('ui.lan.searching')}</p>`:'');
 if(markup!==lanMarkup){const focused=document.activeElement?.dataset?.address;lanMarkup=markup;$('lan-list').innerHTML=markup;if(focused)$('lan-list').querySelector(`[data-address="${CSS.escape(focused)}"]`)?.focus();}
 if(lan?.addresses?.length)$('online-help').textContent=t('ui.lan.help',{address:lan.addresses[0]});
}
// Discovery runs only while the online lobby is on screen.
function syncLan(){
 const on=online()&&game?.state==='lobby';
 if(on&&!stopLan){stopLan=watchLan(renderLan);renderLan(null);}else if(!on&&stopLan){stopLan();stopLan=null;renderLan(null);}
}
function openOnline(message=''){
 $('online-mode').textContent=MODES[mode()].label.toUpperCase();$('online-modal').classList.remove('hidden');$('online-status').textContent=message&&t(message);if(!$('online-address').value)$('online-address').value=defaultAddress();try{$('online-name').value=localStorage.getItem('fw-name')||'';}catch{}if(!touchDevice())$('online-name').focus();describeRoom();
}
function hideOnline(){$('online-modal').classList.add('hidden');}
function closeOnline(){pendingConnection?.disconnect();pendingConnection=null;hideOnline();}
async function joinOnline(event){
 event.preventDefault();const button=$('online-connect');button.disabled=true;$('online-status').textContent=t('ui.online.connecting');
 try{await startHost();const name=$('online-name').value.trim();try{localStorage.setItem('fw-name',name);}catch{}pendingConnection=new NetworkSession(game,{name,team:$('online-team').value,address:$('online-address').value,weapon:selected,sidearm,botDifficulty:level(),mapId:map(),mode:mode(),rules:rules(),onDisconnect:message=>openOnline(message)});await pendingConnection.connect();pendingConnection=null;hideOnline();}
 catch(error){if(!$('online-modal').classList.contains('hidden'))$('online-status').textContent=t(error.message);}finally{button.disabled=false;}
}
try{
 $('online-address').value=defaultAddress();$('lobby-weapon').textContent=WEAPONS[selected].name;$('lobby-class').textContent=WEAPONS[selected].category;game=new Game(settings,stateChanged);try{showcase=new WeaponShowcase();}catch(error){console.warn(error);}renderArsenal();preview($('loadout-render'),WEAPONS[selected].id);updateSound();renderLobby();pollRoom();
 document.querySelectorAll('.nav').forEach(button=>button.addEventListener('click',()=>changeView(button.dataset.view)));
 document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();changeView('play');});
 $('briefing-link').addEventListener('click',()=>changeView('briefing'));$('loadout-button').addEventListener('click',()=>changeView('arsenal'));$('back-play').addEventListener('click',()=>changeView('play'));
 document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{setMode(button.dataset.mode);game.audio.tone(480,.05,.03);}));
 document.querySelectorAll('[data-venue]').forEach(button=>button.addEventListener('click',()=>{settings.venue=button.dataset.venue;saveSettings();renderLobby();pollRoom();}));
 // Safari asks for the motion sensors from a user gesture: choosing the headset is one.
 $('display-choice').addEventListener('change',e=>{settings.display=e.target.value;saveSettings();renderLobby();pollRoom();if(settings.display==='vr')game.touch.motionAccess()?.then(renderDisplay);});
 $('rules-list').addEventListener('click',e=>{const button=e.target.closest('[data-rule]');if(!button||imposed('rules'))return;const key=button.dataset.rule,step=MODES[mode()].fields[key][3];settings.rules[mode()]=normalizeRules(mode(),{...rules(),[key]:rules()[key]+step*Number(button.dataset.step)});saveSettingsSoon();renderRules();document.querySelector(`[data-rule="${key}"][data-step="${button.dataset.step}"]`)?.focus();});
 $('rules-reset').addEventListener('click',()=>{if(imposed('rules'))return;settings.rules[mode()]=normalizeRules(mode());saveSettings();renderRules();});
 if(arSupported()){
  game.ar.onDeploy=launch;game.ar.onExit=()=>reloadWith({primary:selected,sidearm});game.ar.describe=summary;
  arCapabilities().then(info=>{arInfo=info;if(info?.supported===false)renderLobby();else renderDisplay();});renderDisplay();
 }
 $('deploy').addEventListener('click',deploy);$('briefing-deploy').addEventListener('click',deploy);$('resume').addEventListener('click',()=>game.resume());$('quit').addEventListener('click',()=>{game.lobby();changeView('play');});
 $('retry').addEventListener('click',()=>{if(game.online){game.transition('paused');game.resume();game.network.redeploy();}else game.start(game.mode,game.nextPrimary??game.primary??selected,null,game.mapId,game.rules,game.nextSidearm??game.sidearm??sidearm);});$('return-lobby').addEventListener('click',()=>{game.lobby();changeView('play');});
 $('online-form').addEventListener('submit',joinOnline);$('online-close').addEventListener('click',closeOnline);$('online-modal').addEventListener('click',e=>{if(e.target===$('online-modal'))closeOnline();});$('online-address').addEventListener('change',()=>{describeRoom();pollRoom();renderLan();});
 $('lan-list').addEventListener('click',e=>{const button=e.target.closest('[data-address]');if(!button)return;$('online-address').value=button.dataset.address;describeRoom();pollRoom();renderLan();});
 $('settings-button').addEventListener('click',showSettings);$('server-port-apply').addEventListener('click',applyServerPort);$('server-port').addEventListener('keydown',e=>{if(e.key==='Enter')applyServerPort();});$('pause-settings').addEventListener('click',showSettings);$('close-settings').addEventListener('click',closeSettings);$('settings').addEventListener('click',e=>{if(e.target===$('settings'))closeSettings();});
 // The interface language applies when the settings close (closeSettings
 // reloads the page, which builds every string again): stepping through the
 // list with a controller's d-pad must not reload at each step.
 $('language').append(...LANGUAGES.map(({id,name})=>{const option=new Option(name,id);option.lang=id;return option;}));$('language').value=chosenLanguage()||'auto';
 $('sensitivity').addEventListener('input',e=>{settings.sensitivity=Number(e.target.value);$('sensitivity-value').textContent=settings.sensitivity.toFixed(1);saveSettings();});
 $('fov').addEventListener('input',e=>{settings.fov=fovSetting(e.target.value);game.applyFov();renderFov();saveSettingsSoon();});
 $('fov-reset').addEventListener('click',()=>{settings.fov=null;game.applyFov();renderFov();saveSettings();$('fov').focus();});
 $('volume').addEventListener('input',e=>{settings.volume=Number(e.target.value);$('volume-value').textContent=t('ui.settings.percent',{n:settings.volume});game.audio.setVolume(settings.volume/100);updateSound();saveSettings();});
 $('map-choice').addEventListener('change',e=>{settings.mapId=mapId(e.target.value);saveSettings();renderMap();});
 $('bot-difficulty').addEventListener('change',e=>{settings.botDifficulty=botLevel(e.target.value);saveSettings();renderDifficulty();});
 $('quality').addEventListener('change',e=>{settings.quality=e.target.value;game.setQuality();saveSettings();qualityNote();});
 $('stick-mode').addEventListener('change',e=>{settings.stickMode=stickMode(e.target.value);saveSettings();});
 $('touch-layout').addEventListener('click',()=>game.touch.editLayout(saveSettings));
 $('gyro').addEventListener('change',e=>{settings.gyro=gyroMode(e.target.value);saveSettings();renderGyro();game.touch.motionAccess()?.then(renderGyro);if(settings.gyro==='tilt')calibrate();else stopCalibration();});
 $('gyro-calibrate').addEventListener('click',calibrate);
 $('gyro-sensitivity').addEventListener('input',e=>{settings.gyroSensitivity=Number(e.target.value);$('gyro-sensitivity-value').textContent=settings.gyroSensitivity.toFixed(1);saveSettings();});
 $('aim-assist').addEventListener('change',e=>{settings.aimAssist=aimAssistLevel(e.target.value);saveSettings();});
 $('pointer').addEventListener('change',e=>{settings.pointer=e.target.value==='trackpad'?'trackpad':'mouse';renderPointer();saveSettings();});
 $('trackpad-sensitivity').addEventListener('input',e=>{settings.trackpadSensitivity=Number(e.target.value);$('trackpad-sensitivity-value').textContent=settings.trackpadSensitivity.toFixed(1);saveSettings();});
 $('aim-mode').addEventListener('change',e=>{settings.aimMode=e.target.value==='toggle'?'toggle':'hold';saveSettings();});
 $('keyboard-pitch').addEventListener('change',e=>{settings.keyboardPitch=['auto','level','keep'].includes(e.target.value)?e.target.value:'auto';saveSettings();});
 $('sound-toggle').addEventListener('click',()=>{game.audio.start();game.audio.toggle();updateSound();});
 document.addEventListener('keydown',e=>{if(e.code==='Escape'&&!$('settings').classList.contains('hidden')){e.preventDefault();closeSettings();}});
 // A key being chosen is caught before anything else hears it.
 document.addEventListener('keydown',captureKey,true);
 document.addEventListener('keyup',e=>{if(e.code!==swallowKeyup)return;swallowKeyup=null;e.preventDefault();e.stopImmediatePropagation();},true);
 document.addEventListener('keydown',e=>{if(e.code==='Escape'&&!$('keys').classList.contains('hidden')){e.preventDefault();closeKeys();}});
 $('keys-button').addEventListener('click',showKeys);$('close-keys').addEventListener('click',closeKeys);
 $('keys').addEventListener('click',e=>{if(e.target===$('keys'))closeKeys();});
 $('keys-list').addEventListener('click',e=>{const button=e.target.closest('[data-action]');if(button)listenKey(button);else stopListening();});
 // Any mouse button cancels a key being chosen, except the click that starts it.
 $('keys').addEventListener('mousedown',e=>{if(listening&&!e.target.closest('[data-action]'))stopListening();});
 $('keys-reset').addEventListener('click',()=>{settings.keys=defaultBindings();saveSettings();game.bindingsChanged();$('keys-note').textContent=t('ui.keys.restored');renderKeys();});
 renderKeyNames();learnLayout().then(changed=>{if(changed)renderKeyNames();});
 // The lobby shows the version of package.json, bundled at build time.
 $('game-version').textContent=`V. ${VERSION}`;
 // Read-only diagnostics for support and browser verification.
 window.fieldWarfare=Object.freeze({version:VERSION,getState:()=>game.snapshot(),getRendererInfo:()=>({calls:game.renderer.info.render.calls,triangles:game.renderer.info.render.triangles,quality:game.visuals.quality,pixelRatio:game.renderer.getPixelRatio()})});
 for(const type of ['pointerdown','keydown'])addEventListener(type,()=>game.audio.start(),{once:true,capture:true});
 requestAnimationFrame(()=>{$('loading').style.opacity='0';setTimeout(()=>$('loading').remove(),450);});
}catch(error){console.error(error);$('loading')?.remove();$('error').classList.remove('hidden');$('error-message').textContent=t('ui.error.startFailed');}
