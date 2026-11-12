// Game controllers through the browser Gamepad API, on desktop as on phones
// and tablets. Buttons follow the standard mapping (Xbox layout); a
// PlayStation controller gets its own symbols in the hints. In menus the
// d-pad moves the focus, A confirms and B goes back.
import {t} from './i18n.js';
const $=id=>document.getElementById(id);
const B={a:0,b:1,x:2,y:3,lb:4,rb:5,lt:6,rt:7,back:8,start:9,ls:10,rs:11,up:12,down:13,left:14,right:15};
const DEAD_ZONE=.16;
// The room refuses shots for a quarter second after a weapon change.
const DRAW_DELAY=.3;
// Full deflection turns this many radians per second at sensitivity 1;
// the vertical axis is slower, as on console shooters.
const LOOK_RATE=2.9,PITCH_SHARE=.62,MOUSE_COUNT=.0018;
const STICKS={lstick:t('ui.pad.leftStick'),rstick:t('ui.pad.rightStick'),dpad:t('ui.pad.dpad'),left:`${t('ui.pad.dpad')} ←`,right:`${t('ui.pad.dpad')} →`};
const LABELS={
 xbox:{a:'A',b:'B',x:'X',y:'Y',lb:'LB',rb:'RB',lt:'LT',rt:'RT',back:'VIEW',start:'MENU',ls:'L3',rs:'R3',...STICKS},
 ps:{a:'✕',b:'○',x:'□',y:'△',lb:'L1',rb:'R1',lt:'L2',rt:'R2',back:'SHARE',start:'OPTIONS',ls:'L3',rs:'R3',...STICKS},
};
const FOCUSABLE='button:not(:disabled),select:not(:disabled),input:not(:disabled):not([type=hidden]),a[href]';
// Radial dead zone, rescaled so movement starts smoothly at its edge.
function stick(x=0,y=0){const m=Math.hypot(x,y);if(m<DEAD_ZONE)return [0,0];const s=Math.min(1,(m-DEAD_ZONE)/(1-DEAD_ZONE))/m;return [x*s,y*s];}
const visible=el=>el.getClientRects().length>0&&!el.closest('.hidden');

export class GamepadControls {
 constructor(game){
  this.game=game;this.connected=false;this.active=false;this.pad=null;this.prev=[];this.style='xbox';
  this.move={x:0,y:0};this.sprint=false;this.sprintLatch=false;this.jump=false;this.breath=false;this.fire=false;this.aimHeld=false;this.scores=false;this.repeat=0;this.direction=0;
  addEventListener('gamepadconnected',e=>this.connect(e.gamepad));
  addEventListener('gamepaddisconnected',()=>this.refresh());
  // Keyboard, mouse or touch take over again as soon as they are used.
  for(const type of ['keydown','pointerdown'])addEventListener(type,()=>this.setActive(false),true);
 }
 pads(){try{return [...(navigator.getGamepads?.()||[])].filter(p=>p&&p.connected!==false);}catch{return [];}}
 connect(pad){
  const was=this.connected;this.connected=true;document.body.classList.add('pad-connected');
  this.style=/054c|playstation|dualsense|dualshock|^wireless controller/i.test(pad?.id||'')?'ps':'xbox';this.labels();
  if(!was&&['active','paused'].includes(this.game.state))this.game.notify(t('ui.pad.connected'),t('ui.pad.pauseHint',{button:LABELS[this.style].start}),2);
 }
 refresh(){
  this.connected=this.pads().length>0;document.body.classList.toggle('pad-connected',this.connected);
  if(!this.connected){this.setActive(false);if(this.game.state==='active')this.game.pause();}
 }
 setActive(on){
  if(this.active===on)return;this.active=on;document.body.classList.toggle('gamepad',on);if(!on)this.release();this.labels();
  const touch=this.game.touch?.enabled;
  $('lock-help').textContent=on?t('ui.pause.padHelp',{start:LABELS[this.style].start,a:LABELS[this.style].a}):t(touch?'ui.pause.touchHelp':'ui.pause.lockHelp');
 }
 // Lets go of everything held, without sending anything: pause, death,
 // end of round or another device taking over.
 release(){
  const g=this.game;if(this.fire)g.mouseDown=false;if(this.aimHeld)g.aim=false;if(this.scores)g.showScoreboard(false);
  this.fire=this.aimHeld=this.scores=this.sprint=this.sprintLatch=this.jump=this.breath=this.grenadeHeld=this.drawHeld=this.drawShot=this.drawing=false;this.move.x=this.move.y=0;
 }
 // Hints show controller buttons while it is in use; keyboard keys otherwise.
 labels(){
  const names=LABELS[this.style];
  for(const el of document.querySelectorAll('[data-pad]')){
   if(el.dataset.key===undefined&&el.closest('.hud-hints'))el.dataset.key=el.textContent;
   let pad=el.dataset.pad.split(' ').map(k=>names[k]).join(' / ');if(el.dataset.template)pad=t(el.dataset.template,{key:pad});
   el.textContent=el.dataset.key===undefined||this.active?pad:el.dataset.key;
  }
 }
 rumble(strong,weak,duration){
  if(!this.active)return;
  try{this.pad?.vibrationActuator?.playEffect?.('dual-rumble',{duration,strongMagnitude:strong,weakMagnitude:weak})?.catch?.(()=>{});}catch{}
 }
 update(dt){
  const pads=this.pads();if(!pads.length){if(this.connected)this.refresh();return;}
  // The controller used last drives the game when several are plugged in.
  const pad=pads.reduce((a,b)=>(b.timestamp||0)>(a.timestamp||0)?b:a);if(!this.connected||pad.id!==this.pad?.id)this.connect(pad);this.pad=pad;
  // Without the standard mapping a Sony controller reports its raw order
  // (□ ✕ ○ △, right stick on axes 2 and 5): put □ on reload and △ on the
  // weapon change like everywhere else.
  const raw=pad.mapping!=='standard'&&this.style==='ps',b=pad.buttons;
  const buttons=raw?[b[1],b[2],b[0],b[3],...b.slice(4)]:b,lookY=raw&&pad.axes.length>5?pad.axes[5]:pad.axes[3];
  const now=buttons.map(b=>!!b&&(b.pressed||b.value>.5)),prev=this.prev,down=i=>now[i]&&!prev[i];this.prev=now;
  const [lx,ly]=stick(pad.axes[0],pad.axes[1]),[rx,ry]=stick(pad.axes[2],lookY),value=i=>buttons[i]?.value??0;
  // A drifting stick must not steal the game from the keyboard: a press or a
  // clear push is needed. That first press also acts.
  if(!this.active&&(now.some((p,i)=>down(i))||Math.hypot(lx,ly)>.5||Math.hypot(rx,ry)>.5))this.setActive(true);
  if(!this.active)return;
  if(this.game.state==='active')this.play(dt,down,now,value,lx,ly,rx,ry);else this.menu(dt,down,now,lx,ly);
 }
 play(dt,down,now,value,lx,ly,rx,ry){
  const g=this.game;
  if(down(B.start)){g.pause();return;}
  if(now[B.back]!==this.scores){this.scores=now[B.back];g.showScoreboard(this.scores);}
  // While down, Y and the d-pad pick the main weapon of the next life.
  if(!g.player?.alive){if(this.fire||this.aimHeld||this.move.x||this.move.y)this.release();if(down(B.y)||down(B.right))g.cycleWeapon(1);if(down(B.left))g.cycleWeapon(-1);return;}
  const before=[Math.sign(this.move.x),Math.sign(this.move.y),this.sprint,this.jump].join();
  this.move.x=lx;this.move.y=-ly;
  // L3 starts a sprint that lasts while the stick stays forward; in a scope
  // it holds the breath instead, like Shift on the keyboard.
  if(down(B.ls)&&!g.aim)this.sprintLatch=true;
  if(this.move.y<.3||g.aim||this.fire)this.sprintLatch=false;
  this.sprint=this.sprintLatch;this.breath=now[B.ls]&&g.aim;
  this.jump=now[B.a];if(down(B.a)){g.jumpQueued=true;g.crouchToggle=false;}
  if(down(B.b))g.crouchToggle=!g.crouchToggle;
  // R3 in a headset: the head's current pitch becomes the level view.
  if(down(B.rs)&&g.stereo)g.touch.recentre();
  if(down(B.x))g.reload();
  if(down(B.y)||down(B.right))g.cycleWeapon(1);
  if(down(B.left))g.cycleWeapon(-1);
  // LB aims while held. Triggers are analog: hysteresis keeps a resting
  // finger from flickering. LT throws a grenade. Same mapping in a headset.
  const aim=now[B.lb];
  if(aim!==this.aimHeld){this.aimHeld=aim;g.aim=aim;}
  const grenade=value(B.lt)>(this.grenadeHeld?.3:.55);if(grenade&&!this.grenadeHeld)g.throwGrenade();this.grenadeHeld=grenade;
  // RT draws the sidearm and fires it: a quick press still gets its shot
  // once the sidearm is in hand and the room accepts it.
  const sidearm=g.loadout()[1],inHand=g.selected===sidearm&&g.pendingWeapon===undefined;
  if(inHand&&!this.sidearmInHand)this.drawDelay=this.drawing?DRAW_DELAY:0;
  this.sidearmInHand=inHand;this.drawDelay=Math.max(0,(this.drawDelay||0)-dt);
  const draw=value(B.rt)>(this.drawHeld?.3:.55);
  if(draw&&!this.drawHeld){if(!inHand){this.drawing=true;g.equip(sidearm);}this.drawShot=true;}
  this.drawHeld=draw;
  // RB fires the weapon in hand.
  const fire=now[B.rb]||inHand&&this.drawDelay<=0&&(this.drawHeld||this.drawShot);
  if(fire!==this.fire){this.fire=fire;g.trigger(fire);if(fire)this.drawShot=this.drawing=false;}
  if(rx||ry){const m=Math.hypot(rx,ry),curve=Math.pow(m,1.7)/m,rate=LOOK_RATE*dt/MOUSE_COUNT*curve;g.turn(rx*rate,ry*rate*PITCH_SHARE,true);}
  if(before!==[Math.sign(this.move.x),Math.sign(this.move.y),this.sprint,this.jump].join())g.network?.inputChanged?.();
 }
 // Menus: the topmost open layer receives the d-pad focus.
 layer(){
  const g=this.game;
  for(const id of ['settings','online-modal'])if(!$(id).classList.contains('hidden'))return $(id);
  return g.state==='paused'?$('pause'):g.state==='ended'?$('results'):$('lobby');
 }
 menu(dt,down,now,lx,ly){
  const g=this.game,layer=this.layer(),el=document.activeElement,inside=el&&layer.contains(el)&&el!==layer;
  const vertical=now[B.up]||ly<-.6?-1:now[B.down]||ly>.6?1:0,horizontal=now[B.left]||lx<-.6?-1:now[B.right]||lx>.6?1:0;
  const direction=vertical||horizontal?`${vertical},${horizontal}`:'';
  // Held directions repeat after a short delay, as on a keyboard.
  let step=false;if(direction!==this.direction){this.direction=direction;this.repeat=.38;step=!!direction;}else if(direction){this.repeat-=dt;if(this.repeat<=0){this.repeat=.12;step=true;}}
  if(step){
   const adjustable=inside&&(el.tagName==='SELECT'||el.type==='range');
   if(horizontal&&adjustable)this.adjust(el,horizontal);else this.focus(layer,vertical||horizontal);
  }
  if(down(B.a)){if(inside){if(el.tagName==='SELECT')this.adjust(el,1);else el.click();}else this.focus(layer,1);}
  if(down(B.b))this.back(layer);
  if(down(B.start)){
   if(g.state==='paused'&&layer===$('pause'))g.resume();
   else if(g.state==='ended')$('retry').click();
   else if(g.state==='lobby'&&layer===$('lobby'))$('deploy').click();
  }
 }
 focus(layer,step){
  const items=[...layer.querySelectorAll(FOCUSABLE)].filter(visible);if(!items.length)return;
  const index=items.indexOf(document.activeElement);
  // The lobby starts on the deploy button, the obvious first choice.
  const next=index<0?(layer.id==='lobby'&&visible($('deploy'))?$('deploy'):items[step>0?0:items.length-1]):items[(index+step+items.length)%items.length];
  next.focus();next.scrollIntoView?.({block:'nearest'});
 }
 adjust(el,step){
  if(el.tagName==='SELECT'){el.selectedIndex=(el.selectedIndex+step+el.options.length)%el.options.length;el.dispatchEvent(new Event('change',{bubbles:true}));return;}
  if(step>0)el.stepUp();else el.stepDown();el.dispatchEvent(new Event('input',{bubbles:true}));
 }
 back(layer){
  const g=this.game;
  if(layer.id==='settings')$('close-settings').click();
  else if(layer.id==='online-modal')$('online-close').click();
  else if(layer.id==='pause')g.resume();
  else if(layer.id==='results')$('return-lobby').click();
  else if(!visible($('deploy')))document.querySelector('.nav[data-view="play"]').click();
 }
}
