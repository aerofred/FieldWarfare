import { collides, distance, hostile } from './rules.js';

export const DEATHMATCH = Object.freeze({ limit:40, duration:480, respawn:4, protection:2 });
export const TEAM_SPAWNS = {
  blue:[{x:-9,z:25},{x:-5,z:27},{x:12,z:26},{x:18,z:20},{x:-20,z:20},{x:26,z:25},{x:-27,z:24}],
  red:[{x:-8,z:-27},{x:0,z:-27},{x:13,z:-25},{x:22,z:-20},{x:-19,z:-22},{x:-28,z:-18},{x:27,z:-17}]
};
export const opposingTeam = team => team==='blue'?'red':'blue';
export const canDamage = (attacker,victim,time) => !!attacker && victim.alive && hostile(attacker,victim) && time>=(victim.protectedUntil||0);

export function chooseTeamSpawn(team,actors,obstacles,isExposed=()=>false,spawns=TEAM_SPAWNS) {
  const living=actors.filter(a=>a.alive),enemies=living.filter(a=>a.team!==team);
  const candidates=spawns[team].filter(p=>!collides(p.x,p.z,.45,obstacles));
  if(!candidates.length)throw new Error(`No reachable spawn point for ${team}`);
  const score=p=>{
    const clearance=Math.min(30,...enemies.map(e=>distance(p,e)));
    const exposure=enemies.filter(e=>distance(p,e)<28&&isExposed(p,e)).length;
    const crowd=living.reduce((sum,a)=>sum+Math.max(0,3-distance(p,a))*12,0);
    return clearance-exposure*12-crowd;
  };
  return {...candidates.reduce((best,p)=>score(p)>score(best)?p:best,candidates[0])};
}

export function awardTeamKill(scores,attacker,victim) {
  if(!attacker||attacker===victim||attacker.team===victim.team)return false;
  scores[attacker.team]++;
  return true;
}

export function deathmatchResult(scores,remaining) {
  if(scores.blue<DEATHMATCH.limit&&scores.red<DEATHMATCH.limit&&remaining>0)return null;
  return scores.blue===scores.red?'draw':scores.blue>scores.red?'blue':'red';
}

// Free-for-all: any listed point, as far as possible from every living
// combatant and out of their sight lines.
export function chooseFreeSpawn(actor,actors,obstacles,isExposed=()=>false,points=[],random=Math.random) {
  const others=actors.filter(a=>a!==actor&&a.alive),candidates=points.filter(p=>!collides(p.x,p.z,.45,obstacles));
  if(!candidates.length)throw new Error('No reachable spawn point');
  const score=p=>Math.min(30,...others.map(a=>distance(p,a)))-others.filter(a=>distance(p,a)<28&&isExposed(p,a)).length*8+random()*3;
  let best=candidates[0],bestScore=-Infinity;for(const p of candidates){const s=score(p);if(s>bestScore){best=p;bestScore=s;}}
  return {x:best.x,z:best.z};
}
