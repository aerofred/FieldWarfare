# Field Warfare

Solo and multiplayer military FPS built with Three.js. Original code, maps and interface.

Designed for computers with keyboard and mouse, playable on phones and tablets with the touch controls, and everywhere with a gamepad. Google Fonts are optional; 3D rendering and audio are local.

> **Built with AI:** the code, maps, interface, documentation and app icon were created with AI assistants, under the direction and review of the author.

## Contents

- [Getting started](#getting-started)
- [Modes](#modes)
- [Maps](#maps)
- [Arsenal](#arsenal)
- [Controls](#controls)
- [Bot AI](#bot-ai)
- [Streaks, grenades and records](#streaks-grenades-and-records)
- [Collisions and hits](#collisions-and-hits)
- [Rendering and performance](#rendering-and-performance)
- [Languages](#languages)
- [Augmented reality (iOS app)](#augmented-reality-ios-app)
- [Multiplayer](#multiplayer)
- [Local network (apps and dedicated server)](#local-network-apps-and-dedicated-server)
- [Windows, macOS and iOS apps](#windows-macos-and-ios-apps)
- [Deployment package](#deployment-package)
- [GitHub releases](#github-releases)
- [Verification and tests](#verification-and-tests)

## Getting started

```sh
npm install
npm run build
npm run dev
```

Open <http://127.0.0.1:4173> in a browser with WebGL.

On Windows PowerShell, use `npm.cmd` instead of `npm`.

## Modes

There are five modes, each playable solo against the AI or online, with the same rules. In the lobby, choose the mode (01), then **WHERE TO PLAY** (**SOLO** or **ONLINE**), then the map and rules in the right panel.

| Mode | Type | Goal |
| --- | --- | --- |
| **Assault** | Co-op | Secure relays A, B, then C before time runs out. |
| **Survival** | Co-op | Hold off the waves. |
| **Team Deathmatch** | Competitive | ALPHA versus BRAVO. |
| **Capture the Flag** | Competitive | Bring the enemy flag back to your base. |
| **Free-for-All** | Competitive | Everyone against everyone, humans and bots. |

### Co-op

- **Assault:** stay seven seconds in each relay's circle and eliminate the enemies contesting it. The enemy sends two reinforcements at each relay, then more at regular intervals whenever its numbers are short.
- **Survival:** each wave has two more hostiles than the last. You resupply between waves.
- A downed teammate comes back after ten seconds (Assault) or at the next wave (Survival). The mission fails if all the humans in the squad are down at the same time. When you play alone, going down ends the mission.

### Competitive

- **Team Deathmatch:** the first team to the elimination limit wins. Otherwise the best score when time runs out wins, and ties are possible.
- **Capture the Flag:** take the enemy flag by walking over it, and bring it back to your base while your own flag is there.
  - A carrier who is killed drops the flag. A defender who touches a dropped flag returns it to base; otherwise it goes back on its own after 20 seconds.
  - The carrier can fire, aim, reload and throw grenades, but can't sprint or climb, and shows up on the enemy minimap.
  - Bots split between attack (two out of three) and defense, escort their carrier and chase whoever took their flag.
- **Free-for-All:** the first to the elimination limit wins, otherwise the best score when time runs out. Fighters respawn at the point farthest from the other fighters.
- In all competitive modes, fighters respawn after four seconds with two seconds of protection. Friendly fire and friendly grenades are disabled. Allies are blue and opponents orange (in Free-for-All, everyone else is orange).

### During a match

- **Tab** shows the scores and the fighter table (eliminations, captures, deaths).
- In solo, the game pauses when the window loses focus or mouse capture.
- Online, menus release the mouse but the game continues on the server.
- Health regenerates after six seconds without damage.
- Ammo and grenades are restored at each captured relay, completed wave or respawn.
- Audio, sensitivity, view control, aiming and quality settings are saved on the device.

### Adjustable rules

Use the **−** / **+** buttons in the right panel. Rules are saved per mode on the device, and **DEFAULT** restores the original values.

| Mode | Settings |
| --- | --- |
| Assault | Duration (2–20 min), squad (1–8 operators), active hostiles (2–12). The three relays remain the objective. |
| Survival | Waves (3–10), squad (1–8), hostiles in the first wave (2–10). No time limit. |
| Team Deathmatch | Duration (3–20 min), victory (10–100 eliminations), ALPHA and BRAVO size (1–8 each). |
| Capture the Flag | Duration (5–20 min), captures (1–10), team sizes. |
| Free-for-All | Duration (3–20 min), victory (5–60 eliminations), fighters (2–12). |

Team sizes count humans and bots, so ALPHA 1 and BRAVO 5 puts you alone against five bots. Bots always fill the remaining slots.

## Maps

Choose the map under **THEATER OF OPERATIONS** before deploying. The choice is saved on the device. Every map offers all five modes, solo and online.

| Map | `MAP=` | Description |
| --- | --- | --- |
| **The Foundry** | `factory` | The original map: an abandoned factory and containers. |
| **The Two Gardens** | `gardens` | Two single-story houses facing each other across a street. Entrances on the street side, exits onto the gardens, interior rooms, windows and side passages around each house. A bus and a car serve as cover. |
| **Rail Depot** | `railway` | Four staggered railcars, two platforms, a workshop you can walk through, an accessible freight office and several passages between the tracks. |
| **The Outpost** | `desert` | A mud-brick desert village around a well. Flat roofs reached by ladders, two houses you can walk through, a water tower, an open hangar, low walls and pickup truck wrecks. Long sight lines. |
| **The Market Halls** | `market` | A downtown area at dusk. A covered market hall in the center, eight shops with a street door and a backyard door, a kiosk, a fountain, cars and a bus, shop windows and string lights. Close-quarters combat. |
| **The Harbor** | `harbor` | Snowy docks by the sea, with falling snow. A trawler in dry dock (deck and wheelhouse reached by ladders), a gantry crane, a catwalk at 3 m, a cold-storage warehouse, a fish auction hall and containers. Bots stay on the ground. |

- Spawn points, assault relays, flag bases and patrols are specific to each map, and bots also move through the interiors.
- Online, the first human in an empty room chooses the shared map, and later players load it automatically.
- The server can force a map with the `MAP` environment variable, using the values above.

## Arsenal

Each operator carries one primary weapon and one sidearm. Key **1** selects the primary and **2** the sidearm; the mouse wheel, **Y / △** or the touch button switch between them. The server rejects any other weapon.

**Changing weapons:** choose them in the arsenal before deploying. You can change them again at each respawn: during the countdown, the **BACK INTO THE FIGHT** screen offers the five primaries (keys **1**–**5**, mouse wheel, **Y / △**, the gamepad D-pad, or a tap on a touchscreen) and the two sidearms (keys **6** and **7**). The pause menu offers the same choice without interrupting your current life. The new weapons are in hand from the next respawn. In solo Assault, where death ends the round, **REDEPLOY** brings back the weapons chosen in the pause menu or during the countdown.

Weapon names follow one pattern: the role, then the caliber, with an **S** added for suppressed weapons. For example, **SMG-9S** is a suppressed 9 mm submachine gun.

### Primary weapons

| Weapon | Role | Caliber | Damage | Rate | Magazine | Reload | Mobility |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **LMG-5.56** | Light machine gun | 5.56 × 45 | 26 | 600 rpm | 100 | 4.5 s | 90% |
| **MMG-7.62** | Medium machine gun | 7.62 × 51 | 34 | 750 rpm | 100 | 5.5 s | 80% |
| **SG-12** | Shotgun | 12 gauge | 8 × 17 | 70 rpm | 6 | 3 s | 100% |
| **SR-12.7** | Sniper rifle | 12.7 × 99 | 120 | 40 rpm | 5 | 3.8 s | 88% |
| **SMG-9S** | Submachine gun, suppressed | 9 × 19 | 21 | 880 rpm | 30 | 1.6 s | 100% |

- **LMG-5.56:** commando-style version with a short barrel, flash hider, vertical grip and collapsible stock. Accurate when aiming and handy, built for support fire at medium range. Full damage up to 40 m, 70% at 100 m. All bots use this weapon.
- **MMG-7.62:** massive receiver, thick barrel in a shroud, wooden stock, ammo box and iron sights. The fastest to kill up close (three bullets), but it sprays, even when aiming. Slow to shoulder (0.5 s), slow to fire after a sprint (0.45 s), and long to reload. 60% damage at 80 m.
- **SG-12:** a pump shotgun with a straight wooden stock and no pistol grip, a wide barrel and a magazine tube underneath. Each shot fires eight pellets, each traced individually. A full shot kills up to about 11 m (full damage up to 6 m, dropping to zero at 25 m). Aiming barely tightens the spread. The pump is worked after each shot, and reloading slides the shells into the tube one by one.
- **SR-12.7:** one body shot kills at any range. Short five-round magazine. Fired without aiming it goes anywhere; fully aimed (0.4 s) it is perfectly accurate. Manual bolt: 1.5 s between shots. Hold **Shift** (or **L3** on a gamepad) while aiming to hold your breath for a few seconds.
- **SMG-9S:** the quickest in hand and the fastest to kill up close (0.27 s), but its damage drops from the first meter and its bullets stop at 42 m. Its integrated suppressor muffles the report and flash, removes the bullet whiz, and stops enemies from locating the shooter by sound.

The LMG-5.56 and SR-12.7 magazines slot into a well under the receiver (the LMG-5.56 takes a straight box magazine).

### Sidearms

| Weapon | Role | Caliber | Damage | Rate | Magazine | Reload |
| --- | --- | --- | --- | --- | --- | --- |
| **RV-357** | Revolver | .357 Magnum | 58 | 150 rpm | 6 | 2.7 s |
| **PST-380S** | Pistol, suppressed | .380 ACP | 30 | 350 rpm | 8 | 1.5 s |

- **RV-357:** when aiming, the front sight (with an orange dot) sits in the notch of the rear sight, in the center of the screen, above the hammer.
- **PST-380S:** the opposite of the RV-357. Half as powerful (four body shots versus two), but with a screw-on suppressor, light recoil, quick aiming and a short reload. Like the SMG-9S, it makes almost no flash or noise, and enemies can't locate the shooter by sound. The slide moves back with each shot and locks open on an empty magazine.

### Handling and sound

- Shouldering time also counts on the server: accuracy moves from hip to aimed at the weapon's pace, and returns to hip as soon as you release aim.
- Weapon weight slows down human players. Bots keep their speed, which their movement is tuned to.
- **Shell casings:** a dull thud on the ground and the short, inharmonic ring of a brass tube, deeper for big cases (the SR-12.7's 12.7 mm). The shotgun's plastic shells make a hollow "tock". Each bounce is quieter than the last.
- **Hits:** a dull, muffled impact on the body; a sharp knock on the helmet with a brief metallic note on the head; a heavier, deeper thud on an elimination.

Online, the server must be up to date: older clients and servers don't know these weapons.

## Controls

### Keyboard and mouse

Keys can be changed under **BRIEFING** > **OPERATOR'S MANUAL** > **CUSTOMIZE KEYS**. Each action takes two keys: click a slot, then press the key you want (**Esc** cancels, **Backspace** clears the slot). A key that is already taken moves to the new action. The manual and the HUD hints show your chosen keys, which are saved with the settings. **Esc** always pauses, and while you're down, **1**–**5** still choose the weapon.

Default keys:

| Action | Key |
| --- | --- |
| Move | ZQSD or WASD |
| Look | Mouse |
| Forward / back | ↑ / ↓ |
| Turn | ← / → (slower when aiming) |
| Fire | Left click or **X** |
| Aim | Right click or **E** (held, or toggle: see [Trackpad](#trackpad-macbook-and-laptops)) |
| Sprint | Left Shift |
| Crouch / stand up | **C** (toggle) |
| Jump, climb | Space |
| Reload | **R** |
| Throw a grenade | **G** |
| Primary / sidearm | **1** / **2**, or the mouse wheel |
| Statistics | Tab |
| Pause and release the mouse | Esc |
| Hold breath (SR-12.7, aiming) | Shift |

Sprinting or jumping also makes the character stand up.

**Keyboard-only play:** the arrow keys make it possible to play entirely on the keyboard. Since the keyboard can't look up or down, **Settings** > **Keyboard aim height** sets the height:

- **Automatic** (default): aims at the upper torso of the visible enemy most directly ahead, at any height (roof, stairs, crouching), otherwise at the horizon.
- **Horizon:** returns to the horizon when turning.
- **Fixed:** keeps the height set with the mouse.

On the keyboard, aim assist (slowdown near a target, tracking, snap when aiming) applies as it does on a gamepad, according to **Settings** > **Aim assist**. Turning with the keyboard switches to keyboard play; moving the mouse leaves it.

**Climbing:** press Space when facing an obstacle up to about 1.5 m (low wall, crate, machine) to climb onto it. Move forward when facing a ladder to climb it, move back to go down, and press Space to let go. At the top, moving forward takes you onto the roof. The weapon is lowered while climbing, so you can't fire or aim. Ladders are found on:

- the containers in The Foundry
- the sheds in The Two Gardens
- the ends of the railcars in Rail Depot
- the roofs in The Outpost
- the shop roofs in The Market Halls
- the trawler, catwalk and container in The Harbor

### Gamepad (computer, phone, tablet)

Xbox, PlayStation and compatible controllers recognized by the browser work over USB or Bluetooth. Press a button for the gamepad to take over; the keyboard, mouse or touchscreen take control back as soon as they are used.

| Action | Xbox | PlayStation |
| --- | --- | --- |
| Move | Left stick | Left stick |
| Sprint (stick forward) | L3 | L3 |
| Look | Right stick | Right stick |
| Aim (held) | LB | L1 |
| Fire | RB | R1 |
| Draw and fire the sidearm | RT | R2 |
| Throw a grenade | LT | L2 |
| Jump, climb | A | ✕ |
| Crouch (toggle) | B | ○ |
| Reload | X | □ |
| Next weapon | Y or D-pad right | △ or D-pad right |
| Previous weapon | D-pad left | D-pad left |
| Scores (held) | VIEW | SHARE |
| Pause | MENU | OPTIONS |
| Hold breath (SR-12.7, aiming) | L3 | L3 |

- **RT / R2:** a short press fires as soon as the sidearm is in hand. **Y / △** then switches to the next weapon.
- **Menus:** D-pad or left stick to choose, **A** to confirm, **B** to go back, **MENU** to deploy or resume. Left and right adjust the sliders and lists in the settings. The aim sensitivity also sets the stick.
- Vibration on firing, taking damage and nearby explosions (Chrome and Edge).
- Without mouse capture, clicking the game takes it back, and Esc pauses.
- Chrome and Firefox only give access to gamepads over HTTPS or on localhost. From another machine over HTTP, go through an HTTPS proxy.
- iPhone and iPad need iOS 14.5 or later.
- Labels switch to PlayStation symbols with a Sony controller.

### Trackpad (MacBook and laptops)

- **Settings** > **View control** > **Trackpad.** Capture keeps the system acceleration (slow gestures for precision, fast gestures to turn), and the trackpad has its own sensitivity, separate from the mouse.
- Two-finger scrolling switches weapons only once per gesture: stop for a moment before the next switch.
- **Settings** > **Aiming** > **Toggle:** pressing **E** or a two-finger click aims, and a second press stops. This is also useful with a mouse.
- Tip: fire by pressing the trackpad down with your thumb and steer the view with your index finger. "Tap to click" doesn't allow automatic fire.
- On Windows, set **Settings** > **Touchpad** > **Touchpad sensitivity** to **Most sensitive** so the touchpad stays active while keys are pressed.

### Aim assist

Aim assist applies to the gamepad, the touchscreen and keyboard-only play, never to the mouse.

- Near a visible enemy, aiming slows down. It follows the target as long as you steer the view, move, aim or fire, and briefly snaps back onto it when you start aiming. A still view is never turned on its own.
- It ignores allies, enemies hidden behind a wall and those out of range, and turns off while sprinting and climbing.
- **Settings** > **Aim assist:** Off, Light, Normal (default) or Strong, set per device.
- Online, it only changes the player's orientation: the server validates shots as it does for everyone.

### Touchscreen (iPhone, iPad, Android)

Touch controls appear on their own on phones and tablets and hide while a gamepad is in use. Keyboard and mouse remain usable at the same time.

**Layout:**

- **Left half of the screen:** movement stick. Pushing it far forward, beyond its circle, makes you sprint. **Settings** > **Movement joystick** (saved on the device):
  - **Floating** (default): placed where your thumb lands.
  - **Semi-fixed:** stays in place when your thumb lands near it, otherwise comes under your thumb.
  - **Fixed:** never moves and ignores touches far from it.
- **Rest of the screen:** swipe to look.
- **Right edge:** four buttons, **Fire**, **Aim** (toggle), **Jump or climb** and **Crouch** (toggle). A swipe that starts on one of them also steers the view, so you can aim while firing without lifting your finger. **Crouch** acts when you release a touch without a swipe, so you don't crouch when your thumb passes over it to aim.
- **Left side:** **Fire with the left hand**, a second fire button used while the right thumb aims (at the top on phones, just above the stick on tablets), and **Throw a grenade** next to the stick, with the number of grenades left. Sliding your thumb from the stick onto the left fire button stops movement and fires immediately.
- **Bottom, on the ammo counter:** **Reload** (circular arrow; reloading is also automatic when the magazine is empty) and, to its left, **Switch weapon**, which shows the weapon in hand.
- **Top right:** **Pause** and **Show scores** (shown while held).

Every button shows a pictogram, and its name is its accessible label. Buttons stay subtle at rest and light up when touched.

**Customizing:** **Settings** > **Control layout** > **CUSTOMIZE** (landscape only). Drag any button or the joystick to move it, and set each button's size (60% to 180%). For the joystick, the chosen position is where it rests, where it returns and where it stays in semi-fixed or fixed mode. **DEFAULT** resets everything in the editor, **CANCEL** leaves without changes, and **SAVE** applies the layout and keeps it on the device.

The aim sensitivity in the settings also sets swiping.

**Gyro aiming** (**Settings**, off by default):

- The view follows the device's orientation the way a VR headset follows the head, on top of the swipe, which re-centers it. It looks where the back of the device points: turning around turns it, raising or lowering the device raises or lowers it, and tilting it sideways rolls it while the horizon stays level, in both landscape orientations.
- It uses the absolute orientation the system computes from the sensors, not rotation rates, so it doesn't drift and loses nothing when rendering slows down.
- **While aiming** uses it only while aiming (the view levels out again when you stop), and **Always** uses it all the time. It has its own sensitivity: at 1, the device and the view turn by the same angle, including when aiming and through the scope.
- **Tilt** (iPhone) turns the device into a joystick. While it leans away from its neutral position, the aim moves: rolling it like a steering wheel turns left or right, and tipping it forward or back lowers or raises the aim, faster as the angle grows. It stops when the device returns to neutral (3° dead zone). Tilt is measured against gravity alone, so it doesn't drift and turning around doesn't shift the neutral. Choosing this mode starts a calibration countdown: hold the device still in your playing position, which becomes the neutral (kept on the device). **RECALIBRATE** in the settings redoes it. Aiming is slowed down as with the stick, and the gyro sensitivity sets the speed.
- On iPhone and iPad, Safari asks for sensor access on the first touch after enabling it; the app gets it without asking. In a browser, an HTTPS (or localhost) address is required: over HTTP, the setting is grayed out with a note explaining why.

**VIEW menu** (top of the lobby's game settings, kept on the device): **Normal**, **VR headset (Cardboard)**, and in the iOS app **Tabletop model** and **Full room (LiDAR)** or **Room (floor and walls)** (see [Augmented reality](#augmented-reality-ios-app)).

- **VR headset:** split screen with two views for a Cardboard-style headset. Your head steers the view and the headset button fires. You move with the gamepad (**LT** aims, **LB** fires, **RB** throws a grenade, **R3** re-centers the horizon). It requires the gyroscope, so HTTPS in a browser (grayed out otherwise).

**Other notes:**

- Play in landscape: switching to portrait pauses the mission.
- There is no kill feed in the middle of the screen on these devices.
- The SR-12.7 scope appears at once, without the weapon-raise animation, and the scope image renders at reduced resolution. On all devices, the scene behind the scope is no longer drawn when the eyepiece covers the screen.
- Graphics quality defaults to **Performance** on these devices, and the resolution adapts on its own to keep the game smooth.
- **iPhone:** in Safari, Share > **Add to Home Screen** installs the game with its icon. It then opens full screen, without the Safari bars.
- iPad and Android switch to full screen on deployment.
- With the iPhone silent switch on, the game stays muted.
- Holding your breath on the scope has no touch equivalent.

## Bot AI

Choose **Recruit**, **Soldier**, **Veteran** or **Elite** in the deployment panel. The solo choice is saved on the device and applies to all modes.

| Level | Behavior | Grenades |
| --- | --- | --- |
| **Recruit** | Slow reactions, spaced-out shots, simple movement. | None |
| **Soldier** (normal) | Short bursts and strafing. | About every 40 s |
| **Veteran** | Faster reactions, accurate aim, flanking and use of cover. | About every 26 s |
| **Elite** | Very fast reactions, sustained bursts, tactical retreats. | About every 16 s |

**Damage:**

- The levels change decisions, accuracy and fire rate. Health and damage don't increase with difficulty.
- In co-op, enemies deal reduced damage (about 8 per bullet) and fire more slowly. In competitive modes, bots deal about 80% of their weapon's damage. Solo and online are identical.
- Each level deals about 2.5 times more damage per second than the previous one (at 20 m in solo: 2, 5, 15 and 40).

**Awareness:**

- Bots have a limited field of view and memory. They search for a lost target at its last known position and investigate nearby shots.
- They avoid firing when an ally is in their line of fire.
- A bot hit by a shooter it can't see (from behind, from far away, or with a suppressed weapon) remembers where the shot came from, to within four meters as with a shot it hears, and goes to check instead of continuing its patrol.

**Grenades:**

- An enemy who has just disappeared behind cover, between 8 and 24 m away, may get a grenade (direct or lobbed, bounces included).
- Bot grenades are scaled down like their bullets (about 28% in co-op, 80% in competitive).
- All bots flee a nearby enemy grenade as soon as they notice it (after their level's reaction time), and stop firing meanwhile.

**Online:** the first human in an empty room applies the level chosen in the lobby, and later arrivals keep it. The applied level is shown in each player's HUD. The host can force the level with `BOT_DIFFICULTY` (see [DEPLOYMENT.txt](DEPLOYMENT.txt)).

## Streaks, grenades and records

- **Streaks:** two eliminations less than four seconds apart give **DOUBLE KILL**, then **TRIPLE KILL** and **MULTI-KILL**. Without going down, a streak is announced at 3, 5, 10, 15… eliminations. Tab shows the current streak and the best of the round; the end screen shows the best.
- **Eliminations:** the feed shows the weapon (LMG-5.56, MMG-7.62, SG-12, SR-12.7, SMG-9S, RV-357, PST-380S, or GREN. for grenade). The respawn screen shows the weapon, whether it was a headshot, and the distance.
- **Grenade alert:** an enemy grenade within 9 m is shown around the reticle, in its direction, with its distance and a beep. It flashes red under 5 m. Allied grenades and your own aren't flagged.
- **Records:** best elimination count and longest streak per mode, saved on the device and shown at the end of the round (**NEW RECORD** when either is beaten).

Online, the weapon and distance of eliminations, grenade teams and bot grenades come from the server, so update it. With an older server, the game remains playable without this information.

## Collisions and hits

- Living characters block each other, whatever their team. Eliminated bodies don't block the way.
- Wall corners are handled with a rounded body and continuous movement, even at low frame rates.
- Head, torso, arms and legs share the same hit detection in solo and on the server. Hit volumes follow jumping, turning and stance.
- A weapon or backpack sticking out of cover doesn't count as a hit.
- The first wall or character stops the bullet. Friendly fire stays disabled.
- Ceilings block jumps, and you can land on low cover by jumping onto it.
- Grenades bounce off walls, cover and roofs.

## Rendering and performance

**Settings** > **Graphics quality** (saved on the device):

| Profile | Details |
| --- | --- |
| **Performance** | Reduced resolution, no shadows or post-processing, simplified sky clouds. Default on phones and tablets. |
| **Balanced** | 1024 shadows with sharp filtering (PCF), tone mapping, FXAA anti-aliasing and color grading. Default on computers. |
| **High** | 2048 shadows with soft filtering (PCF soft), bloom and full color grading. |

Switching profiles mid-game recompiles the materials once (brief hitch).

- **Post-processing chain:** bloom on the HDR image, then tone mapping and sRGB conversion, then FXAA (which thus reads display luminance as intended), and finally color grading with light dithering that removes banding in fog and sky gradients.
- **Dynamic resolution:** the render resolution drops below 50 frames per second and goes back up when the frame rate holds (never below 65%).
- **Shared textures:** procedural textures are shared per surface family (concrete, brick, metal, rust, wood, fabric, vegetation, plain). Each map loads eight texture sets instead of one per material, so switching maps is faster.
- **Animation:** soldiers outside the camera's view and more than 7 m away animate their skeleton only one frame in three, catching up on the skipped time.
- **Muzzle light:** the player's shots briefly light up nearby walls, except with suppressed weapons. The explosion light is reused.

## Languages

The interface is available in English, French, Spanish, Brazilian Portuguese, German and Japanese. It follows the device's preferred languages, falling back to English.

- **Settings** > **Language** overrides it, and **Automatic (device language)** follows the device again. The choice applies when the settings close, and the page reloads. It is stored on the device (`localStorage` key `fw-lang`).
- **iOS app:** the language list comes from the app's localizations (`ios/App/App/<lang>.lproj/InfoPlist.strings`, `CFBundleLocalizations` in `Info.plist`), which also translate the camera and local network permission prompts.

### Developer notes

- [`src/i18n.js`](src/i18n.js) provides `t(key, vars)` with `{name}` placeholders. Plural keys `key_one` / `key_other` are chosen with `Intl.PluralRules`. `translatePage()` fills the `data-i18n` and `data-i18n-attr` markup of `index.html`.
- Catalogs live in `src/locales/<lang>/{ui,game,data}.js`, with keys prefixed `ui.`, `game.` and `data.`. English is the base: a key missing from another catalog falls back to English. Outside a page (server, Node tests), the language is always English.
- The game server sends message keys (`data.error.*`) rather than text, and the client translates them. Raw text from older servers still shows.
- [`tests/i18n.test.mjs`](tests/i18n.test.mjs) checks that every catalog has the English keys, placeholders and markup. The browser checks (`scripts/*-check.mjs`) run with the `fr-FR` locale and keep French expectations.

**Adding a language:**

1. Copy `src/locales/en` to `src/locales/<id>` and translate it.
2. Register it in `LANGUAGES` in `src/i18n.js`.
3. For iOS, add `<id>.lproj/InfoPlist.strings` to the Xcode project, and add the language to `CFBundleLocalizations` (`Info.plist`) and `knownRegions` (`project.pbxproj`).

## Augmented reality (iOS app)

In the iPhone and iPad app (ARKit), the **VIEW** menu in the game settings also offers **Tabletop model** and a room view (**Full room (LiDAR)** or **Room (floor and walls)**, depending on the device). In these views, **DEPLOY** opens the camera to place the map or scan the room, then the panel's **DEPLOY** starts the mission. **← LOBBY** goes back to the settings (the page reloads, and the chosen weapons are kept). Camera access is requested the first time.

### Tabletop

The chosen map is placed on a table or the floor.

- **Placement:** aim at the surface in the center of the screen and sweep it slowly; the map follows. With two fingers, pinch to scale (1:400 to 1:16; 1:80 by default, which is 80 cm per side) and twist to rotate. **PLACE HERE** locks it, **MOVE** frees it, and **DEPLOY** starts the mode, map, rules and weapons chosen in the lobby (solo or online).
- **During the mission:** you move around the tabletop with the device. The center of the screen is the reticle. Your soldier, circled in green, fires at whatever it covers (green line of sight). An enemy whose chest comes within 40 points of the reticle is locked on (green reticle).
- The joystick moves the soldier relative to the screen, whatever direction the soldier is aiming in.
- There is no scope aiming from above, so the **Aim** button disappears. Sound is heard from the soldier's position.

### Room

Your room becomes the battlefield, and you are the device. The lobby switches to Survival and solo (mode, map and **ONLINE** grayed out). The scan type depends on the device:

- **Full room** (devices with LiDAR: iPad Pro, iPhone Pro): the room's 3D mesh provides the floor and every obstacle, furniture included. Soldiers behind real furniture or a real wall are hidden.
- **Floor and walls** (other devices): the floor and walls detected by ARKit. Furniture isn't recognized; only walls hide soldiers.

**Scan:** walk around the room, slowly sweeping the floor and the walls (and the furniture with LiDAR). The preview shows free floor in green and obstacles in orange (walls as a low band). **CONFIRM ROOM** requires at least 1.5 m² of contiguous free floor, and **RESCAN** starts over.

**Scale:** soldiers are at 1:8 (about 22 cm), so a 4 × 5 m room makes a 32 × 40 m battlefield, like the maps. Beyond 7.5 m per side, the soldiers grow so the room fits the battlefield (rooms are limited to 12 m). The couch becomes a six-meter wall.

**Mission:** Survival in solo, with the lobby's rules, difficulty and weapons.

- Waves enter the room from the farthest areas.
- You move by walking (no joystick, jump or crouch) and aim with the center of the screen (same lock-on as Tabletop). The weapon is held at the bottom of the screen as in normal play.
- Shots come from the device and enemies aim at it, so ducking behind furniture protects you. Since the device is visible from everywhere, enemies deal only 35% of their usual damage and don't throw grenades.
- Soldiers' shadows fall on the real floor (Balanced or High quality). The minimap shows the room and its obstacles.
- Exposure follows the room lighting as estimated by ARKit.

### Technical notes

- WKWebView has no WebXR. The `native/ar` plugin (Swift) runs ARKit, displays the camera behind the page and sends, every frame, the device pose, the projection and the point on the targeted surface.
- The page reports each frame it draws, and the camera image for that same pose is displayed, so the game stays locked to the real world even below 60 fps.
- During the scan, the plugin computes a 10 cm height grid aligned with the walls. On confirmation, it places an ARKit anchor at the grid's origin (ARKit re-adjusts it if its map of the room is refined) and sends the LiDAR mesh.
- The page turns the mesh into a world of boxes for collisions, shots and bot navigation ([`src/ar-room.js`](src/ar-room.js)). The game room places the operator at the device's position.

## Multiplayer

From the project folder:

```sh
npm install
npm run build
npm start
```

The same server provides the site and the WebSocket on TCP port 4173. The terminal shows a **Local** address and the machine's **Network** addresses.

1. The host opens <http://127.0.0.1:4173>; the other computers open the **Network** address shown, for example `http://192.168.1.10:4173`.
2. In each browser, choose the mode, then **ONLINE** under **WHERE TO PLAY**, then **DEPLOY**.
3. Enter a callsign (and a team for team modes), click **JOIN SERVER**, then **RESUME MISSION** to capture the mouse.

The connection window shows the game in progress on the server. In an empty room, the lobby's mode, map, rules and bot level apply; otherwise the player joins the game in progress, regardless of their own settings. The connection address is prefilled with the site's address and can be edited. If Windows asks, allow Node.js on the private network.

### Rules of an online room

- 8 humans maximum. Each side has the size set by the rules, and the humans on a side can't exceed it (full squad in co-op). By default, bots fill the free slots.
- The round starts as soon as the first human joins. New humans replace bots without interrupting the round, and a disconnected human is replaced by a bot. With no humans, the room empties.
- Bots move, fire, reload and respawn on the server. They are identical for all players and marked **BOT** in the scores.
- The server validates movement, collisions, shots, ammo, damage and scores.
- Esc opens the menu, but your operator stays vulnerable and the game continues.
- A new round starts automatically ten seconds after the previous one ends. In co-op, the mission restarts for the whole squad ten seconds after it ends.

### Server configuration

| Variable | Effect |
| --- | --- |
| `PORT` | TCP port (default `4173`). |
| `HOST` | Listening address. `127.0.0.1` restricts the server to this computer; `0.0.0.0` opens it to the network. |
| `BOTS` | `1` fills the teams with bots (default); `0` is humans only. One human per side is then required to start the round, and co-op enemies remain bots. |
| `MODE` | Forces a mode: `assault`, `survival`, `tdm`, `ctf` or `ffa`. The first player then only chooses the rules. |
| `MAP` | Forces a map (see [Maps](#maps)). |
| `BOT_DIFFICULTY` | Forces the bot level (see [DEPLOYMENT.txt](DEPLOYMENT.txt)). |
| `DISCOVERY` | `0` disables local network discovery. |

PowerShell example:

```powershell
$env:PORT = '4180'
$env:HOST = '0.0.0.0'
$env:BOTS = '1'     # 1: fill the teams; 0: humans only
$env:MODE = 'ctf'   # optional: force a mode
npm.cmd start
```

To play over the Internet, the server must be reachable from outside (public hosting or TCP port forwarding). An HTTPS proxy must forward WebSocket connections to `/multiplayer`. The game doesn't set up any external hosting or change the firewall.

## Local network (apps and dedicated server)

In the lobby, choose **ONLINE**, then **DEPLOY**. The connection window lists **THIS DEVICE**, then the games announced on the local network with their mode, map and number of humans. Picking one fills in the address.

- **Host:** choose **THIS DEVICE** and join. The game is announced over Bonjour/mDNS (service `_fieldwarfare._tcp`) as soon as a human plays in it, and withdrawn when the last one leaves. It is named after the first player's callsign.
- **Join:** choose **…'S GAME** in the list. Windows, macOS and iOS see each other and play together.
- **From a browser:** open the address shown below the list (for example `http://192.168.1.10:4173`); the app also serves the game.
- **First launch:** Windows asks to allow the app on the private network, and macOS and iOS ask for local network access. Without this permission, other players can't see the game.
- **Ports:** TCP 4173 by default (another free port if it is taken, announced the same way). The announcement uses UDP port 5353 multicast.
- **Choosing the port** (Windows, macOS): **Settings** → **Game server port** (1024–65535), then **APPLY**. The server restarts on that port immediately and the window follows it, keeping the settings. The current game is left and connected players are disconnected. A port already in use is refused without changing anything. The port is kept for later launches (`server.json` in the app's data folder).
- **iOS:** the hosted game stops when the app goes to the background, and connected players are disconnected.
- **Dedicated server** (`npm start` or `server.mjs`): keeps its `PORT` variable, announces itself the same way and lists the other games for browsers. `DISCOVERY=0` disables this.

## Windows, macOS and iOS apps

Each app contains the game and its own game server: there's no Node.js, browser or separate server to install for hosting.

**Windows** (from Windows):

```powershell
npm.cmd install
npm.cmd run app:win
```

Creates `releases/app/FieldWarfare-<version>-setup.exe` (installer) and `FieldWarfare-<version>-portable.exe` (no installation).

**macOS** (from a Mac):

```sh
npm install
npm run app:mac
```

Creates `FieldWarfare-<version>-mac.dmg` and `.zip` in `releases/app`, universal (Intel and Apple Silicon). With a "Developer ID Application" certificate in the keychain, electron-builder signs the app (public distribution then also needs notarization). Without one, set `CSC_IDENTITY_AUTO_DISCOVERY=false` to build it unsigned, as releases do.

**iOS and iPadOS 15 or later** (from a Mac with Xcode):

```sh
npm install
npm run app:ios
npx cap open ios
```

In Xcode, choose the signing team (**Signing & Capabilities**), then run on the iPhone or iPad. The app follows the device's orientation like the web version: menus also work in portrait, but the game is played in landscape (portrait pauses it). The displayed version and the Xcode build number come from the `package.json` version on each `npm run app:ios`.

**Other:**

- `npm run app:start` runs the desktop app without packaging it.
- App identifier: `com.aerofred.fieldwarfare` (`build.appId` in `package.json`, and `capacitor.config.json`).

### Unsigned desktop apps

The macOS and Windows apps published on GitHub aren't signed, so the system warns players the first time they open them.

- **macOS:** open the app once; macOS refuses it. Then go to **System Settings** > **Privacy & Security**, scroll down to the message about Field Warfare and click **Open Anyway**. If macOS says the app is damaged (a quarantined download), move it to Applications and run in Terminal:

  ```sh
  xattr -cr "/Applications/Field Warfare.app"
  ```

- **Windows:** SmartScreen shows "Windows protected your PC". Click **More info**, then **Run anyway**.

The same instructions appear on every release page ([`.github/release-notes.md`](.github/release-notes.md)).

## Deployment package

```sh
npm run package
npm run test:package
```

Creates `releases/field-warfare-<version>-server.zip` and `.tar.gz`. Extract the package on the target machine with Node.js 22 or later, then run `node server.mjs` or `npm start`. No `npm install` is required.

See [DEPLOYMENT.txt](DEPLOYMENT.txt) for instructions and network configuration.

## GitHub releases

[`.github/workflows/release.yml`](.github/workflows/release.yml) publishes a release when a version tag is pushed. To release version x.y.z:

1. Set `"version"` to `x.y.z` in `package.json`, commit and push.
2. Tag and push:

   ```sh
   git tag vx.y.z && git push origin vx.y.z
   ```

The workflow checks that the tag matches `package.json` and runs `npm test`. It then builds in parallel on GitHub's machines: the macOS app (dmg and zip), the Windows apps (installer and portable) and the server package (zip, tar.gz and SHA256SUMS). Finally, it creates the release "Field Warfare x.y.z" with these files, the install notes from `.github/release-notes.md` and the list of changes since the previous tag.

If a build fails, no release is created. Fix the problem, delete the tag, and push it again:

```sh
git push origin :vx.y.z
git tag -d vx.y.z
```

## Verification and tests

```sh
npm test            # rules, modes and real WebSocket connections
npm run build
```

Browser checks (server running and Google Chrome installed):

| Script | Checks |
| --- | --- |
| `node scripts/browser-check.mjs` | General browser check. |
| `node scripts/deathmatch-check.mjs` | Teams, flag, Free-for-All, team sizes. |
| `node scripts/coop-check.mjs` | Online co-op assault with two humans, full squad, mission lost when all humans go down, restart. |
| `node scripts/touch-check.mjs` | Emulated iPhone in landscape: full game by touch, stick, two-finger aiming, buttons, pause, portrait, home icons. |
| `node scripts/gamepad-check.mjs` | Simulated gamepad on computer and phone: full game, vibration, menus, Xbox and PlayStation labels. |
| `node scripts/feedback-check.mjs` | Streaks, weapon and distance of eliminations, grenade alert, personal records. |
| `node scripts/collision-check.mjs` | Character blocking, eliminated bodies, hits on limbs and walls (browser and WebSocket). |
| `node scripts/maps-check.mjs` | Maps, house doors, objectives, shots, saving the choice, solo modes and shared map in multiplayer. |
| `node scripts/bot-difficulty-check.mjs` | The four levels, local saving, sharing the level in multiplayer and dedicated server configuration. |
| `node scripts/multiplayer-check.mjs` | Two human browsers on a temporary test server: movement, shots, scores, respawns and disconnections. |
| `node scripts/multiplayer-bots-check.mjs` | Browser and server with bots, rapid clicks with the weapons, bots replaced by humans. |

The test servers stop automatically at the end.
