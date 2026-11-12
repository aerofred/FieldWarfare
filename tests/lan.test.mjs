import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import WebSocket from 'ws';
import {createHub} from '../server/hub.js';
import {createGameServer} from '../server/server.js';

// A peer as the iOS native server hands it to the hub: plain callbacks.
function fakePeer(){const peer={open:true,bufferedAmount:0,sent:[],closed:null,send:text=>peer.sent.push(JSON.parse(text)),close:(code,reason)=>{peer.closed={code,reason};},terminate:()=>{peer.closed={code:1006};}};return peer;}

test('the hub serves peers of any transport and names the room after its first human',()=>{
 const hub=createHub({fillBots:false,autoTick:false}),alice=fakePeer(),connection=hub.connect(alice);
 assert.equal(hub.host(),null);
 connection.message(JSON.stringify({type:'join',name:'Alice'}));
 assert.equal(alice.sent[0].type,'welcome');assert.equal(hub.host(),'Alice');assert.equal(hub.status().players,1);
 connection.message(JSON.stringify({type:'ping',time:5}));assert.deepEqual(alice.sent.at(-1),{type:'pong',time:5});
 connection.message('not json');assert.equal(alice.closed.code,1008);
 connection.close();assert.equal(hub.host(),null);assert.equal(hub.status().players,0);
 hub.close();
});

test('the hub turns away a seventeenth connection',()=>{
 const hub=createHub({autoTick:false});for(let i=0;i<16;i++)assert.ok(hub.connect(fakePeer()));
 const extra=fakePeer();assert.equal(hub.connect(extra),null);assert.equal(extra.closed.code,1013);hub.close();
});

test('/api/lan exists only with discovery and gives addresses to this machine only',async t=>{
 const plain=await createGameServer({port:0,host:'127.0.0.1',autoTick:false});t.after(()=>plain.close());
 assert.equal((await fetch(`http://127.0.0.1:${plain.address.port}/api/lan`)).status,404);
 const lan=await createGameServer({port:0,host:'127.0.0.1',autoTick:false,discovery:true,version:'test'});t.after(()=>lan.close());
 const answer=await(await fetch(`http://127.0.0.1:${lan.address.port}/api/lan`)).json();
 assert.ok(Array.isArray(answer.servers));assert.ok(answer.addresses.every(a=>a.startsWith('http://')&&a.endsWith(':'+lan.address.port)));
 const socket=new WebSocket(`ws://127.0.0.1:${lan.address.port}/multiplayer`);await once(socket,'open');socket.send(JSON.stringify({type:'join',name:'Bob'}));
 await new Promise(resolve=>socket.once('message',resolve));assert.equal(lan.hub.host(),'Bob');socket.close();
});
