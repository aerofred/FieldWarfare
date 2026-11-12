import {GameRoom,MAX_HUMANS} from '../src/sim/room.js';

// Transport-neutral host: one room, its connections and its clock. The Node
// server feeds it ws sockets; the iOS app feeds it the sockets of its native
// LAN server, so both apply the same limits and messages.
// A peer is {send(text),close(code,reason),terminate(),open,bufferedAmount}.
// A refused join gets {type:'error',message} with an i18n key (data.error.*);
// close reasons are diagnostics in English, not shown to players.
export const DISCOVERY_TYPE='fieldwarfare';
export function createHub({fillBots=true,botDifficulty=null,mapId=null,mode=null,autoTick=true}={}){
  const room=new GameRoom({fillBots,botDifficulty,mapId,mode}),peers=new Map();
  const send=(peer,data)=>{if(peer.open){if(peer.bufferedAmount>256*1024){peer.terminate();return;}peer.send(JSON.stringify(data));}};
  const broadcast=()=>{const events=room.drainEvents();for(const [peer,connection]of peers){if(!connection.id)continue;send(peer,room.snapshot(connection.id));if(events.length)send(peer,{type:'events',events});}};
  function connect(peer){
    if(peers.size>=16){peer.close(1013,'Server busy');return null;}
    const connection={id:null,window:Date.now(),messages:0};peers.set(peer,connection);
    const timeout=setTimeout(()=>{if(!connection.id)peer.close(1008,'Join required');},5000);timeout.unref?.();
    return {
      message(data,isBinary=false){
        const now=Date.now();if(now-connection.window>1000){connection.window=now;connection.messages=0;}
        if(isBinary||++connection.messages>150){peer.close(1008,'Invalid or too frequent messages');return;}
        let message;try{message=JSON.parse(data.toString());}catch{peer.close(1008,'Invalid JSON');return;}
        if(!message||typeof message!=='object')return;
        if(message.type==='join'&&!connection.id){try{const p=room.add(message);connection.id=p.id;clearTimeout(timeout);send(peer,{type:'welcome',id:p.id,snapshot:room.snapshot(p.id)});broadcast();}catch(error){send(peer,{type:'error',message:error.message});peer.close(1008,'Join refused');}return;}
        if(!connection.id)return;
        if(message.type==='input')room.input(connection.id,message);
        if(message.type==='action')room.action(connection.id,message);
        if(message.type==='ping')send(peer,{type:'pong',time:message.time});
      },
      close(){if(!peers.has(peer))return;clearTimeout(timeout);if(connection.id)room.remove(connection.id);peers.delete(peer);broadcast();},
    };
  }
  // Body of GET /api/server.
  const status=()=>({name:'Field Warfare — '+room.mapConfig.name,players:room.humanCount,bots:room.players.size-room.humanCount,fillBots:room.fillBots,mode:room.rules.mode,modeFixed:room.modeFixed,rules:room.rules,rulesFixed:room.rulesFixed,scores:room.scores,elapsed:room.elapsed,remaining:room.remaining,mapId:room.mapId,mapFixed:room.mapFixed,botDifficulty:room.botDifficulty,difficultyFixed:room.difficultyFixed,capacity:MAX_HUMANS,phase:room.phase,teams:Object.fromEntries((room.rules.mode==='ffa'?['ffa']:['blue','red']).map(team=>[team,room.actors.filter(p=>p.team===team).length]))});
  // A room is announced on the local network only while someone plays in it,
  // under the name of its first human. Live details come from /api/server.
  const host=()=>room.actors.find(p=>!p.isBot)?.name||null;
  let previous=performance.now(),accumulator=0;
  const tick=autoTick?setInterval(()=>{
    const now=performance.now();accumulator+=Math.min((now-previous)/1000,.5);previous=now;
    while(accumulator>=1/30){room.tick(1/30);accumulator-=1/30;}
    broadcast();
  },1000/30):null;tick?.unref?.();
  return {room,broadcast,connect,status,host,close(){if(tick)clearInterval(tick);for(const peer of peers.keys())peer.terminate();peers.clear();}};
}
