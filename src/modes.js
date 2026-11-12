// Game modes and their adjustable rules. The lobby, the local simulation and
// the dedicated server all normalize settings through this table, so a room
// never runs with a value the interface could not have offered.
import {t} from './i18n.js';

// Labels and descriptions come from the catalogs (data.mode.<id>.*).
const text=id=>({label:t(`data.mode.${id}.label`),hud:t(`data.mode.${id}.hud`),summary:t(`data.mode.${id}.summary`),description:t(`data.mode.${id}.description`)});
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
// [default, min, max, step] per adjustable field.
export const MODES=Object.freeze({
 assault:Object.freeze({...text('assault'),coop:true,fields:{duration:[300,120,1200,60],blue:[1,1,8,1],red:[6,2,12,1]}}),
 survival:Object.freeze({...text('survival'),coop:true,fields:{score:[5,3,10,1],blue:[1,1,8,1],red:[4,2,10,1]}}),
 tdm:Object.freeze({...text('tdm'),coop:false,fields:{duration:[480,180,1200,60],score:[40,10,100,5],blue:[4,1,8,1],red:[4,1,8,1]}}),
 ctf:Object.freeze({...text('ctf'),coop:false,fields:{duration:[600,300,1200,60],score:[3,1,10,1],blue:[4,1,8,1],red:[4,1,8,1]}}),
 ffa:Object.freeze({...text('ffa'),coop:false,fields:{duration:[480,180,1200,60],score:[25,5,60,5],players:[8,2,12,1]}})
});
export const MODE_IDS=Object.keys(MODES);
export const validMode=value=>typeof value==='string'&&Object.hasOwn(MODES,value);
export const modeId=value=>validMode(value)?value:'tdm';
export const modeConfig=value=>MODES[modeId(value)];
export function normalizeRules(mode,input={}){
 const id=modeId(mode),rules={mode:id};
 for(const [key,[value,min,max,step]]of Object.entries(MODES[id].fields)){const n=Number(input?.[key]);rules[key]=Number.isFinite(n)?clamp(Math.round((n-min)/step)*step+min,min,max):value;}
 return rules;
}
export const defaultRules=mode=>normalizeRules(mode);
export function ruleLabel(mode,key){
 const coop=MODES[modeId(mode)].coop;
 const id={duration:'duration',score:mode==='survival'?'score.survival':mode==='ctf'?'score.ctf':'score.default',blue:coop?'blue.coop':'blue.team',red:coop?(mode==='survival'?'red.survival':'red.coop'):'red.team',players:'players'}[key];
 return id&&t(`data.rule.${id}`);
}
export function ruleValue(mode,key,value){
 const n=value;
 if(key==='duration')return t('data.rule.value.minutes',{n:Math.round(value/60)});
 if(key==='score')return t(mode==='survival'?'data.rule.value.waves':mode==='ctf'?'data.rule.value.captures':'data.rule.value.kills',{n});
 if(key==='blue')return MODES[modeId(mode)].coop?(value===1?t('data.rule.value.alone'):t('data.rule.value.operators',{n})):t('data.rule.value.players',{n});
 if(key==='red')return t(MODES[modeId(mode)].coop?'data.rule.value.enemies':'data.rule.value.players',{n});
 return t('data.rule.value.players',{n});
}
// One line for the deploy button and the HUD, e.g. "1 VS 5 · 40 KILLS · 8 MIN".
export function rulesSummary(rules){
 const r=normalizeRules(rules?.mode,rules),parts=[];
 if(r.mode==='ffa')parts.push(t('data.rule.summary.combatants',{n:r.players}));else parts.push(t(!MODES[r.mode].coop?'data.rule.summary.teams':r.blue===1?'data.rule.summary.alone':'data.rule.summary.squad',{blue:r.blue,red:r.red}));
 if(r.score)parts.push(ruleValue(r.mode,'score',r.score));if(r.duration)parts.push(ruleValue(r.mode,'duration',r.duration));
 return parts.join(' · ');
}
