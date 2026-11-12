import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEATHMATCH,canDamage,awardTeamKill,deathmatchResult,chooseTeamSpawn} from '../src/deathmatch.js';
import {collides,distance} from '../src/rules.js';

test('friendly fire and spawn protection reject both direct fire and grenade damage',()=>{
 const ally={team:'blue',alive:true,protectedUntil:0},enemy={team:'red',alive:true,protectedUntil:5};
 assert.equal(canDamage(ally,ally,10),false);assert.equal(canDamage({team:'blue'},ally,10),false);
 assert.equal(canDamage(ally,enemy,4.9),false);assert.equal(canDamage(ally,enemy,5),true);
 enemy.alive=false;assert.equal(canDamage(ally,enemy,8),false);
});
test('only opposing-team kills increase the correct team score',()=>{
 const scores={blue:0,red:0},blue={team:'blue'},red={team:'red'};
 assert.equal(awardTeamKill(scores,blue,red),true);assert.equal(awardTeamKill(scores,red,blue),true);
 assert.equal(awardTeamKill(scores,blue,{team:'blue'}),false);assert.equal(awardTeamKill(scores,null,red),false);
 assert.deepEqual(scores,{blue:1,red:1});
});
test('deathmatch ends at forty points or on time, with either a winner or a draw',()=>{
 assert.equal(deathmatchResult({blue:39,red:20},1),null);assert.equal(deathmatchResult({blue:40,red:20},60),'blue');
 assert.equal(deathmatchResult({blue:30,red:40},60),'red');assert.equal(deathmatchResult({blue:19,red:20},0),'red');
 assert.equal(deathmatchResult({blue:21,red:20},0),'blue');assert.equal(deathmatchResult({blue:20,red:20},0),'draw');
 assert.equal(DEATHMATCH.respawn,4);
});
test('spawn selection avoids walls, nearby enemies and occupied team positions',()=>{
 const obstacles=[{minX:-10,maxX:-8,minZ:24,maxZ:26}];
 const actors=[{x:-5,z:27,team:'blue',alive:true},{x:26,z:24,team:'red',alive:true}];
 const spawn=chooseTeamSpawn('blue',actors,obstacles);
 assert.equal(collides(spawn.x,spawn.z,.45,obstacles),false);assert.ok(actors.every(a=>distance(a,spawn)>3));assert.ok(distance(spawn,actors[1])>20);
});
test('safe covered spawns take priority over exposed spawns',()=>{
 const actors=[{x:0,z:15,team:'red',alive:true}];
 const spawn=chooseTeamSpawn('blue',actors,[],p=>p.x>-20);
 assert.ok(spawn.x<=-20);
});
