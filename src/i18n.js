// Interface language. English is the base: every key exists in the English
// catalog, and a key missing from another catalog falls back to English.
// The language comes from the player's choice (settings), else from the
// device's preferred languages, else English. Outside a page (server, tests)
// it is always English, so output does not depend on the machine's locale.
// Changing the language reloads the page: every string is built again.
import en from './locales/en/index.js';
import fr from './locales/fr/index.js';
import es from './locales/es/index.js';
import pt from './locales/pt/index.js';
import de from './locales/de/index.js';
import ja from './locales/ja/index.js';

export const LANGUAGES=[
 {id:'en',name:'English'},
 {id:'fr',name:'Français'},
 {id:'es',name:'Español'},
 {id:'pt',name:'Português (Brasil)'},
 {id:'de',name:'Deutsch'},
 {id:'ja',name:'日本語'},
];
const CATALOGS={en,fr,es,pt,de,ja};
const STORE='fw-lang';

const storedChoice=()=>{try{return globalThis.localStorage?.getItem(STORE)??null;}catch{return null;}};

export function detectLanguage(){
 if(typeof document==='undefined')return 'en';
 const chosen=storedChoice();if(CATALOGS[chosen])return chosen;
 const nav=globalThis.navigator,tags=nav?.languages?.length?nav.languages:[nav?.language];
 for(const tag of tags){const id=String(tag||'').toLowerCase().split(/[-_]/)[0];if(CATALOGS[id])return id;}
 return 'en';
}

export const lang=detectLanguage();
const catalog=CATALOGS[lang],plurals=new Intl.PluralRules(lang);

// The player's explicit choice; null follows the device again.
export function chosenLanguage(){const id=storedChoice();return CATALOGS[id]?id:null;}
export function setLanguage(id){try{if(CATALOGS[id])localStorage.setItem(STORE,id);else localStorage.removeItem(STORE);}catch{}}

export const hasKey=key=>typeof key==='string'&&key in en;

// t('hud.wave',{n:3}) → "WAVE 3". With a numeric `n`, a plural form
// key_one / key_other (Intl.PluralRules categories) wins over the plain key.
// Unknown keys come back unchanged, so a raw message (an older server's
// French text, for instance) still shows.
export function t(key,vars){
 let text;
 if(vars&&typeof vars.n==='number'){const form=`${key}_${plurals.select(vars.n)}`;text=catalog[form]??en[form]??catalog[`${key}_other`]??en[`${key}_other`];}
 text??=catalog[key]??en[key];
 if(text===undefined)return String(key);
 return vars?text.replace(/\{(\w+)\}/g,(match,name)=>name in vars?String(vars[name]):match):text;
}

// Static markup: data-i18n="key" sets the element's content (catalog strings
// are ours and may hold <br>, <em>, <b>); data-i18n-attr="aria-label:key;
// placeholder:key" sets attributes.
export function translatePage(root=document){
 if(root===document)document.documentElement.lang=lang;
 for(const el of root.querySelectorAll('[data-i18n]'))el.innerHTML=t(el.dataset.i18n);
 for(const el of root.querySelectorAll('[data-i18n-attr]'))for(const pair of el.dataset.i18nAttr.split(';')){const [name,key]=pair.split(':').map(s=>s.trim());if(name&&key)el.setAttribute(name,t(key));}
}
