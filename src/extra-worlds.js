import {laddersFor} from './ladders.js';
import {buildMoreWorld,PERIMETER} from './more-worlds.js';
// These boxes drive both rendering and authoritative movement/shot collision.
export function createExtraWorld(id){
 const boxes=[],obstacles=[],solids=[];
 function box(w,h,d,x,y,z,material='concrete',{solid=true,walk=true,rotation=0}={}){
  const b={w,h,d,x,y,z,material,solid,walk,rotation};boxes.push(b);
  if(solid){const bounds={minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2};solids.push({...bounds,minY:y-h/2,maxY:y+h/2});if(walk)obstacles.push(bounds);}return b;
 }
 const decor=(w,h,d,x,y,z,m,rotation=0)=>box(w,h,d,x,y,z,m,{solid:false,walk:false,rotation});
 const overhead=(w,h,d,x,y,z,m)=>box(w,h,d,x,y,z,m,{walk:false});
 const ground=(w,d,x,z,m,y=.08)=>decor(w,.08,d,x,y,z,m);
 function doorWall(axis,fixed,center,length,height,material,opening=2.8){
  const part=(length-opening)/2;
  for(const side of [-1,1])axis==='z'?box(part,height,.35,center+side*(opening/2+part/2),height/2,fixed,material):box(.35,height,part,fixed,height/2,center+side*(opening/2+part/2),material);
  axis==='z'?overhead(opening,height-2.45,.35,center,2.45+(height-2.45)/2,fixed,material):overhead(.35,height-2.45,opening,fixed,2.45+(height-2.45)/2,center,material);
 }
 function windowWall(z,x,w,material){
  box(w,1,.35,x,.5,z,material);overhead(w,1.05,.35,x,2.875,z,material);
  for(const side of [-1,1])box(.45,1.35,.35,x+side*(w/2-.225),1.675,z,material);
  decor(w+.15,.12,.5,x,1.03,z,'white');decor(.07,1.3,.08,x,1.7,z,'white');
 }
 // The harbour opens onto the sea to the east; the arena edge still stops players.
 const [wallHeight,wallMaterial]=PERIMETER[id]||PERIMETER.railway;
 for(const [w,d,x,z]of [[64,.5,0,-32],[64,.5,0,32],[.5,64,-32,0],[.5,64,32,0]])if(!(id==='harbor'&&x===32))box(w,wallHeight,d,x,wallHeight/2,z,wallMaterial);
 if(['desert','market','harbor'].includes(id))buildMoreWorld(id,{box,decor,overhead,ground,doorWall});
 else if(id==='gardens'){
  ground(150,150,0,0,'grass',-.02);ground(64,10,0,0,'asphalt',.02);
  for(const z of [-6,6])ground(64,2,0,z,'pavement');
  for(let x=-28;x<31;x+=6)ground(3,.14,x,0,'yellow',.09);
  for(const side of [-1,1]){
   const z=14*side,paint=side===1?'ochre':'teal';
   ground(14,10,0,z,'wood',.12);ground(20,6,0,24*side,'lawn');// Paths sit 2 cm above the lawn and sidewalk so coplanar tops never z-fight.
   ground(2.8,8,0,6*side,'pavement',.1);ground(2.8,10,0,24*side,'pavement',.1);
   for(const x of [-7,7])box(.35,3.4,10,x,1.7,z,paint);
   for(const face of [-1,1]){
    const wz=z+face*5;windowWall(wz,-4.2,5.6,paint);windowWall(wz,4.2,5.6,paint);overhead(2.8,.95,.35,0,2.925,wz,paint);
    for(const x of [-1.5,1.5])decor(.15,2.5,.5,x,1.25,wz,'white');
   }
   doorWall('z',z,0,14,3.2,'cream',3);
   overhead(15,.2,11,0,3.5,z,'white');
   for(const slope of [-1,1])decor(8,.2,11,slope*3.6,4.35,z,'roof',-slope*.23);
   box(3.2,.85,1.2,-4,.425,z-side*2.7,'sofa');box(.7,.7,3,-5.7,.35,z-side*2.7,'sofa');
   box(2,1,1.2,4,.5,z+side*2.5,'wood');box(1.3,1.8,.8,-5.7,.9,z+side*3.4,'cabinet');
   decor(4.5,.03,2.6,-3.4,.17,z-side*2.6,'rug');decor(2.8,.07,.35,0,.2,z-side*5.5,'wood');
   // Garden fences leave generous side lanes around both houses.
   for(const x of [-19,19])box(.2,1.45,20,x,.725,20*side,'wood');
   for(const x of [-13,13])box(12,1.45,.2,x,.725,30*side,'wood');
   box(4,2.5,3,13,1.25,25*side,'shed');overhead(4.4,.18,3.4,13,2.6,25*side,'roof');
   box(3.4,.85,1.2,-13,.425,24*side,'hedge');decor(2,.15,2,-10,.7,26*side,'wood');
   for(const x of [-24,24]){box(.6,3,.6,x,1.5,21*side,'trunk');decor(5,3.5,5,x,4.2,21*side,'leaves');}
  }
  function car(x,z,color,length=4.6){box(length,1.1,2.2,x,.55,z,color);box(length*.55,.65,1.95,x,1.35,z,'carGlass');overhead(length*.56,.12,2,x,1.72,z,color);for(const dx of [-length*.32,length*.32])for(const dz of [-1.13,1.13])decor(.75,.65,.2,x+dx,.4,z+dz,'rubber');}
  car(-3,0,'bus',7.8);car(12,1,'red');
  for(const x of [-23,22]){box(.2,5,.2,x,2.5,-5.4,'steel');decor(1.3,.15,.4,x+.5,5,-5.4,'steel');}
  // Houses beyond the perimeter give the arena a residential skyline.
  for(const x of [-48,-32,-16,0,16,32,48])for(const z of [-45,45]){decor(11,4,9,x,2,z,'cream');decor(12,.7,10,x,4.1,z,'roof');}
 }else{
  ground(150,150,0,0,'gravel',-.02);
  for(const x of [-9,9]){
   ground(6,62,x,0,'ballast');for(const dx of [-.85,.85])decor(.12,.1,62,x+dx,.13,0,'steel');
   for(let z=-30;z<=30;z+=1.8)decor(3,.08,.25,x,.11,z,'wood');// sleepers stand proud of the ballast
  }
  for(const x of [-15,15]){ground(3,56,x,0,'pavement',.1);for(let z=-26;z<=28;z+=4)ground(.15,2,x+(x>0?-1.2:1.2),z,'yellow',.17);}
  function wagon(x,z,color){
   box(4,3.4,11,x,1.7,z,color);overhead(4.25,.2,11.2,x,3.5,z,'rust');
   for(const dx of [-2.03,2.03])for(let dz=-5;dz<=5;dz+=1)decor(.08,3.1,.1,x+dx,1.8,z+dz,'steel');
   for(const dx of [-2.05,2.05])for(const dz of [-3.8,3.8])decor(.15,.9,1,x+dx,.45,z+dz,'rubber');
  }
  wagon(-9,-16,'red');wagon(-9,11,'green');wagon(9,-9,'ochre');wagon(9,19,'red');
  ground(12,24,-23,-3,'pavement',.12);
  for(const z of [-15,9])box(12,4,.4,-23,2,z,'brick');
  doorWall('x',-29,-3,24,4,'brick',4);doorWall('x',-17,-3,24,4,'brick',4);
  overhead(13,.25,25,-23,4.2,-3,'roof');
  for(const z of [-11,5]){box(2,1.3,3,-26,.65,z,'green');box(1.5,2,2,-20,1,z,'cabinet');}
  // A small office on the opposite side provides another interior route.
  ground(8,12,24,-12,'wood',.12);box(8,3.2,.35,24,1.6,-18,'cream');box(.35,3.2,12,28,1.6,-12,'cream');
  doorWall('x',20,-12,12,3.2,'cream',3);doorWall('z',-6,24,8,3.2,'cream',3);overhead(9,.2,13,24,3.4,-12,'roof');box(2,1.1,1.5,25.5,.55,-15,'wood');
  for(const [x,z]of [[-2,-22],[3,14],[23,8],[-23,19],[24,-23]]){box(2.6,1.2,2.3,x,.6,z,'green');decor(2.8,.12,2.5,x,1.26,z,'wood');}
  for(const [x,z]of [[-14,-26],[14,28],[-14,28],[14,-26]]){box(.18,5.5,.18,x,2.75,z,'steel');decor(.7,.45,.25,x,5,z,'signal');}
  for(const x of [-44,44])for(const z of [-32,0,32]){decor(16,8,22,x,4,z,'brick');decor(17,.6,23,x,8.2,z,'roof');}
 }
 return {id,boxes,obstacles,solids,ladders:laddersFor(id)};
}
