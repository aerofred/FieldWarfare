import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Effects} from '../src/effects.js';
import {createNavigation,walkable} from '../src/navigation.js';
import {createWorld} from '../src/world.js';
import {distance} from '../src/rules.js';
import {mapConfig} from '../src/maps.js';

test('pooled effects never grow their buffers and expire after their lifetime',()=>{
 const scene=new THREE.Scene(),fx=new Effects(scene),children=scene.children.length,sizes=[fx.glow.pos.length,fx.smoke.pos.length,fx.tracers.items.length,fx.casings.items.length];
 const p=new THREE.Vector3(0,1,0),n=new THREE.Vector3(1,0,0);
 for(let i=0;i<60;i++){fx.explosion(p);fx.impact(p,n,true);fx.muzzle(p,n);fx.tracer(p,new THREE.Vector3(30,1,0));fx.casing(p,n);}
 assert.deepEqual([fx.glow.pos.length,fx.smoke.pos.length,fx.tracers.items.length,fx.casings.items.length],sizes);assert.equal(scene.children.length,children);
 for(let i=0;i<60*8;i++)fx.update(1/60);
 assert.equal(fx.glow.active,0);assert.equal(fx.smoke.active,0);assert.equal(fx.tracers.active,0);assert.equal(fx.casings.active,0);
 assert.ok(fx.smoke.size.every(v=>v===0),'expired particles are hidden');
 fx.dispose();assert.equal(scene.children.length,0);
});
test('casings bounce on the ground and report their first impact once',()=>{
 const fx=new Effects(new THREE.Scene()),bounces=[];fx.casing(new THREE.Vector3(0,1.5,0),new THREE.Vector3(1,1,0));
 for(let i=0;i<120;i++)fx.update(1/60,(p,n)=>bounces.push(n));
 assert.equal(bounces.filter(n=>n===0).length,1);const c=fx.casings.items[0];assert.ok(c.p.y>=.108&&c.p.y<.2);fx.dispose();
});
test('navigation paths are smoothed into walkable straight segments on every map',()=>{
 for(const id of ['factory','gardens','railway']){
  const {obstacles}=createWorld(id),nav=createNavigation(obstacles),start=mapConfig(id).soloSpawn,end=mapConfig(id).teamSpawns.red[0],path=nav.findPath(start,end);
  assert.ok(path.length>0&&path.length<20,`${id}: ${path.length} waypoints`);assert.ok(distance(path.at(-1),end)<1.5);
  for(let i=1;i<path.length;i++)assert.ok(walkable(path[i-1],path[i],obstacles),`${id}: segment ${i} crosses an obstacle`);
 }
});
