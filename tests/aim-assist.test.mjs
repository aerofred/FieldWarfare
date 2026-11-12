import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AimAssist,aimAssistLevel} from '../src/aim-assist.js';
import {characterHit} from '../src/combat.js';

// A controller player at the origin looking down -Z; one enemy ten metres
// ahead and a metre to the right of the crosshair.
function setup(overrides={}){
 const game={settings:{aimAssist:'standard'},gamepad:{active:true},touch:{enabled:false},state:'active',player:{alive:true,team:'blue'},
  camera:{position:{x:0,y:1.87,z:0}},yaw:0,pitch:-.04,weapon:{range:70},aim:false,moving:false,mouseDown:false,sprinting:false,traversal:null,
  bots:[{id:'enemy',team:'red',alive:true,visible:true,x:1,z:-10,jump:0,crouch:false,yaw:0}],...overrides};
 game.isEnemy=actor=>actor.team!==game.player.team;
 return {game,assist:new AimAssist(game)};
}
const run=(assist,seconds,each=()=>{})=>{for(let t=0;t<seconds;t+=1/60){each();assist.update(1/60);}};
const error=game=>{const b=game.bots[0],dx=b.x-game.camera.position.x,dz=b.z-game.camera.position.z;return Math.abs(Math.atan2(Math.sin(Math.atan2(-dx,-dz)-game.yaw),Math.cos(Math.atan2(-dx,-dz)-game.yaw)));};
const hits=game=>{const c=Math.cos(game.pitch);return !!characterHit(game.camera.position,{x:-Math.sin(game.yaw)*c,y:Math.sin(game.pitch),z:-Math.cos(game.yaw)*c},game.bots[0],100);};

test('the mouse gets no aim assist, controllers and touch screens do',()=>{
 assert.equal(setup({gamepad:{active:false}}).assist.enabled,false);
 assert.equal(setup({gamepad:{active:false},touch:{enabled:true}}).assist.enabled,true);
 assert.equal(setup({settings:{aimAssist:'off'}}).assist.enabled,false);
 assert.equal(aimAssistLevel('bogus'),'standard');
});

test('tracking brings a steering player onto the target, where the real hit test agrees',()=>{
 const {game,assist}=setup();assert.equal(hits(game),false);const before=error(game);
 run(assist,1.2,()=>assist.look());
 assert.ok(error(game)<before*.25,`error ${before} → ${error(game)}`);assert.ok(hits(game),'the corrected view hits the enemy');
 assert.equal(assist.target.actor.id,'enemy');
});

test('an idle view is never turned, only slowed near a target',()=>{
 const {game,assist}=setup();run(assist,1);
 assert.equal(game.yaw,0);assert.ok(assist.slow<1&&assist.slow>.4);
});

test('aiming in snaps toward a nearby target',()=>{
 const {game,assist}=setup();assist.update(1/60);game.aim=true;const before=error(game);run(assist,.2);
 assert.ok(error(game)<before*.5,`error ${before} → ${error(game)}`);
});

test('hidden, allied, distant or off-cone actors are ignored',()=>{
 for(const change of [{visible:false},{team:'blue'},{alive:false},{z:-90},{x:6}]){
  const {game,assist}=setup();Object.assign(game.bots[0],change);run(assist,.5,()=>assist.look());
  assert.equal(assist.target,null,JSON.stringify(change));assert.equal(game.yaw,0);assert.equal(assist.slow,1);
 }
});

test('no assistance while sprinting, climbing or with the setting off',()=>{
 for(const change of [{sprinting:true},{traversal:'climb'},{settings:{aimAssist:'off'}}]){
  const {game,assist}=setup(change);run(assist,.5,()=>assist.look());assert.equal(game.yaw,0,JSON.stringify(change));
 }
});

test('stronger levels pull harder',()=>{
 const pulled=level=>{const {game,assist}=setup({settings:{aimAssist:level}});run(assist,.25,()=>assist.look());return error(game);};
 assert.ok(pulled('strong')<pulled('standard')&&pulled('standard')<pulled('light'));
});

test('keyboard-only play gets the assist, and a view height set on the enemy ahead',()=>{
 assert.equal(setup({gamepad:{active:false},keyboardLook:true}).assist.enabled,true);
 // Standing, crouching, on a roof three metres up, and far below: the view
 // height found hits each one along the current bearing.
 for(const enemy of [{jump:0,crouch:false},{jump:0,crouch:true},{jump:3,crouch:false},{jump:-4,crouch:false,z:-25}]){
  const {game,assist}=setup({gamepad:{active:false},keyboardLook:true});Object.assign(game.bots[0],{x:0},enemy);
  game.pitch=assist.keyboardPitch();assert.ok(hits(game),`hits ${JSON.stringify(enemy)} at pitch ${game.pitch}`);
 }
});

test('keyboard view height: horizon without a visible enemy ahead',()=>{
 for(const enemy of [{visible:false},{alive:false},{team:'blue'},{x:12,z:-3}]){
  const {game,assist}=setup({gamepad:{active:false},keyboardLook:true});Object.assign(game.bots[0],enemy);
  assert.equal(assist.keyboardPitch(),0,JSON.stringify(enemy));
 }
});
