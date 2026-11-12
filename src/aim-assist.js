// Aim assistance for controllers, touch screens and keyboard-only play; the
// mouse never gets any. Near a visible enemy the view slows down (friction), follows the
// target while the player steers, moves or fires (tracking) and turns
// briefly toward it when aiming in (snap). Only the player's own view
// moves: the room checks every shot as before, online as in solo.
const LEVELS=Object.freeze({
 off:null,
 light:{friction:.3,track:1.8,snap:.4,radius:.85},
 standard:{friction:.45,track:3.2,snap:.7,radius:1.1},
 strong:{friction:.6,track:5,snap:.9,radius:1.4},
});
export const AIM_ASSIST_LEVELS=Object.keys(LEVELS);
export const aimAssistLevel=value=>AIM_ASSIST_LEVELS.includes(value)?value:'standard';
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
// Upper chest of the hit volumes, which crouch and jump with the body.
const CHEST=1.3,KEYBOARD_CONE=.35,KEYBOARD_RADIUS=2.5,MAX_CONE=.3,MAX_RANGE=60,MAX_TRACK_RATE=1.6,SNAP_TIME=.16,PITCH_SHARE=.55;

export class AimAssist {
 constructor(game){this.game=game;this.target=null;this.slow=1;this.snapTime=0;this.wasAim=false;this.steering=false;}
 get level(){return LEVELS[aimAssistLevel(this.game.settings.aimAssist)];}
 // A controller in use, a touch screen whose mouse is not captured, or the
 // keyboard turning the view.
 get enabled(){
  const g=this.game,locked=typeof document!=='undefined'&&document.pointerLockElement===g.canvas;
  return !!this.level&&(!!g.gamepad?.active||!!g.touch?.enabled&&!locked||!!g.keyboardLook);
 }
 // Called for each stick or touch look: friction applies and the player
 // counts as steering this frame.
 look(){this.steering=true;return this.slow;}
 // The enemy closest to the crosshair, relative to a cone whose width in
 // metres stays the same at any distance.
 find(){
  const g=this.game,cam=g.camera.position,level=this.level,range=Math.min(g.weapon?.range||MAX_RANGE,MAX_RANGE);let best=null;
  for(const actor of g.bots){
   if(!actor.alive||!actor.visible||!g.isEnemy(actor))continue;
   const height=.15+(actor.targetJump??actor.jump??0)+CHEST*(actor.crouch?.65:1),dx=actor.x-cam.x,dz=actor.z-cam.z,dy=height-cam.y,flat=Math.hypot(dx,dz),dist=Math.hypot(flat,dy);
   if(dist>range||dist<.6)continue;
   const pitch=Math.atan2(dy,flat),yawError=wrap(Math.atan2(-dx,-dz)-g.yaw),pitchError=pitch-g.pitch,error=Math.hypot(yawError*Math.cos(pitch),pitchError);
   const cone=Math.min(MAX_CONE,Math.atan(level.radius/dist)),ratio=error/cone;
   if(ratio<1&&(!best||ratio<best.ratio))best={actor,yawError,pitchError,ratio};
  }
  return best;
 }
 // The view height for keyboard-only play, which cannot look up or down: the
 // upper chest of the visible enemy most nearly ahead, at any height (roof,
 // stairs, crouching), or the horizon when there is none. Bearing alone
 // picks the enemy, within a cone a few metres wide.
 keyboardPitch(){
  const g=this.game,cam=g.camera.position,range=Math.min(g.weapon?.range||MAX_RANGE,MAX_RANGE);let best=0,bestRatio=1;
  for(const actor of g.bots){
   if(!actor.alive||!actor.visible||!g.isEnemy(actor))continue;
   const height=.15+(actor.targetJump??actor.jump??0)+CHEST*(actor.crouch?.65:1),dx=actor.x-cam.x,dz=actor.z-cam.z,flat=Math.hypot(dx,dz);
   if(flat>range||flat<.6)continue;
   const ratio=Math.abs(wrap(Math.atan2(-dx,-dz)-g.yaw))/Math.min(KEYBOARD_CONE,Math.atan(KEYBOARD_RADIUS/flat));
   if(ratio<bestRatio){bestRatio=ratio;best=Math.atan2(height-cam.y,flat);}
  }
  return best;
 }
 update(dt){
  const g=this.game,aim=!!g.aim,steering=this.steering;this.steering=false;
  if(g.state!=='active'||!g.player?.alive||!this.enabled||g.sprinting||g.traversal){this.target=null;this.slow=1;this.wasAim=aim;this.snapTime=0;return;}
  const level=this.level;if(aim&&!this.wasAim)this.snapTime=SNAP_TIME;this.wasAim=aim;this.snapTime=Math.max(0,this.snapTime-dt);
  const target=this.target=this.find();
  this.slow=target?1-level.friction*(1-target.ratio):1;
  if(!target)return;
  // Tracking only helps a player who is already playing: steering, moving,
  // aiming or firing. It never turns an idle view on its own.
  let rate=steering||g.moving||aim||g.mouseDown?level.track:0;
  if(this.snapTime>0)rate=Math.max(rate,level.snap*18);
  if(!rate)return;
  const share=1-Math.exp(-rate*dt*(1-target.ratio*.5)),limit=MAX_TRACK_RATE*dt+(this.snapTime>0?.03:0);
  g.yaw+=Math.max(-limit,Math.min(limit,target.yawError*share));
  g.pitch=Math.max(-1.45,Math.min(1.45,g.pitch+Math.max(-limit,Math.min(limit,target.pitchError*share*PITCH_SHARE))));
 }
}
