// Native apps: the web build plus what each shell needs. Electron (Windows,
// macOS) gets its main process as one bundle with the game server inside;
// electron-builder and the iOS project get the game icon, and the iOS
// project the version of package.json.
import {build} from 'esbuild';
import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {iconPNG} from './icons.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
execFileSync(process.execPath,[path.join(root,'scripts/build.mjs')],{cwd:root,stdio:'inherit'});
await build({entryPoints:[path.join(root,'desktop/main.js')],bundle:true,platform:'node',format:'esm',target:'node22',minify:true,legalComments:'eof',outfile:path.join(root,'build/desktop/main.mjs'),external:['electron','bufferutil','utf-8-validate'],banner:{js:"import {createRequire as __appCreateRequire} from 'node:module';const require=__appCreateRequire(import.meta.url);"}});
// The page's bridge to the app (server port), next to the main process.
await copyFile(path.join(root,'desktop/preload.cjs'),path.join(root,'build/desktop/preload.cjs'));
await mkdir(path.join(root,'build/resources'),{recursive:true});
const icon=await iconPNG(1024);
await writeFile(path.join(root,'build/resources/icon.png'),icon);
const ios=path.join(root,'ios/App/App/Assets.xcassets');
await writeFile(path.join(ios,'AppIcon.appiconset/AppIcon-512@2x.png'),await iconPNG(1024,1,{opaque:true}));
// Launch screen: the logo small on the game's background.
const splash=await iconPNG(2732,.16,{opaque:true});
for(const name of ['splash-2732x2732.png','splash-2732x2732-1.png','splash-2732x2732-2.png'])await writeFile(path.join(ios,'Splash.imageset',name),splash);
// iOS shows MARKETING_VERSION; the build number takes the same x.y.z, so
// each new version uploads with a higher one.
const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error(`Invalid version in package.json: ${version}`);
const xcode=path.join(root,'ios/App/App.xcodeproj/project.pbxproj'),project=await readFile(xcode,'utf8');
const versioned=project.replace(/MARKETING_VERSION = [^;]*;/g,`MARKETING_VERSION = ${version};`).replace(/CURRENT_PROJECT_VERSION = [^;]*;/g,`CURRENT_PROJECT_VERSION = ${version};`);
if(versioned!==project)await writeFile(xcode,versioned);
console.log(`Apps ready → build/desktop (Electron), iOS and desktop icons, iOS project at ${version}.`);
