import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {scopeFov,ScopeView} from '../src/scope.js';
import {createWeapon} from '../src/models.js';

test('scope projection magnifies the scene four times within the lens at every ADS transition',()=>{
 for(const [world,gun,distance]of [[78,62,.406],[58,28,.406],[62,40,.37]]){
  const field=scopeFov(world,gun,.027,distance),r=.027/(distance*Math.tan(THREE.MathUtils.degToRad(gun/2)));
  const zoom=r*Math.tan(THREE.MathUtils.degToRad(world/2))/Math.tan(THREE.MathUtils.degToRad(field/2));assert.ok(Math.abs(zoom-4)<1e-8);
 }
});
test('only the sniper rifle exposes an independent lens; leaving ADS restores its original glass',()=>{
 for(const id of ['minimi','mag58','r870'])assert.equal(createWeapon(id).scopeLens,null);
 const model=createWeapon('hecate'),original=model.scopeLens.material;assert.ok(model.group.children.includes(model.scopeLens));
 const scope=new ScopeView({weaponModel:model,weapon:{id:'hecate',scope:true},state:'active',player:{alive:true},aim:false});scope.surface=model.scopeLens;scope.originalMaterial=original;model.scopeLens.material=scope.material;scope.active=true;scope.render('low');assert.equal(model.scopeLens.material,original);assert.equal(scope.active,false);scope.material.dispose();
});
