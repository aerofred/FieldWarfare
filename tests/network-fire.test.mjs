import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/game.js';
import {NetworkSession} from '../src/network.js';
import {MultiplayerRoom} from '../server/room.js';
import {WEAPONS} from '../src/rules.js';

for(const weapon of WEAPONS)test(`${weapon.id}: a click shorter than a network tick fires once with the current aim`,()=>{
 // A sidearm is chosen on joining and drawn after a main weapon.
 const room=new MultiplayerRoom({fillBots:false,random:()=>.5}),alice=room.add({name:'Alice',weapon:weapon.sidearm?0:WEAPONS.indexOf(weapon),sidearm:weapon.sidearm?WEAPONS.indexOf(weapon):undefined}),bob=room.add({name:'Bob'});
 if(weapon.sidearm)room.action(alice.id,{action:'weapon',weapon:WEAPONS.indexOf(weapon)});assert.equal(alice.weapon,WEAPONS.indexOf(weapon));
 Object.assign(alice,{x:-8,z:8,yaw:Math.PI,pitch:0,cooldown:0,protectedUntil:0});Object.assign(bob,{x:-8,z:3,protectedUntil:0});
 const game={state:'active',player:{alive:true},keys:new Set(),weapon,yaw:0,pitch:-Math.atan2(.57,5),mouseDown:true,aim:true,cooldown:1,reloadTime:0};
 const session=new NetworkSession(game,{name:'Alice',address:'http://localhost'});game.network=session;session.phase='active';
 session.send=m=>{if(m.type==='input')room.input(alice.id,m);if(m.type==='action')room.action(alice.id,m);};
 // No update/tick between mouse-down and mouse-up, as with a quick click.
 Game.prototype.fire.call(game,true);game.mouseDown=false;session.releaseFire();
 assert.equal(alice.shots,1);assert.equal(alice.ammunition[alice.weapon].ammo,weapon.capacity-1);assert.ok(bob.health<100,'the shot uses the latest mouse orientation');
 for(let i=0;i<30;i++)Game.prototype.fire.call(game);assert.equal(alice.shots,1,'render frames do not send duplicate trigger actions');
 room.tick(1/30);assert.equal(alice.shots,1,'release before the next tick prevents extra automatic shots');
});

test('held automatic fire continues on server ticks and stops on release',()=>{
 const room=new MultiplayerRoom({fillBots:false}),a=room.add({name:'A'});room.add({name:'B'});a.cooldown=0;
 room.input(a.id,{seq:1,forward:0,strafe:0,yaw:0,pitch:0,fire:true});room.action(a.id,{action:'fire'});
 for(let i=0;i<8;i++)room.tick(1/30);assert.ok(a.shots>=3);const shots=a.shots;
 room.input(a.id,{seq:2,forward:0,strafe:0,yaw:0,pitch:0,fire:false});for(let i=0;i<8;i++)room.tick(1/30);assert.equal(a.shots,shots);
});
