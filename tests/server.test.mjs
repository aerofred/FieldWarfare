import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import WebSocket from 'ws';
import {createGameServer} from '../server/server.js';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(check){for(let i=0;i<200;i++){if(check())return;await sleep(10);}throw new Error('Server condition timeout');}
async function join(port,name,team='auto'){
 const socket=new WebSocket(`ws://127.0.0.1:${port}/multiplayer`),messages=[];socket.on('error',()=>{});socket.on('message',raw=>messages.push(JSON.parse(raw.toString())));
 await once(socket,'open');socket.send(JSON.stringify({type:'join',name,team}));await waitFor(()=>messages.some(m=>m.type==='welcome'||m.type==='error'));
 return{socket,messages,welcome:messages.find(m=>m.type==='welcome'),error:messages.find(m=>m.type==='error')};
}
test('HTTP and real WebSocket clients join the same room, receive updates and disconnect cleanly',async t=>{
 const server=await createGameServer({port:0,host:'127.0.0.1',fillBots:false,autoTick:false});t.after(()=>server.close());const port=server.address.port;
 const alice=await join(port,'Alice'),bob=await join(port,'Bob');assert.equal(server.room.phase,'active');assert.equal(alice.welcome.id!==bob.welcome.id,true);
 const status=await (await fetch(`http://127.0.0.1:${port}/api/server`)).json();assert.equal(status.players,2);assert.equal(status.capacity,8);
 alice.socket.send(JSON.stringify({type:'input',seq:1,forward:1,strafe:0,yaw:0,pitch:0,x:999,damage:999}));await waitFor(()=>server.room.players.get(alice.welcome.id).input.seq===1);const actor=server.room.players.get(alice.welcome.id),z=actor.z;server.room.tick(.1);server.broadcast();await waitFor(()=>bob.messages.some(m=>m.type==='snapshot'&&m.players.some(p=>p.id===actor.id&&p.z<z)));assert.ok(actor.x!==999);
 const closed=once(bob.socket,'close');bob.socket.close();await closed;await waitFor(()=>server.room.players.size===1);assert.equal(server.room.phase,'waiting');
 alice.socket.close();
});
test('WebSocket server rejects a ninth human and malformed messages',async t=>{
 const server=await createGameServer({port:0,host:'127.0.0.1',fillBots:false,autoTick:false});t.after(()=>server.close());const port=server.address.port;
 for(let i=0;i<8;i++)assert.ok((await join(port,'Human '+i)).welcome);
 const ninth=await join(port,'Ninth');assert.equal(ninth.error.message,'data.error.serverFull');assert.equal(server.room.players.size,8);
 const invalid=new WebSocket(`ws://127.0.0.1:${port}/multiplayer`);invalid.on('error',()=>{});await once(invalid,'open');const closed=once(invalid,'close');invalid.send('bad JSON');const [code]=await closed;assert.equal(code,1008);
});

test('real clients see the same bots, combat and human replacements',async t=>{
 const server=await createGameServer({port:0,host:'127.0.0.1',autoTick:false});t.after(()=>server.close());const port=server.address.port;
 const alice=await join(port,'Alice'),first=alice.welcome.snapshot;assert.equal(first.phase,'active');assert.equal(first.players.length,8);assert.equal(first.bots,7);
 const bob=await join(port,'Bob');server.broadcast();await waitFor(()=>alice.messages.some(m=>m.type==='snapshot'&&m.humans===2&&m.bots===6));
 const last=alice.messages.findLast(m=>m.type==='snapshot');assert.deepEqual(last.players,bob.welcome.snapshot.players);assert.equal(last.self.id,alice.welcome.id);assert.equal(bob.welcome.snapshot.self.id,bob.welcome.id);
 const actor=server.room.players.get(alice.welcome.id),victim=[...server.room.players.values()].find(p=>p.isBot&&p.team!==actor.team);
 victim.protectedUntil=0;server.room.damage(victim,200,actor);server.broadcast();
 await waitFor(()=>bob.messages.some(m=>m.type==='snapshot'&&m.players.some(p=>p.id===victim.id&&!p.alive)&&m.teamScores.blue===1));
 await waitFor(()=>alice.messages.some(m=>m.type==='events'&&m.events.some(e=>e.type==='kill'&&e.victim===victim.id)));
 const closed=once(bob.socket,'close');bob.socket.close();await closed;await waitFor(()=>server.room.humanCount===1);assert.equal(server.room.players.size,8);assert.equal(server.room.phase,'active');
 const status=await(await fetch(`http://127.0.0.1:${port}/api/server`)).json();assert.equal(status.players,1);assert.equal(status.bots,7);assert.equal(status.fillBots,true);assert.deepEqual(status.teams,{blue:4,red:4});
 const end=once(alice.socket,'close');alice.socket.close();await end;await waitFor(()=>server.room.players.size===0);assert.equal(server.room.phase,'waiting');
});

test('a taken port rejects the new server without an uncaught error',async()=>{
 const first=await createGameServer({port:0,host:'127.0.0.1',autoTick:false}),uncaught=[],catcher=e=>uncaught.push(e);process.on('uncaughtException',catcher);
 try{await assert.rejects(createGameServer({port:first.address.port,host:'127.0.0.1',autoTick:false}),{code:'EADDRINUSE'});await new Promise(r=>setTimeout(r,50));assert.deepEqual(uncaught,[]);}
 finally{process.off('uncaughtException',catcher);await first.close();}
});
