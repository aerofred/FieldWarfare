import {RELAYS,SPAWNS} from './rules.js';
import {TEAM_SPAWNS} from './deathmatch.js';
import {t} from './i18n.js';
// Names, descriptions and relay labels come from the catalogs (data.map.<id>.*).
const text=id=>({name:t(`data.map.${id}.name`),operation:t(`data.map.${id}.operation`),sector:t(`data.map.${id}.sector`),description:t(`data.map.${id}.description`)});
const relay=(id,x,z,name)=>({x,z,name,label:t(`data.map.${id}.relay.${name}`)});
const homesSpawns={blue:[{x:-12,z:28},{x:-6,z:27},{x:0,z:28},{x:6,z:27},{x:12,z:28},{x:-15,z:22},{x:15,z:22}],red:[{x:-12,z:-28},{x:-6,z:-27},{x:0,z:-28},{x:6,z:-27},{x:12,z:-28},{x:-15,z:-22},{x:15,z:-22}]};
const railSpawns={blue:[{x:-24,z:26},{x:-17,z:27},{x:-3,z:27},{x:4,z:27},{x:17,z:27},{x:25,z:25},{x:-1,z:23}],red:[{x:-25,z:-26},{x:-17,z:-27},{x:-3,z:-27},{x:4,z:-27},{x:17,z:-27},{x:26,z:-25},{x:1,z:-23}]};
const desertSpawns={blue:[{x:-24,z:27},{x:-16,z:26},{x:-8,z:27},{x:-3,z:28},{x:8,z:27},{x:16,z:26},{x:24,z:27}],red:[{x:-24,z:-27},{x:-16,z:-26},{x:-8,z:-27},{x:-3,z:-28},{x:10,z:-27},{x:16,z:-26},{x:24,z:-27}]};
const marketSpawns={blue:[{x:-26,z:27},{x:-16,z:26},{x:-10,z:27},{x:-3,z:28},{x:10,z:27},{x:16,z:26},{x:26,z:27}],red:[{x:-26,z:-27},{x:-16,z:-26},{x:-10,z:-27},{x:3,z:-28},{x:10,z:-27},{x:16,z:-26},{x:26,z:-27}]};
const harborSpawns={blue:[{x:-26,z:27},{x:-18,z:27},{x:-10,z:27},{x:-3,z:28},{x:6,z:27},{x:14,z:27},{x:24,z:27}],red:[{x:-26,z:-27},{x:-18,z:-26},{x:-8,z:-27},{x:-3,z:-28},{x:6,z:-27},{x:20,z:-27},{x:26,z:-24}]};
export const MAPS=Object.freeze({
 factory:{...text('factory'),sky:'#adb4a3',fog:'#a6af9a',sun:3.3,teamSpawns:TEAM_SPAWNS,soloSpawn:{x:-9,z:22},enemySpawns:SPAWNS,relays:RELAYS,flags:{blue:{x:0,z:26},red:{x:-3,z:-25}},patrol:[{x:-8,z:8},{x:12,z:-7},{x:-7,z:-23},{x:20,z:20},{x:-22,z:16},{x:0,z:23}],lobby:{x:29,y:8.5,z:31,lookX:-4,lookY:4,lookZ:-9}},
 gardens:{...text('gardens'),sky:'#b8d5da',fog:'#c4d7cf',sun:3.7,teamSpawns:homesSpawns,soloSpawn:{x:-12,z:26},enemySpawns:[...homesSpawns.red,{x:22,z:3},{x:-23,z:-4}],flags:{blue:{x:0,z:25},red:{x:0,z:-25}},relays:[relay('gardens',10,23,'A'),relay('gardens',5,-3,'B'),relay('gardens',10,-23,'C')],patrol:[{x:0,z:24},{x:0,z:14},{x:-12,z:0},{x:0,z:-14},{x:0,z:-24},{x:14,z:3}],lobby:{x:30,y:18,z:30,lookX:0,lookY:0,lookZ:0}},
 railway:{...text('railway'),sky:'#b6c5ce',fog:'#b3bfc1',sun:3.1,teamSpawns:railSpawns,soloSpawn:{x:-17,z:26},enemySpawns:[...railSpawns.red,{x:24,z:2},{x:-24,z:-4}],flags:{blue:{x:1,z:25},red:{x:-2,z:-25}},relays:[relay('railway',-22,4,'A'),relay('railway',0,0,'B'),relay('railway',24,-12,'C')],patrol:[{x:-23,z:4},{x:-2,z:20},{x:0,z:0},{x:24,z:-12},{x:0,z:-23},{x:23,z:13}],lobby:{x:31,y:16,z:31,lookX:-1,lookY:1,lookZ:-5}},
 desert:{...text('desert'),sky:'#e3d2b0',fog:'#e0cfa9',sun:4.2,teamSpawns:desertSpawns,soloSpawn:{x:-3,z:26},enemySpawns:[...desertSpawns.red,{x:24,z:-2},{x:-27,z:0}],flags:{blue:{x:0,z:25},red:{x:0,z:-25}},relays:[relay('desert',-4,6,'A'),relay('desert',14,-4,'B'),relay('desert',-17,-21,'C')],patrol:[{x:-4,z:6},{x:14,z:-4},{x:-17,z:-21},{x:0,z:-18},{x:18,z:20},{x:-22,z:16}],lobby:{x:30,y:17,z:30,lookX:0,lookY:1,lookZ:-3}},
 market:{...text('market'),sky:'#e7a978',fog:'#c99a86',sun:2.2,teamSpawns:marketSpawns,soloSpawn:{x:-3,z:26},enemySpawns:[...marketSpawns.red,{x:-27,z:0},{x:27,z:8}],flags:{blue:{x:-6,z:27},red:{x:6,z:-27}},relays:[relay('market',-26,14,'A'),relay('market',0,0,'B'),relay('market',0,-24,'C')],patrol:[{x:-26,z:14},{x:0,z:0},{x:0,z:-24},{x:26,z:-10},{x:-14,z:0},{x:14,z:0}],lobby:{x:28,y:20,z:29,lookX:0,lookY:2,lookZ:0}},
 harbor:{...text('harbor'),sky:'#b9c4cc',fog:'#c3cbd0',sun:2,teamSpawns:harborSpawns,soloSpawn:{x:-3,z:26},enemySpawns:[...harborSpawns.red,{x:27,z:0},{x:-28,z:2}],flags:{blue:{x:0,z:25},red:{x:0,z:-25}},relays:[relay('harbor',13,12,'A'),relay('harbor',2,-2,'B'),relay('harbor',-18,-15,'C')],patrol:[{x:13,z:12},{x:2,z:-2},{x:-18,z:-15},{x:-22,z:16},{x:26,z:-12},{x:-6,z:-16}],lobby:{x:-29,y:15,z:29,lookX:6,lookY:1,lookZ:-4}}
});
export const validMap=value=>typeof value==='string'&&Object.hasOwn(MAPS,value);
export const mapId=value=>validMap(value)?value:'factory';
export const mapConfig=value=>MAPS[mapId(value)];
