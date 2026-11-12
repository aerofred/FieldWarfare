// Interface: lobby, briefing, settings, online play, key bindings, touch and
// controller labels, plus the static text of index.html. English is the base
// catalog: every key exists here. Values may hold simple inline markup
// (<br>, <em>, <b>) where the French source had it; keep it in translations.
// {name} placeholders are filled in by the code. UPPERCASE text stays
// UPPERCASE. Buttons and labels are narrow: keep lengths close to English.
export default {
 // Page and loading screen
 // aria-label of the 3D view
 'ui.world.label': '3D view of the abandoned factory',
 'ui.loading': 'INITIALIZING THEATER OF OPERATIONS',

 // Top bar
 'ui.top.home': 'Field Warfare, home',
 'ui.top.nav': 'Main navigation',
 'ui.nav.play': 'PLAY',
 'ui.nav.arsenal': 'ARSENAL',
 'ui.nav.briefing': 'BRIEFING',
 'ui.top.settings': 'Settings',
 'ui.profile.local': 'LOCAL OPERATOR',
 'ui.profile.localSub': 'SOLO · VS AI',
 'ui.profile.online': 'ONLINE OPERATOR',
 'ui.profile.onlineSub': 'SERVER · HUMANS AND BOTS',

 // Lobby: play view
 'ui.play.zone': 'AREA OF OPERATIONS / 07',
 // Label before the operation name (e.g. "OPERATION FOUNDRY")
 'ui.play.operation': 'OPERATION',
 'ui.play.tagline': 'Silence has fallen over the site.<br>It’s up to you to retake the ground.',
 'ui.play.briefingLink': 'READ THE BRIEFING',
 // aria-label of the match settings panel
 'ui.setup.label': 'Match settings',

 // Lobby: view (touch devices: normal, VR headset, AR in the iOS app)
 'ui.display.label': 'VIEW',
 'ui.display.normal': 'Normal',
 'ui.display.vr': 'VR headset (Cardboard)',
 'ui.display.vrHttps': 'VR headset (HTTPS required)',
 'ui.display.table': 'Tabletop model',
 'ui.display.roomLidar': 'Full room (LiDAR)',
 'ui.display.room': 'Room (floor and walls)',
 'ui.display.noteVr': 'Split screen in two views for a Cardboard-style headset. Your head steers the view and the headset button fires; move with a controller (same buttons as without the headset, R3 recenters the horizon). In portrait, the mission pauses.',
 'ui.display.noteTable': 'Tabletop: the map laid on a table, your soldier seen from above. Solo or online.',
 'ui.display.noteRoomLidar': 'Full room: the room and its furniture, scanned by LiDAR. You are the device; the Survival waves come into your home. Solo.',
 'ui.display.noteRoom': 'Floor and walls: the room’s floor and walls are scanned. You are the device; the Survival waves come into your home. Solo.',
 'ui.motion.denied': 'Motion access denied: fully close the browser, then reopen the game so it asks again.',

 // Lobby: where to play
 'ui.venue.title': 'WHERE TO PLAY',
 'ui.venue.label': 'Where to play',
 'ui.venue.local': 'SOLO',
 'ui.venue.online': 'ONLINE',

 // Lobby: maps (select options: "Name — short description")
 'ui.map.label': 'THEATER OF OPERATIONS',
 'ui.map.factory': 'The Foundry — abandoned factory',
 'ui.map.gardens': 'The Two Gardens — residential district',
 'ui.map.railway': 'Rail Depot — freight terminal',
 'ui.map.desert': 'The Outpost — desert village',
 'ui.map.market': 'The Market Halls — downtown at dusk',
 'ui.map.harbor': 'The Harbor — snowbound docks',
 'ui.map.room': 'Your room',
 'ui.map.roomDescription': 'Your room, scanned when you deploy, becomes the battlefield.',

 // Lobby: rules of the selected mode
 // Followed by " · " and the mode name
 'ui.rules.title': 'RULES',
 'ui.rules.reset': 'DEFAULT',
 // aria-labels of the − and + buttons; {rule} is the rule name
 'ui.rules.less': '{rule}: less',
 'ui.rules.more': '{rule}: more',
 // Sentences appended to the mode description
 'ui.rules.live': 'Rules of the game in progress.',
 'ui.rules.imposed': 'Rules set by the server.',
 'ui.rules.onlineNote': 'Online, these rules apply if the room is empty.',

 // Lobby: game modes (button title and subtitle)
 'ui.lobby.modeTitle': '01 / GAME MODE',
 'ui.mode.assault': 'ASSAULT',
 'ui.mode.assaultHint': 'Capture the 3 relays',
 'ui.mode.survival': 'SURVIVAL',
 'ui.mode.survivalHint': 'Hold off the waves',
 'ui.mode.tdm': 'TEAMS',
 'ui.mode.tdmHint': 'Team deathmatch',
 'ui.mode.ctf': 'FLAG',
 'ui.mode.ctfHint': 'Capture the flag',
 // Free-for-all mode; short button title
 'ui.mode.ffa': 'MELEE',
 'ui.mode.ffaHint': 'Free-for-all',

 // Lobby: loadout, bots, deploy
 'ui.lobby.loadoutTitle': '02 / YOUR LOADOUT',
 'ui.lobby.botsTitle': '03 / BOT INTELLIGENCE',
 'ui.difficulty.recruit': 'Recruit — easy',
 'ui.difficulty.soldier': 'Soldier — normal',
 'ui.difficulty.veteran': 'Veteran — hard',
 'ui.difficulty.elite': 'Elite — expert',
 // Sentences appended to the bot level description
 'ui.difficulty.live': 'Level of the game in progress.',
 'ui.difficulty.imposed': 'Level set by the server.',
 'ui.difficulty.onlineNote': 'Online: one shared level, chosen when the room is created.',
 // Big deploy button (narrow)
 'ui.lobby.deploy': 'DEPLOY',
 // Small line under DEPLOY, items joined with " · "
 'ui.deploy.vr': 'HEADSET',
 'ui.deploy.table': 'TABLETOP',
 'ui.deploy.room': 'ROOM',
 'ui.deploy.joinGame': 'JOIN THE GAME',
 'ui.deploy.joinServer': 'JOIN THE SERVER',

 // Online room status in the lobby
 'ui.room.unreachable': 'SERVER UNREACHABLE',
 'ui.room.searching': 'LOOKING FOR THE SERVER…',
 'ui.room.unreachableNote': 'Your settings will apply if the room is empty when you connect.',
 'ui.room.empty': 'EMPTY ROOM',
 'ui.room.emptyNote': 'Your settings will create the game.',
 'ui.room.emptyNoteFixed': 'Your settings will create the game, except those the server imposes.',
 // {n}: team score
 'ui.room.blue': 'BLUE {n}',
 'ui.room.red': 'RED {n}',
 'ui.room.waiting': 'WAITING FOR OPPONENTS',
 'ui.room.over': 'ROUND OVER',
 // {time}: mm:ss
 'ui.room.remaining': '{time} LEFT',
 'ui.room.elapsed': '{time} ELAPSED',
 'ui.room.live': 'GAME IN PROGRESS · {mode}',
 // {level}: bot level name
 'ui.room.mapBots': '{map} · AI {level}',
 // {clock}: one of the waiting/over/remaining/elapsed texts
 'ui.room.counts': '{players}/{capacity} HUMANS · {bots} BOTS · {clock}',

 // Local network games, in the lobby
 'ui.lan.title': 'LOCAL NETWORK',
 'ui.lan.thisDevice': 'THIS DEVICE',
 'ui.lan.hostHere': 'Host the game here',
 // {host}: player name, uppercase
 'ui.lan.hostGame': '{host}’S GAME',
 'ui.lan.detail': '{mode} · {map} · {players}/{capacity} humans',
 'ui.lan.detailVersion': '{mode} · {map} · {players}/{capacity} humans · version {version}',
 'ui.lan.searching': 'Searching for games on the local network…',
 // {address}: URL
 'ui.lan.help': 'Players on the local network see your game in their list as soon as you join it. From a browser, they open {address}.',

 // Arsenal
 'ui.arsenal.eyebrow': 'PREPARATION / LOADOUT',
 'ui.arsenal.title': 'YOUR <em>ARSENAL.</em>',
 'ui.arsenal.subtitle': 'Five approaches. One mission.',
 'ui.arsenal.sidearm': 'SIDEARM',
 'ui.arsenal.commonGear': 'STANDARD ISSUE <b>2 FRAG GRENADES</b>',
 'ui.arsenal.back': 'BACK TO DEPLOYMENT ↗',
 // Weapon stat bars
 'ui.arsenal.damage': 'DAMAGE',
 'ui.arsenal.rate': 'FIRE RATE',
 'ui.arsenal.accuracy': 'ACCURACY',
 // Rounds per minute; {rate}: number
 'ui.arsenal.rpm': '{rate} RPM',
 'ui.arsenal.equipped': '✓ EQUIPPED',
 'ui.arsenal.equip': 'EQUIP ↗',

 // Briefing
 'ui.briefing.eyebrow': 'INTELLIGENCE / CLASSIFIED',
 'ui.briefing.title': 'TAKE BACK <em>CONTROL.</em>',
 'ui.briefing.situation': 'SITUATION',
 'ui.briefing.assault': 'ASSAULT · CO-OP',
 'ui.briefing.assaultText': '3 relays to secure · enemy reinforcements',
 'ui.briefing.survival': 'SURVIVAL · CO-OP',
 'ui.briefing.survivalText': 'Ever-growing waves',
 'ui.briefing.tdm': 'TEAM DEATHMATCH',
 'ui.briefing.tdmText': 'Alpha vs Bravo · friendly fire off',
 'ui.briefing.ctf': 'CAPTURE THE FLAG',
 'ui.briefing.ctfText': 'Bring the enemy flag back to your base',
 'ui.briefing.ffa': 'FREE-FOR-ALL',
 'ui.briefing.ffaText': 'Everyone against everyone, humans and bots',
 'ui.briefing.rules': 'ADJUSTABLE RULES',
 'ui.briefing.rulesText': 'Duration, objective and headcount of each side.<br>Solo vs AI or online: same rules, same engine.',

 // Operator's manual (briefing): action names, then how to do them
 'ui.manual.title': 'OPERATOR’S MANUAL',
 'ui.manual.editKeys': 'CUSTOMIZE KEYS',
 'ui.manual.moveSprint': 'Move / Sprint',
 'ui.manual.look': 'Look',
 'ui.manual.aimFire': 'Aim / Fire',
 'ui.manual.padSidearm': 'Draw the revolver and fire',
 'ui.manual.jumpCrouch': 'Jump, climb / Crouch',
 'ui.manual.reloadGrenade': 'Reload / Grenade',
 'ui.manual.nextPrev': 'Next / previous weapon',
 'ui.manual.scoresHoldPause': 'Scores (hold) / Pause',
 'ui.manual.breath': 'Hold breath (scope)',
 // {key}: a key or controller button, e.g. "LEFT SHIFT WHILE AIMING"
 'ui.manual.breathKey': '{key} WHILE AIMING',
 'ui.manual.menus': 'Menus: select / confirm / back',
 'ui.manual.touchMove': 'LEFT STICK · PUSH FAR FORWARD',
 'ui.manual.touchLook': 'SWIPE ON THE RIGHT',
 'ui.manual.fireAimToggle': 'Fire / Aim (toggle)',
 // Shown between the fire and aim pictograms
 'ui.manual.touchFireSides': 'RIGHT OR LEFT',
 'ui.manual.reloadSwitch': 'Reload / Switch weapon',
 // Tap the ammo counter to reload / the weapon badge to switch
 'ui.manual.touchOnAmmo': 'ON THE AMMO',
 'ui.manual.touchWeaponBadge': 'WEAPON BADGE',
 'ui.manual.grenade': 'Grenade',
 'ui.manual.touchNearStick': 'NEAR THE STICK',
 'ui.manual.moveTurn': 'Move / Turn head',
 'ui.manual.sprintCrouch': 'Sprint / Crouch (toggle)',
 'ui.manual.jumpReload': 'Jump, climb / Reload',
 'ui.manual.ladder': 'Climb a ladder',
 'ui.manual.ladderHow': 'MOVE FORWARD FACING THE LADDER',
 'ui.manual.grenadeSwitch': 'Grenade / Switch weapon',
 'ui.manual.scoresPause': 'Scores / Pause',
 // Mouse controls listed with the keys (uppercase)
 'ui.manual.mouse': 'MOUSE',
 'ui.manual.rightClick': 'RIGHT CLICK',
 'ui.manual.leftClick': 'LEFT CLICK',
 'ui.manual.wheel': 'WHEEL',

 // Lobby footer and sound button
 'ui.footer.modes': 'SOLO &amp; MULTIPLAYER',
 'ui.footer.keyboard': 'KEYBOARD &amp; MOUSE',
 'ui.footer.touch': 'TOUCHSCREEN',
 'ui.footer.pad': 'CONTROLLER',
 'ui.sound.on': 'SOUND ON',
 'ui.sound.off': 'SOUND OFF',
 'ui.sound.toggle': 'Turn sound on or off',
 'ui.sound.unmute': 'Turn sound on',
 'ui.sound.mute': 'Mute sound',

 // In-game HUD (static parts)
 'ui.hud.teamScores': 'Team scores',
 'ui.hud.timeLeft': 'TIME LEFT',
 // Compass points (one or two letters)
 'ui.hud.west': 'W',
 'ui.hud.northWest': 'NW',
 'ui.hud.northEast': 'NE',
 'ui.hud.east': 'E',
 // Incoming grenade alert, very short
 'ui.hud.grenadeAlert': 'GRENADE',
 // Objective marker label, very short
 'ui.hud.relay': 'RELAY',
 'ui.hud.minimap': 'Tactical map',
 // Key hints at the bottom of the screen, next to a key
 'ui.hud.hintReload': 'RELOAD',
 'ui.hud.hintGrenade': 'GRENADE',
 'ui.hud.hintWeapon': 'WEAPON',
 'ui.hud.hintPause': 'PAUSE',
 'ui.hud.reloading': 'RELOADING',
 // Scoreboard heading during a mission
 'ui.hud.report': 'FIELD REPORT',

 // Respawn screen
 'ui.respawn.title': 'BACK INTO THE FIGHT',
 'ui.respawn.auto': 'Automatic respawn',
 // After the TAB key
 'ui.respawn.scores': 'Scores',
 'ui.respawn.loadout': 'WEAPONS FOR NEXT DEPLOYMENT',
 'ui.respawn.loadoutLabel': 'Weapons for next deployment',

 // Pause menu
 'ui.pause.eyebrow': 'TRANSMISSION SUSPENDED',
 'ui.pause.title': 'PAUSED.',
 'ui.pause.text': 'Get back in position, operator.',
 'ui.pause.loadout': 'WEAPONS FOR NEXT RESPAWN',
 'ui.pause.loadoutLabel': 'Weapons for next respawn',
 'ui.pause.resume': 'RESUME MISSION',
 'ui.pause.settings': 'SETTINGS',
 'ui.pause.quit': 'QUIT MISSION ↗',
 'ui.pause.lockHelp': 'Click to capture the mouse. Esc to release it.',
 // "Resume" is the resume button
 'ui.pause.touchHelp': 'Tap Resume to get back into the fight.',
 // {start}, {a}: controller button names
 'ui.pause.padHelp': '{start} or {a} to resume.',
 'ui.pause.rotate': 'Turn the device to landscape to play.',

 // Online: join window
 'ui.online.close': 'Close multiplayer',
 // Followed by the mode name
 'ui.online.eyebrow': 'ONLINE GAME /',
 'ui.online.title': 'JOIN<br><em>THE FIGHT.</em>',
 'ui.online.intro': 'Up to 8 humans. Bots fill out the sides: play as soon as you arrive, and each new human replaces a bot. In an empty room, the mode, map, rules and bot level chosen in the lobby apply.',
 'ui.online.name': 'Your callsign',
 'ui.online.namePlaceholder': 'Your operator name',
 'ui.online.team': 'Your team (team modes)',
 'ui.online.teamAuto': 'Automatic — balance the teams',
 'ui.online.teamBlue': 'ALPHA — blue',
 'ui.online.teamRed': 'BRAVO — orange',
 'ui.online.address': 'Server address',
 // “Network” is the label the server prints in its terminal
 'ui.online.help': 'On other computers, open the “Network” address shown in the server’s terminal.',
 'ui.online.connect': 'JOIN SERVER',
 'ui.online.connecting': 'Connecting to server…',
 'ui.online.roomLive': 'Room in progress: {mode} · {map} · {players}/{capacity} humans. You will join this game.',
 'ui.online.roomEmpty': 'Empty room. Your settings will apply.',
 'ui.online.roomEmptyMode': 'Empty room · mode set: {mode}. Your settings will apply.',
 'ui.online.roomEmptyMap': 'Empty room · map set: {map}. Your settings will apply.',
 'ui.online.roomEmptyModeMap': 'Empty room · mode set: {mode} · map set: {map}. Your settings will apply.',

 // Key bindings window
 'ui.keys.close': 'Close keys',
 'ui.keys.title': 'KEYS.',
 'ui.keys.help': 'Click a slot, then press the key you want. Esc cancels, Backspace clears the slot. A key already in use moves to the new action.',
 'ui.keys.reset': 'DEFAULT KEYS',
 // Under an action name; {button}: "left click" or "right click"
 'ui.keys.orMouse': 'or {button}',
 // aria-label of a key slot; {slot}: 1 or 2
 'ui.keys.slot': '{action}, key {slot}: {key}',
 'ui.keys.none': 'none',
 // In a key slot while waiting for a key (short)
 'ui.keys.press': 'PRESS…',
 'ui.keys.reserved': 'This key is reserved. Pick another one for “{action}”.',
 'ui.keys.moved': '{key} was removed from “{action}”.',
 'ui.keys.restored': 'Default keys restored.',

 // Actions that can be bound to keys
 'ui.action.forward': 'Move forward',
 'ui.action.back': 'Move back',
 'ui.action.left': 'Strafe left',
 'ui.action.right': 'Strafe right',
 'ui.action.turnLeft': 'Turn left',
 'ui.action.turnRight': 'Turn right',
 'ui.action.fire': 'Fire',
 'ui.action.aim': 'Aim',
 'ui.action.reload': 'Reload',
 'ui.action.grenade': 'Grenade',
 'ui.action.primary': 'Primary weapon',
 'ui.action.secondary': 'Sidearm',
 'ui.action.sprint': 'Sprint, hold breath',
 'ui.action.crouch': 'Crouch (toggle)',
 'ui.action.jump': 'Jump, climb',
 'ui.action.scores': 'Scores',
 'ui.action.leftClick': 'left click',
 'ui.action.rightClick': 'right click',

 // Keyboard key names (uppercase, short: shown on key caps)
 'ui.key.Space': 'SPACE',
 'ui.key.ShiftLeft': 'LEFT SHIFT',
 'ui.key.ShiftRight': 'RIGHT SHIFT',
 'ui.key.ControlLeft': 'LEFT CTRL',
 'ui.key.ControlRight': 'RIGHT CTRL',
 'ui.key.Tab': 'TAB',
 'ui.key.Enter': 'ENTER',
 'ui.key.NumpadEnter': 'NUMPAD ENTER',
 'ui.key.Backspace': 'BACKSPACE',
 'ui.key.Delete': 'DELETE',
 'ui.key.Insert': 'INSERT',
 'ui.key.Home': 'HOME',
 'ui.key.End': 'END',
 'ui.key.PageUp': 'PAGE ↑',
 'ui.key.PageDown': 'PAGE ↓',
 'ui.key.NumpadDecimal': 'NUMPAD .',
 'ui.key.Escape': 'ESC',
 // Mac keyboards
 'ui.key.optionLeft': 'LEFT OPTION',
 'ui.key.optionRight': 'RIGHT OPTION',
 'ui.key.altLeft': 'LEFT ALT',
 'ui.key.altGr': 'ALT GR',
 // A numeric keypad key; {key}: digit or symbol
 'ui.key.numpad': 'NUMPAD {key}',
 // Between two keys of one action: "E OR SPACE"
 'ui.key.or': 'OR',

 // Controller names
 'ui.pad.leftStick': 'LEFT STICK',
 'ui.pad.rightStick': 'RIGHT STICK',
 // Directional pad; followed by an arrow for left/right
 'ui.pad.dpad': 'D-PAD',
 'ui.pad.connected': 'CONTROLLER CONNECTED',
 // {button}: controller button name
 'ui.pad.pauseHint': '{button}: pause',

 // Touch controls (button names, read by screen readers and the layout editor)
 'ui.touch.stick': 'Movement joystick',
 'ui.touch.fire': 'Fire',
 'ui.touch.aim': 'Aim',
 'ui.touch.jump': 'Jump or climb',
 'ui.touch.crouch': 'Crouch',
 'ui.touch.fireLeft': 'Fire with the left hand',
 'ui.touch.grenade': 'Throw a grenade',
 'ui.touch.reload': 'Reload',
 'ui.touch.weapon': 'Switch weapon',
 'ui.touch.scores': 'Show scores',
 'ui.touch.pause': 'Pause',
 // Touch layout editor
 'ui.touch.layoutTitle': 'CONTROL LAYOUT',
 'ui.touch.size': 'Size',
 'ui.touch.reset': 'DEFAULT',
 'ui.touch.cancel': 'CANCEL',
 'ui.touch.save': 'SAVE',
 'ui.touch.rotate': 'Turn the device to landscape to arrange the controls.',
 // Placeholder on the weapon badge, 3-4 letters
 'ui.touch.weaponShort': 'GUN',
 'ui.touch.hintNone': 'Drag a button or the joystick to move it.',
 'ui.touch.hintStick': 'Joystick: its resting place, where it returns and where it stays in semi-fixed or fixed mode.',
 // {button}: button name
 'ui.touch.hintButton': '{button}: drag to move it, set the size below.',

 // Settings
 'ui.settings.close': 'Close settings',
 'ui.settings.eyebrow': 'OPERATOR CONFIGURATION',
 'ui.settings.title': 'SETTINGS.',
 // In every other language, keep the English word too ("Langue · Language") so a player can find it in a language they can't read.
 'ui.settings.language': 'Language',
 'ui.settings.languageNote': 'Applied when you close the settings: the game restarts.',
 'ui.settings.languageAuto': 'Automatic (device language)',
 'ui.settings.sensitivity': 'Aim sensitivity',
 'ui.settings.fov': 'Horizontal field of view',
 // {value}: degrees
 'ui.settings.fovDefault': '{value}° · default',
 'ui.settings.fovNote': 'Wider shows more at the sides, but everything looks smaller and rendering is heavier. In a headset, the view stays fixed.',
 'ui.settings.fovReset': 'DEFAULT VALUE',
 'ui.settings.volume': 'Volume',
 // A percentage; {n}: number
 'ui.settings.percent': '{n}%',
 'ui.settings.quality': 'Graphics quality',
 'ui.settings.qualityHigh': 'High — fine shadows and finish',
 'ui.settings.qualityMedium': 'Balanced — shadows and anti-aliasing',
 'ui.settings.qualityLow': 'Performance — reduced resolution',
 'ui.settings.qualityNote': 'This profile’s anti-aliasing will apply at next launch.',
 'ui.settings.stick': 'Movement joystick',
 'ui.settings.stickFloating': 'Floating — comes to your thumb',
 'ui.settings.stickSemi': 'Semi-fixed — stays put if your thumb is close',
 'ui.settings.stickFixed': 'Fixed — never moves',
 'ui.settings.layout': 'Control layout',
 'ui.settings.layoutNote': 'Move each button and the joystick, and set the button size.',
 'ui.settings.layoutEdit': 'CUSTOMIZE',
 'ui.settings.gyro': 'Gyro aiming',
 'ui.settings.gyroOff': 'Off',
 'ui.settings.gyroAim': 'While aiming — the device steers the view when you aim',
 'ui.settings.gyroAlways': 'Always — the device steers the view at all times',
 'ui.settings.gyroTilt': 'Tilt — leaning the device moves your aim, like a joystick',
 'ui.settings.calibrate': 'CALIBRATE',
 'ui.settings.recalibrate': 'RECALIBRATE',
 'ui.settings.calibrated': 'Calibrated: your aim moves while the device leans away from its neutral position, and stops when it returns.',
 'ui.settings.notCalibrated': 'Not calibrated yet: your aim won’t move.',
 // Countdown; {n}: seconds left
 'ui.settings.calibrating': 'Hold the device still in its neutral position, the way you will play… {n}',
 'ui.settings.noMotion': 'No device motion readings: allow them, then recalibrate.',
 'ui.settings.gyroSensitivity': 'Gyro sensitivity',
 'ui.settings.gyroHttps': 'The browser only gives gyro access over HTTPS: use the app or an HTTPS address.',
 'ui.settings.aimAssist': 'Aim assist (controller, touch and keyboard)',
 'ui.settings.aimAssistOff': 'Off',
 'ui.settings.aimAssistLight': 'Light',
 'ui.settings.aimAssistStandard': 'Normal',
 'ui.settings.aimAssistStrong': 'Strong',
 'ui.settings.pointer': 'View control',
 'ui.settings.pointerMouse': 'Mouse — raw movement, no acceleration',
 'ui.settings.pointerTrackpad': 'Trackpad — system acceleration',
 'ui.settings.trackpadSensitivity': 'Trackpad sensitivity',
 'ui.settings.aimMode': 'Aiming (right click or aim key)',
 'ui.settings.aimHold': 'Hold — aims while held down',
 'ui.settings.aimToggle': 'Toggle — press once to aim, again to stop',
 'ui.settings.keyboardPitch': 'Keyboard aim height',
 'ui.settings.pitchAuto': 'Automatic — locks onto the enemy ahead, else the horizon',
 'ui.settings.pitchLevel': 'Horizon — returns to the horizon when turning',
 'ui.settings.pitchKeep': 'Fixed — keeps the height set with the mouse',
 // Desktop app only: port of its built-in game server
 'ui.settings.serverPort': 'Game server port',
 'ui.settings.portApply': 'APPLY',
 'ui.settings.portListening': 'The server is listening on port {port}.',
 'ui.settings.portBusy': 'Port {configured} was taken at startup: the server is listening on port {port}.',
 'ui.settings.portWarning': 'Applying another port quits the current game and disconnects online players.',
 'ui.settings.restarting': 'Restarting the server…',
 'ui.settings.portSaved': 'Port {port} saved.',
 'ui.settings.saved': 'Settings are saved on this device.',

 // End of mission
 'ui.results.retry': 'REDEPLOY',
 'ui.results.lobby': 'BACK TO BASE ↗',

 // Startup failure
 'ui.error.title': '3D RENDERING UNAVAILABLE',
 'ui.error.enable': 'Enable hardware acceleration in your browser, then reload the page.',
 'ui.error.retry': 'RETRY',
 'ui.error.startFailed': 'The 3D renderer could not start. Check that WebGL and hardware acceleration are enabled, then reload the page.',
};
