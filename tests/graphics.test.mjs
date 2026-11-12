import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {surfaceMaps,surfaceFamily,worldUV} from '../src/materials.js';
import {createSoldier,animateSoldier,createWeapon,animateWeapon,equipSoldier} from '../src/models.js';
import {Visuals,desktopRenderer,nativeAntialias,adaptState,adaptStep,MIN_SCALE} from '../src/visuals.js';
import {MultiplayerRoom} from '../server/room.js';
import {WEAPONS} from '../src/rules.js';

test('PBR textures have correct color spaces, seamless wrapping and non-flat normals',()=>{
 for(const kind of ['brick','fabric','wood','gun']){const maps=surfaceMaps(kind);assert.equal(maps.map.colorSpace,THREE.SRGBColorSpace);assert.equal(maps.normalMap.colorSpace,THREE.NoColorSpace);assert.equal(maps.roughnessMap.colorSpace,THREE.NoColorSpace);assert.equal(maps.normalMap.wrapS,THREE.RepeatWrapping);assert.ok(maps.normalMap.image.data.some((v,i)=>i%4===0&&v!==128));Object.values(maps).forEach(t=>t.dispose());}
 const g=new THREE.BoxGeometry(4,2,2);worldUV(g);assert.ok(Math.max(...g.attributes.uv.array)-Math.min(...g.attributes.uv.array)>=2);g.dispose();
});
test('soldier skinning stays finite through locomotion, reload, death and respawn',()=>{
 const m=createSoldier('blue');assert.equal(m.skeleton.bones.length,13);let skinned=0;m.body.traverseVisible(o=>{if(o.isSkinnedMesh)skinned++;});assert.equal(skinned,3);
 const v=new THREE.Vector3();for(const state of [{alive:true,speed:4.5},{alive:true,speed:7.5,crouch:true,pitch:.6,reload:1.1},{alive:false},{alive:true,speed:0}]){
  for(let i=0;i<40;i++)animateSoldier(m,state,1/60);m.root.updateMatrixWorld(true);m.skeleton.update();
  m.body.traverse(o=>{if(o.isSkinnedMesh){o.getVertexPosition(0,v);assert.ok(v.toArray().every(Number.isFinite));}});
 }
 assert.equal(m.body.rotation.z,0);assert.equal(m.body.position.y,0);assert.ok(m.knees.some(k=>k.rotation.x>=0));m.skeleton.dispose();
});
test('all weapon reloads move the magazine and support hand, and restore their resting pose',()=>{
 for(const id of ['minimi','mag58','hecate']){const m=createWeapon(id),rest=m.magRest[1];animateWeapon(m,{reload:1,duration:2});assert.ok(m.magazine.position.y<rest-.1,id);assert.ok(m.left.position.z>-.26);animateWeapon(m,{reload:0,duration:2});assert.equal(m.magazine.position.y,rest);assert.ok(Math.abs(m.magazine.rotation.z)<1e-8);assert.equal(m.left.position.z,-.26);}
});
test('the shotgun loads shells by hand and racks its pump after a shot',()=>{
 const m=createWeapon('r870'),pump=m.bolt.position.z;animateWeapon(m,{});assert.equal(m.magazine.visible,false);
 let shown=0;for(let p=.13;p<.8;p+=.01){animateWeapon(m,{reload:3*(1-p),duration:3});if(m.magazine.visible)shown++;}assert.ok(shown>8,'a shell rides in the hand');
 animateWeapon(m,{reload:3*(1-.9),duration:3,empty:true});assert.ok(m.bolt.position.z>pump+.05,'empty: the pump is racked');
 animateWeapon(m,{cycle:.4});assert.ok(m.bolt.position.z>pump+.05,'the pump runs back after a shot');animateWeapon(m,{cycle:1});assert.equal(m.bolt.position.z,pump);assert.equal(m.magazine.visible,false);
});
test('peers receive server-owned reload state for animation without receiving ammunition',()=>{
 const room=new MultiplayerRoom({fillBots:false}),a=room.add({name:'Alice'}),b=room.add({name:'Bob'});a.ammunition[0].ammo--;room.reload(a);const peer=room.snapshot(b.id).players.find(p=>p.id===a.id);assert.ok(peer.reload>0);assert.equal(peer.ammunition,undefined);for(let i=0;i<150;i++)room.tick(1/30);assert.equal(room.snapshot(b.id).players.find(p=>p.id===a.id).reload,0);
});

test('sniper rifle scope tube is open along the aiming line',()=>{
 const m=createWeapon('hecate');m.group.position.set(0,-.145,-.47);m.group.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,0,-1),0,.7);
 const hits=ray.intersectObject(m.group,true).filter(h=>!h.object.material.transparent);
 assert.ok(hits.every(h=>h.object.material.color.getHexString()!=='202625'),'an opaque cylinder cap must not cover the sight');
});

test('impact instances are capped and restart at slot zero after a map or round reset',()=>{
 const visual=Object.create(Visuals.prototype),wall=new THREE.Mesh(new THREE.BoxGeometry(1,4,4));wall.position.set(0,2,0);wall.updateMatrixWorld(true);visual.game={scene:new THREE.Scene(),map:{solidMeshes:[wall]}};visual.createImpacts();
 for(let i=0;i<150;i++)visual.impact({x:4,y:2,z:0},{x:.5,y:2,z:0});assert.equal(visual.impacts.count,96);visual.resetImpacts();assert.equal(visual.impacts.count,0);assert.equal(visual.impactIndex,0);
 visual.impact({x:4,y:2,z:.7},{x:.5,y:2,z:.7});const matrix=new THREE.Matrix4();visual.impacts.getMatrixAt(0,matrix);assert.ok(Math.abs(matrix.elements[14]-.7)<1e-5);assert.equal(visual.impacts.count,1);
 visual.impacts.geometry.dispose();visual.impacts.material.map.dispose();visual.impacts.material.dispose();wall.geometry.dispose();wall.material.dispose();
});

test('revolver cylinder swings out to reload, spins per shot and closes again',()=>{
 const m=createWeapon('revolver');assert.equal(m.kind,'revolver');assert.equal(m.scopeLens,null);
 animateWeapon(m,{reload:1.35,duration:2.7});assert.ok(m.magazine.rotation.z>1);assert.ok(m.left.position.z>.07);
 m.spin+=Math.PI/3;animateWeapon(m,{reload:0,duration:2.7});assert.equal(m.magazine.rotation.z,0);assert.ok(Math.abs(m.cylinder.rotation.z-Math.PI/3)<1e-9);assert.equal(m.left.position.z,.07);
});
test('pistol slide runs back on a shot, the magazine drops and is seated again',()=>{
 const m=createWeapon('ppk');assert.equal(m.kind,'ppk');const slide=m.boltRest[2];
 animateWeapon(m,{reload:0,duration:1.5,recoil:.026});assert.ok(m.bolt.position.z>slide+.025,'slide back after a shot');
 animateWeapon(m,{reload:1.2,duration:1.5,empty:true});assert.ok(m.magazine.position.y<m.magRest[1]-.05,'the empty magazine falls');assert.ok(m.bolt.position.z>slide+.025,'slide locked open');
 animateWeapon(m,{reload:.01,duration:1.5,empty:true});assert.deepEqual(m.magazine.position.toArray(),m.magRest);assert.ok(Math.abs(m.bolt.position.z-slide)<1e-9);
 assert.ok(m.muzzle<-.2&&m.sight>m.bore+.03,'the sights stand above the suppressor');
});
test('the server equips the revolver, fires six rounds and reloads it',()=>{
 const index=WEAPONS.findIndex(w=>w.id==='revolver'),room=new MultiplayerRoom({fillBots:false}),a=room.add({name:'Alice'});room.add({name:'Bob'});
 assert.ok(index>=0&&WEAPONS[index].sidearm);room.action(a.id,{action:'weapon',weapon:index});assert.equal(a.weapon,index);
 let shots=0;for(let i=0;i<10;i++){a.cooldown=0;if(room.fire(a))shots++;}assert.equal(shots,6);assert.equal(a.ammunition[index].ammo,0);
 for(let i=0;i<Math.ceil((WEAPONS[index].reload+.2)*30);i++)room.tick(1/30);assert.equal(a.ammunition[index].ammo,6);assert.equal(a.ammunition[index].reserve,30);
});

test('soldier hands stay on the grip and handguard of every carried weapon',()=>{
 const m=createSoldier('red'),hand=new THREE.Vector3(),grip=new THREE.Vector3();
 for(const id of ['minimi','mag58','r870','hecate','mp5','revolver','ppk'])for(const pitch of [0,.4]){
  equipSoldier(m,id);for(let i=0;i<10;i++)animateSoldier(m,{alive:true,speed:0,pitch},1/60);m.root.updateMatrixWorld(true);
  for(const [i,point] of [[0,m.hold.right],[1,m.hold.left]]){m.elbows[i].localToWorld(hand.set(0,-.27,0));m.weapon.group.localToWorld(grip.set(...point));assert.ok(hand.distanceTo(grip)<.02,`${id} hand ${i} off by ${hand.distanceTo(grip).toFixed(3)}`);}
 }
 m.skeleton.dispose();
});

test('surface textures are shared per family of material, whatever the colour',()=>{
 const a=surfaceMaps('steel'),b=surfaceMaps('bus'),c=surfaceMaps('rust'),d=surfaceMaps('cream'),e=surfaceMaps('white');
 assert.equal(a.map,b.map,'all metals share one set');assert.notEqual(a.map,c.map,'rust has its own tint');assert.equal(d.normalMap,e.normalMap,'unknown kinds share the plain family');
 assert.equal(surfaceFamily('pavement'),'floor');assert.equal(surfaceFamily('leaves'),'grass');
 const n=surfaceMaps('wood').normalMap.image.data,v=new THREE.Vector3();
 for(let i=0;i<n.length;i+=4){assert.equal(n[i+3],255);v.set(n[i]/127.5-1,n[i+1]/127.5-1,n[i+2]/127.5-1);assert.ok(Math.abs(v.length()-1)<.02,'unit normals');assert.ok(v.z>0,'normals point out of the surface');}
});

test('Performance drops multisampling on desktop GPUs only; tile-based and unknown chips keep it',()=>{
 for(const name of ['ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)','ANGLE (Intel Inc., ANGLE Metal Renderer: Intel(R) Iris(TM) Plus Graphics, Unspecified Version)','ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)','ANGLE (ATI Technologies Inc., AMD Radeon Pro 5500M OpenGL Engine, OpenGL 4.1)','ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Direct3D11 vs_5_0 ps_5_0, D3D11)'])assert.ok(desktopRenderer(name),name);
 for(const name of ['Apple GPU','ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)','Mali-G78','Adreno (TM) 650','PowerVR Rogue GE8320','ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)','Radiant'])assert.ok(!desktopRenderer(name),name);
 assert.equal(nativeAntialias('low',true),false);for(const quality of ['medium','high'])assert.equal(nativeAntialias(quality,true),true);
 for(const quality of ['low','medium','high'])assert.equal(nativeAntialias(quality,false),true);
 assert.equal(nativeAntialias('low'),true,'without a browser the chip is unknown');
});

test('adaptive resolution drops once to the scale the frame time asks for',()=>{
 const a=adaptState();
 // 30 i/s at full scale: one step to √(30/55), not four steps of 0.1.
 assert.equal(adaptStep(a,1/30,0,1),.75);assert.ok(a.trial);
 // Still checking: no further change before three seconds.
 assert.equal(adaptStep(a,1/30,1.5,.75),.75);
 // Faster afterwards: the drop is kept.
 assert.equal(adaptStep(a,1/45,3,.75),.75);assert.equal(a.trial,null);
 // A milder overload costs a smaller drop.
 assert.equal(adaptStep(adaptState(),1/48,0,1),.95);
 assert.equal(adaptStep(adaptState(),1/30,0,.7),MIN_SCALE);assert.equal(adaptStep(adaptState(),1/30,0,MIN_SCALE),MIN_SCALE);
});

test('a drop that does not speed frames up is undone and not retried for a minute',()=>{
 const a=adaptState();
 assert.equal(adaptStep(a,1/30,0,1),.75);
 assert.equal(adaptStep(a,1/31,3,.75),1);
 assert.equal(adaptStep(a,1/30,4.5,1),1);assert.equal(adaptStep(a,1/30,62,1),1);
 assert.equal(adaptStep(a,1/30,63.5,1),.75);
});

test('the scale climbs back in large, spaced steps and holds after overshooting',()=>{
 const a=adaptState();
 assert.equal(adaptStep(a,1/60,0,.7),.8);
 assert.equal(adaptStep(a,1/60,1.5,.8),.8);
 assert.equal(adaptStep(a,1/60,4,.8),.9);
 // Too slow right after rising: drop, and no rise for 30 s.
 assert.equal(adaptStep(a,1/40,5.5,.9),.75);assert.equal(adaptStep(a,1/50,8.5,.75),.75);
 assert.equal(adaptStep(a,1/60,20,.75),.75);assert.equal(adaptStep(a,1/60,36,.75),.85);
});
