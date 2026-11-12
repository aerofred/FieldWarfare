// All platforms use the same generated artwork, kept in the repository.
import sharp from 'sharp';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const SOURCE=fileURLToPath(new URL('../assets/branding/icon-soldier.png',import.meta.url));
const BACKGROUND='#151916';
let artwork;

// Trim the transparent export margin, keeping the rounded silhouette.
// Native iOS icons must be opaque; iOS supplies their final corner mask.
export async function iconPNG(size,scale=1,{opaque=false}={}){
 artwork??=sharp(SOURCE).trim({threshold:10}).png().toBuffer();
 const edge=Math.max(1,Math.round(size*scale));
 const image=await sharp(await artwork).resize(edge,edge,{fit:'contain',background:'#00000000'}).png().toBuffer();
 let canvas=sharp({create:{width:size,height:size,channels:4,background:opaque?BACKGROUND:'#00000000'}})
  .composite([{input:image,gravity:'centre'}]);
 if(opaque)canvas=canvas.flatten({background:BACKGROUND}).removeAlpha();
 return canvas.png().toBuffer();
}

export const MANIFEST={
 name:'Field Warfare',short_name:'Field Warfare',description:'Military FPS, solo against the AI or online.',lang:'en',
 start_url:'/',scope:'/',display:'fullscreen',orientation:'landscape',background_color:'#151916',theme_color:'#151916',
 icons:[
  {src:'/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
  {src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
  {src:'/icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'},
 ],
};

export async function writeIcons(dir){
 await Promise.all([
  ...[[32,'icon-32.png'],[180,'icon-180.png'],[192,'icon-192.png'],[512,'icon-512.png']]
   .map(async([size,name])=>writeFile(`${dir}/${name}`,await iconPNG(size,1,{opaque:size===180}))),
  iconPNG(512,.8,{opaque:true}).then(image=>writeFile(`${dir}/icon-maskable-512.png`,image)),
 ]);
 await writeFile(`${dir}/manifest.webmanifest`,JSON.stringify(MANIFEST,null,1));
}
