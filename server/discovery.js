import {Bonjour} from 'bonjour-service';
import {hostname,networkInterfaces} from 'node:os';
import {DISCOVERY_TYPE} from './hub.js';

// Bonjour/mDNS presence on the local network (_fieldwarfare._tcp), the same
// service the iOS app announces and browses with Network.framework. TXT
// records stay stable (id, version, host name); players read the live state
// of each game from its /api/server.
export function lanAddresses(port){
  const result=[];for(const entries of Object.values(networkInterfaces()))for(const address of entries||[])if(address.family==='IPv4'&&!address.internal)result.push(`http://${address.address}:${port}`);
  return result;
}
export function startDiscovery({hub,port,version,log=console.warn}){
  const id=Math.random().toString(36).slice(2,10),report=error=>log(`Local network discovery unavailable: ${error.message}`);
  const bonjour=new Bonjour({},report);bonjour.server?.mdns?.on?.('error',report);
  const browser=bonjour.find({type:DISCOVERY_TYPE});
  let service=null;
  const refresh=()=>{
    const host=hub.host();
    if(host&&!service){service=bonjour.publish({name:`Field Warfare ${hostname()} ${port}`.slice(0,63),type:DISCOVERY_TYPE,port,txt:{id,v:version,host}});service.on('error',report);}
    else if(!host&&service){service.stop();service=null;}
  };
  const timers=[setInterval(refresh,1000),setInterval(()=>browser.update(),15000)];for(const timer of timers)timer.unref();
  return {
    id,
    servers(){
      const list=[];
      for(const s of browser.services){
        if(s.txt?.id===id)continue;
        const ip=[s.referer?.address,...(s.addresses||[])].find(a=>/^\d+\.\d+\.\d+\.\d+$/.test(a||''));
        if(ip&&Number.isInteger(s.port))list.push({id:String(s.txt?.id||s.name),host:String(s.txt?.host||s.name).slice(0,40),version:String(s.txt?.v||''),address:`http://${ip}:${s.port}`});
      }
      return list;
    },
    close(){for(const timer of timers)clearInterval(timer);browser.stop();return new Promise(resolve=>bonjour.unpublishAll(()=>bonjour.destroy(resolve)));},
  };
}
