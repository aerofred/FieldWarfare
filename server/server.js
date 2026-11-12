import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer,WebSocket} from 'ws';
import {createHub} from './hub.js';
import {startDiscovery,lanAddresses} from './discovery.js';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const loopback=address=>/^(127\.|::1$|::ffff:127\.)/.test(address||'');
export async function createGameServer({port=4173,host='0.0.0.0',root=path.join(projectRoot,'dist'),autoTick=true,fillBots=true,botDifficulty=null,mapId=null,mode=null,discovery=false,version='0.0.0'}={}){
  const hub=createHub({fillBots,botDifficulty,mapId,mode,autoTick}),room=hub.room,types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8'};
  let lan=null;
  const json=(req,res,data)=>res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}).end(req.method==='HEAD'?undefined:JSON.stringify(data));
  root=path.resolve(root);
  const server=http.createServer(async(req,res)=>{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(pathname==='/api/server'){json(req,res,hub.status());return;}
      // Games announced on the local network. Only a page opened on this
      // machine learns the addresses under which it can be reached.
      if(pathname==='/api/lan'&&lan){json(req,res,{servers:lan.servers(),addresses:loopback(req.socket.remoteAddress)?lanAddresses(server.address().port):[]});return;}
      const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
      if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
      const data=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(req.method==='HEAD'?undefined:data);
    }catch{res.writeHead(404).end('Not found');}
  });
  // Listen before the WebSocket server attaches: a taken port then only
  // rejects this promise (the WebSocket server would re-emit it uncaught).
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);}).catch(error=>{hub.close();throw error;});
  const wss=new WebSocketServer({server,path:'/multiplayer',maxPayload:4096,perMessageDeflate:false}),alive=new Map();
  wss.on('connection',socket=>{
    const peer={send:text=>socket.send(text),close:(code,reason)=>socket.close(code,reason),terminate:()=>socket.terminate(),get open(){return socket.readyState===WebSocket.OPEN;},get bufferedAmount(){return socket.bufferedAmount;}};
    const connection=hub.connect(peer);if(!connection)return;alive.set(socket,true);
    socket.on('pong',()=>alive.set(socket,true));socket.on('error',()=>{});
    socket.on('message',(data,isBinary)=>connection.message(data,isBinary));
    socket.on('close',()=>{alive.delete(socket);connection.close();});
  });
  const heartbeat=setInterval(()=>{for(const [socket,ok]of alive){if(!ok){socket.terminate();continue;}alive.set(socket,false);socket.ping();}},15000);heartbeat.unref();
  if(discovery)lan=startDiscovery({hub,port:server.address().port,version});
  let closing;
  return {server,wss,hub,room,broadcast:hub.broadcast,discovery:lan,address:server.address(),close(){if(closing)return closing;closing=(async()=>{clearInterval(heartbeat);hub.close();await lan?.close();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});})();return closing;}};
}
