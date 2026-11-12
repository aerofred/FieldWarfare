// Bridge between the game page and the desktop app: the port of the game
// server built into the app. Sandboxed preloads are CommonJS.
const {contextBridge,ipcRenderer}=require('electron');

// Web storage belongs to an address: when the port changes, the settings of
// the previous address are written here before the game reads them.
try{const carried=ipcRenderer.sendSync('fw:carried-storage');if(carried)for(const [key,value] of Object.entries(carried))localStorage.setItem(key,value);}catch{}

contextBridge.exposeInMainWorld('fieldWarfareDesktop',{
  serverPort:()=>ipcRenderer.invoke('fw:server-port'),
  setServerPort:port=>{
    const storage={};try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);storage[key]=localStorage.getItem(key);}}catch{}
    return ipcRenderer.invoke('fw:set-server-port',port,storage);
  }
});
