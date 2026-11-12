import {createHub} from '../server/hub.js';
import {version} from '../package.json';
import {Capacitor,registerPlugin} from '@capacitor/core';

// Where the page runs. The desktop app (and any Node server) serves it from a
// game server that also lists the games of the local network (/api/lan). The
// iOS app has no Node: the room runs in this page behind the native LAN
// server of the LanHost plugin, which also announces and browses the network.
export const VERSION=version;
const lanHost=Capacitor.isNativePlatform()?registerPlugin('LanHost'):null;
let hostPort=4173,hostAddresses=[],lanServers=[];
const loopback=()=>['127.0.0.1','localhost','[::1]'].includes(location.hostname);
// Address of the game server built into this app, or of the one serving this
// page on this machine; null for a page opened from another machine.
export function localServer(){return lanHost?`http://127.0.0.1:${hostPort}`:loopback()?location.origin:null;}
export function defaultAddress(){return localServer()||location.origin;}

// The native server starts only once online play is chosen (solo needs no
// network at all), then stays up until the app quits. A failed or stalled
// start (no network yet) is retried on the next call.
let hub=null,hostStart=null;
export function startNativeHost(){
  if(!lanHost)return Promise.resolve(false);
  if(!hub)attachHost();
  hostStart??=Promise.race([lanHost.start({port:hostPort}),new Promise((resolve,reject)=>setTimeout(()=>reject(new Error('Local server: start timed out.')),5000))])
    .then(started=>{hostPort=started.port;hostAddresses=started.addresses||[];return true;})
    .catch(error=>{console.warn(error);hostStart=null;return false;});
  return hostStart;
}
function attachHost(){
  hub=createHub();const peers=new Map(),outbox=[];
  const flush=()=>{if(outbox.length)lanHost.send({messages:outbox.splice(0)});};
  lanHost.addListener('events',({events})=>{
    for(const e of events||[]){
      if(e.t==='o'){const peer={open:true,bufferedAmount:0,send:data=>{if(!outbox.length)queueMicrotask(flush);outbox.push({id:e.id,data});},close:(code,reason)=>lanHost.close({id:e.id,code,reason}),terminate:()=>lanHost.close({id:e.id})};const connection=hub.connect(peer);if(connection)peers.set(e.id,{peer,connection});}
      else if(e.t==='m')peers.get(e.id)?.connection.message(e.data,!!e.binary);
      else if(e.t==='c'){const entry=peers.get(e.id);if(entry){entry.peer.open=false;peers.delete(e.id);entry.connection.close();}}
    }
  });
  lanHost.addListener('servers',({servers})=>{lanServers=Array.isArray(servers)?servers:[];});
  // What /api/server answers, and the announce while someone plays here.
  let announced=null;
  setInterval(()=>{
    lanHost.setStatus({json:JSON.stringify(hub.status())});
    const host=hub.host();if(host!==announced){announced=host;lanHost.advertise({host:host||'',version});}
  },1000);
}

// Games announced on the local network with the state of their room, or
// null where this page cannot discover them (a browser on another machine).
async function withRoom(server){
  try{const room=await(await fetch(new URL('/api/server',server.address),{cache:'no-store',signal:AbortSignal.timeout(2500)})).json();return room&&typeof room==='object'?{...server,room}:null;}catch{return null;}
}
export function watchLan(callback){
  let stopped=false,timer;
  if(lanHost)lanHost.browse().catch(()=>{});
  const poll=async()=>{
    let lan=null;
    if(lanHost)lan={servers:lanServers,addresses:hostAddresses};
    else try{const answer=await fetch('/api/lan',{cache:'no-store'});if(answer.ok)lan=await answer.json();}catch{}
    if(lan)lan={addresses:Array.isArray(lan.addresses)?lan.addresses:[],servers:(await Promise.all((Array.isArray(lan.servers)?lan.servers:[]).map(withRoom))).filter(Boolean)};
    if(stopped)return;callback(lan);timer=setTimeout(poll,3000);
  };
  poll();return()=>{stopped=true;clearTimeout(timer);};
}
