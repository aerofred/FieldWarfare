import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runServer} from '../server/cli.js';

if(Number(process.versions.node.split('.')[0])<22){
  console.error('Field Warfare requires Node.js 22 or later.');process.exitCode=1;
}else{
  // import.meta.url refers to server.mjs at the root of the extracted release.
  await runServer({root:path.join(path.dirname(fileURLToPath(import.meta.url)),'dist')});
}
