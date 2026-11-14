export default {
 // Briefing panel. {description} is the map's own description sentence.
 'game.briefing.text':'{description} Secure the relays, hold against the waves, capture the enemy flag or dominate the deathmatch. Indoor and outdoor routes let you flank enemy positions.',
 'game.briefing.mapInfo':'64 × 64 M · SOLO AND MULTIPLAYER',

 // Pause menu. "Resume" is the pause menu's button.
 'game.pause.lockRefused':'Mouse capture was denied. Click Resume to try again.',
 'game.pause.lockHelp':'Click Resume to let the game use the mouse.',
 'game.pause.online':'The match goes on on the server. Your operator stays in the field.',
 'game.pause.solo':'Back to your position, operator.',

 // HUD. In free-for-all the score panel shows YOU against the leader (1ST).
 'game.hud.you':'YOU',
 'game.hud.first':'1ST',
 'game.hud.firstYou':'1ST · YOU',
 'game.hud.timeElapsed':'TIME ELAPSED',
 'game.hud.timeLeft':'TIME LEFT',
 'game.hud.online':'ONLINE',
 // {name}: the player's name.
 'game.hud.operator':'OPERATOR / {name}',
 // Fire modes.
 'game.hud.auto':'AUTO',
 'game.hud.semiAuto':'SEMI-AUTO',
 'game.hud.contested':'ZONE CONTESTED',
 'game.hud.securing':'SECURING RELAY',
 'game.hud.wave':'WAVE {wave} / {total}',
 // {sub}: the objective detail line; {level}: the bots' difficulty label.
 'game.hud.subAi':'{sub} · AI {level}',

 // Round intro titles. {operation}: the map's operation name.
 'game.intro.assault':'OPERATION {operation}',
 'game.intro.survival':'DEFENSIVE POSITION',
 // {blue}, {red}: players per team.
 'game.intro.tdm':'TEAM ALPHA / {blue} VS {red}',
 'game.intro.ctf':'CAPTURE THE FLAG / {blue} VS {red}',

 // Round goals
 'game.goal.assault':'Secure the three transmission relays',
 'game.goal.survival_one':'Repel {n} wave of hostiles',
 'game.goal.survival_other':'Repel {n} waves of hostiles',
 'game.goal.kills_one':'First to {n} kill',
 'game.goal.kills_other':'First to {n} kills',
 'game.goal.captures_one':'First to {n} capture',
 'game.goal.captures_other':'First to {n} captures',

 // Objective line and its detail. {name}: a relay letter; {label}: the relay's place.
 'game.objective.captureRelay':'CAPTURE RELAY {name}',
 'game.objective.captureRelaySub':'{label} · Hold the zone for 7 seconds',
 'game.objective.reinforcements_one':'Reinforcements in {n} second',
 'game.objective.reinforcements_other':'Reinforcements in {n} seconds',
 'game.objective.hostilesLeft_one':'{n} hostile left',
 'game.objective.hostilesLeft_other':'{n} hostiles left',
 'game.objective.bringFlag':'BRING THE FLAG TO YOUR BASE',
 'game.objective.recoverFlag':'RECOVER YOUR FLAG',
 // {team}: ALPHA or BRAVO.
 'game.objective.captureFlag':'CAPTURE THE {team} FLAG',
 'game.objective.protected':'SPAWN PROTECTION',
 // {state}: game.flag.atBase, game.flag.droppedState or game.flag.carriedBy.
 'game.objective.ownFlag':'Your flag: {state}',
 'game.objective.ffa':'ELIMINATE ALL OPPONENTS',
 'game.objective.ffaSub_one':'Rank {rank} / {total} · First to {n} kill',
 'game.objective.ffaSub_other':'Rank {rank} / {total} · First to {n} kills',
 'game.objective.tdm':'ELIMINATE TEAM {team}',
 'game.objective.tdmSub_one':'First to {n} kill · Friendly fire off',
 'game.objective.tdmSub_other':'First to {n} kills · Friendly fire off',
 'game.objective.waitingOpponents':'WAITING FOR OPPONENTS',
 'game.objective.waitingOpponent':'WAITING FOR AN OPPONENT',
 'game.objective.waitingSub':'The round starts as soon as each side has a fighter.',

 // Notifications
 'game.notify.respawn':'BACK IN THE FIGHT',
 'game.notify.respawnSub':'Spawn protection · 3 seconds',
 'game.notify.pickup':'AMMO RECOVERED',
 'game.notify.pickupSub':'Magazine reserve full',
 'game.notify.doubleKill':'DOUBLE KILL',
 'game.notify.tripleKill':'TRIPLE KILL',
 // {count}: kills in quick succession (4 or more).
 'game.notify.multiKill':'MULTI-KILL ×{count}',
 // {count}: kills since the last death.
 'game.notify.streak':'STREAK OF {count}',
 'game.notify.streakAlive':'STREAK OF {count} · no deaths',
 'game.notify.streakKills_one':'{n} kill without dying',
 'game.notify.streakKills_other':'{n} kills without dying',
 'game.notify.lastHeadshot':'Last one by headshot',
 'game.notify.coopHeadshot':'HEADSHOT +150',
 'game.notify.coopKill':'HOSTILE DOWN +100',
 'game.notify.headshot':'HEADSHOT +1',
 'game.notify.kill':'KILL +1',
 'game.notify.killGoal_one':'Goal: {n} kill',
 'game.notify.killGoal_other':'Goal: {n} kills',
 'game.notify.team':'TEAM {team}',
 'game.notify.relaySecured':'RELAY {name} SECURED',
 'game.notify.relaySecuredSub':'Health, ammo and grenades resupplied',
 'game.notify.waveSub_one':'{n} hostile in the sector',
 'game.notify.waveSub_other':'{n} hostiles in the sector',
 'game.notify.cleared':'SECTOR CLEAR',
 'game.notify.clearedSub':'Resupply · next wave in 6 seconds',

 // Respawn screen. killedBy is followed by the weapon, HEADSHOT and range.
 'game.respawn.down':'OPERATOR DOWN',
 'game.respawn.killedBy':'KILLED BY {name}',
 'game.respawn.headshot':'HEADSHOT',
 'game.respawn.nextWave':'Back with the next wave',
 'game.respawn.auto':'Automatic respawn',

 // Killfeed: the victim's name, killed by a headshot.
 'game.killfeed.head':'{name} / HEAD',

 // Capture the flag. {name}: a player's name.
 'game.flag.youCarry':'YOU HAVE THE FLAG',
 'game.flag.youCarrySub':'Bring it to your base · firing allowed, no sprinting or climbing',
 'game.flag.ownTaken':'FRIENDLY FLAG TAKEN',
 'game.flag.enemyTaken':'ENEMY FLAG TAKEN',
 'game.flag.takenOwn':'{name} took your flag',
 'game.flag.taken.blue':'{name} took the ALPHA flag',
 'game.flag.taken.red':'{name} took the BRAVO flag',
 'game.flag.ownDropped':'YOUR FLAG IS DOWN',
 'game.flag.enemyDropped':'ENEMY FLAG DOWN',
 'game.flag.ownDroppedSub':'Touch it to send it back to base',
 'game.flag.enemyDroppedSub':'Grab it before it returns (20 s)',
 'game.flag.ownReturned':'FLAG RECOVERED',
 'game.flag.enemyReturned':'ENEMY FLAG RETURNED',
 'game.flag.autoReturn':'Automatic return to base',
 'game.flag.lost':'FLAG LOST',
 'game.flag.captured':'FLAG CAPTURED',
 'game.flag.scoresEnemy':'{name} scores for the enemy team',
 'game.flag.scoresTeam':'{name} scores for your team',
 // Where your flag is, shown after "Your flag:".
 'game.flag.atBase':'at base',
 'game.flag.droppedState':'down · returns in {seconds} s',
 'game.flag.carriedBy':'carried by {name}',
 'game.flag.carriedUnknown':'carried by an operator',

 // Scoreboard and results roster
 'game.roster.operator':'OPERATOR',
 'game.roster.self':'{name} · YOU',
 'game.roster.bot':'{name} · BOT',
 'game.roster.alive':'IN ACTION',
 'game.roster.respawning':'RESPAWNING',
 'game.roster.standings_one':'STANDINGS / {n} FIGHTER',
 'game.roster.standings_other':'STANDINGS / {n} FIGHTERS',
 'game.roster.squad':'ALPHA SQUAD',
 'game.roster.allies':'{team} / ALLIES',
 'game.roster.enemies':'{team} / ENEMIES',

 // Statistics (short labels under numbers)
 'game.stats.kills':'KILLS',
 // Column header abbreviations: kills, captures.
 'game.stats.killsShort':'KILLS',
 'game.stats.captures':'CAPTURES',
 'game.stats.capturesShort':'CAPS',
 'game.stats.deaths':'DEATHS',
 'game.stats.accuracy':'ACCURACY',
 'game.stats.bestStreak':'BEST STREAK',
 // Current kill streak, then {best}: the longest of the round.
 'game.stats.streakMax':'STREAK · MAX {best}',
 'game.stats.missionTime':'MISSION TIME',
 'game.stats.roundTime':'ROUND TIME',
 'game.stats.yourKills':'YOUR KILLS',
 'game.stats.yourDeaths':'YOUR DEATHS',
 'game.stats.yourCaptures':'YOUR CAPTURES',
 'game.stats.rank':'RANK',
 'game.stats.relays':'RELAYS',
 'game.stats.waves':'WAVES',

 // Round results
 'game.result.extraction':'EXTRACTION AUTHORIZED',
 'game.result.endTransmission':'END OF TRANSMISSION',
 'game.result.accomplished':'MISSION ACCOMPLISHED.',
 'game.result.squadDown':'SQUAD DOWN.',
 'game.result.operatorDown':'OPERATOR DOWN.',
 'game.result.failed':'MISSION FAILED.',
 'game.result.assaultWon':'All three relays are secured. The compound is under your control.',
 'game.result.survivalWon_one':'{n} wave repelled. Your position held. Extraction authorized.',
 'game.result.survivalWon_other':'{n} waves repelled. Your position held. Extraction authorized.',
 'game.result.assaultTime':'Time is up. Not all relays were secured.',
 'game.result.assaultLost':'Your squad has fallen. The sector remains in enemy hands.',
 'game.result.survivalLost':'The squad fell during wave {wave}. The position is lost.',
 // Free-for-all; {n}: number of fighters.
 'game.result.ffaLabel_one':'FREE-FOR-ALL / {n} FIGHTER',
 'game.result.ffaLabel_other':'FREE-FOR-ALL / {n} FIGHTERS',
 'game.result.victory':'VICTORY.',
 'game.result.draw':'DRAW.',
 // Final place, by ordinal category (Intl.PluralRules type "ordinal"):
 // add the categories your language uses; "other" is the fallback.
 'game.result.place.one':'{rank}ST PLACE.',
 'game.result.place.two':'{rank}ND PLACE.',
 'game.result.place.few':'{rank}RD PLACE.',
 'game.result.place.other':'{rank}TH PLACE.',
 // First half of the result line; the second half is timeUp or a limit.
 'game.result.tiedFirst':'Tied for first',
 'game.result.youWin':'You win the round',
 'game.result.playerWins':'{name} wins the round',
 'game.result.opponentWins':'An opponent wins the round',
 'game.result.timeUp':'Time up',
 'game.result.killLimit_one':'{n} kill limit reached',
 'game.result.killLimit_other':'{n} kill limit reached',
 'game.result.captureLimit_one':'{n} capture limit reached',
 'game.result.captureLimit_other':'{n} capture limit reached',
 // {mode}: the mode's name; {blue}, {red}: players per team.
 'game.result.teamLabel':'{mode} / {blue} VS {red}',
 // {team}: ALPHA or BRAVO.
 'game.result.teamVictory':'{team} VICTORY.',
 'game.result.teamDefeat':'{team} DEFEAT.',
 // Personal best on this device. {mode}: the mode's name; {n}: kills in a round; {streak}: longest streak.
 'game.result.newRecord_one':'NEW RECORD · {mode} · {n} KILL · STREAK OF {streak}',
 'game.result.newRecord_other':'NEW RECORD · {mode} · {n} KILLS · STREAK OF {streak}',
 'game.result.record_one':'RECORD · {mode} · {n} KILL · STREAK OF {streak}',
 'game.result.record_other':'RECORD · {mode} · {n} KILLS · STREAK OF {streak}',

 // Online play. {level}: the bots' difficulty; {ping}: latency in milliseconds.
 'game.net.hud':'ONLINE · {humans}/8 HUMANS · {bots} BOTS · AI {level} · {ping} MS',
 'game.net.connected':'CONNECTED TO SERVER',
 // The server runs another mode than the one picked: {mode} and {map} name it.
 'game.net.currentRoom':'Current room: {mode} · {map}',
 'game.net.enterGamepad':'Press A or MENU to enter the field',
 'game.net.enterTouch':'Tap Resume to enter the field',
 'game.net.enterClick':'Click Resume to enter the field',
 'game.net.newRound':'NEW ROUND',
 'game.net.waitingPlayers':'WAITING FOR OTHER PLAYERS',
 'game.net.nextRound':'Next round in {seconds} s',
 // {result}: the round's result line.
 'game.net.resultNextRound':'{result} · Next round in {seconds} s.',
 // A player joined or left; their name shows below.
 'game.net.joined':'OPERATOR JOINED',
 'game.net.left':'OPERATOR LEFT',
 'game.net.badAddress':'Enter a valid http://, https://, ws:// or wss:// address.',
 'game.net.timeout':'The server is not responding. Check its address and that it is running.',
 'game.net.invalidResponse':'Invalid server response.',
 'game.net.invalidResponseInGame':'The server sent an invalid response. Reconnect to resume.',
 'game.net.unreachable':'Unable to connect. Start the server and check the address.',
 'game.net.cancelled':'Connection cancelled.',
 'game.net.interrupted':'Connection to the server interrupted.',
 'game.net.lost':'Connection lost. You left the match. You can join the server again.',
 'game.net.refused':'Connection refused.',

 // Graphics quality profiles
 'game.quality.low':'Performance',
 'game.quality.medium':'Balanced',
 'game.quality.high':'High',
 // Free-for-all result line: {outcome} (who won) · {reason} (time up or kill limit).
 'game.result.ffaLine':'{outcome} · {reason}.',
};
