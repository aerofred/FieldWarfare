import {build} from 'esbuild';
import {zipSync} from 'fflate';
import {mkdir,mkdtemp,readFile,writeFile,readdir,copyFile,cp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {isBuiltin} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
if(!/^\d+\.\d+\.\d+$/.test(manifest.version))throw new Error('Invalid package version.');
const basename=`field-warfare-${manifest.version}-server`,out=path.join(root,'releases');
const sha256=data=>createHash('sha256').update(data).digest('hex');
execFileSync('tar',['--version'],{stdio:'ignore'});
execFileSync(process.execPath,[path.join(root,'scripts/build.mjs')],{cwd:root,stdio:'inherit'});
await mkdir(out,{recursive:true});
const stageBase=await mkdtemp(path.join(tmpdir(),'field-warfare-release-'));
const stage=path.join(stageBase,basename);
async function files(directory,prefix=''){
  const result=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const relative=prefix+entry.name;
    if(entry.isDirectory())result.push(...await files(path.join(directory,entry.name),relative+'/'));
    else if(entry.isFile())result.push({name:relative,data:await readFile(path.join(directory,entry.name))});
    else throw new Error(`Refused non-regular entry: ${relative}`);
  }
  return result.sort((a,b)=>a.name.localeCompare(b.name));
}
try{
  await mkdir(stage);await cp(path.join(root,'dist'),path.join(stage,'dist'),{recursive:true});
  const bundle=await build({entryPoints:[path.join(root,'scripts/release-entry.mjs')],bundle:true,platform:'node',format:'esm',target:'node22',minify:true,legalComments:'eof',metafile:true,outfile:path.join(stage,'server.mjs'),external:['bufferutil','utf-8-validate'],banner:{js:"import {createRequire as __releaseCreateRequire} from 'node:module';const require=__releaseCreateRequire(import.meta.url);"}});
  for(const output of Object.values(bundle.metafile.outputs))for(const dependency of output.imports)if(dependency.external&&!isBuiltin(dependency.path)&&!['bufferutil','utf-8-validate'].includes(dependency.path))throw new Error(`Dependency not bundled into the server: ${dependency.path}`);
  await writeFile(path.join(stage,'package.json'),JSON.stringify({name:'field-warfare-server',version:manifest.version,private:true,type:'module',engines:{node:'>=22'},scripts:{start:'node server.mjs'}},null,2)+'\n');
  // The shipped guide names this release's folder and archives.
  await writeFile(path.join(stage,'DEPLOYMENT.txt'),(await readFile(path.join(root,'DEPLOYMENT.txt'),'utf8')).replaceAll('<version>',manifest.version));
  await mkdir(path.join(stage,'licenses'));
  await copyFile(path.join(root,'node_modules/ws/LICENSE'),path.join(stage,'licenses/ws-LICENSE.txt'));
  await copyFile(path.join(root,'node_modules/three/LICENSE'),path.join(stage,'licenses/three-LICENSE.txt'));
  for(const dependency of ['bonjour-service','multicast-dns','dns-packet','@leichtgewicht/ip-codec','thunky','fast-deep-equal'])await copyFile(path.join(root,'node_modules',dependency,'LICENSE'),path.join(stage,`licenses/${dependency.replace('/','-').replace('@','')}-LICENSE.txt`));
  const content=await files(stage);
  await writeFile(path.join(stage,'release-manifest.json'),JSON.stringify({name:'Field Warfare',version:manifest.version,node:'>=22',files:Object.fromEntries(content.map(f=>[f.name,sha256(f.data)]))},null,2)+'\n');
  const archiveFiles=await files(stage),zipPath=path.join(out,basename+'.zip'),tarPath=path.join(out,basename+'.tar.gz');
  await writeFile(zipPath,zipSync(Object.fromEntries(archiveFiles.map(f=>[`${basename}/${f.name}`,f.data])),{level:9}));
  execFileSync('tar',['-czf',tarPath,'-C',stageBase,basename],{stdio:'inherit'});
  const checksums=await Promise.all([zipPath,tarPath].map(async archive=>`${sha256(await readFile(archive))}  ${path.basename(archive)}`));
  await writeFile(path.join(out,basename+'-SHA256SUMS.txt'),checksums.join('\n')+'\n');
  console.log(`Packages ready:\n${zipPath}\n${tarPath}\n${archiveFiles.length} files, no npm install needed on the target server.`);
}finally{
  // Only remove the newly created, task-owned temporary directory.
  if(path.dirname(path.resolve(stageBase))!==path.resolve(tmpdir())||!path.basename(stageBase).startsWith('field-warfare-release-'))throw new Error('Temporary cleanup refused: unexpected path.');
  await rm(stageBase,{recursive:true,force:true});
}
