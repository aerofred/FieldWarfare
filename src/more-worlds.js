// Layouts of the desert outpost, the covered market and the snowy harbour.
// Like the other extra maps they are plain boxes: the same list drives the
// renderer, player and bot movement and the server's shot traces.
// Blue spawns along z ≈ +27, red along z ≈ −27; every route used by bots
// stays on the ground, roofs and walkways are bonus positions for players.
export function buildMoreWorld(id,{box,decor,overhead,ground,doorWall}){
 // A wall with several doorways, along x (axis 'z', fixed z) or along z (axis 'x', fixed x).
 function doorsWall(axis,fixed,from,to,height,material,doors,width=2){
  const cuts=[from,...doors.flatMap(c=>[c-width/2,c+width/2]),to];
  for(let i=0;i<cuts.length;i+=2){const a=cuts[i],b=cuts[i+1],len=b-a,c=(a+b)/2;if(len>.01)axis==='z'?box(len,height,.35,c,height/2,fixed,material):box(.35,height,len,fixed,height/2,c,material);}
  for(const c of doors)axis==='z'?overhead(width,height-2.45,.35,c,2.45+(height-2.45)/2,fixed,material):overhead(.35,height-2.45,width,fixed,2.45+(height-2.45)/2,c,material);
 }
 const crate=(x,z,m='crate',s=1.2,h=1)=>box(s,h,s,x,h/2,z,m);
 if(id==='desert'){
  ground(150,150,0,0,'sand',-.02);ground(6,62,0,0,'dirt');ground(62,5,0,0,'dirt',.1);
  // Plaza and well.
  box(2.4,.9,2.4,0,.45,0,'stone');decor(.18,2.2,.18,-1,1.1,0,'wood');decor(.18,2.2,.18,1,1.1,0,'wood');decor(2.3,.16,.16,0,2.2,0,'wood');
  // Flat-roofed houses reached by ladders.
  for(const [w,d,x,z]of [[8,6,-12,8],[8,6,16,-16],[6,8,-22,-2],[6,8,22,6]]){box(w,3,d,x,1.5,z,'adobe');decor(w+.2,.25,d+.2,x,3.1,z,'adobeDark');}
  // Two houses that can be crossed, doors north and south.
  for(const [x,z]of [[5,11],[-5,-11]]){
   for(const face of [-1,1])doorWall('z',z+face*3.5,x,10,3.2,'adobe',2.4);
   for(const side of [-1,1])box(.35,3.2,7,x+side*5,1.6,z,'adobe');
   overhead(10.4,.25,7.4,x,3.33,z,'adobeDark');ground(9.6,6.6,x,z,'rug',.11);box(2.2,.8,1,x+2.5,.4,z,'wood');box(1.2,1.6,.6,x-4.3,.8,z+2.6,'cabinet');
  }
  // Water tower over the eastern track.
  for(const [dx,dz]of [[-2.5,-2.5],[2.5,-2.5],[-2.5,2.5],[2.5,2.5]])box(.5,7,.5,14+dx,3.5,-4+dz,'wood');
  overhead(5.4,3,5.4,14,8.5,-4,'tank');decor(6,.15,6,14,7,-4,'wood');
  // Hangar, wide open to the south.
  box(12,4.5,.35,-17,2.25,-25,'tin');box(.35,4.5,8,-23,2.25,-21,'tin');doorWall('x',-11,-21,8,4.5,'tin',2.6);doorWall('z',-17,-17,12,4.5,'tin',6);
  overhead(12.6,.2,8.6,-17,4.6,-21,'tin');ground(11.6,7.6,-17,-21,'concrete',.11);
  for(const [x,z]of [[-21.4,-23.5],[-12.8,-23.4],[-21.5,-19]])crate(x,z,'crate',1.4,1.2);
  // Wrecked pick-ups and low walls to vault over.
  for(const [x,z,w,d]of [[-8,20,4.4,2],[24,-6,4.4,2],[-24,12,2,4.4],[8,-24,2,4.4]]){box(w,1.3,d,x,.65,z,'rust');decor(w>d?1.6:1.7,.7,w>d?1.7:1.6,x+(w>d?-.6:0),1.65,z+(w>d?0:-.6),'rust');}
  for(const [w,d,x,z]of [[6,.5,-14,16],[6,.5,14,-22],[.5,5,-9,-1],[.5,5,9,3],[5,.5,22,18],[5,.5,-22,-12]])box(w,1.1,d,x,.55,z,'adobe');
  for(const [x,z]of [[4,-4],[-3,-5],[18,12],[-18,22],[26,-24],[-27,16],[-6,4.5]])crate(x,z);
  // Sandbag positions in front of both flag compounds.
  for(const side of [-1,1])for(const x of [-5,5])box(4,.9,.7,x,.45,22*side,'sandbag');
  for(const [x,z]of [[-27,-27],[27,26],[-27,6],[27,-12]]){box(.45,4.5,.45,x,2.25,z,'palmTrunk');decor(1.3,.9,1.3,x,4.65,z,'palm');}
  // Market awnings on the plaza, purely overhead dressing.
  for(const [x,z]of [[-6,-3.5],[6,-3.5]]){decor(3.2,.08,2.2,x,2.6,z,'awning');for(const dx of [-1.5,1.5])decor(.08,2.6,.08,x+dx,1.3,z+1,'wood');}
  // Village roofs beyond the walls, all outside the 64 m arena.
  for(const [x,z]of [[-46,-30],[-46,0],[-46,30],[46,-30],[46,0],[46,30],[-20,-46],[0,-46],[20,-46],[-20,46],[0,46],[20,46]]){decor(12,5,10,x,2.5,z,'adobe');decor(12.4,.4,10.4,x,5.2,z,'adobeDark');}
 }else if(id==='market'){
  ground(150,150,0,0,'asphalt',-.02);ground(16,62,0,0,'cobble',.06);for(const side of [-1,1])ground(62,10,0,26*side,'cobble',.06);
  for(const x of [-23,23])for(const s of [-1,1])ground(.6,10,x+s*.3,16*s,'pavement',.1);
  // The covered market hall: tall portals north and south, side doors east and west.
  for(const face of [-1,1]){box(6,6,.4,-7,3,8*face,'brick');box(6,6,.4,7,3,8*face,'brick');overhead(8,1.8,.4,0,5.1,8*face,'brick');}
  for(const side of [-1,1])doorWall('x',10*side,0,16,6,'brick',3);
  overhead(20.6,.3,16.6,0,6.15,0,'roof');ground(19.6,15.6,0,0,'tiles',.1);
  for(const [x,z]of [[-5,-4],[5,-4],[-5,4],[5,4]])box(.5,6,.5,x,3,z,'iron');
  for(const [x,z,w,d]of [[-7.8,-2,3,1.2],[7.8,2,3,1.2],[-2.5,-5.5,3,1.2],[2.5,5.5,3,1.2],[-7.8,3.2,3,1.2],[7.8,-3.2,3,1.2]]){box(w,1,d,x,.5,z,'stall');decor(w+.4,.06,d+.8,x,2.4,z,'awning');}
  // Four blocks of two shops, each with a street door and a back-yard door.
  for(const sx of [-1,1])for(const sz of [-1,1]){
   const x=15*sx,z=16*sz,inner=8*sx,outer=22*sx,m=sz>0?'plaster':'plasterBlue';
   doorsWall('x',inner,z-5,z+5,4,m,[z-2.5,z+2.5]);doorsWall('x',outer,z-5,z+5,4,m,[z-2.5,z+2.5]);
   for(const zz of [z-5,z,z+5])box(14,4,.35,x,2,zz,m);
   overhead(14.35,.25,10.35,x,4.125,z,'roof');ground(13.6,9.6,x,z,'tiles',.11);
   for(const dz of [-2.5,2.5])box(3,1,.8,x+sx*1.5,.5,z+dz*1.64,'counter');
  }
  // Kiosk on the north square, fountain on the south square.
  for(const [dx,dz]of [[-2.5,-2.5],[2.5,-2.5],[-2.5,2.5],[2.5,2.5]])box(.3,3,.3,dx,1.5,-24+dz,'iron');overhead(6.2,.25,6.2,0,3.12,-24,'roof');
  box(3.2,.8,3.2,0,.4,25,'stone');decor(.5,1.4,.5,0,1.5,25,'stone');
  // Back yards: bins, a delivery van, the city bus and pallets.
  for(const [x,z]of [[-26,-4],[-27,24],[26,10],[27,-20]])box(1.8,1.3,1.2,x,.65,z,'dumpster');
  box(2.6,2.9,8,27,1.45,-2,'bus');decor(2.66,.9,7.4,27,2.2,-1.9,'carGlass');decor(2.62,.12,8.02,27,1.25,-2,'awning');
  box(2.2,2.3,5,-27,1.15,-16,'van');
  for(const [x,z]of [[-5,15],[5,-15],[-5,-18],[5,18]])box(2.1,1.1,4.4,x,.55,z,'carHit');// drawn in more-map.js
  for(const [x,z]of [[-25,6],[24,24],[-28,-26],[28,-26]])crate(x,z,'crate',1.2,1);
  // Taller façades beyond the walls make the skyline.
  for(const x of [-52,-36,-20,-4,12,28,44])for(const z of [-44,44]){decor(14,14+(x%3+3),10,x,7,z,'plaster');decor(14.4,.5,10.4,x,14.3+(x%3+3)/2,z,'roof');}
  for(const z of [-36,-12,12,36])for(const x of [-44,44]){decor(10,12,14,x,6,z,'plasterBlue');}
 }else if(id==='harbor'){
  ground(150,150,0,0,'snow',-.02);ground(8,62,27,0,'quay',.06);for(let z=-30;z<=30;z+=3)ground(.12,1.6,23.5,z,'yellow',.1);
  // Cold store: doors east and south.
  box(.35,5,12,-25,2.5,-15,'panel');box(14,5,.35,-18,2.5,-21,'panel');doorWall('x',-11,-15,12,5,'panel',3.2);doorWall('z',-9,-18,14,5,'panel',3.2);
  overhead(14.4,.3,12.4,-18,5.15,-15,'roof');ground(13.6,11.6,-18,-15,'concrete',.11);
  for(const x of [-21,-15])box(4,2.4,1,x,1.2,-19.6,'steel');box(1.4,1.3,1.4,-23,.65,-11.5,'crate');box(1.4,1.3,1.4,-13,.65,-19.3,'crate');
  // Open-sided fish auction hall.
  for(const x of [-24,-18,-12])for(const z of [11,21])box(.45,3.9,.45,x,1.95,z,'steel');overhead(12.8,.3,10.8,-18,4,16,'roof');ground(11.6,9.6,-18,16,'tiles',.1);
  for(const z of [13,19])box(4,.95,1.2,-18,.475,z,'steel');
  // Trawler on the slipway: hull on keel blocks, deck and wheelhouse reached by ladders.
  box(5,2,15,20,1.6,12,'hull');decor(5.1,.6,15.1,20,.3,12,'keel');decor(5.2,.25,15.2,20,2.65,12,'hullTop');
  const deck=2.6;
  box(.25,2.2,4,18.2,deck+1.1,15,'cabin');box(.25,2.2,4,21.8,deck+1.1,15,'cabin');box(3.6,2.2,.25,20,deck+1.1,17,'cabin');
  for(const x of [18.7,21.3])box(1,2.2,.25,x,deck+1.1,13,'cabin');overhead(1.6,.4,.25,20,deck+2,13,'cabin');overhead(4,.2,4.4,20,deck+2.3,15,'roof');
  decor(.18,6,.18,20,deck+3,8,'steel');decor(2.4,.1,.1,20,deck+4.6,8,'steel');decor(4,.04,.04,20,deck+5.2,10.5,'steel',.5);
  // Gantry crane over the central quay.
  for(const [dx,dz]of [[-4,-4],[4,-4],[-4,4],[4,4]])box(.8,9,.8,2+dx,4.5,-2+dz,'crane');
  overhead(9.6,.8,.8,2,9.4,-6,'crane');overhead(9.6,.8,.8,2,9.4,2,'crane');overhead(2.4,1.8,2,2,8.6,-2,'craneCab');decor(.06,4.6,.06,2,5.6,-2,'steel');decor(.6,.5,.4,2,3.2,-2,'yellow');
  // Raised walkway between the cold store and the crane.
  overhead(2,.25,20,-5.5,3.125,0,'grating');for(const z of [-9.5,-3,3,9.5])box(.3,3,.3,-5.5,1.5,z,'steel');
  // Containers, fish crates, a forklift and bollards along the quay edge.
  for(const [x,z,w,d,m]of [[8,-18,6,2.4,'containerRed'],[16,-22,2.4,6,'containerBlue'],[-8,22,6,2.4,'containerBlue'],[12,22,2.4,6,'containerRed']])box(w,2.6,d,x,1.3,z,m);
  overhead(6,2.6,2.4,8,3.9,-18,'containerBlue');
  for(const [x,z]of [[-4,16],[4,-12],[10,4],[24,-8],[-26,4],[-14,-4],[26,-26],[-28,26]])crate(x,z,'fishCrate',1.2,.9);
  box(1.4,1.2,2.2,-9,.6,-4,'yellow');decor(1.2,1.4,.1,-9,1.9,-5.05,'steel');
  for(let z=-27;z<=27;z+=9)box(.45,.6,.45,30.3,.3,z,'bollard');
  for(const z of [-44,44])for(const x of [-48,-28,-8,12]){decor(16,7,12,x,3.5,z,'panel');decor(16.4,.5,12.4,x,7.2,z,'roof');}
  for(const z of [-32,0,32]){decor(14,6,18,-46,3,z,'panel');decor(14.4,.5,18.4,-46,6.2,z,'roof');}
 }
}
export const PERIMETER={gardens:[2,'wood'],railway:[3,'concrete'],desert:[3,'adobe'],market:[4.5,'plaster'],harbor:[3,'fence']};
