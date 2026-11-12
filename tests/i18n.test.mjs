import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGES,t,lang} from '../src/i18n.js';

const GROUPS=['ui','game','data'];
const load=async id=>Object.fromEntries(await Promise.all(GROUPS.map(async g=>[g,(await import(`../src/locales/${id}/${g}.js`)).default])));
const placeholders=text=>[...text.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort().join();
// <br> may move or repeat where a language breaks its lines; other tags must match.
const tags=text=>[...text.matchAll(/<\/?([a-z]+)/gi)].map(m=>m[1].toLowerCase()).filter(name=>name!=='br').join();

test('outside a page the language is English and keys resolve',()=>{
 assert.equal(lang,'en');
 assert.equal(t('missing.key'),'missing.key');
 assert.equal(t('data.error.serverFull'),t('data.error.serverFull',{}));
});
test('every catalog has the English keys, placeholders and markup',async()=>{
 const en=await load('en');
 for(const {id} of LANGUAGES.filter(l=>l.id!=='en')){
  const other=await load(id);
  for(const g of GROUPS){
   const base=en[g],cat=other[g];
   const missing=Object.keys(base).filter(k=>!(k in cat)),extra=Object.keys(cat).filter(k=>!(k in base));
   assert.deepEqual([missing,extra],[[],[]],`${id}/${g}.js keys`);
   for(const key of Object.keys(base)){
    assert.equal(typeof cat[key],'string',`${id} ${key}`);assert.ok(cat[key].trim(),`${id} ${key} is empty`);
    assert.equal(placeholders(cat[key]),placeholders(base[key]),`${id} ${key} placeholders`);
    assert.equal(tags(cat[key]),tags(base[key]),`${id} ${key} markup`);
   }
  }
 }
});
test('keys stay in their file namespace',async()=>{
 const en=await load('en');
 for(const g of GROUPS)for(const key of Object.keys(en[g]))assert.ok(key.startsWith(`${g}.`),`${key} in ${g}.js`);
});
