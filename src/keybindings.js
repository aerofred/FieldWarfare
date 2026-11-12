import {t} from './i18n.js';

// Keyboard bindings, chosen from the briefing and saved with the settings.
// Each action takes up to two keys, and a key serves one action only.
// Keys are physical positions (KeyboardEvent.code): the same place on any
// layout. Their names follow the layout when the browser reports it, or the
// character the key last typed.
export const ACTIONS=[
 {id:'forward',label:t('ui.action.forward'),keys:['KeyW','ArrowUp']},
 {id:'back',label:t('ui.action.back'),keys:['KeyS','ArrowDown']},
 {id:'left',label:t('ui.action.left'),keys:['KeyA']},
 {id:'right',label:t('ui.action.right'),keys:['KeyD']},
 {id:'turnLeft',label:t('ui.action.turnLeft'),keys:['ArrowLeft']},
 {id:'turnRight',label:t('ui.action.turnRight'),keys:['ArrowRight']},
 {id:'fire',label:t('ui.action.fire'),keys:['KeyX'],mouse:t('ui.action.leftClick')},
 {id:'aim',label:t('ui.action.aim'),keys:['KeyE'],mouse:t('ui.action.rightClick')},
 {id:'reload',label:t('ui.action.reload'),keys:['KeyR']},
 {id:'grenade',label:t('ui.action.grenade'),keys:['KeyG']},
 {id:'primary',label:t('ui.action.primary'),keys:['Digit1']},
 {id:'secondary',label:t('ui.action.secondary'),keys:['Digit2']},
 {id:'sprint',label:t('ui.action.sprint'),keys:['ShiftLeft']},
 {id:'crouch',label:t('ui.action.crouch'),keys:['KeyC']},
 {id:'jump',label:t('ui.action.jump'),keys:['Space']},
 {id:'scores',label:t('ui.action.scores'),keys:['Tab']},
];
// Escape pauses and frees the mouse; the system keys break key release.
export const RESERVED=new Set(['Escape','MetaLeft','MetaRight','OSLeft','OSRight','ContextMenu','CapsLock','Fn','FnLock']);
const valid=code=>typeof code==='string'&&/^[A-Za-z0-9]{1,24}$/.test(code)&&!RESERVED.has(code);

export function defaultBindings(){return Object.fromEntries(ACTIONS.map(a=>[a.id,[...a.keys]]));}
// Saved bindings, cleaned: unknown actions get their default keys, and a key
// claimed twice stays with the first action.
export function normalizeBindings(stored){
 const out={},used=new Set(),source=stored&&typeof stored==='object'?stored:{};
 for(const a of ACTIONS){const list=Array.isArray(source[a.id])?source[a.id]:a.keys;out[a.id]=[];for(const c of list)if(out[a.id].length<2&&valid(c)&&!used.has(c)){out[a.id].push(c);used.add(c);}}
 return out;
}
// Puts a key in one slot of an action, or empties the slot (code null). The
// key leaves any other action; returns that action's id, if any.
export function bind(bindings,action,slot,code){
 let previous=null;const list=[...(bindings[action]||[])];
 if(code){
  for(const a of ACTIONS)if(a.id!==action&&bindings[a.id]?.includes(code)){bindings[a.id]=bindings[a.id].filter(c=>c!==code);previous=a.id;}
  // Already on the other slot of this action: the two keys swap.
  const i=Math.min(slot,list.length),at=list.indexOf(code);if(at>=0&&at!==i)list[at]=list[i];list[i]=code;
 }else list.splice(slot,1);
 bindings[action]=list.filter(Boolean).slice(0,2);
 return previous;
}
export function actionMap(bindings){const map=new Map();for(const id in bindings)for(const code of bindings[id])map.set(code,id);return map;}

// Names of the special keys, in the interface language.
const NAMES=Object.fromEntries(['Space','ShiftLeft','ShiftRight','ControlLeft','ControlRight','Tab','Enter','NumpadEnter','Backspace','Delete','Insert','Home','End','PageUp','PageDown','NumpadDecimal','Escape'].map(code=>[code,t('ui.key.'+code)]));
Object.assign(NAMES,{ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',NumpadAdd:t('ui.key.numpad',{key:'+'}),NumpadSubtract:t('ui.key.numpad',{key:'−'}),NumpadMultiply:t('ui.key.numpad',{key:'×'}),NumpadDivide:t('ui.key.numpad',{key:'÷'})});
const mac=typeof navigator!=='undefined'&&/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent||'');
NAMES.AltLeft=t(mac?'ui.key.optionLeft':'ui.key.altLeft');NAMES.AltRight=t(mac?'ui.key.optionRight':'ui.key.altGr');
// Without a layout from the browser, a French locale suggests AZERTY.
const AZERTY={KeyQ:'A',KeyA:'Q',KeyW:'Z',KeyZ:'W',Semicolon:'M',KeyM:','};
const azerty=typeof navigator!=='undefined'&&/^fr(-(fr|be|lu|mc))?$/i.test(navigator.language||'');
const learned=new Map(),STORE='fw-key-names';
try{for(const [code,name] of Object.entries(JSON.parse(localStorage.getItem(STORE)||'{}')))if(valid(code)&&typeof name==='string'&&name.length<=3)learned.set(code,name);}catch{}
const remember=()=>{try{localStorage.setItem(STORE,JSON.stringify(Object.fromEntries(learned)));}catch{}};
const PRINTABLE=/^(Key[A-Z]|Semicolon|Comma|Period|Slash|Quote|BracketLeft|BracketRight|Backquote|Backslash|Minus|Equal|IntlBackslash|IntlRo|IntlYen)$/;
// The browser's layout map, where offered (Chromium, the desktop app).
export async function learnLayout(){
 try{const map=await navigator.keyboard?.getLayoutMap?.();if(!map)return false;let changed=false;map.forEach((key,code)=>{if(PRINTABLE.test(code)&&key&&learned.get(code)!==key.toUpperCase()){learned.set(code,key.toUpperCase());changed=true;}});if(changed)remember();return changed;}catch{return false;}
}
// The character a key types names it from then on (not with a modifier,
// which types another character).
export function learnKey(e){
 if(!PRINTABLE.test(e.code)||e.altKey||e.ctrlKey||e.metaKey||typeof e.key!=='string'||e.key.length!==1||e.key===' ')return false;
 const name=e.key.toUpperCase();if(learned.get(e.code)===name)return false;learned.set(e.code,name);remember();return true;
}
export function keyName(code){
 if(NAMES[code])return NAMES[code];
 let m=/^Digit(\d)$/.exec(code);if(m)return m[1];
 m=/^Numpad(\d)$/.exec(code);if(m)return t('ui.key.numpad',{key:m[1]});
 if(learned.has(code))return learned.get(code);
 if(azerty&&AZERTY[code])return AZERTY[code];
 m=/^Key([A-Z])$/.exec(code);if(m)return m[1];
 m=/^Numpad(.+)$/.exec(code);if(m)return t('ui.key.numpad',{key:m[1].toUpperCase()});
 return code.toUpperCase();
}
// Names of an action's keys: "E", "E OR F", or a dash when none is set.
export function bindingText(bindings,action,joiner=` ${t('ui.key.or')} `){const list=bindings[action]||[];return list.length?list.map(keyName).join(joiner):'—';}
