import { build } from 'esbuild';
import { mkdir, copyFile, cp } from 'node:fs/promises';
import { writeIcons } from './icons.mjs';
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, sourcemap: false, outfile: 'dist/app.js', target: ['es2022'] });
await Promise.all(['index.html', 'style.css'].map(file => copyFile(file, `dist/${file}`)));
// The fonts ship with the game: the page never waits on the network to show up.
await cp('assets/fonts', 'dist/fonts', { recursive: true });
await writeIcons('dist');
console.log('Field Warfare built → dist/');
