import {app,BrowserWindow,dialog,ipcMain,shell} from 'electron';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createGameServer} from '../server/server.js';
import {version} from '../package.json';
import en from '../src/locales/en/data.js';
import fr from '../src/locales/fr/data.js';
import es from '../src/locales/es/data.js';
import pt from '../src/locales/pt/data.js';
import de from '../src/locales/de/data.js';
import ja from '../src/locales/ja/data.js';

// Desktop app (Windows, macOS). The game server runs inside the app: it
// serves the page to this window and to browsers of the local network, hosts
// the online room and announces it (Bonjour/mDNS) while someone plays in it.
// Its port is chosen in the game settings and kept in the app's data folder.
const PORT=4173;
// The startup error box has no page to translate it: it follows the system
// language. Port errors go back to the page as i18n keys with their values,
// {ok:false,error:key,vars}, for the page to show as t(error,vars).
const CATALOGS={en,fr,es,pt,de,ja};
const systemText=(key,vars={})=>(CATALOGS[app.getLocale().toLowerCase().split(/[-_]/)[0]]?.[key]??en[key]).replace(/\{(\w+)\}/g,(match,name)=>name in vars?String(vars[name]):match);
let gameServer=null,mainWindow=null,quitting=false,carried=null;

const validPort=port=>Number.isInteger(port)&&port>=1024&&port<=65535;
const configFile=()=>path.join(app.getPath('userData'),'server.json');
async function configuredPort(){try{const {port}=JSON.parse(await readFile(configFile(),'utf8'));return validPort(port)?port:PORT;}catch{return PORT;}}
const serverOptions=()=>({host:'0.0.0.0',root:path.join(app.getAppPath(),'dist'),discovery:true,version});
async function listen(port){
  try{return await createGameServer({...serverOptions(),port});}
  // Another app or a dedicated server already uses the port on this machine.
  catch(error){if(error.code!=='EADDRINUSE')throw error;return createGameServer({...serverOptions(),port:0});}
}
const origin=()=>`http://127.0.0.1:${gameServer.address.port}`;
function createWindow(){
  mainWindow=new BrowserWindow({width:1440,height:900,minWidth:960,minHeight:600,backgroundColor:'#151916',title:'Field Warfare',icon:path.join(app.getAppPath(),'dist/icon-512.png'),autoHideMenuBar:true,show:false,webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false,preload:path.join(app.getAppPath(),'build/desktop/preload.cjs')}});
  mainWindow.once('ready-to-show',()=>mainWindow.show());
  mainWindow.on('closed',()=>{mainWindow=null;});
  // Links leave for the system browser; the window stays on the game.
  mainWindow.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//.test(url))shell.openExternal(url);return {action:'deny'};});
  mainWindow.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(origin()+'/'))event.preventDefault();});
  mainWindow.webContents.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&input.key==='F11'){event.preventDefault();mainWindow.setFullScreen(!mainWindow.isFullScreen());}});
  mainWindow.loadURL(origin()+'/');
}

ipcMain.handle('fw:server-port',async()=>({port:gameServer.address.port,configured:await configuredPort()}));
// A new port starts a second server first: if the port is taken, nothing
// changes. Then the old server closes and the window moves to the new
// address, carrying its saved settings along.
ipcMain.handle('fw:set-server-port',async(event,port,storage)=>{
  if(!validPort(port))return {ok:false,error:'data.desktop.portRange'};
  if(port!==gameServer.address.port){
    let next;try{next=await createGameServer({...serverOptions(),port});}
    catch(error){return {ok:false,error:error.code==='EADDRINUSE'?'data.desktop.portInUse':error.code==='EACCES'?'data.desktop.portReserved':error.message,vars:{port}};}
    const old=gameServer;gameServer=next;carried=storage&&typeof storage==='object'?storage:null;
    setTimeout(()=>{mainWindow?.loadURL(origin()+'/');old.close();},50);
  }
  await writeFile(configFile(),JSON.stringify({port}));
  return {ok:true,port};
});
ipcMain.on('fw:carried-storage',event=>{event.returnValue=carried;carried=null;});

if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();}});
  app.whenReady().then(async()=>{gameServer=await listen(await configuredPort());createWindow();app.on('activate',()=>{if(!mainWindow)createWindow();});})
    .catch(error=>{console.error(error);dialog.showErrorBox('Field Warfare',systemText('data.desktop.serverFailed',{error:error.message}));app.quit();});
  app.on('window-all-closed',()=>app.quit());
  // Close the room and withdraw the announce before leaving.
  app.on('will-quit',event=>{
    if(quitting||!gameServer)return;event.preventDefault();quitting=true;
    Promise.race([gameServer.close(),new Promise(resolve=>setTimeout(resolve,2000))]).finally(()=>app.quit());
  });
}
