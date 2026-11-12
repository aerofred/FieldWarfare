import {networkInterfaces} from 'node:os';
import {createGameServer} from './server.js';
import {botProfile,validBotLevel} from '../src/bot-ai.js';
import {mapConfig,validMap} from '../src/maps.js';
import {MODES,validMode} from '../src/modes.js';
import manifest from '../package.json' with {type:'json'};

export async function runServer({root}={}) {
  const port=Number(process.env.PORT||4173),host=process.env.HOST||'0.0.0.0',fillBots=process.env.BOTS!=='0',botDifficulty=process.env.BOT_DIFFICULTY||null,mapId=process.env.MAP||null,mode=process.env.MODE||null,discovery=process.env.DISCOVERY!=='0';
  try {
    if(!Number.isInteger(port)||port<0||port>65535)throw new Error('PORT must be an integer between 0 and 65535.');
    if(botDifficulty!==null&&!validBotLevel(botDifficulty))throw new Error('BOT_DIFFICULTY: recruit, soldier, veteran or elite.');
    if(mapId!==null&&!validMap(mapId))throw new Error('MAP: factory, gardens, railway, desert, market or harbor.');
    if(mode!==null&&!validMode(mode))throw new Error('MODE: assault, survival, tdm, ctf or ffa.');
    const gameServer=await createGameServer({port,host,root,fillBots,botDifficulty,mapId,mode,discovery,version:manifest.version});
    console.log(`Local: http://127.0.0.1:${gameServer.address.port}`);
    if(host==='0.0.0.0')for(const entries of Object.values(networkInterfaces()))for(const address of entries||[])if(address.family==='IPv4'&&!address.internal)console.log(`Network: http://${address.address}:${gameServer.address.port}`);
    console.log(`Multiplayer: 8 humans maximum. ${fillBots?'Bots: sides filled automatically (BOTS=0 to disable).':'Allied and enemy bots disabled: one human per side required (co-op enemies remain bots).'} Ctrl+C to stop.`);
    console.log(mode?`Fixed mode: ${MODES[mode].label} (rules chosen by the first player).`:'Mode and rules: chosen by the first player in an empty room.');
    if(fillBots)console.log(botDifficulty?`AI level fixed by the server: ${botProfile(botDifficulty).label}.`:'AI: the first player in an empty room chooses the level.');
    console.log(mapId?`Fixed map: ${mapConfig(mapId).name}.`:'Map: chosen by the first player in an empty room.');
    console.log(discovery?'Local network: game announced (Bonjour/mDNS) once the first player joins (DISCOVERY=0 to disable).':'Local network: announce disabled.');
    let stopping=false;
    const stop=async()=>{if(stopping)return;stopping=true;await gameServer.close();process.exit(0);};
    process.once('SIGINT',stop);process.once('SIGTERM',stop);
    return gameServer;
  }catch(error){console.error(error.code==='EADDRINUSE'?`Port ${port} is already in use. Stop the existing server or choose another PORT.`:error.message);process.exitCode=1;}
}
