// Touch controls for phones and tablets. A floating stick on the left of the
// screen moves the operator, dragging anywhere else turns the view, and
// buttons replace the keyboard. They drive the same Game state as the
// keyboard and mouse, so solo and online play need nothing else.
//
// The right thumb aims: only four buttons sit there, tight against the edge,
// and a drag that starts on any of them still turns the view. Reload and
// weapon change live on the ammo counter, the grenade and a second trigger
// on the left. Buttons show pictograms, and the player can move each of them
// and the stick, and resize the buttons, in a layout editor.
import {Capacitor} from '@capacitor/core';
import * as THREE from 'three';
import {t} from './i18n.js';

const $=id=>document.getElementById(id);
const STICK_RADIUS=52,DEAD_ZONE=.14,SPRINT_PUSH=1.35;
// Screen pixels are larger than mouse counts: one swipe across a phone turns
// the view by about two thirds of a full circle at sensitivity 1.
const LOOK_SCALE=2.6;
// A press that travels further than this is a look, not a tap.
const TAP_SLOP=12;
// Stick modes: floating (the ring comes under the thumb anywhere on the
// left), semi (it stays put when the thumb lands near it) and fixed (it
// never moves; touches far from it are ignored).
export const STICK_MODES=['floating','semi','fixed'];
export const stickMode=value=>STICK_MODES.includes(value)?value:'floating';
const SEMI_REACH=1.5,FIXED_REACH=2.2;
// Gyroscope aiming: off, only in the sights, always, or by tilt: the
// device then works as a stick, the view turning for as long as it leans
// away from the neutral position set by calibration.
export const GYRO_MODES=['off','aim','always','tilt'];
export const gyroMode=value=>GYRO_MODES.includes(value)?value:'off';
// The view looks out of the back of the device, not out of its top: a
// quarter turn about the device's x axis. The screen may then be turned
// about z within the device.
const BACK=new THREE.Quaternion(-Math.SQRT1_2,0,0,Math.SQRT1_2),Z=new THREE.Vector3(0,0,1);
const attitude=new THREE.Quaternion(),screenTurn=new THREE.Quaternion(),euler=new THREE.Euler();
const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
// Tilt aiming: under TILT_DEAD of lean the view holds still; past it the
// view turns faster and faster, up to TILT_SPEED (radians per second at
// sensitivity 1) at TILT_FULL of lean.
const TILT_DEAD=3*Math.PI/180,TILT_FULL=25*Math.PI/180,TILT_SPEED=2.4;
const tiltRate=lean=>Math.sign(lean)*TILT_SPEED*Math.min(1,Math.max(0,Math.abs(lean)-TILT_DEAD)/(TILT_FULL-TILT_DEAD))**1.5;
// Pictograms, drawn in the button's text colour on a 24 × 24 grid.
const svg=body=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const SOLID='fill="currentColor" stroke="none"';
export const ICONS={
 fire:svg(`<path d="M12 2.5c-1.9 1.8-3 4.3-3 7V17h6V9.5c0-2.7-1.1-5.2-3-7z" ${SOLID}/><rect x="8.5" y="18.5" width="7" height="3" rx=".6" ${SOLID}/>`),
 aim:svg(`<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1.3" ${SOLID}/>`),
 jump:svg('<path d="M12 17V4M6.5 9.5 12 4l5.5 5.5M5 21h14"/>'),
 crouch:svg('<path d="M12 3v12M6.5 9.5 12 15l5.5-5.5M5 21h14"/>'),
 grenade:svg(`<circle cx="11" cy="15" r="6.5" ${SOLID}/><rect x="8.5" y="6" width="5" height="4" rx=".5" ${SOLID}/><path d="M13.5 6.5h1.8c1.7 0 2.9 1.5 2.9 4.3"/><circle cx="6.6" cy="5" r="2.1" stroke-width="1.7"/>`),
 reload:svg('<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6l2.5 2.5"/><path d="M20.5 3.5v5h-5"/>'),
 weapon:svg('<path d="M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4"/>'),
 scores:svg('<path d="M3 20h18M4.5 20v-6h5v6M9.5 20V8h5v12M14.5 20v-4h5v4"/>'),
 pause:svg(`<rect x="6" y="5" width="4" height="14" rx="1" ${SOLID}/><rect x="14" y="5" width="4" height="14" rx="1" ${SOLID}/>`),
};
// Id, pictogram, name.
const BUTTONS=[
 ['fire','fire',t('ui.touch.fire')],['aim','aim',t('ui.touch.aim')],['jump','jump',t('ui.touch.jump')],['crouch','crouch',t('ui.touch.crouch')],
 ['fire-left','fire',t('ui.touch.fireLeft')],['grenade','grenade',t('ui.touch.grenade')],
 ['reload','reload',t('ui.touch.reload')],['weapon','weapon',t('ui.touch.weapon')],
 ['scores','scores',t('ui.touch.scores')],['pause','pause',t('ui.touch.pause')],
];
const markup=()=>`<div class="touch-stick" data-part="stick" title="${t('ui.touch.stick')}"><i></i></div>${BUTTONS.map(([id,icon,title])=>`<button type="button" class="touch-button" data-touch="${id}" data-part="${id}" title="${title}" aria-label="${title}" tabindex="-1">${ICONS[icon]}${id==='weapon'?'<span></span>':''}${id==='grenade'?'<b></b>':''}</button>`).join('')}`;
// Custom layout (settings.touchLayout): for each part moved, its centre as
// fractions of the area inside the safe insets, and a size factor for the
// buttons. Parts left out keep their place from the style sheet.
export const LAYOUT_PARTS=['stick',...BUTTONS.map(([id])=>id)];
const SIZE_MIN=.6,SIZE_MAX=1.8;
const clamp=(value,low,high)=>Math.min(high,Math.max(low,value));
export function touchLayout(value){
 const layout={};if(!value||typeof value!=='object')return layout;
 for(const id of LAYOUT_PARTS){const p=value[id];if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y))layout[id]={x:clamp(p.x,0,1),y:clamp(p.y,0,1),k:id==='stick'||!Number.isFinite(p.k)?1:clamp(p.k,SIZE_MIN,SIZE_MAX)};}
 return layout;
}
function place(el,p){
 el.classList.toggle('placed',!!p);
 if(p){el.style.setProperty('--x',p.x);el.style.setProperty('--y',p.y);el.style.setProperty('--k',p.k);}
 else for(const name of ['--x','--y','--k'])el.style.removeProperty(name);
}
const arrange=(root,layout)=>{for(const el of root.querySelectorAll('[data-part]'))place(el,layout[el.dataset.part]);};
// Buttons under the right thumb steer the view while held.
const STEERING=new Set(['fire','fire-left','aim','jump','crouch']);

export function touchDevice(){
 try{return matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0&&!matchMedia('(pointer: fine)').matches;}catch{return false;}
}

export class TouchControls {
 constructor(game){
  this.game=game;this.enabled=false;this.horizon=0;this.move={x:0,y:0};this.sprint=false;this.jump=false;this.stick=null;this.looks=new Map();this.shown={};this.firing=0;
  const root=this.root=document.createElement('div');root.id='touch-controls';root.setAttribute('aria-hidden','true');
  root.innerHTML=markup();arrange(root,touchLayout(game.settings.touchLayout));
  $('hud').appendChild(root);this.base=root.querySelector('.touch-stick');this.knob=this.base.firstElementChild;
  this.buttons=Object.fromEntries([...root.querySelectorAll('[data-touch]')].map(b=>[b.dataset.touch,b]));this.weaponName=this.buttons.weapon.querySelector('span');
  // The manual in the briefing shows the same pictograms.
  for(const el of document.querySelectorAll('[data-touch-icon]'))el.innerHTML=ICONS[el.dataset.touchIcon]||'';
  root.addEventListener('pointerdown',e=>this.down(e));
  for(const type of ['pointermove','pointerup','pointercancel'])addEventListener(type,e=>this[type==='pointermove'?'drag':'up'](e),{passive:false});
  // Block the page gestures Safari would start from a held or moving finger.
  for(const type of ['touchstart','touchmove','gesturestart','contextmenu'])root.addEventListener(type,e=>e.preventDefault(),{passive:false});
  if(touchDevice())this.enable();else addEventListener('touchstart',()=>this.enable(),{once:true,passive:true});
 }
 enable(){
  if(this.enabled)return;this.enabled=true;document.body.classList.add('touch');
  $('lock-help').textContent=t('ui.pause.touchHelp');
  // Leaving landscape mid-mission pauses it: the controls need the width.
  const check=()=>{if(innerHeight>innerWidth&&this.game.state==='active')this.game.pause();};addEventListener('resize',check);addEventListener('orientationchange',check);
  // iOS hands out the motion sensors only from a tap: any tap asks once.
  addEventListener('click',()=>this.motionAccess(),true);addEventListener('deviceorientation',e=>this.orient(e));
 }
 // Browsers only send the attitude of the device to HTTPS pages (and
 // localhost); the app always gets it. this.motion ends 'granted' or 'denied'.
 motionAccess(){
  if(this.motion||!isSecureContext||gyroMode(this.game.settings.gyro)==='off'&&this.game.settings.display!=='vr')return;
  const ask=globalThis.DeviceOrientationEvent?.requestPermission;if(!ask){this.motion='granted';return;}
  this.motion='asking';return ask.call(DeviceOrientationEvent).then(result=>{this.motion=result;},()=>{this.motion=null;});
 }
 // The view follows the attitude of the device as the screen of a VR
 // headset follows the head: it looks where the back of the device points
 // and its horizon stays level, whatever the screen orientation. The
 // browser fuses the sensors into alpha, beta and gamma (degrees): the
 // device's turn about the vertical, then about its portrait x axis (to
 // the right of the screen), then about its y axis (to its top). That
 // attitude becomes the yaw, pitch and roll of a camera looking out of
 // the back, and the view moves by their change since the last reading:
 // it is never behind the device, however late the readings arrive, and
 // dragging still turns it, so it can be recentred. Readings keep coming
 // while the view is not steered, so steering resumes without a jump.
 orient(e){
  if(e.beta==null||e.gamma==null)return;
  const d=Math.PI/180,turn=(globalThis.orientation??screen.orientation?.angle??0)*d;
  euler.set(e.beta*d,(e.alpha||0)*d,-e.gamma*d,'YXZ');
  attitude.setFromEuler(euler).multiply(BACK).multiply(screenTurn.setFromAxisAngle(Z,-turn));
  euler.setFromQuaternion(attitude,'YXZ');
  const last=this.attitude;this.attitude={pitch:euler.x,yaw:euler.y,roll:euler.z};
  if(!last||!this.steering)return;
  // In a headset the pitch is the head's own, measured from gravity, less
  // the horizon set by recentre(): recoil, respawns and the room can never
  // leave the view looking at the sky while the head is level.
  const pitch=this.game.stereo?euler.x-this.horizon-this.game.pitch:euler.x-last.pitch;
  this.game.rotate(wrap(euler.y-last.yaw),pitch);
 }
 // The head's current pitch becomes the level view: for a headset that
 // holds the phone tilted, or a head held a little high or low.
 recentre(){if(this.attitude)this.horizon=this.attitude.pitch;}
 // Whether the device steers the view right now. In a headset it always
 // does, a controller in hand or not. Tilt aiming never does: there the
 // device leans to turn the view, which stays level.
 get steering(){if(this.game.stereo)return true;const mode=gyroMode(this.game.settings.gyro);return this.ready&&(mode==='always'||mode==='aim'&&!!this.game.aim);}
 // Tilt aiming, every frame: the lean is measured from gravity alone, the
 // pitch of the back of the device and its roll as a steering wheel, so no
 // drift of the compass and no turn of the player on their chair moves the
 // neutral position. Rolling turns the view left or right, tipping lifts or
 // lowers it, slower in the sights as with a stick.
 tilt(dt){
  const neutral=this.game.settings.gyroNeutral;
  if(!this.attitude||!neutral||this.game.stereo||gyroMode(this.game.settings.gyro)!=='tilt'||!this.ready)return;
  const s=this.game.aimSlowdown()*dt;
  this.game.rotate(tiltRate(wrap(this.attitude.roll-neutral.roll))*s,tiltRate(this.attitude.pitch-neutral.pitch)*s);
 }
 // The device's current lean, as the neutral position of tilt aiming.
 neutral(){return this.attitude&&{pitch:this.attitude.pitch,roll:this.attitude.roll};}
 // The roll of the device while it steers the view, or null.
 viewRoll(){return this.attitude&&this.steering?this.attitude.roll:null;}
 get ready(){const g=this.game;return this.enabled&&!g.gamepad?.active&&g.state==='active'&&!!g.player?.alive;}
 // Full screen hides the browser bars where it exists (Android, iPad);
 // on iPhone the page added to the home screen plays without them. The iOS
 // app already fills the screen: there iOS would add its own banner and close
 // button over the game.
 fullscreen(){
  const el=document.documentElement,request=el.requestFullscreen||el.webkitRequestFullscreen;
  if(Capacitor.isNativePlatform()||document.fullscreenElement||document.webkitFullscreenElement||!request)return;
  try{const result=request.call(el,{navigationUI:'hide'});result?.catch?.(()=>{});}catch{}
 }
 down(e){
  if(e.pointerType==='mouse'||!this.enabled)return;e.preventDefault();
  const button=e.target.closest('[data-touch]'),action=button?.dataset.touch;
  if(action==='pause'){this.game.pause();return;}
  if(action==='scores'){this.track(e,{kind:'scores',button});this.root.classList.add('scores');this.game.showScoreboard(true);return;}
  if(!this.ready)return;
  const g=this.game;
  // In a headset only the viewer's button reaches the screen: any touch
  // fires, for as long as it lasts.
  if(g.stereo){this.track(e,{kind:'trigger',fire:true});if(this.firing++===0)g.trigger(true);return;}
  if(!action){
   // Left part of the screen: movement stick. Anywhere else: look.
   if(!this.stick&&e.clientX<this.stickZone()){this.startStick(e);return;}
   this.track(e,{kind:'look',x:e.clientX,y:e.clientY});return;
  }
  if(STEERING.has(action)){
   const touch={kind:'look',button,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};this.track(e,touch);
   if(action==='fire'||action==='fire-left'){touch.fire=true;if(this.firing++===0)g.trigger(true);}
   if(action==='aim')g.aim=!g.aim;
   // Jumping cannot wait for the release; crouching can, so a thumb that
   // lands on it to aim does not crouch by accident.
   if(action==='jump'){touch.jump=true;this.jump=true;g.jumpQueued=true;g.crouchToggle=false;g.network?.inputChanged?.();}
   if(action==='crouch')touch.tap='crouch';
   return;
  }
  button.classList.add('pressed');setTimeout(()=>button.classList.remove('pressed'),120);
  if(action==='reload')g.reload();
  if(action==='grenade')g.throwGrenade();
  if(action==='weapon')g.cycleWeapon(1);
 }
 // The left part of the screen, widened to reach a stick moved further right.
 stickZone(){
  const zone=innerWidth*.42,rest=this.game.settings.touchLayout?.stick;if(!rest)return zone;
  const box=this.root.getBoundingClientRect();return Math.max(zone,box.left+rest.x*box.width+STICK_RADIUS*FIXED_REACH);
 }
 startStick(e){
  const mode=stickMode(this.game.settings.stickMode),rest=this.base.getBoundingClientRect(),cx=rest.left+rest.width/2,cy=rest.top+rest.height/2,near=Math.hypot(e.clientX-cx,e.clientY-cy);
  if(mode==='fixed'&&near>STICK_RADIUS*FIXED_REACH)return;
  // Anchored: the ring stays at rest and the thumb's offset from it counts
  // at once. Otherwise the ring is centred under the thumb.
  const anchored=mode==='fixed'||mode==='semi'&&near<=STICK_RADIUS*SEMI_REACH;
  this.stick=anchored?{id:e.pointerId,x:cx,y:cy}:{id:e.pointerId,x:e.clientX,y:e.clientY};
  // The controls sit inside the safe area (notch, home indicator).
  if(!anchored){const box=this.root.getBoundingClientRect();this.base.style.left=e.clientX-box.left+'px';this.base.style.top=e.clientY-box.top+'px';}
  this.base.classList.add('held');this.track(e,{kind:'stick'});if(anchored)this.steer(e.clientX-cx,e.clientY-cy);
 }
 track(e,touch){this.looks.set(e.pointerId,touch);touch.button?.classList.add('pressed');}
 drag(e){
  const touch=this.looks.get(e.pointerId);if(!touch)return;e.preventDefault();
  if(touch.kind==='stick'){
   // Sliding the movement thumb onto the left trigger hands it over: the
   // stick lets go and that finger now fires and aims, as if pressed there.
   if(this.ready&&this.over('fire-left',e)){this.releaseStick();const button=this.buttons['fire-left'];this.track(e,{kind:'look',fire:true,button,x:e.clientX,y:e.clientY});if(this.firing++===0)this.game.trigger(true);return;}
   this.steer(e.clientX-this.stick.x,e.clientY-this.stick.y);return;
  }
  if(touch.kind!=='look')return;
  if(touch.tap&&Math.hypot(e.clientX-touch.startX,e.clientY-touch.startY)>TAP_SLOP)touch.tap=null;
  const dx=e.clientX-touch.x,dy=e.clientY-touch.y;touch.x=e.clientX;touch.y=e.clientY;
  if(this.ready)this.game.turn(dx*LOOK_SCALE,dy*LOOK_SCALE,true);
 }
 // The stick is analog, as the room accepts; pushing it well past its ring
 // while moving forward sprints.
 steer(dx,dy){
  const length=Math.hypot(dx,dy),reach=Math.min(1,length/STICK_RADIUS),angle=Math.atan2(dy,dx),x=Math.cos(angle)*reach,y=-Math.sin(angle)*reach,active=reach>DEAD_ZONE;
  const before=[Math.sign(this.move.x),Math.sign(this.move.y),this.sprint].join();
  this.move.x=active?x:0;this.move.y=active?y:0;this.sprint=active&&length>STICK_RADIUS*SPRINT_PUSH&&y>.7;
  this.knob.style.transform=`translate(${x*STICK_RADIUS}px,${-y*STICK_RADIUS}px)`;this.base.classList.toggle('sprint',this.sprint);
  if(before!==[Math.sign(this.move.x),Math.sign(this.move.y),this.sprint].join())this.game.network?.inputChanged?.();
 }
 // Whether a finger is inside a round button.
 over(id,e){const b=this.buttons[id].getBoundingClientRect();return b.width>0&&Math.hypot(e.clientX-(b.left+b.width/2),e.clientY-(b.top+b.height/2))<b.width/2;}
 releaseStick(){this.stick=null;this.base.classList.remove('held','sprint');this.base.style.left=this.base.style.top='';this.knob.style.transform='';this.move.x=this.move.y=0;this.sprint=false;this.game.network?.inputChanged?.();}
 up(e){
  const touch=this.looks.get(e.pointerId);if(!touch)return;this.looks.delete(e.pointerId);touch.button?.classList.remove('pressed');
  if(touch.kind==='stick')this.releaseStick();
  if(touch.jump){this.jump=false;this.game.network?.inputChanged?.();}
  if(touch.kind==='scores'){this.root.classList.remove('scores');this.game.showScoreboard(false);}
  if(touch.tap==='crouch'&&e.type==='pointerup'&&this.ready)this.game.crouchToggle=!this.game.crouchToggle;
  // Both triggers can be held at once; firing stops with the last one.
  if(touch.fire&&--this.firing===0)this.game.trigger(false);
 }
 // Drops every held finger: pause, death and the end of a round.
 reset(){
  for(const touch of this.looks.values())touch.button?.classList.remove('pressed');this.root.classList.remove('scores');
  this.looks.clear();this.stick=null;this.move.x=this.move.y=0;this.sprint=false;this.jump=false;this.firing=0;
  this.base.classList.remove('held','sprint');this.base.style.left=this.base.style.top='';this.knob.style.transform='';
 }
 // Button states follow the game, which can drop aim or crouch on its own.
 update(){
  if(!this.enabled||!this.game.player)return;const g=this.game,show=(key,value,apply)=>{if(this.shown[key]!==value){this.shown[key]=value;apply(value);}};
  show('aim',!!g.aim,v=>this.buttons.aim.classList.toggle('on',v));
  show('crouch',!!g.crouchToggle,v=>this.buttons.crouch.classList.toggle('on',v));
  show('grenades',g.grenadeCount,v=>{this.buttons.grenade.querySelector('b').textContent=v;this.buttons.grenade.classList.toggle('empty',!v);});
  show('weapon',g.weapon?.short,v=>{this.weaponName.textContent=v;});
 }
 // The layout editor, over everything else: each button and the stick's
 // resting place are dragged where the thumbs want them, the selected button
 // resized. Saving applies the layout and calls onSave; until then the
 // controls in play keep the old one.
 editLayout(onSave){
  if(this.editor)return;const opener=document.activeElement;
  const el=this.editor=document.createElement('div');el.id='touch-editor';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-labelledby','touch-editor-title');
  el.innerHTML=`<div class="touch-editor-panel"><h3 id="touch-editor-title">${t('ui.touch.layoutTitle')}</h3><p id="touch-editor-hint"></p><label>${t('ui.touch.size')} <input type="range" min="${SIZE_MIN}" max="${SIZE_MAX}" step="0.05" value="1" disabled><output>${t('ui.settings.percent',{n:100})}</output></label><div><button type="button" data-editor="reset">${t('ui.touch.reset')}</button><button type="button" data-editor="cancel">${t('ui.touch.cancel')}</button><button type="button" data-editor="save" class="primary">${t('ui.touch.save')}</button></div></div><div class="touch-editor-area">${markup()}</div><p class="touch-editor-rotate">${t('ui.touch.rotate')}</p>`;
  document.body.appendChild(el);
  const area=el.querySelector('.touch-editor-area'),size=el.querySelector('input'),output=el.querySelector('output'),hint=el.querySelector('#touch-editor-hint'),part=id=>area.querySelector(`[data-part="${id}"]`);
  let layout=touchLayout(this.game.settings.touchLayout),selected=null,drag=null;
  arrange(area,layout);area.querySelector('[data-part=weapon] span').textContent=this.game.weapon?.short||t('ui.touch.weaponShort');area.querySelector('[data-part=grenade] b').textContent=this.game.grenadeCount??2;
  // A part's entry, created at the place the style sheet gives it.
  const pin=id=>{if(layout[id])return layout[id];const a=area.getBoundingClientRect(),b=part(id).getBoundingClientRect();return layout[id]={x:(b.left+b.width/2-a.left)/a.width,y:(b.top+b.height/2-a.top)/a.height,k:1};};
  const select=id=>{
   selected=id;for(const p of area.querySelectorAll('[data-part]'))p.classList.toggle('selected',p.dataset.part===id);
   const k=layout[id]?.k??1;size.disabled=!id||id==='stick';size.value=k;output.textContent=t('ui.settings.percent',{n:Math.round(k*100)});
   hint.textContent=!id?t('ui.touch.hintNone'):id==='stick'?t('ui.touch.hintStick'):t('ui.touch.hintButton',{button:part(id).title});
  };
  select(null);
  area.addEventListener('pointerdown',e=>{
   const target=e.target.closest('[data-part]');if(!target)return;e.preventDefault();
   const b=target.getBoundingClientRect();select(target.dataset.part);drag={pointer:e.pointerId,id:target.dataset.part,dx:e.clientX-(b.left+b.width/2),dy:e.clientY-(b.top+b.height/2)};el.classList.add('dragging');
  });
  el.addEventListener('pointermove',e=>{
   if(drag?.pointer!==e.pointerId)return;e.preventDefault();
   const target=part(drag.id),p=pin(drag.id),a=area.getBoundingClientRect(),b=target.getBoundingClientRect(),w=b.width/2/a.width,h=b.height/2/a.height;
   p.x=clamp((e.clientX-drag.dx-a.left)/a.width,w,1-w);p.y=clamp((e.clientY-drag.dy-a.top)/a.height,h,1-h);place(target,p);
  });
  const end=e=>{if(drag?.pointer===e.pointerId){drag=null;el.classList.remove('dragging');}};
  el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
  for(const type of ['touchstart','touchmove','gesturestart','contextmenu'])area.addEventListener(type,e=>e.preventDefault(),{passive:false});
  size.addEventListener('input',()=>{if(!selected||selected==='stick')return;const p=pin(selected);p.k=Number(size.value);output.textContent=t('ui.settings.percent',{n:Math.round(p.k*100)});place(part(selected),p);});
  const close=()=>{removeEventListener('keydown',key,true);el.remove();this.editor=null;opener?.focus?.();};
  const key=e=>{if(e.code!=='Escape')return;e.preventDefault();e.stopImmediatePropagation();close();};addEventListener('keydown',key,true);
  el.querySelector('.touch-editor-panel').addEventListener('click',e=>{
   const action=e.target.closest('[data-editor]')?.dataset.editor;
   if(action==='reset'){layout={};arrange(area,layout);select(null);}
   if(action==='cancel')close();
   if(action==='save'){this.game.settings.touchLayout=layout;arrange(this.root,layout);onSave?.(layout);close();}
  });
  el.querySelector('[data-editor=save]').focus();
 }
}
