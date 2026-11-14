// Procedural audio: no samples are downloaded. Positional sounds use the
// camera as listener, arrive late with distance (343 m/s) and lose their
// highs through air absorption. A per-map convolution reverb adds the room.
const SPEED_OF_SOUND=343;
// Sounds start a few milliseconds ahead of the audio clock. Scheduled at the
// clock itself, a sound reaching the audio thread late (busy page, slow
// phone) skips its fade-in and starts with an audible click.
const LOOKAHEAD=.012;
// Placement of one sound, as a Web Audio 'equalpower' panner with the
// 'inverse' distance model would compute it: a PannerNode per sound makes
// WebKit load its HRTF database each time, a constant background load.
export const REF_DISTANCE=3,ROLLOFF=1.15,MAX_DISTANCE=150;
export function placement(source,listener,right,forward){
 const x=source.x-listener.x,y=source.y-listener.y,z=source.z-listener.z;
 const side=x*right.x+y*right.y+z*right.z,ahead=x*forward.x+y*forward.y+z*forward.z,flat=Math.hypot(side,ahead);
 // Front and back fold together, as in the equal-power panner.
 const pan=flat>1e-6?Math.asin(Math.max(-1,Math.min(1,side/flat)))*2/Math.PI:0;
 // The inverse model ignores maxDistance, as the specification has it.
 const d=Math.max(REF_DISTANCE,Math.hypot(x,y,z));
 return{pan,gain:REF_DISTANCE/(REF_DISTANCE+ROLLOFF*(d-REF_DISTANCE))};
}
const GUNS={
 minimi:{crack:[2600,.05,.48],body:[1050,.14,.46],thump:[120,42,.12,.44],send:.2},
 mp5:{crack:null,body:[650,.08,.2],thump:[95,45,.07,.14],click:[3200,.035,.14],send:.06},
 mag58:{crack:[2000,.07,.6],body:[820,.2,.62],thump:[92,34,.18,.66],send:.3},
 r870:{crack:null,body:[600,.3,.75],thump:[70,30,.26,.8],send:.36},
 hecate:{crack:[1800,.1,.8],body:[520,.38,.85],thump:[60,24,.34,.9],send:.45},
 revolver:{crack:[2300,.06,.6],body:[780,.26,.64],thump:[86,30,.24,.66],send:.34},
 ppk:{crack:null,body:[820,.06,.15],thump:[115,50,.05,.1],click:[3800,.03,.17],send:.05}
};
const ROOMS={factory:{length:2.4,decay:2.8,wet:.42},gardens:{length:1.1,decay:3.6,wet:.16},railway:{length:1.7,decay:3,wet:.28},desert:{length:.9,decay:3.8,wet:.12},market:{length:1.6,decay:3,wet:.3},harbor:{length:1.3,decay:3.4,wet:.2}};

export class AudioEngine{
 constructor(volume=.6){this.volume=volume;this.context=null;this.muted=false;this.room='factory';this.position={x:0,y:0,z:0};this.right={x:1,y:0,z:0};this.forward={x:0,y:0,z:-1};}
 start(){
  if(!this.context){
   const ctx=this.context=new(window.AudioContext||window.webkitAudioContext)();
   this.master=ctx.createGain();const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-12;limiter.knee.value=10;limiter.ratio.value=6;limiter.attack.value=.002;limiter.release.value=.2;this.master.connect(limiter).connect(ctx.destination);this.setVolume(this.volume);
   const size=ctx.sampleRate*2;this.noise=ctx.createBuffer(1,size,ctx.sampleRate);const d=this.noise.getChannelData(0);for(let i=0;i<size;i++)d[i]=Math.random()*2-1;
   this.reverb=ctx.createConvolver();this.send=ctx.createGain();this.send.connect(this.reverb).connect(this.master);this.setRoom(this.room);
  }
  this.context.resume().catch(()=>{});
 }
 now(){return this.context.currentTime+LOOKAHEAD;}
 setVolume(v){this.volume=v;if(this.master)this.master.gain.value=this.muted?0:v;}
 toggle(){this.muted=!this.muted;this.setVolume(this.volume);return this.muted;}
 setRoom(id){
  this.room=ROOMS[id]?id:'factory';if(!this.context)return;const room=ROOMS[this.room],ctx=this.context,length=Math.floor(ctx.sampleRate*room.length),buffer=ctx.createBuffer(2,length,ctx.sampleRate);
  for(let c=0;c<2;c++){const data=buffer.getChannelData(c);for(let i=0;i<length;i++){const t=i/length;data[i]=(Math.random()*2-1)*Math.pow(1-t,room.decay)*(i<ctx.sampleRate*.012?.25:1);}}
  this.reverb.buffer=buffer;this.send.gain.value=room.wet;
 }
 // Camera pose → Web Audio listener, once per frame.
 listen(camera){
  if(!this.context)return;const l=this.context.listener,p=camera.position,e=camera.matrixWorld.elements;this.position={x:p.x,y:p.y,z:p.z};this.right={x:e[0],y:e[1],z:e[2]};this.forward={x:-e[8],y:-e[9],z:-e[10]};
  if(l.positionX){l.positionX.value=p.x;l.positionY.value=p.y;l.positionZ.value=p.z;l.forwardX.value=-e[8];l.forwardY.value=-e[9];l.forwardZ.value=-e[10];l.upX.value=e[4];l.upY.value=e[5];l.upZ.value=e[6];}
  else{l.setPosition(p.x,p.y,p.z);l.setOrientation(-e[8],-e[9],-e[10],e[4],e[5],e[6]);}
 }
 // Output chain for one sound. Returns its input node and start time.
 voice(position,sendLevel=0){
  const ctx=this.context,input=ctx.createGain();let t=this.now();
  if(position){
   const d=Math.hypot(position.x-this.position.x,position.y-this.position.y,position.z-this.position.z),air=ctx.createBiquadFilter();let panner;
   if(ctx.createStereoPanner){const place=placement(position,this.position,this.right,this.forward),level=ctx.createGain();panner=ctx.createStereoPanner();panner.pan.value=place.pan;level.gain.value=place.gain;air.connect(level).connect(panner);}
   else{panner=ctx.createPanner();panner.panningModel='equalpower';panner.distanceModel='inverse';panner.refDistance=REF_DISTANCE;panner.rolloffFactor=ROLLOFF;panner.maxDistance=MAX_DISTANCE;
    if(panner.positionX){panner.positionX.value=position.x;panner.positionY.value=position.y;panner.positionZ.value=position.z;}else panner.setPosition(position.x,position.y,position.z);air.connect(panner);}
   air.type='lowpass';air.frequency.value=600+17000*Math.exp(-d/38);input.connect(air);panner.connect(this.master);
   t+=d/SPEED_OF_SOUND;sendLevel*=1+Math.min(.6,d/40);
  }else input.connect(this.master);
  if(sendLevel>0){const s=ctx.createGain();s.gain.value=sendLevel;input.connect(s).connect(this.send);}
  return {input,t};
 }
 burst(out,t,{type='lowpass',freq=1000,q=.7,duration=.1,volume=.2,attack=.001}){
  const ctx=this.context,s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=this.noise;f.type=type;f.frequency.value=freq;f.Q.value=q;
  volume=Math.max(.0002,volume);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(volume,t+attack);g.gain.exponentialRampToValueAtTime(.0001,t+duration);s.connect(f).connect(g).connect(out);s.start(t,Math.random()*Math.max(0,1.9-duration),duration+.05);
 }
 sweep(out,t,from,to,duration,volume,type='sine'){
  const ctx=this.context,o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(from,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,to),t+duration);
  volume=Math.max(.0002,volume);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(volume,t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g).connect(out);o.start(t);o.stop(t+duration+.02);
 }
 // Frequent sounds are rendered once, off line, into a few random variants:
 // a shot then costs one buffer instead of three live filters and an
 // oscillator on the audio thread. Until its variants are ready a sound is
 // synthesised live, as before.
 baked(key,length,recipe,out,t,level=1,variants=5){
  const banks=this.banks??=new Map(),bank=banks.get(key);
  if(!bank){banks.set(key,[]);if(typeof OfflineAudioContext==='function')for(let i=0;i<variants;i++)this.bake(key,length,recipe);return false;}
  if(!bank.length)return false;
  const ctx=this.context,source=ctx.createBufferSource();source.buffer=bank[Math.floor(Math.random()*bank.length)];
  if(level!==1){const g=ctx.createGain();g.gain.value=level;source.connect(g).connect(out);}else source.connect(out);
  source.start(t);return true;
 }
 bake(key,length,recipe){
  const ctx=this.context,rate=ctx.sampleRate;let offline;
  try{offline=new OfflineAudioContext(1,Math.ceil(rate*length),rate);}catch{return;}
  // The recipe runs unchanged against the offline context.
  const baker=Object.create(this);baker.context=offline;recipe(baker,offline.destination,0);
  new Promise(resolve=>{offline.oncomplete=e=>resolve(e.renderedBuffer);offline.startRendering()?.then?.(resolve);}).then(rendered=>{
   const data=rendered.getChannelData(0);let end=data.length;while(end>1&&Math.abs(data[end-1])<1e-4)end--;
   const buffer=ctx.createBuffer(1,end,rate);buffer.copyToChannel(data.subarray(0,end),0);this.banks.get(key)?.push(buffer);
  }).catch(()=>{});
 }
 noiseBurst(duration,freq,volume){if(!this.context)return;this.burst(this.master,this.now(),{freq,duration,volume});}
 tone(freq,duration,volume=.1,type='sine'){if(!this.context)return;this.sweep(this.master,this.now(),freq,freq*.35,duration,volume,type);}
 // Layered gunshot: supersonic crack, muzzle blast body, low thump, tail.
 shot(id,distant=false,position=null){
  if(!this.context)return;const gun=GUNS[id]||GUNS.minimi,level=distant&&!position?.35:1,{input,t}=this.voice(position,gun.send);
  if(!this.baked(`shot:${id}`,1.2,(b,out,at)=>b.shotLayers(id,gun,out,at,1),input,t,level))this.shotLayers(id,gun,input,t,level);
 }
 shotLayers(id,gun,input,t,level){
  if(gun.crack)this.burst(input,t,{type:'highpass',freq:gun.crack[0],duration:gun.crack[1],volume:gun.crack[2]*level});
  this.burst(input,t,{freq:gun.body[0]*(.92+Math.random()*.16),duration:gun.body[1],volume:gun.body[2]*level,q:.9});
  this.sweep(input,t,gun.thump[0],gun.thump[1],gun.thump[2],gun.thump[3]*level,'triangle');
  if(gun.click)this.burst(input,t+.012,{type:'bandpass',freq:gun.click[0],q:4,duration:gun.click[1],volume:gun.click[2]*level});
  // The pump and the bolt are worked by hand, in step with the weapon animation.
  if(id==='r870')for(const [at,freq,duration] of [[.26,1800,.05],[.43,2400,.045]])this.burst(input,t+at,{type:'bandpass',freq,q:4,duration,volume:.2*level});
  if(id==='hecate')for(const [at,freq,duration] of [[.38,3000,.03],[.55,1500,.06],[.75,2000,.05],[.92,2800,.03]])this.burst(input,t+at,{type:'bandpass',freq,q:5,duration,volume:.18*level});
 }
 // Magazine out, magazine seated, bolt released, timed on the reload. A
 // magazine change with a round still chambered skips the bolt.
 reload(duration=0,id='minimi',empty=true){
  if(!this.context)return;const out=this.master,t=this.now();
  if(!duration){this.burst(out,t,{type:'bandpass',freq:3400,q:3,duration:.06,volume:.12});return;}
  if(id==='revolver'){
   // Cylinder swung out, empties dumped, speed loader seated, cylinder closed.
   this.burst(out,t+duration*.1,{type:'bandpass',freq:2600,q:5,duration:.035,volume:.18});
   for(let i=0;i<6;i++){const at=t+duration*.24+i*.035+Math.random()*.03,f=3600+Math.random()*1600;this.sweep(out,at,f,f*.93,.06,.03);}
   this.burst(out,t+duration*.62,{freq:700,duration:.06,volume:.16});this.burst(out,t+duration*.64,{type:'bandpass',freq:3000,q:4,duration:.03,volume:.14});
   this.burst(out,t+duration*.86,{type:'bandpass',freq:2200,q:6,duration:.04,volume:.22});return;
  }
  if(id==='r870'){
   // Four shells pushed into the tube, then the pump racked on an empty gun.
   for(let i=0;i<4;i++){const at=t+duration*(.2+i*.15);this.burst(out,at,{type:'bandpass',freq:2600,q:5,duration:.03,volume:.16});this.burst(out,at+.02,{freq:600,duration:.05,volume:.1});}
   if(empty)for(const [at,freq] of [[.86,1800],[.92,2400]])this.burst(out,t+duration*at,{type:'bandpass',freq,q:4,duration:.05,volume:.2});
   return;
  }
  const pitch={mag58:.8,hecate:.75,mp5:1.15,ppk:1.3}[id]??1;
  this.burst(out,t+duration*.14,{type:'bandpass',freq:2400*pitch,q:5,duration:.04,volume:.16});this.burst(out,t+duration*.18,{freq:900,duration:.12,volume:.07});
  this.burst(out,t+duration*.58,{freq:650*pitch,duration:.07,volume:.2});this.burst(out,t+duration*.6,{type:'bandpass',freq:2900*pitch,q:6,duration:.035,volume:.2});
  if(!empty)return;
  this.burst(out,t+duration*.84,{type:'bandpass',freq:3600*pitch,q:5,duration:.03,volume:.18});this.burst(out,t+duration*.88,{type:'bandpass',freq:2100*pitch,q:4,duration:.05,volume:.2});
 }
 step(position=null,volume=.05){if(!this.context)return;const {input,t}=this.voice(position,.04);if(!this.baked('step',.2,(b,out,at)=>b.stepLayers(out,at,1),input,t,volume,6))this.stepLayers(input,t,volume);}
 stepLayers(input,t,volume){this.burst(input,t,{freq:240+Math.random()*200,duration:.08+Math.random()*.03,volume:volume*(.85+Math.random()*.3),attack:.006});this.burst(input,t+.012,{type:'bandpass',freq:1200+Math.random()*400,q:.8,duration:.05,volume:volume*.14,attack:.01});}
 land(){if(!this.context)return;const t=this.now();this.burst(this.master,t,{freq:220,duration:.12,volume:.12});this.sweep(this.master,t,90,45,.1,.12);}
 // A case striking the ground: a dull tap on the floor and, for brass, the
 // short inharmonic ring of a tube (bigger cases ring lower). A shotgun
 // hull is plastic: a hollow tock, no ring. Each bounce is weaker.
 casing(position,{bounce=0,size=1,kind='brass',speed=2}={}){
  if(!this.context||bounce>2)return;const now=this.context.currentTime;if(bounce>0&&now-(this.lastCasing||0)<.03)return;this.lastCasing=now;
  const {input,t}=this.voice(position,.05),level=Math.min(1,speed/3)*[1,.45,.2][bounce];
  if(!this.baked(`casing:${kind}:${size}:${bounce?1:0}`,.4,(b,out,at)=>b.casingLayers(out,at,bounce,size,kind,1),input,t,level,4))this.casingLayers(input,t,bounce,size,kind,level);
 }
 casingLayers(input,t,bounce,size,kind,level){
  this.burst(input,t,{freq:500,duration:.025,volume:.05*level});
  if(kind==='shell'){this.burst(input,t,{type:'bandpass',freq:1100+Math.random()*300,q:3,duration:.05,volume:.07*level});return;}
  this.burst(input,t,{type:'highpass',freq:5000,duration:.012,volume:.04*level});
  const f=(2400+Math.random()*700)/size,ring=(bounce?.05:.09)*Math.min(1.6,size);
  for(const [ratio,share,decay] of [[1,1,1],[2.76,.5,.6],[5.4,.22,.35]])this.sweep(input,t+.002,f*ratio,f*ratio*.995,ring*decay,.022*share*level,'sine');
 }
 // Near miss: band-passed whoosh panned from the closest point of the shot.
 whiz(position){if(!this.context)return;const {input,t}=this.voice(position,0);if(!this.baked('whiz',.3,(b,out,at)=>b.whizLayers(out,at),input,t,1,4))this.whizLayers(input,t);}
 whizLayers(input,t){const ctx=this.context,s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=this.noise;f.type='bandpass';f.Q.value=3;f.frequency.setValueAtTime(3200,t);f.frequency.exponentialRampToValueAtTime(900,t+.16);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.35,t+.03);g.gain.exponentialRampToValueAtTime(.0001,t+.17);s.connect(f).connect(g).connect(input);s.start(t,Math.random(),.2);}
 // A bullet striking a body: a dull, muffled thump with a short slap of
 // cloth. On the head it knocks on the helmet: a hard click with a brief
 // metallic edge. No tones: it should sound like an impact, not a signal.
 hit(head=false){
  if(!this.context)return;const t=this.now(),out=this.master;
  this.burst(out,t,{freq:650+Math.random()*150,duration:.07,volume:.15});this.sweep(out,t,150,70,.08,.13);this.burst(out,t,{type:'bandpass',freq:1600,q:1.2,duration:.03,volume:.045});
  if(head){this.burst(out,t,{type:'highpass',freq:3000,duration:.015,volume:.07});this.burst(out,t+.003,{type:'bandpass',freq:2500+Math.random()*300,q:8,duration:.06,volume:.05});}
 }
 // A shot stopped by spawn protection: a bright glassy ping, no thud.
 shield(){if(!this.context)return;const t=this.now(),out=this.master;this.sweep(out,t,2600,3400,.12,.05,'sine');this.sweep(out,t+.004,5200,6100,.08,.02,'sine');this.burst(out,t,{type:'highpass',freq:7000,duration:.02,volume:.03});}
 // The killing hit lands heavier and lower.
 kill(){if(!this.context)return;const t=this.now()+.02;this.burst(this.master,t,{freq:380,duration:.12,volume:.1});this.sweep(this.master,t,95,42,.15,.12);}
 hurt(){if(!this.context)return;const t=this.now();this.burst(this.master,t,{freq:520,duration:.14,volume:.14});this.sweep(this.master,t,110,50,.14,.2);}
 heartbeat(){if(!this.context)return;const t=this.now();this.sweep(this.master,t,62,38,.12,.22);this.sweep(this.master,t+.2,55,35,.14,.16);}
 explosion(position=null){
  if(!this.context)return;const {input,t}=this.voice(position,.9);
  this.burst(input,t,{type:'highpass',freq:1500,duration:.08,volume:.5});this.burst(input,t,{freq:520,duration:1.4,volume:.85,attack:.004});this.sweep(input,t,72,22,1.3,.7,'triangle');
  for(let i=0;i<5;i++)this.burst(input,t+.25+Math.random()*.7,{type:'bandpass',freq:1800+Math.random()*2400,q:2,duration:.05,volume:.05});
 }
 capture(){this.tone(740,.3,.14);setTimeout(()=>this.tone(1100,.4,.12),160);}
}
