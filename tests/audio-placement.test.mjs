import {test} from 'node:test';
import assert from 'node:assert/strict';
import {placement,REF_DISTANCE} from '../src/audio.js';

const listener={x:0,y:1.6,z:0},right={x:1,y:0,z:0},forward={x:0,y:0,z:-1};
const at=(x,z,y=1.6)=>placement({x,y,z},listener,right,forward);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} ≠ ${b}`);

test('panning follows the equal-power azimuth, front and back folded together',()=>{
 close(at(0,-10).pan,0);close(at(10,0).pan,1);close(at(-10,0).pan,-1);
 close(at(10,-10).pan,.5);close(at(10,10).pan,.5);close(at(0,10).pan,0);
 // Height does not pan, and a sound on the listener is centred.
 close(at(0,-10,9).pan,0);close(at(0,0).pan,0);
});

test('level follows the inverse distance model beyond the reference distance',()=>{
 close(at(0,-1).gain,1);close(at(0,-REF_DISTANCE).gain,1);
 close(at(0,-10).gain,3/(3+1.15*7));close(at(0,-500).gain,3/(3+1.15*497));
});
