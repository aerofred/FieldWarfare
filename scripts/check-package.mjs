import {unzipSync} from 'fflate';
import WebSocket from 'ws';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const basename=`field-warfare-${version}-server`,out=path.join(root,'releases');
const sha256=data=>createHash('sha256').update(data).digest('hex');
const sums=(await readFile(path.join(out,basename+'-SHA256SUMS.txt'),'utf8')).trim().split('\n');
for(const sum of sums){const [hash,name]=sum.trim().split(/\s+/);assert.equal(sha256(await readFile(path.join(out,name))),hash);}
const zip=unzipSync(await readFile(path.join(out,basename+'.zip'))),zipFiles=Object.keys(zip).sort();
assert.ok(zipFiles.every(name=>name.startsWith(basename+'/')&&!name.split('/').some(p=>['.git','.openai','node_modules','artifacts'].includes(p))));
const tarFiles=execFileSync('tar',['-tzf',path.join(out,basename+'.tar.gz')],{encoding:'utf8'}).trim().split(/\r?\n/).filter(name=>!name.endsWith('/')).sort();
assert.deepEqual(tarFiles,zipFiles);
const base=await mkdtemp(path.join(tmpdir(),'field-warfare-verify-')),directory=path.join(base,basename);
let child;const sockets=[];let output='';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(check){for(let i=0;i<300;i++){if(await check())return;await delay(10);}throw new Error('Package condition not reached.');}
async function join(url,name){
  const socket=new WebSocket(url),messages=[];sockets.push(socket);socket.on('error',()=>{});socket.on('message',raw=>messages.push(JSON.parse(raw.toString())));
  await once(socket,'open');socket.send(JSON.stringify({type:'join',name,team:'auto',weapon:0}));await waitFor(()=>messages.some(m=>m.type==='welcome'));
  return {socket,messages,id:messages.find(m=>m.type==='welcome').id};
}
try{
  execFileSync('tar',['-xzf',path.join(out,basename+'.tar.gz'),'-C',base]);
  const release=JSON.parse(await readFile(path.join(directory,'release-manifest.json'),'utf8'));
  for(const [name,hash]of Object.entries(release.files)){assert.equal(sha256(await readFile(path.join(directory,name))),hash);assert.equal(sha256(zip[`${basename}/${name}`]),hash);}
  const pkg=JSON.parse(await readFile(path.join(directory,'package.json'),'utf8'));assert.equal(pkg.dependencies,undefined);assert.equal(pkg.scripts.start,'node server.mjs');
  // Run outside both the repository and release directory. No NODE_PATH and
  // no node_modules are available to the deployed process.
  child=spawn(process.execPath,[path.join(directory,'server.mjs')],{cwd:tmpdir(),env:{...process.env,HOST:'127.0.0.1',PORT:'0',BOTS:'1',BOT_DIFFICULTY:'veteran',MAP:'gardens',MODE:'ctf',NODE_PATH:''},stdio:['ignore','pipe','pipe'],windowsHide:true});
  child.stdout.on('data',data=>output+=data.toString());child.stderr.on('data',data=>output+=data.toString());
  await waitFor(()=>{if(child.exitCode!==null)throw new Error(output);return /http:\/\/127\.0\.0\.1:\d+/.test(output);});
  const origin=output.match(/http:\/\/127\.0\.0\.1:\d+/)[0];
  for(const [asset,type]of [['/','text/html'],['/app.js','javascript'],['/style.css','text/css']]){const response=await fetch(origin+asset);assert.equal(response.status,200);assert.ok(response.headers.get('content-type').includes(type));assert.ok((await response.arrayBuffer()).byteLength>1000);}
  const status=await(await fetch(origin+'/api/server')).json();assert.equal(status.capacity,8);assert.equal(status.botDifficulty,'veteran');assert.equal(status.difficultyFixed,true);assert.equal(status.mapId,'gardens');assert.equal(status.mapFixed,true);assert.equal(status.mode,'ctf');assert.equal(status.modeFixed,true);
  const alice=await join(origin.replace('http:','ws:')+'/multiplayer','Alice'),bob=await join(origin.replace('http:','ws:')+'/multiplayer','Bob');
  await waitFor(()=>bob.messages.some(m=>m.type==='snapshot'&&m.phase==='active'&&m.players.length===8&&m.humans===2&&m.bots===6));
  assert.equal(bob.messages.find(m=>m.type==='welcome').snapshot.botDifficulty,'veteran');assert.equal(bob.messages.find(m=>m.type==='welcome').snapshot.mapId,'gardens');
  const first=bob.messages.findLast(m=>m.type==='snapshot').players.find(p=>p.id===alice.id);
  alice.socket.send(JSON.stringify({type:'input',seq:1,forward:1,strafe:0,yaw:0,pitch:0}));
  await waitFor(()=>bob.messages.some(m=>m.type==='snapshot'&&m.players.some(p=>p.id===alice.id&&p.z<first.z-.1)));
  await delay(400);alice.socket.send(JSON.stringify({type:'action',action:'fire'}));
  await waitFor(()=>alice.messages.some(m=>m.type==='snapshot'&&m.self.shots===1));
  assert.ok(alice.messages.find(m=>m.type==='welcome').snapshot.players.filter(p=>p.isBot).length===7);
  for(const socket of sockets)socket.terminate();
  await waitFor(async()=>(await(await fetch(origin+'/api/server')).json()).players===0);
  console.log(JSON.stringify({status:'passed',version,checks:['ZIP and TAR.GZ consistent','valid SHA-256 checksums','extraction outside the repository','server without node_modules','launch from another directory','HTTP and game assets','two humans and six bots connected over WebSocket','Les Deux Jardins map forced by MAP','capture the flag forced by MODE','shot validated by the server','movement synchronized','clean disconnect']},null,2));
}catch(error){console.error(output);throw error;}
finally{
  for(const socket of sockets)socket.terminate();
  if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await Promise.race([exited,delay(3000)]);if(child.exitCode===null){child.kill('SIGKILL');await exited;}}
  if(path.dirname(path.resolve(base))!==path.resolve(tmpdir())||!path.basename(base).startsWith('field-warfare-verify-'))throw new Error('Temporary cleanup refused.');
  await rm(base,{recursive:true,force:true});
}
