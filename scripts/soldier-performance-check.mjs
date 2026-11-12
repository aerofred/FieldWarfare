import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

// Rendering counters are portable; SwiftShader frame rates do not represent
// an iPad GPU. Run this beside graphics-check.mjs for visual integration.
await mkdir('artifacts',{recursive:true});
const harness=await build({stdin:{contents:`
import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createSoldier,animateSoldier,equipSoldier,updateSoldierLOD,setSoldierQuality} from './src/models.js';
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1024,768);renderer.info.autoReset=false;renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(78,1024/768,.05,180);scene.background=new THREE.Color('#b8c7d4');camera.position.set(0,1.7,8);camera.lookAt(0,1.1,0);
scene.add(new THREE.HemisphereLight(0xffffff,0x404040,2));const sun=new THREE.DirectionalLight(0xffffff,3);sun.position.set(-10,20,10);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-20,right:20,top:20,bottom:-20});scene.add(sun);
const generator=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();scene.environment=generator.fromScene(room,.06).texture;scene.environmentIntensity=.3;room.dispose();generator.dispose();
const models=Array.from({length:5},(_,i)=>{const m=createSoldier(i%2?'blue':'red');m.root.position.x=(i-2)*1.5;scene.add(m.root);return m;});
window.measure=()=>{const results=[];for(const [quality,shadows] of [['medium',false],['medium',true],['low',false]]){renderer.shadowMap.enabled=shadows;models.forEach(m=>setSoldierQuality(m,quality));for(const distance of [0,20,40]){models.forEach(m=>updateSoldierLOD(m,distance));for(const count of [1,5]){models.forEach((m,i)=>m.root.visible=i<count);renderer.info.reset();renderer.render(scene,camera);results.push({quality,shadows,distance,detail:models[0].detailLevel,count,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles});}}}models.forEach(m=>setSoldierQuality(m,'medium'));return results;};
window.materialProfiles=()=>['medium','low','high'].map(quality=>{
 models.forEach(m=>setSoldierQuality(m,quality));renderer.render(scene,camera);let lambert=0,pbr=0,textured=0;
 for(const m of models)m.body.traverseVisible(o=>{if(!o.isMesh||o===m.flash)return;lambert+=o.material.isMeshLambertMaterial?1:0;pbr+=o.material.isMeshStandardMaterial?1:0;textured+=['map','normalMap','roughnessMap','metalnessMap','envMap'].some(k=>o.material[k])?1:0;});
 return{quality,lambert,pbr,textured};
});
window.preview=(weapon,distance,quality='medium')=>{
 renderer.shadowMap.enabled=quality!=='low';camera.fov=35;camera.position.set(2.7,1.75,3.8);camera.lookAt(0,1.05,0);camera.updateProjectionMatrix();
 models.forEach((m,i)=>m.root.visible=i===0);const m=models[0];m.root.position.x=0;m.root.rotation.y=.2;setSoldierQuality(m,quality);equipSoldier(m,weapon);updateSoldierLOD(m,distance);animateSoldier(m,{alive:true,speed:0,weaponId:weapon},1/60);renderer.render(scene,camera);
};
`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife'});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const errors=[];
try{
 const page=await browser.newPage({locale:'fr-FR',viewport:{width:1024,height:768}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.setContent('<html><body style="margin:0"></body></html>');await page.addScriptTag({content:harness.outputFiles[0].text});
 const results=await page.evaluate(()=>window.measure());
 // Body batches plus the weapon and its magazine; Performance merges the body.
 for(const result of results){assert.equal(result.calls,result.count*(result.quality==='low'?3:5)*(result.shadows?2:1),JSON.stringify(result));assert.ok(result.triangles<result.count*[5400,1100,650][result.detail]*(result.shadows?2:1),JSON.stringify(result));}
 const materialProfiles=await page.evaluate(()=>window.materialProfiles());
 for(const profile of materialProfiles){if(profile.quality==='low'){assert.ok(profile.lambert>0);assert.equal(profile.pbr,0);assert.equal(profile.textured,0);}else{assert.equal(profile.lambert,0);assert.ok(profile.pbr>0);assert.ok(profile.textured>0);}}
 for(const weapon of ['minimi','mag58','r870','hecate','mp5','revolver','ppk']){await page.evaluate(weapon=>window.preview(weapon,0),weapon);await page.screenshot({path:'artifacts/soldier-'+weapon+'.png'});}
 for(const distance of [20,40]){await page.evaluate(distance=>window.preview('minimi',distance),distance);await page.screenshot({path:'artifacts/soldier-lod-'+distance+'.png'});}
 await page.evaluate(()=>window.preview('minimi',0,'low'));await page.screenshot({path:'artifacts/soldier-performance-materials.png'});
 assert.deepEqual(errors,[]);
 const report={renderer:'Chrome SwiftShader; rendering counts only, not an iPad FPS benchmark',results,materialProfiles,errors};
 await writeFile('artifacts/soldier-performance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
