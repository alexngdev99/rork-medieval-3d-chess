# King's Gambit — Medieval 3D Chess

A cinematic 3D chess game in the browser. Rival civilisations — a medieval European
**Ivory Kingdom**, a Mesoamerican **Sun Empire** and Napoleonic France's **Grande Armée** —
face each other as sculpted, rigged characters that march, strike, scream and burn away into
dust on a marble-and-basalt board. Either side can muster any of the three armies.

Built with **Vite + React 19 + TypeScript + three.js**, [chess.js](https://github.com/jhlywa/chess.js)
for the rules, and a **Web Worker** search engine for the computer opponent. No backend, no
account, no build-time asset pipeline — it is a static site.

```bash
cd web && bun install && bun run dev
```

---

## Table of contents

- [Features](#features)
- [Quick start](#quick-start)
- [Controls](#controls)
- [Interface](#interface)
- [Game modes](#game-modes)
- [Armies](#armies)
- [Battlegrounds](#battlegrounds)
- [Project structure](#project-structure)
- [Architecture](#architecture)
- [The computer opponent](#the-computer-opponent)
- [Graphics presets](#graphics-presets)
- [Character animation](#character-animation)
- [Swapping in your own models](#swapping-in-your-own-models)
- [Audio](#audio)
- [Scripts](#scripts)
- [Browser support](#browser-support)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Full chess rules** — castling, en passant, promotion, check, checkmate, stalemate,
  threefold repetition, the fifty-move rule and insufficient material, all via chess.js.
- **Rigged 3D characters, not chess pieces** — eighteen sculpts (six per army), each with
  `idle`, `walk`, `attack` and `death` skeletal clips, plus weapons, shields and a floating
  rank crest.
- **The two armies are never in doubt** — every figure stands inside a band painted on its tile
  and carries a faction rim light along its silhouette: azure for the near side, ember for the
  far one. The band's *shape* differs as well as its colour (a plain double band against a
  spiked sun collar), so the two sides stay separable for a colour-blind player, on a phone, in
  the darkest map, and in a mirror match where both sides muster the same sculpts.
- **Three army skins, chosen per side** — Ivory Kingdom, Sun Empire or the Grande Armée, each
  with its own six sculpts, clips, weapon family and voices. Swap either side at any time in
  **Settings → Armies**; the choice is remembered between visits.
- **Figures march, they do not slide** — a moved piece turns to face its destination, walks
  the distance on its own legs at the cadence of its rank, and squares up again on arrival.
  Knights keep the leap, running through the air and landing on both feet.
- **Synthesised footsteps on the stride clock** — every footfall is fired by the same clock
  that retimes the walk cycle, so sound, grit puff and foot all land together: scuffs for
  footsoldiers, leather for the clergy, plate for the tower guardians, a slow deliberate
  tread for the crown.
- **Cinematic captures** — the camera punches in, the attacker strikes on the hit frame,
  sparks fly, the screen shakes, and the defender **burns away from the soles upward**
  through a ragged edge of light, shedding motes that drift off (cold soul-light for the
  Kingdom, live embers for the Empire).
- **The square changes hands** — the moment a victor's boot comes down on the tile it has just
  cleared, its own colours **close inward** over the square (every other ring on this board
  travels outward, so the reversed motion is unmistakable), the army's mark seals under it,
  chips of the old occupant's stone are thrown up, and the figure draws itself up to full
  height. Over the top of it, a short brass motif rises a perfect fifth — the one sound in the
  game that means *conquest* rather than violence. All of it is keyed to **what was taken**, so
  trading a footsoldier never sounds like felling a queen.
- **A blow that scales with rank** — the footsoldier stabs and moves on; the rider cuts on the
  charge and leaves an arc of steel hanging in the air; the tower guardian's hammer sends a
  wave rolling across the stone and the hall keeps shaking afterwards; the crown drops a
  **column of light on the condemned**, rings a bell over it, and executes it in gold. Each
  rank has its own lens punch, hitstop, swing weight and aftershock.
- **Casters kill at range** — the queen and the mage never close the distance. They level the
  staff from their own square, gather fire at the crystal, and throw it down the line: it
  lights the hall as it flies, breaks open on the body, and only once the corpse has burned
  away do they walk the whole distance and take the square. The mage throws **one** bolt; the
  sorceress throws a **volley of three** and leaves a ring of fire burning on the square (cold
  witchfire for the Kingdom, sunfire for the Empire).
- **Eighteen death cries** — one recorded voice per rank per army, panned to where the body is
  on screen, ducking the music for a beat and pitch-jittered so no two deaths sound alike. Each
  army dies in its own language of pain: the Ivory Kingdom roars and groans, the Sun Empire
  shrieks and hisses, and the Grande Armée — being shot rather than struck — has the air punched
  out of it first and the voice second.
- **The check alarm** — the instant a king falls under the sword, the hall itself reacts: a red
  lamp lights over the threatened crown, red light bleeds in from the far edges of the screen, and
  the camera picks up a faint low rumble. It is deliberately quiet: the surge is gone in under a
  second, the wash never reaches the board, and the lamp then keeps breathing at a low level for as
  long as the king stays in check. A warning has to be noticed, not endured — the alarm names the
  crown in danger without tinting the figures or moving the board under the player's eye.
- **Four battlegrounds** that relight the whole world — sky, haze, stone colour, tile
  contrast, fires, birds, siege engines and the film grade.
- **2D tactical view** — one key lifts the camera straight overhead and flattens every figure
  into a stamped counter, so nothing can hide a square. Selection and moving keep working.
- **Three engine strengths** running off the main thread, so the render loop never blocks.
- **AI vs AI / attract mode** — let two engines duel on their own with pace control, pause,
  auto-rematch, and a clean capture view with the entire interface hidden. Three camera
  behaviours: hold one angle, follow the figure on the move and close in on the fight, or
  drift slowly around the board. The follow rig **leans** towards the action instead of
  chasing it into the hall wall, so the picture no longer shudders while it tracks. AI vs AI also renders crisper than a played game —
  no depth of field, softer grain, vignette and bloom. Every AI vs AI duel now **ends with a
  verdict card**: who won and how, the two engine strengths, the record, a countdown on the next
  duel that can be held, and one tap to roll another duel or return to the hall.
- **An interface that stays off the board** — icon-only controls with a themed tooltip on every
  one of them (name, one-line explanation, key cap), the move record folded into a corner
  sigil, and a slim showcase rail that collapses to a single icon. One key strips the whole
  overlay for recording.
- **Auto-detected graphics presets** (Low → Ultra) with an automatic step-down if the
  measured frame rate stays low, plus WebGL context-loss recovery.
- **Chess clocks**, undo, resign, flip board, copyable PGN, captured tray with material score.
- **Field tally** in the top-left corner: figures lost and time on the field for each army, ticking
  live even in an untimed duel.

## Quick start

Requires **Node 20+**. [Bun](https://bun.sh) is recommended; npm/pnpm work too.

```bash
git clone <your-fork-url>
cd <repo>/web

bun install
bun run dev        # http://localhost:5173
bun run build      # production bundle in web/dist/
bun run preview    # serve the built bundle
```

The build output in `web/dist/` is a plain static site — drop it on GitHub Pages, Netlify,
Cloudflare Pages or any static host. No environment variables are required to run the game.

## Controls

| Action | Input |
| --- | --- |
| Orbit / zoom | Drag, mouse wheel (one-finger drag and pinch on touch) |
| Playing on a phone | Nothing to set: the framing, the lens and the orbit limits are solved for the screen (see [Fitting the hall to the screen](#fitting-the-hall-to-the-screen)) |
| Select a figure | Click it — legal squares glow green, captures red |
| Move | Click a highlighted square (click the figure again to deselect) |
| Promotion | Pick one of the four figures rotating on pedestals |
| Camera & battleground | Camera icon in the top bar — Ivory / Obsidian / Overhead / Cinematic, flip, tactical, and the four arenas |
| What a button does | Hover or focus it (tap it on touch) — every icon carries a tooltip |
| Skip the intro | Click anywhere during the opening sweep |
| Settings | Gear icon — armies, battleground, graphics preset, capture cinematics, board swing, sound |

There is no drag-and-drop: a press that travels more than 8px (16px for a finger — a tap on
glass always drifts) is read as a camera swing, so orbiting from a figure never moves it.
Selection and moves both resolve on release.

Keyboard shortcuts (ignored while typing in a field):

| Key | Action |
| --- | --- |
| `F` | Flip the camera to the other side |
| `T` | Toggle the 2D tactical view |
| `H` | Open / fold the chronicle (move record and spoils) |
| `C` | Toggle cinema mode (hide the entire interface) |
| `Space` | Pause / resume playback in showcase mode |
| `Esc` | Close the settings panel, camera menu, chronicle or an open tooltip |

## Interface

The board owns the screen; every panel is either short, in a corner, or foldable.

| Region | What lives there |
| --- | --- |
| Top left | Whose turn it is, the thinking pulse, the check banner, the showcase duel counter — and the field tally under it |
| Top right | Clocks, then the icon rail — take back, resign, new duel, sound, fullscreen, flip, tactical, camera menu, settings |
| Right flank | The rail: spoils (both captured trays and the material score) under the bar, then the **move record** running down the rest of the flank beside the board. Desktop and tablet only — on a phone both fold into the chronicle |
| Bottom left | The chronicle sigil — a corner button with a move counter that shows or hides the record (`H`) |
| Bottom right | The showcase rail, only during a showcase duel |

- **The field tally** (`.mc-tally`) sits directly under the turn slate: one row per army with its
  crest, the number of figures it has **lost**, and how long it has **been on the field**, plus the
  battle's total length in the header. The army on the move is the lit row — full opacity, a wash
  and a hairline in its own azure/ember — so the panel says whose meter is running without a second
  label. A fresh burial swells and flares its loss count once (`mc-tally-toll`). It is read, never
  touched: the panel is `pointer-events-none`, so every tap in that corner still reaches the board.
- **Elapsed time is not the clock.** `ClockState` counts *down* and only exists when a clock was
  chosen; `ElapsedState` always accumulates, so an untimed duel still reports how long each side
  has spent. `GameController` charges wall time to whoever is on the move and re-points the meter
  on every event that changes who is thinking — a played move, a pause, an undo, the end of the
  battle — so a paused showcase charges nobody. The tally reads it **live** through
  `controller.getElapsed()` on its own 500 ms tick rather than off the snapshot: the core only
  publishes on real events, and a passing second must not re-render the whole interface.

- **Tooltips** (`src/ui/Tooltip.tsx`) replace the browser's native `title`, which appears too
  late to explain an icon. Each bubble carries the control's name, one sentence of
  explanation and a key cap when there is a shortcut. It opens after 110 ms, then **instantly**
  for the rest of a sweep along the rail, picks the screen edge that keeps it in view, flashes
  for 1.8 s on a touch press (touch has no hover), and closes on Escape, blur or scroll. The
  bubble is rendered inside its anchor rather than through a body portal, so it survives
  fullscreen.
- **The showcase rail** is a single 26px row of icons — play/pause, 0.5×–4× pace, the three
  camera behaviours, loop, restart — held at 74% opacity until hovered, and foldable down to
  one clapperboard icon. Pause is shown by a breathing play button instead of a large label.
- **Cinema mode** (`C`) removes the overlay completely and leaves one small restore button, so
  a screen capture is board-only.
- **The verdict card** (`GameOverModal.tsx`) closes every battle, a showcase included. It used to be
  **suppressed** whenever the showcase loop was armed — the most-watched mode was the only one that
  never said who won, it just silently reset. Now it rises for a showcase too, in its own framing:
  the duel number, the winning crest and how the game ended, the two engine strengths and the move
  count, the record, then **Another duel** / **Great hall**. Two things are tuned for an audience
  rather than a player: the backdrop stays **thin and unblurred** (35%, no blur) because in a
  showcase the final position *is* the picture, and the card **waits 2.2 s** so the end cinematic
  can finish its dolly onto the fallen king instead of being cut off by a panel.
- **The loop, made visible.** With auto-rematch armed the card carries a live **NEXT DUEL IN _n_s**
  bar and a **HOLD** button that disarms the loop on the spot — so the board cannot reset under a
  viewer mid-sentence, and stopping it does not mean hunting for the rail. The pause before the next
  duel was stretched from 6.5 s to **9 s** to leave time to read the result. The countdown reads the
  deadline off the controller on its **own 100 ms tick** (a running second must not push a snapshot
  through the whole overlay), and **Another duel** routes through `restartDemo()` so the two engine
  strengths, the pace and the duel counter survive — sending it through `startMatch` quietly demoted
  the duel to a game against the computer.
- **Nothing here is raised by the engine.** The marksman's rifle shot used to close a full-screen
  sight picture over the whole interface; it was removed along with its extra lens punch-in, so a
  rifle kill is watched in the hall like every other one (see
  [Gunpowder combat](#gunpowder-combat-pistol-rifle-musket-and-field-gun)).

## Game modes

| Mode | What it is |
| --- | --- |
| **Player vs Computer** | Pick your colour, an engine strength and an optional clock |
| **Two players** | Hotseat on one screen; the camera swings round between turns (switchable) |
| **AI vs AI** | Two engines duel on their own — per-side strength, 0.5×–4× pace, auto-rematch, still / follow / orbit camera, foldable rail, verdict card at the end |
| **Attract** | Leave the menu alone for 30 seconds and an AI vs AI duel starts behind it |

Clocks: none, 5, 10 or 15 minutes, drawn as draining hourglasses.

## Armies

Each side picks its army independently in **Settings → Armies** (near side / far side). An army
skin is a whole civilisation: six sculpts, their skeletal clips, a weapon family and a set of
death cries.

| Id | Army | King → pawn | Arms |
| --- | --- | --- | --- |
| `ivory` | **Ivory Kingdom** | King, Queen, Mage, Knight, Guardian, Footman | Greatsword, crystal sceptre and staff, warhammer, spear, heater / tower / round shields |
| `sun` | **Sun Empire** | Emperor, Priestess, Serpent Priest, Jaguar Warrior, Temple Guardian, Eagle Warrior | Macuahuitl, sun sceptre, serpent staff, basalt maul, tepoztopilli, feathered chimalli |
| `empire` | **Grande Armée** | Napoléon, Imperial Commander, Marshal-Tirailleur, Cuirassier, Artillery Guard, Line Infantry | **Sculpted, not built** (see [The Napoleonic arms](#the-napoleonic-arms)): An XIII officer's flintlock and a general's dress sabre, a second flintlock over the Marengo presentation sword, the 1793 Versailles rifled carbine, the An XI cuirassier sword, empty hands behind a towed field gun, and the Charleville 1777 with the bayonet fixed |

The first two armies carry weapons built from boxes and cylinders, which is the right answer for
arms nobody can check against an original. The Grande Armée's are **generated meshes of the real
objects**: a Charleville musket and an An XI cavalry sword are documented down to their furniture,
and an approximation of one reads as a toy in a hand that is otherwise a real sculpt.

The Grande Armée is navy and gold throughout — red facings, brass imperial eagles, white
breeches, bicornes, shakos and bearskins — with one silhouette per rank: Napoléon's sideways
bicorne and dress sabre, the commander's laurel crown over the Marengo sword, the marshal's plumed hat
and coat tails over the longest barrel on the board, the cuirassier's horsehair-crested helmet
over a steel breastplate, the artillery guard's bearskin behind the field gun he hauls, and the
infantry's musket. **This is the one army that fights with powder** (see [Gunpowder
combat](#gunpowder-combat-pistol-rifle-musket-and-field-gun)): Napoléon settles matters with the
flintlock in his fist, his commander does the same with the Marengo sword still in her left hand,
the marshal waits out the game on one knee and shoots from it with a rifle, the line infantry
fires a volley, and the battery lays and serves the gun it drags along. Only the cuirassier still
closes, sabre first — **nobody in this army casts anything**.

Swapping an army re-downloads its rosters, so the swap waits for any fight on screen to finish,
takes the old figures down and stands the new ones up (a second or two on a cold cache). Give
**both** sides the same army and it is downloaded once: the far side renders the very same
sculpts, re-tinted into dark livery so the two forces never become impossible to tell apart, and
sharing one set of clips with the side it borrows from.

The livery tint is not what makes a side legible, though — it cannot be. Two *different* armies
both keep their own painted textures, so the tint never runs at all in the common case. Which
side a figure belongs to is therefore said three times over, in channels that fail differently:
a **band painted on the tile it stands on**, a **rim light along its silhouette**, and its
**rank crest** — azure for the near side, ember for the far one. The band also differs in shape
(the kingdoms' plain double band against the empire's spiked sun collar), so the answer survives
a colour-blind player as well as a dark hall. The band is *painted* rather than added to the
tile: the old additive glow disappeared into every lit marble square, which is most of the
board. The rim is a fresnel edge injected beside the dissolve shader and added before tone
mapping, so it is graded with the frame instead of sitting on top of it — and it is on the
weapons too, because a levelled musket is part of the silhouette.

Because the answer is given three times, **each telling can be quiet** — and has to be. Turned up
together the marks swamped the very figures they were labelling: the edge light spread off the
contour and across the uniforms, and the glow under each figure bounced colour up its legs, so a
hall of hand-painted sculpts read as blue and orange shapes. The edge light is now held to the
grazing sliver at the outline and the floor glow to a breath under the boots, while the crest
overhead — the one mark that covers no part of the model — stays bright. Colour tells you the
side; the sculpt is still what you look at.

That sharing is why army loads are **serialised**, and why asking for armies that are already
standing does nothing at all. The app remembers your armies between visits and hands them to the
board *before* the first download starts, so any non-default choice used to begin a swap and the
first load at the same moment. Both runs filled the same roster table, and with one army on both
sides the borrowing side was left holding the first run's sculpt while the side it borrowed from
had been replaced by the second run's. They stopped sharing their clips, and a borrowing roster
kept no clip addresses of its own — so that side could never fetch another stride, strike or
death. It slid across the board and killed without swinging while the other side animated
perfectly. Choosing the same army for both sides was the one way to hit it every time.

## Battlegrounds

Switchable at any time from the camera menu or Settings; each one is a complete relight.

| Id | Name | Look |
| --- | --- | --- |
| `jungle` | **Sun Temple** (default) | Rainforest clearing, jade canopy, drifting pollen, two gold-crowned step pyramids |
| `dawn` | **Dawn Court** | Golden morning light, pale sky, warm stone — highest legibility |
| `frost` | **Frostfall** | Overcast snowfield, cold flat light, hardest contrast on the sculpts |
| `dusk` | **Siege at Dusk** | The original torch-lit siege — moodiest, heaviest bloom |

## Project structure

```
.
├── rork.json               workspace manifest (one app: web/)
├── scripts/
│   └── rewrite-commit-messages.sh
└── web/
    ├── index.html
    ├── public/             icon, favicon, robots.txt (drop local .glb models here)
    └── src/
        ├── core/           chess state — never imports three.js
        │   ├── gameController.ts   owns chess.js, clocks, undo, AI turns, snapshots
        │   ├── types.ts            MoveEvent, GameSnapshot, LedgerMove, …
        │   └── emitter.ts          tiny typed event emitter
        ├── ai/
        │   ├── engine.worker.ts    negamax + alpha-beta + quiescence + iterative deepening
        │   └── aiClient.ts         main-thread handle, cancels stale searches
        ├── scene/          three.js only
        │   ├── sceneEngine.ts      renderer, camera, interaction, move animation, cinematics
        │   ├── environment.ts      hall, lighting, torches, particles, PMREM environment
        │   ├── arena.ts            the four battleground looks and their ordering
        │   ├── battlefield.ts      siege props, camps, fires, birds
        │   ├── jungle.ts           canopy, palms, vines, pollen for the Sun Temple
        │   ├── board.ts            tiles, base, engraved labels, highlight pool
        │   ├── pieces.ts           rigged GLB loading, clips, faction materials, mixers
        │   ├── weapons.ts          arms per rank: primitives, loadouts, hand/bone mounting
        │   ├── armoury.ts          fits the generated Napoleonic weapons into the prop frame
        │   ├── gltfQueue.ts        the one download window every GLB fetch shares
        │   ├── rankBadges.ts       floating heraldic crests, flat map tokens
        │   ├── effects.ts          particle bursts, flashes, dissolve, camera shake and rumble
        │   ├── alarm.ts            the red lamp that stands over a king in check
        │   ├── strikes.ts          per-rank blow visuals (slash arc, ground wave, pillar)
        │   ├── spells.ts           fireball orbs, per-army fire, the shared light pool
        │   ├── gunfire.ts          muzzle flashes, rounds in flight, powder smoke banks
        │   ├── ammunition.ts       the four rounds: pistol/musket ball, Minié bullet, iron round shot
        │   ├── postfx.ts           EffectComposer pipeline (bloom, SSAO, DOF, grade, SMAA, clarity)
        │   ├── textures.ts         procedural marble, basalt, bronze, cloth
        │   ├── quality.ts          graphics presets + auto-detection
        │   ├── viewport.ts         solves the camera framing for the screen it is drawn into
        │   └── tween.ts            promise-based tween engine
        ├── ui/             React + CSS overlay
        │   ├── GameShell.tsx       phases, settings, attract mode, keyboard shortcuts
        │   ├── MainMenu.tsx        mode / colour / strength / clock / muster selection
        │   ├── Hud.tsx             top bar, field tally, spoils, chronicle sigil, showcase rail
        │   ├── Tooltip.tsx         themed tooltip for the icon-only controls
        │   ├── MoveLedger.tsx      the chronicle: move list, PGN, hover preview
        │   ├── Muster.tsx          army + battleground pickers, and their locked in-match view
        │   ├── SettingsPanel.tsx   muster (out of match), graphics, picture, cinematics, sound
        │   ├── Heraldry.tsx        crests, hourglasses, piece glyphs
        │   └── medieval.css        the whole overlay's look
        ├── audio/          Web Audio mixer with layered score stems
        ├── assets/         army skins: model / clip / voice URLs per civilisation
        └── components/ui/  shadcn/ui primitives
```

## Architecture

Rendering is fully decoupled from the rules: **the chess core emits events and the scene
subscribes to them.** Nothing in `src/core` imports three.js, so the game logic is testable
headlessly and the renderer is replaceable.

### Move flow

1. The player (or the worker) produces a move → `GameController.tryMove`.
2. chess.js validates it and the controller builds a `MoveEvent` — captures, the castling
   rook trip, the en passant square, promotion and check flags.
3. The controller **awaits the animator the scene registered**, so the engine never moves
   while a figure is still gliding.
4. React re-renders from the immutable `GameSnapshot` published after every change.

### State

There is exactly one source of truth (`GameController`). React reads it through the
`useGameSnapshot` hook, which subscribes to the emitter and returns the latest snapshot —
no global store, no prop drilling of game state into the scene.

## The computer opponent

| Difficulty | Search | Budget |
| --- | --- | --- |
| **Easy** — *Squire* | Random legal move, prefers captures, always takes a mate in one | instant |
| **Medium** — *Knight* | Depth 3 negamax + alpha-beta, material + piece-square tables | 0.7 s |
| **Hard** — *Warlord* | Depth 5 iterative deepening, MVV-LVA ordering, quiescence on captures | 3.2 s |

All searches run inside `engine.worker.ts`. `aiClient.ts` cancels a stale search whenever the
position changes, so undo and resign are instant.

## Graphics presets

| Preset | Post-processing | Shadow map | Particles |
| --- | --- | --- | --- |
| Low | none (direct render) | off | none |
| Medium | bloom, grade, SMAA | 1024 | light |
| High | + depth of field in cinematics | 2048 | full |
| Ultra | + SSAO | 4096 | dense |

The preset is auto-detected on first load from the GPU string, core count and device memory.
The engine steps down one level automatically if the measured frame rate stays under 40 FPS.
Pixel ratio is capped at 2 (1 on Low), and a lost WebGL context shows a reload prompt instead
of a black screen.

### Black-screen recovery

Some drivers — Mesa's software rasterisers above all, which is what a Linux box without working
hardware acceleration falls back to — draw an all-black scene under a perfectly fine interface.
Three independent causes have been seen: the post-processing composer returning an empty buffer,
the PMREM reflection probe sampling as `NaN` (which poisons every lit surface while emissive
sprites keep drawing), and the shadow maps.

The engine handles all three without being asked:

- **Probe self-test** (`scene/diagnostics.ts`) — at boot, a white sphere lit *only* by the freshly
  built probe is rendered into an 8×8 buffer and read back. Black means the probe is unusable, so
  it is dropped and an ambient skylight of the same colour takes over.
- **Frame watchdog** — the frame is sampled five times over the first eight seconds at five points
  (centre plus quadrants). All five have to come back black before anything is dropped, then each
  failed sample peels off one more layer: post-processing → reflection probe → safe rendering.
- **A notice explains what happened**, and once it falls all the way back to safe rendering the
  choice is remembered in `localStorage` so the next visit starts with a picture.

Manual controls in **Settings → Picture**:

| Control | Effect |
| --- | --- |
| Brightness | Tone-mapping exposure multiplier, 60–180% |
| Safe rendering | No composer, no reflection probe, no shadow maps, +20% exposure |

`?safe=1` in the URL forces safe rendering on from the first frame, and the driver string is
printed to the console (`[scene] gpu: …`) and shown under the graphics presets.

## Character animation

Every figure is a rigged (skinned) character with up to six skeletal clips, declared per rank
in its army's `animated` roster (`ARMY_SKINS` in `src/assets/generated.ts`):

| Clip | When it plays |
| --- | --- |
| `idle` | Looping combat stance, desynced per figure so the army does not breathe in lockstep. The Grande Armée's marshal **stands at the ready**, rifle lowered: he used to hold a kneeling stance for the entire game, which read as a man permanently stuck in cover, so the kneel moved into the one place it is worth something — his `aim` |
| `walk` | Looping in-place stride, retimed to the cadence of the move that is under way. The clip's own stride length is **measured** rather than assumed (`gaitCycle()`), because the generator hands back anything from one cycle (`spear-walk`, 1.13 s) to three (`casual-walk`, 4.23 s). It must still be a *walk*: a 0.5 s sprint cycle stretched across a single square reads as juddering on the spot, which is why the line infantry advances on the musket-across-the-body walk instead of the rifle charge that sits on the same rig |
| `run` | Looping in-place run — the knight charging through its leap (knights only) |
| `attack` | One-shot strike the moment a capture lands — sparks, shake and clash are timed to the hit frame. For the queen and the mage the same clip is the incantation, and its hit frame is the moment the fireball is released; for the Grande Armée's **standing** gunpowder ranks it is the **firing drill**, played at its own readable length with the hit frame on the shot. The marshal carries **no** `attack` at all — he fires out of his kneeling `aim` (see *Gunpowder combat*) |
| `death` | One-shot fall played by the captured figure before it dissolves into dust |
| `reload` | One-shot drill run after a shot — powder, ball, ramrod. Only the Grande Armée's four gunpowder ranks carry one; the marshal reloads still on the knee he fired from, the battery at the muzzle |
| `rise` | One-shot stance change between one knee and both feet. Authored kneeling→standing and played in **both directions**: reversed (`playKneel()`) it puts the marshal down onto the knee, forwards (`playRise()`) it brings him back up. Only he has one — measured on the hips it opens at 48 units and stands at 92 by the 70% mark, so `RISE_SPAN` runs both directions over that part and never shows the still tail |
| `aim` | Looping **sight picture** held before — and, for a kneeling gunner, *through* — a shot: the weapon comes up and stays on the body while the shooter settles. Napoléon (pistol levelled), the line infantry (musket into the shoulder, barrel tracking the man) and the marshal (on one knee, rifle up and scanning) carry one; only the battery has none — laying the gun already *is* its aim. `setAimDrift()` slows the lateral scan almost to a stop once the shot is away, so a man who has fired watches what he hit rather than going back to sweeping the board |

How it is wired (`src/scene/pieces.ts`):

- The **rigged** GLB is the visual — the plain GLB has no skeleton, so clips bound to it do
  nothing. Each animation GLB contributes one clip, renamed to `idle` / `walk` / `run` /
  `attack` / `death`.
- Every instance is cloned with `SkeletonUtils.clone` (never `Object3D.clone`) and gets its
  own `AnimationMixer`. One-shots use `LoopOnce` + `clampWhenFinished`, and the strike
  crossfades back to the stance on the mixer's `finished` event.
- Clip root motion is stripped on X/Z so a figure never walks off its square; the death clip
  keeps its motion so the fall reads properly. The locomotion clips are **in-place** cycles for
  the same reason — board travel is owned by the container tween, so a clip carrying root
  translation would double the distance.
- **The preset governs the *stance*, not animation.** `idleAnimations` (off on **Low**) is the
  ambient breath — thirty-two skeletons ticking every frame, which is the part that actually
  costs something; without it a figure holds the first frame of its stance. The **stride, strike
  and death run on every preset**: a march is one mixer for a second or two.
  `PieceView.returnToStance()` respects the preset on the way back, so a figure that is meant to
  stand still does not start breathing after its first move.
  - This flag used to be one `characterAnimations` switch gating the stance *and* the walk cycle,
    and `detectQualityPreset()` sends touch devices to **Low** — so every phone slid statues
    around the board while the same figures still swung and died in full animation.
    `navigator.deviceMemory` is Chromium-only, so iOS reported nothing, the unknown was
    defaulted to 4 GiB and then tested against `>= 6`: no iPhone could ever clear it. Unknown
    memory is now treated as unknown, and a current phone starts on **Medium**.
- **Clips load in waves, not in one burst.** Twelve rigs × five or six clips is over seventy GLBs;
  firing them at once made the browser drop requests (`TypeError: Failed to fetch`) and figures
  silently lost their strike, so a capture looked like a piece dying untouched. The rig plus its
  `idle` load first, then `PieceFactory.warmClips()` pulls
  `walk` → `run` → `attack` → `death` → `reload` → `aim` two downloads wide, and every clip that
  lands is bound onto the figures already on the board (`PieceView.installClip`). The **strides**
  are warmed before the strikes on purpose: the first thing any game does is move a piece.
- **No beat plays without its clip.** A capture calls `ensureClip` for the attacker's strike and
  the victim's death, so the fight waits (max 2.4 s) instead of skipping its animation — and
  `glide()` does the same for the stride it is about to march on through `armStride()` (max
  0.6 s). Without that second guard the opening move was staged while the walk clips were still
  in the air, and the figure crossed the square frozen in its stance: the exact symptom of "this
  rank has lost its walk animation".
- **A clip binds to every roster that wanted it.** Downloads are shared by URL, and `bindClip()`
  hands the result to *each* roster whose clip address matches rather than only the one that asked
  first — so no figure is left without a stride because its twin got there earlier. A clip URL the
  server does not have is written off after `MAX_CLIP_ATTEMPTS` requests: the Emperor's rig has no
  reload take on R2 at all, and chasing it charged every one of his shots a full round of failed
  fetches before the beat could continue. He lowers the pistol instead until one is generated.
- If a strike clip is genuinely unavailable, `SceneEngine.lunge()` performs the swing by hand —
  wind-up, twist, lean back, then the blow over the top. The tilt is held through
  `PieceView.setStrikeTilt()` and re-applied after the mixer, which otherwise owns the pose.

### Marching and footsteps

`SceneEngine.glide()` owns one stride clock per move (`src/scene/sceneEngine.ts`):

1. `GAITS[kind]` declares steps per square, cadence, boot timbre and loudness for the rank.
2. `steps = tiles × stepsPerTile`, and the move's duration is `steps / cadence` — a longer
   move takes **more steps**, not a faster slide.
3. `PieceView.startMarch(clip, stepRate)` retimes the walk cycle so one gait cycle equals two
   footfalls at exactly that rate, so the skeleton cannot drift out of the clock. The cycle
   length is **read out of the clip** by autocorrelating a leg bone's swing (`gaitCycle()`,
   cached per clip). Treating the whole clip as one cycle is what cost the heavy ranks their
   march: `casual-walk-inplace` — the king's, the queen's, the tower's and the battery's stride —
   is 4.23 s of *three* cycles, so the time scale asked for was 3-4× and saturated the ceiling.
   The legs then whirred at the same fixed blur regardless of the move, out of step with the
   footfall clock, and the tower in particular read as sliding with no animation at all.
4. `strideEasing()` gives the move a push-off, a constant-speed cruise and a settle. A fully
   eased curve would leave the feet skating at both ends against a fixed cadence.
5. Each whole step crossing fires `audio.footstep()` (panned by screen position, alternating
   feet, pitch-jittered) plus a small grit puff at the contact point.
6. The battery hauls a gun rather than carrying one, so while it marches its carriage pitches on
   the axle once per footfall and rocks wheel to wheel (`rumbleTrain()`, set back down level by
   `settleTrain()`). A field gun gliding beside a walking crew was the other half of the tower
   looking unanimated.

Footsteps are fully synthesised in `src/audio/audioManager.ts` — a low body thump for the
weight, a band-passed noise transient for the sole, and a metallic afterring for armour, one
voice per `FootstepTimbre` (`scuff` / `leather` / `plate` / `regal`). No asset, no latency.

### Strikes by rank

The hand-to-hand beat is one piece of choreography — charge, square up, strike, crumble — but
its weight is read out of `STRIKES[kind]` in `src/scene/sceneEngine.ts`, so the same code carries
a footsoldier's stab and a royal execution. The pawn's line is the original beat and is left
exactly as it was; everything above it is measured against it:

| Rank | What is added on top of the pawn's beat |
| --- | --- |
| Pawn (`p`) | The baseline: 5.5° lens punch, sparks, one camera kick |
| Knight (`n`) | Fastest charge, a crescent of steel through the body (`spawnSlash`), dust torn up along the line of the charge, a light aftershock |
| Bishop (`b`) | Safety net only — the mage fights at range |
| Rook (`r`) | Slowest wind-up, heaviest swing in the mix, a wave rolling out across the stone (`spawnGroundWave`) with a second echo, low-frequency slam, long aftershock |
| Queen (`q`) | Safety net only — the sorceress fights at range |
| King (`k`) | A column of light dropped on the condemned before the blow (`spawnPillar` + `judgementToll`), 11° lens punch, gold arc **and** gold ground wave, the longest hitstop and aftershock |

The supporting visuals live in `src/scene/strikes.ts` (`spawnSlash`, `spawnGroundWave`,
`spawnPillar`, `spawnConquestClaim`). Each one builds a throwaway object, animates it off the
caller's tween clock and disposes itself, so none of them needs a slot in the frame loop; the
textures and geometry are shared module singletons freed by `disposeStrikeAssets()`. The swing,
the slam, the bell and the claim (`bladeWhoosh`, `groundSlam`, `judgementToll`, `conquest`) are
synthesised in the mixer alongside the footsteps — no assets.

### Taking the square

All three battle beats — melee, spell and gunpowder — end the same way: the body is cleared and
the victor marches onto the square. That arrival used to be punctuated by the same generic
set-down clack a quiet move gets, and a *softer* landing than usual on top of it, so the moment
that actually wins a game of chess was the quietest thing in the fight. `claimSquare()` in
`src/scene/sceneEngine.ts` gives it its own beat, fired once from `runMove()` after `landOn()` —
which means it covers every path, including captures made with the cinematics switched off and
ones made on the flat tactical map:

1. **`audio.conquest()`** — a boot claiming the stone (dry grit over a low stamp), then a brass
   motif rising a perfect fifth, then two high inharmonic partials left ringing. Each note is
   scooped into from under pitch through a filter that opens on the attack, which is what makes
   it read as brass rather than as a sawtooth. Its root is G3, the same fundamental the
   judgement bell is struck on, so the two read as one hall speaking. Fully synthesised, so the
   full stop lands on the exact frame even on a cold cache.
2. **`spawnConquestClaim()`** — a wide loop of the victor's colour drawn **tight** around the
   tile, brightening as it converges, snapping shut into the army's own sunburst mark and
   letting go. Two throwaway discs; cheap enough for every preset.
3. **The figure draws up** — `drawUp()` leans the shoulders back off the blow and springs them
   level again on `outElastic`, driven off the runtime node rather than a clip so a rig without
   animations gets it too. A lean, not a pose: it finishes inside the pause before the reply,
   because a victory dance would read as the board hanging.

Everything scales off `CONQUEST_WEIGHT[victim.kind]` — the one weight on the board that belongs
to the **victim**. A heavier capture drops the motif's root by up to half an octave, lengthens
its tail, adds an octave as a third note, holds the ring closed longer and throws more chips. So
a queen going down is audibly a different event from a pawn trade, without either one getting
its own choreography.

### Ranged combat (queen and mage)

`RANGED_KINDS` in `src/scene/sceneEngine.ts` routes captures by the queen (`q`) and the mage
(`b`) to `playSpellCinematic()` instead of the melee beat, in this order:

1. Caster and target turn to face each other; the caster does not move off its square.
2. `gatherSpell()` grows a `SpellOrb` (`src/scene/spells.ts`) at the weapon's casting point
   for the length of the strike clip's wind-up, pulling embers inward over a rising charge.
3. `throwFireball()` flies the orb to the target's chest on a flat arc, shedding embers and
   smoke; flight time scales with the distance actually crossed.
4. `spellBurst()` lands it — flash, fire shell, ember cloud, square impact and camera kick.
5. `slay()` then `banish()` run to completion, so the target is **dead and gone** before the
   caster takes a step, and only then does `glide()` march it onto the cleared square.

How much fire is thrown is a profile too — `MAGE_SPELL` versus `QUEEN_SPELL`. The mage holds a
small orb and throws a single bolt. The sorceress gathers roughly half again as long, holds a
much larger ball, and throws a **volley of three**: two smaller leaders that come in off the
shoulder and clap on the body first, then the killing bolt behind them, whose blast is 1.75× the
mage's and rolls a ring of fire out across the square.

The casting point is a marker parented at the head of the main weapon (`focus` in
`src/scene/weapons.ts`), read out of the live pose each frame, so the fire hangs off the
crystal wherever the casting arm swings it. `SPELL_LOOK` gives each army its own fire. The three
spell voices (charge, cast, impact) are synthesised alongside the footsteps — no assets.

**The fire's light comes from a fixed pool.** `SpellLightPool` (`src/scene/spells.ts`) creates
three point lights once with the scene and lends them out per bolt. A light created per fireball
crashed the tab: three.js keys its shader programs on the scene's light counts, so every material
in the hall recompiled mid-fight. Pooled lights are never removed *or hidden* — an invisible
light is dropped from the render state, which changes the count exactly as removing it would —
they are only dimmed to zero and handed back. A fourth simultaneous bolt simply gets no light
instead of a recompile, and the pool is empty on presets without post-processing.

The capture dissolve is a shader injection: a noise field eats the body from the soles up with
a glowing burn edge, while the whole mesh fades and sheds upward-drifting motes.

### Gunpowder combat (pistol, rifle, musket and field gun)

The Grande Armée does not fight with witchfire. `attackStyle(kind, arsenal)` in
`src/scene/sceneEngine.ts` routes captures by **every rank except the cuirassier** to
`playGunCinematic()` — the witchfire beat is unreachable under this arsenal, and the cuirassier
still closes with the sabre. The beat is:

1. Both figures turn to face each other; the shooter never leaves its square. A lock, a ramrod
   or a linstock is heard (`audio.gunLock`) as the barrel comes round — that is the hammer being
   *cocked*, a beat before the trigger is anywhere near it.
2. **Down onto the knee**, for a gunner whose `GUNS[kind].stance` says he fights off the stone (the
   marshal alone). `PieceView.playKneel()` runs his `rise` clip **backwards** over `stance.drop`
   (0.85 s), so the knee is planted by an articulated motion rather than the body being blended
   downwards, and the stone is heard taking his weight on the frame he reaches it.
3. **Taking aim.** `PieceView.playAim()` loops the sight picture for `GUNS[kind].aim` seconds
   (0.3–0.55 s): the weapon is brought up and *held* on the body. A rank with no aim clip leans into
   the shot by hand instead, so a gunner is always visibly aiming before anything is fired.
4. **The drill — or the held kneel.** A **standing** gunner plays his firing clip at its own readable
   length (`GUNS[kind].drill = { seconds, impact }`), the shot leaving on the frame the hammer falls
   (`impact`, 0.5–0.64 of the clip) rather than at the swordsman's default 0.42; at the default
   *length* a firing drill was over in a third of a second and the shot read as a flash appearing out
   of a stance.

   A **kneeling** gunner plays no firing clip at all, and this is the whole point of `stance`. Every
   shooting take the generator produces starts and ends on its feet — the marshal's
   `Female_Crouch_Pick_Gun_Point_Forward` measures, on the hips, 92 units (standing) → 68 → back to 93
   by the 70% mark, so its authored ignition frame at 0.6 fires with the man **upright**. Run between
   a kneeling `aim` (hips 48) and a kneeling `reload` (42) it stood him up to shoot and dropped him
   again: three stance flips inside one shot, which is exactly what read as bobbing up and down. So
   he fires **out of the held kneel**, and `drill` becomes purely the beat — 1.02 s of held sights
   before the trigger, the longest wait on the board. Because the muzzle marker is read out of the
   live pose, the shot still leaves the barrel at the height the knee put it.
5. **The trigger breaks**, `GUNS[kind].lock` seconds before the charge lights. `audio.triggerPull()`
   plays the sear letting go, the flint raking down the frizzen and the priming charge catching — the
   mechanical half of a shot (see *Lock time*).
6. One lock time later the gun answers: `spawnMuzzleFlash()` detonates the charge at the barrel
   mouth (see *The flash at the bore*), `spawnPowderCloud()` leaves a bank of smoke hanging in front
   of the gun — soot for a smoothbore, pale ash grey for the rifle (see *The powder bank*) —
   `boreTrickle()` keeps the barrel smoking in the man's hands afterwards, and `audio.gunshot()`
   fires the report on the same frame as the flash.
7. `flyShot()` sends the round **flat and fast** — no arc, no easing; the flatness is what
   separates a gun from a lobbed spell — trailing wisps of smoke as it goes. A ball out of a
   *smoothbore* bellies off the line of sight and comes back onto the body (see below); the rifled
   round is the only one that flies a true line.
8. The hit lands: the ball's own arrival first (`audio.ballImpact()` — a ricochet whine cut short
   by a thud into the body), then flash, sparks, tile strike, camera kick, and for the field gun a
   wave rolling out across the stone plus a long aftershock. The body **breaks open** where the round
   went in — a punch ring square to the flight line, a cone of spall thrown back at the shooter and a
   field of tumbling chips made of the victim's own material (see *The moment the round arrives*).
   **Solid shot does not stop in the man**: a second short flight carries the iron a tile and a half
   past him and skips it off the stone, throwing stone chips and a ricochet spark shower.
9. `slay()` runs, then `banish()` and the **reload drill run together**, so the body is gone and
   the barrel is charged again before `glide()` walks the shooter onto the cleared square. The
   kneeling gunner's reload is served **from the knee he fired from** — `reload()` hands only a
   standing gunner back to his stance — and once the body is cleared `riseToFeet()` brings him up on
   the forward `rise` clip (~0.95 s, the boot heard taking his weight) before he marches. Between the
   knee going down and the square being empty his stance never changes once; the sight picture is
   also slowed almost to a stop at the report (`setAimDrift()`), so he holds what he shot at instead
   of sweeping the board again.

### The ammunition

**Every barrel fires its own round, and each one is a generated sculpt** — `SHOT_MODELS` names one
GLB per round, `src/scene/ammunition.ts` is the fallback foundry, and `GUNS[kind].ammo` says what is
rammed down which barrel. Nothing here is a glowing dot: black powder never fired a tracer, so a
round is read by its *shape*, its *metal* and its *motion*, and only the iron is allowed to glow.

| Round | Barrel | How it is made | How it flies |
| --- | --- | --- | --- |
| **`pistolBall`** | the Emperor, the commander | Cast lead sphere off a two-part mould: raised seam where the halves met, the nipped stub of the sprue, and a surface that is not quite round | Tumbles on the axis it left with; wanders ~0.9 calibres off the line |
| **`musketBall`** | line infantry, cuirassier | The same ball at .69 and visibly softer — twice the mould deformation, because soft lead rammed down a fouled barrel takes a beating | Tumbles; **wanders ~1.6 calibres** — the fattest, least accurate round on the board |
| **`minieBullet`** | the marshal-tirailleur | A lathed profile turned to the real drawing: long ogive nose, bearing body cut by **three grease grooves** (they carried the tallow that kept the fouling soft), and the **hollow base** whose skirt the charge blew out into the rifling | Spins hard about its own nose and stays pointing where it was sent. **Zero wander** — the only true line in the army |
| **`roundShot`** | the battery | Sand-cast iron: an icosphere **pitted** by a stable hash so one vertex in six is a real cavity, with the casting seam still round its middle | Turns slowly, glows out of the bore and **cools across the hall**, drags a bank of air behind it, and carries clean through the body |

Two metals serve the procedural fallbacks, cached and shared: unpolished **lead** (`0xb4bac2`,
`metalness 0.62`, `roughness 0.44`) and **sand-cast iron** (`0x3b3936`, `roughness 0.72`) whose
emissive is animated per shot. Both are deliberately kept *off* full mirror metal and given a floor
of self-lit grey, and `legible()` does the same to every generated sculpt's own materials on load.
The reason is blunt: a near-mirror sphere a few pixels across has nothing to reflect in a torch-lit
hall, so it renders as a black dot and the shot looks like it never happened. A heated round gets
its own material clones (`ownMetal()` for sculpts), so its glow can cool without touching another
shot still in the air.

### Making a shot visible

A true .69 ball is a fiftieth of a man's height and crosses eight squares in about a hundredth of a
second. Rendered honestly it is one pixel for one frame — which is exactly why the gunfire read as
"flash, then a corpse". Three dials fix that, and only these three are allowed to lie:

- **Gauge** (`AMMUNITION[kind].gauge`, 1.7–2.6×) — the round is *drawn* at a legible multiple of the
  bore while its flight path, wander and spin stay on the real numbers. The cannonball needs the
  least help; the Minié bullet the most.
- **Film speed** (`GUNS[kind].speed`, 0.082–0.125 s per tile, clamped to 0.17–0.58 s of flight) —
  slow enough to pick the round up as it clears the bore and follow it into the body. The order
  between barrels stays true: rifled fastest, field gun slowest.
- **Nose blur** (`tracerTexture()` on a tapered cone, `AMMUNITION[kind].streak × NOSE_BLUR`) — a cone
  of blurred metal on the nose of the round, laid along the *travel vector* rather than billboarded,
  lengthening with the round's actual pace (`haste`) and opening from a stub over the first frames,
  because a shot has no blur before it has moved. It rides *with* the round, so it says how fast the
  metal is going and nothing about where it has been — which is why it is now held to half its
  authored length and the path is drawn separately.

On top of that a small **glint** sprite carries caught torchlight so the metal registers against the
dark far wall, and the round now spawns *clear of the bore* (`min(0.42, muzzleFlare(gun) * 0.44)` down
the line of fire) instead of inside its own muzzle flash and powder bank. The orange glow sprite, the
borrowed point light and the dragged-along wake still belong to the iron alone.

### The streak along the flight path

Everything above is pinned to the round, so all of it *travelled with the metal* and none of it said
where the shot had been: you noticed the ball arriving and never saw it cross. `src/scene/tracer.ts`
is the missing half — a short 3D ribbon swept along the path the round **actually flew**, from just
clear of the bore to the body, rebuilt from its own flown samples every frame.

It is geometry, not a billboard, and that buys three things a sprite cannot:

- it **holds its shape from any camera angle** and is occluded by figures and pillars like a real
  object, instead of flipping or swimming as the shot crosses the view axis;
- it **bends where the ball bent**. A smoothbore ball bellies off the line of sight on its `sin(πt)`
  wander and comes back onto the body — that curve used to be hidden inside a straight cone and is
  now the most legible thing about a musket shot;
- it stays **short on purpose** (`StreakLook.span`, 4.2–9 rendered ball diameters ≈ one square). A
  streak reaching all the way from muzzle to victim reads as a laser, which is the one thing black
  powder never was.

The section is a **three-bladed tube** rather than a camera-facing quad: no camera to consult, no
flip, and cheap enough (12–26 rings by preset, `trailRings(captureParticles)`) to run several shots
at once. Two layers are swept along the same spine — a wide faint **sheath** of disturbed air
(`falloff 1.6`) and a thin bright **filament** at 0.42× the width that only lights the few calibres
immediately behind the metal (`falloff 4.2`). One layer alone reads as fog or as a wire; together
they read as speed. Ring radius tapers on `u^0.55` and brightness on `u^falloff`, so the tail
pinches to a needle and dissolves instead of ending on a cut edge.

Two details keep it from looking like a mesh being animated. The ring frame is **carried forward**
from sample to sample (the normal is re-projected square to each new tangent) rather than rebuilt
from a world axis, which is what stops the tube visibly twisting wherever the path turns. And the
tail is trimmed by **sliding the oldest sample along its segment** to keep the arc length exact,
never by dropping samples — popping one makes the tail stutter backwards once per step, sliding it
means the tail dissolves at the same speed the round is travelling. Buffers are allocated once at
full size and drawn through `setDrawRange`, so a streak that has not yet grown to length never
trails stale triangles.

When the round lands, `releaseStreak()` hands the ribbon to a 0.16 s fade of its own
(`(1-t)^1.7`) instead of deleting it on the frame of impact: it dies under the debris and the flash
as the afterimage of something that was moving very fast. Per round —

| Round | Span | Width | Reads as |
| --- | --- | --- | --- |
| **`pistolBall`** | 5 diameters | 0.60 | barely half a square of thin cold air |
| **`musketBall`** | 5.6 | 0.74 | fat, grey, and visibly *curved* |
| **`minieBullet`** | 9 | 0.48 | the longest, thinnest streak in the army — and the only straight one |
| **`roundShot`** | 4.2 | 1.00 | short, wide, hot: scorched air dragged behind glowing iron |

### The flash at the bore

The flame has to be **sized off the round it launches**, which is why `GUNS[kind].flare` is a *ratio*
(4.4–6.0) rather than a width in world units. `muzzleFlare(gun) = ball × AMMUNITION[ammo].gauge ×
flare` is the single source of truth for everything at the muzzle: the flash, the ember shower, the
reach of the borrowed point light, and how far clear of the bore the ball is spawned. When the flash
was authored independently of the ammunition the two drifted apart the moment the rounds became
sculpts drawn 1.7–2.6× the bore — the projectile ended up brighter and wider than the charge that
sent it, which reads as a ball being dropped rather than fired. Tying both to one number means a
change to a round's gauge can never leave its flash behind. Period flame is roughly 4–8 bore
diameters, so the clean-burning rifle sits at the bottom of the range (4.9) and the field gun at the
top (6.0).

The flash is four layers deep, because a single additive sprite is capped at opacity 1 and simply
cannot be made brighter:

1. **The star** — `muzzleFlashTexture()`, billboarded: thirteen ragged petals reaching to the sprite
   edge plus three long primary jets, over a halo that holds **flat white out to a fifth of its
   radius**. That plateau is the point: the bloom pass only takes hold of what already clips at 1, so
   a flash built as a polite gradient blooms on a handful of pixels and reads as a dull spark.
2. **The core** — a small disc of pure white stacked additively over the star's own blown-out centre.
   Additive layering is the only way past opacity 1. It is the last thing to widen and the first to
   die, which is what makes frame one read as a detonation.
3. **The jet** — the smear cone, *not* billboarded, its bright wide end on the bore and its tip
   running out along the aim. The flash therefore grows *along the barrel* instead of only swelling as
   a disc, and it tells the eye which way the round just went.
4. **The lead bloom** — a second, warmer puff a barrel's width down the line of fire.

The envelope carries as much as the size. Powder ignites in one frame, so the whole stack is **held at
full brightness for the first fifth of its life** (`IGNITION`) and only then falls away on a `(1-t)²·¹`
curve — a flash that starts decaying on frame one never registers at 60 fps. The dying beat carries a
flicker (`0.82 + 0.18·|sin|`) because a charge guts out unevenly rather than dimming on a dial, and
the borrowed light burns at `fade × 38 × flame` over a distance that grows with the charge.

The wander is not decoration. A ball rattling down an unrifled barrel leaves it turning, and a
turning sphere curves — which is exactly why a musket could not be trusted at a hundred paces.
`flyShot()` bellies the ball out along a tilted cross-axis on a `sin(πt)` curve, so it peaks
mid-flight and closes back onto the body: visibly not a straight line, still a hit.

All four rounds are flown as **generated sculpts** (`SHOT_MODELS`, each primed by
`primeShotModel()` behind the game). The generator reports every one of them as *directionless* (a
body of revolution has no intrinsic front), so the loader takes each sculpt's **measured long axis**
as the nose instead of guessing a yaw constant, normalises it to one unit nose-to-base and centres
it. Until a GLB lands, that kind is turned procedurally to the same contract: **nose along +Z,
centred, one unit long**, so a shot only ever scales it by its gauge — and the first shot of a game
is never a blank.

### The moment the round arrives

A shot that ends in a warm sprite puff is a spell, not a kill. `src/scene/shatter.ts` replaces that
beat with something that visibly **breaks**, and it is deliberately geometry rather than billboards —
the whole point of the moment is that the body came apart. Four things fire on the same frame, in the
order the eye reads them, and all of it runs inside **two instanced draw calls** on the tween clock:

1. **The punch ring** — a disc of light square to the line of flight (oriented, not billboarded),
   snapped open on the surface it struck and gone within 0.18 s. The only non-physical part; it
   exists to say *where* on the body the round went in.
2. **Sparks** — real stretched geometry, not dots. Each spark is a four-sided sliver pointed along
   its **own velocity**, so it draws a streak that turns as it flies and whose length tracks its
   speed: a long line while it is quick, a dot once it is spent. They leave in a cone thrown *back*
   at the shooter, because spall comes off the struck face; they cool white → orange → dull red on
   their own clocks through per-instance colour; they **gutter** rather than fade; they skitter off
   the flagstones with their run intact and their lift gone; and roughly one in six is given a much
   longer life so the shower never stops like a switch.
3. **Fragments** — chips of whatever the victim is made of: crushed tetrahedra with per-instance
   colour and value scatter, tumbling on their own axes under gravity, bouncing off `BOARD_TOP` with
   material-specific restitution plus tangential friction and a knocked-down tumble, coming to rest
   lying on the stone, then pulled under over the last quarter of their life so the board is never
   left littered.
4. **Dust** — the haze the caller layers on top, tinted by `impactDust(body)` so it is the colour of
   what just broke instead of the colour of the shooter's powder.

**The debris is made of the victim, not of the shot.** `impactBody()` maps army × rank onto a recipe,
because a ball into an obsidian idol cannot spray the same grit as a ball into a wool coat:

| Body | Who | What comes off |
| --- | --- | --- |
| `marble` | Ivory Kingdom ranks | Pale chips and bright dust, moderate sparks |
| `obsidian` | Sun Empire ranks | The most fragments and the widest spread — glass *flakes*, so long razor slivers (3.4× sliver), near-black with a jade fleck and a jade-green spark cool-down |
| `plate` | cuirassier + guardians of any army | Steel spall, few chips, **the brightest spark shower on the board** (30 at power 1, 10.5 m/s), almost no dust |
| `uniform` | Grande Armée coats | Navy wool, buff leather, gilt lace and shako brass; slow, absorbing, lands where it falls (0.16 restitution), barely any sparks |
| `flagstone` | the floor of the hall | Stone chips and a long ricochet shower that skitters away across the tiles |

**How hard it breaks comes from the round**, not from the rank: `AMMUNITION[kind].shatter` scales
count, speed and size together — `0.72` for a pistol ball, `1` for the musket ball, `1.24` for the
Minié (lighter, but arriving far faster and still spinning), `2.5` for six pounds of iron. And
`.through` decides whether there is exit spall as well as entry: soft lead at black-powder velocity
flattens and stops, while the spun conical bullet and the solid shot both come out the other side and
throw a second, wider, slower cone the way they were already going. The round shot's skip off the
stone a tile and a half beyond the body gets its own `flagstone` shatter aimed down into the floor.

Instance counts are capped off `captureParticles`, so the whole effect scales with the graphics
preset, and the hole throws a borrowed point light for a fifth of a second on `postFx` presets only.

**Black powder is recorded, not only synthesised.** `GUN_AUDIO_URLS` holds one take per barrel
(pistol, musket, rifle, cannon) plus the ball's impact; they stream in behind the music like the
death cries, and `GUNS[kind].voice` says which one a rank fires. Nothing is ever silent: the full
synthesised voice plays alone until the take has decoded.

Two things about a generated take cannot be taken on trust, and `analyseTake()` measures both off
the audio at decode time rather than believing the file:

- **Where the shot actually starts.** A generated sound effect is a *clip*, not an event: it opens
  with whatever room tone the model felt like. The first set of barrels was measured at **54 ms of
  silence in front of the Charleville's crack**, and the rifled barrel did not reach its peak until
  **171 ms in**. Played from sample zero on the frame the hammer fell, the report therefore landed
  three to ten frames *after* the muzzle flash — the shot was seen, then heard. Playback now starts
  at the take's own onset, so the transient lands on the requested instant. The onset is found from
  the **loudest** 4 ms window and then walked *backwards* to the foot of the attack; a plain
  threshold crossing is useless here, because it latches onto the room tone and calls a clip whose
  crack is 170 ms deep “aligned at 0 ms”.
- **How loud it happens to be.** Recording levels came back anywhere between 0.18 and 1.55
  full-scale — a 9× spread that swamped the authored per-barrel mix entirely. Every take is now
  normalised to a common peak (clamped, so a hissy one is never boosted into noise), which is what
  makes `volume` mean the same thing whichever barrel is talking.

How much synthesised voice stays underneath is then authored **per barrel** in `SHOT_VOICES`, not
derived from the calibre — “how good is this recording” is not something a bore diameter can
express. The musket's take has the hardest transient of the four and keeps only 34 % of the synth
beneath it; the flintlock's recording is mostly hall, so it keeps 60 % or the shot has no edge on
the frame it happens. A recorded cannon brings its own wall echo, so the synthesised one steps
aside. Per-shot detune is deliberately kept to a couple of per cent: a larger rate change would
drag the transient off the frame the trigger broke on, which is the one thing this must not do.

#### Lock time

A muzzle-loader is **two** sounds, not one. The sear releases, the flint rakes the frizzen, the pan
flashes — and only then does the main charge in the barrel light, 40–70 ms later on a flintlock and
longer on a gun touched off at the vent with a portfire. That gap is lock time, and it is the whole
reason a real shot sounds like a chain of events rather than a single bang.

`GUNS[kind].lock` states it per barrel and the engine plays the two halves apart: `audio.triggerPull()`
— the sear breaking, the flint scrape, then a thin hiss of priming powder running right up to the
report — fires on the frame the trigger is pulled, and `audio.gunshot()` follows one lock time behind
it, on the same frame as the muzzle flash. The marksman's hand-fitted piece is the fastest ignition
on the board (38 ms — a slow lock throws the shot off at the range he is expected to hit at), the
service musket is coarse-primed and slower (58 ms), and the field gun's vent is by far the longest
wait between the order and the boom (120 ms), with a lower, longer fuse hiss instead of a flint
scrape. Without this the report is the only thing the ear ever gets, and the moment the finger moved
is inaudible.

`GUNS[kind]` holds the bore. The Emperor's flintlock is deliberately the quietest kill on the
board — a dry crack, a puff of smoke, no spectacle. The marshal's rifle is the longest held
breath (0.62 s of aim — dropping into the kneel *is* his aim — before a 1.7 s drill) and the
flattest, fastest ball, with less flame than the line's musket: a marksman is one clean crack,
not a volley. The musket is a hard crack over a chest thump and a real bank of white smoke. The
field gun is the loudest thing in the hall, louder than the crown's judgement: a sub-bass slam
with the report coming back off the far wall.

### The powder bank

Smoke is the slowest thing a gun makes. The flash is three frames and the ball is half a second,
but the cloud is still drifting over the square long after both — so `spawnPowderCloud()` is built
as air rather than as a sprite pop. It used to be a handful of billboards that appeared on one
frame, slid outward in a straight line at constant speed and dimmed together, which read as a
single puff switching on and off. A charge actually does three distinct things, and each lobe of
the bank now carries all three on **its own clock**, integrated from its absolute age (a closed
form, so the smoke is identical at any frame rate):

1. **The vent.** Gas leaves the bore over about a tenth of a second, not at once, so the lobes are
   *born in sequence* across `vent` (0.17 s for a smoothbore, 0.10 s for the rifle's tight-patched
   charge) and the earliest gas gets the hardest shove (`push = 1 − order·0.62`). The bank visibly
   grows *out of* the barrel instead of appearing around it, and the cool late gas is left curling
   at the muzzle.
2. **The stall.** That ejection speed is eaten by the air almost immediately — each lobe travels
   `jet/drag · (1 − e^−drag·age)`, i.e. it lunges perhaps a square forward and stops. From there it
   is only buoyancy (which *builds* as `age²`, because powder smoke sags off the barrel before it
   climbs), the hall's own draft, and its own turbulent curl: a per-lobe `sin` swirl so the smoke
   rolls over itself rather than sliding rigidly, with angular drag on the sprite rotation.
3. **The dissolve.** Mass is conserved while volume is not, so opacity carries
   `(seed/width)^1.35` on top of its fade: smoke gets faint **because it is spreading**. Each lobe
   swells on `age^0.55` (fast while the gas is hot, easing off after) and holds its own lifetime,
   with roughly one in six given a longer one — the bank thins into a haze you can read the board
   through and never ends on a single frame.

Two shared touches keep it in the room: `HALL_DRAFT` (a couple of centimetres a second, the same
for both armies) is what finally carries the bank *off* the square rather than letting it dim where
it was made, and `floor` flattens anything that sags to `BOARD_TOP` instead of letting it sink
through the stone. `GUNS[kind].smokeHang` states the linger per barrel — 1.7 s for the Emperor's
flintlock up to 3.8 s for the field gun — and every one of them outlives its own shot.

**The barrel goes on smoking after the crack.** The bank is made once, where the gun was fired, and
left in the air — air does not follow a man around. But a fouled bore keeps venting for a second or
two, and *that* smoke belongs to the weapon, so `boreTrickle()` emits `GUNS[kind].boreSmoke.wisps`
threads on a clock, each one reading `PieceView.muzzleOrigin()` at the moment it is made. The
thread visibly trails the muzzle as the marksman brings his rifle down out of the kneel, and each
wisp is thinner, slower and longer-lived than the last, because the bore is cooling.

**The rifle's smoke is its own.** `GUNS[kind]` carries the character of the powder as well as the
bore (`smokeTint`, `smokeDensity`, `fineSmoke`), because a rifled barrel firing a small,
tight-patched charge burns it almost completely. The marksman's bank uses `fineSmokeTexture()`
instead of the musket's soot blob — a high-key, low-alpha, threadier bloom — tinted a fixed pale
ash grey (`0xdfe4ea`) rather than the faction livery, at **0.74 density**: sheer enough to keep
seeing the target through it. The answer to a rifle making less smoke than a musket was never to
make it *thicker*: there are **more lobes** (12 against the musket's 8), each smaller, faster off
the bore, quicker to stall, lifting harder and expanding further — and it **hangs 3.2 s** with the
bore trickling for 1.5 s after, so the shot can be watched coming apart. The wisps the ball trails
on its way over carry the same pale tint, shorter life and more rise. Every other barrel keeps the
dirty livery-tinted soot (the field gun at 1.15 density and 14 lobes, the Emperor's flintlock at
0.85 — a puff, no spectacle).

The piece is not nudged by its own charge, it is **thrown** (`gunRecoil()` →
`PieceView.setTrainRecoil(back, lift)`): the wheels leave the stone and the muzzle jumps in under
a tenth of a second, the carriage comes down while it is still running back, rolls a little
further, and only then is heaved up to the mark again over most of a second. Dust and grit are
hammered out from under the wheels on the frame it fires, the trail is heard slamming back just
behind the report with the wheels landing after it, and the hall takes the shock of the recoil a
beat *after* the shot rather than with it. Every voice is synthesised by `calibre` in one mixer
method — no assets, so a volley never waits on a download.

**The marksman is watched, not looked through.** The rifle shot used to be staged from behind a
full-screen sight picture (`SceneCallbacks.onScope` → `ScopeOverlay.tsx`, `.mc-scope`): a dark tube
around the body, a brass two-wire reticle tracking it, a per-shot hand tremor rolled from range, a
recoil that threw the picture off the mark — all of it sitting on top of the hardest lens punch-in
on the board (8.5°). All of it is gone, callbacks and CSS included, and his framing is now the
line infantry's (5.5°).

The reason is that the two effects were competing for the same moment. The overlay took the kill
*out* of the hall — you stopped watching a man on a battlefield and started watching an interface
— and the drill had to be stretched to 2.1 s to give the tube something to fill. What reads as a
marksman is far simpler: **he drops onto one knee to take the shot, and only then.** That kneel used
to be his permanent stance (a figure crouched behind cover for an entire game, which is why nothing
about the shot looked like an act of aiming), so the sequence is now
stand → kneel → level → fire → reload on the knee → up onto his feet → march, all of it in world
space where the rest of the hall is.

**And he holds that kneel for the whole shot.** Getting the kneel into the beat was only half the
job: the pose then had to survive it. Between a kneeling `aim` and a kneeling `reload` sat a *firing*
clip that measures, on the hips, standing → crouch → standing, with its ignition frame on the way
back up — so the man stood to fire and dropped twice per shot, and a beat built around one clean
kneel read as bobbing. Nothing in a clip's name tells you this; only its hip track does. The
kneeling shot therefore has **no firing clip** and is fired out of the held aim, `GUNS.b.stance`
declares the kneel so the engine knows which pose owns the shot, and the two stance changes that are
left are real motions off one generated take — `Kneel_on_One_Knee_and_Stand` reversed to go down,
forwards to come up — rather than crossfades between two heights.

**The gun goes where the arms go.** A prop parented to a hand bone at a fixed body-space angle
suits a blade at rest, but it leaves a rifle standing straight up through an aiming clip.
Firearms therefore declare `hold` in `src/scene/weapons.ts` and their angle is re-solved against
the live skeleton every frame (`AttachedArms.align()`, called right after the mixer): a `longArm`
is laid **downrange** — along the figure's own front, since a shooter has already turned to face
what he is shooting at — with the two fists supplying only the cant and the elevation, so a
levelled musket lies about 20° across the body with the butt in the firing shoulder; a `sidearm`
follows the forearm through the wrist, lifted toward the figure's front so a hanging arm carries the
pistol low instead of aiming at its own boot. Roll comes from the barrel pitched a quarter turn
about the lateral axis — trigger guard forward when upright, floorward when levelled, no flip in
between. Carried guns are exempt from the floor-clearance clamp that keeps grounded shafts out of
the board, which is what had the crouching marksman gripping his rifle by the butt plate.

**The fists do not straddle the barrel.** The long arm used to take its barrel line *straight* from
the vector between the two fists, on the assumption that a shouldered clip puts the support hand out
on the forestock. Measured on the rigs that actually shoot, it does not. The Grande Armée's aim takes
are archery clips, and in them the fists sit side by side **across the chest**: the hand line runs
0.90–1.00 along the figure's lateral axis, leaving almost nothing along its front — and the residue
that was being used as the barrel's *direction* changes sign several times per loop. The line
infantry's aim reads front = −0.24, −0.23, +0.27, +0.54, +0.40, −0.22, +0.02, −0.28 across one scan,
and its firing clip is at −0.26 on the authored ignition frame — so the musket swung between
pointing downrange and pointing back over its owner's shoulder, and **the shot was taken from the
reversed half**. The marksman's rifle marched backwards on all nine samples of its charge cycle for
the same reason. The pistols never showed it because the `sidearm` rule has always carried a front
bias; the long arm simply lacked the equivalent guarantee. It now has one, and every clip on both
rigs (stance, aim, strike, march, reload, rise, death) sits 3–22° off the front with no sign changes
anywhere.

The shot leaves the gun itself: `muzzle` markers in `src/scene/weapons.ts` are parented at each
barrel mouth (pistol, musket, gun bore) and read out of the live pose each frame, exactly like a
caster's `focus`. The **field gun is a towed prop**, not a held one: it hangs off the sculpt root
in body axes with its own wheels, carriage, trail and imperial eagle, so it travels and turns
with the guard but is untouched by the skeleton — a gun carriage must not crouch when its crew
does. Flash lights are borrowed from the same fixed `SpellLightPool`.

## The Napoleonic arms

Every other army is armed from primitives, and should be: a fantasy greatsword has no original to
be wrong about. The Grande Armée's arms do. A Charleville Model 1777, an An XI cuirassier sword and
an An XIII officer's flintlock are documented objects down to their brass furniture, and a
box-and-cylinder version of one reads as a toy in a hand that is otherwise a real sculpt — so all
six are **generated meshes**, listed in `ARM_SCULPTS` (`src/assets/generated.ts`):

| Rank | Weapon | Sculpted detail the primitives could not carry |
| --- | --- | --- |
| Line Infantry | Charleville 1777, bayonet fixed | Full walnut stock, brass butt plate and three barrel bands, lock with cock and frizzen, ramrod under the bore, socket bayonet past the muzzle |
| Marshal-Tirailleur | 1793 Versailles rifled carbine | Raised cheek piece, leaf rear sight, brass ramrod pipes, sling from butt swivel to middle band, no bayonet |
| Cuirassier | An XI heavy cavalry sword | Four-branch brass bowl guard, wire-bound grip, flat-backed blade with a wide fuller |
| Napoléon | General officer's dress sabre | Gilt bronze knuckle-bow hilt, blued and gilt-etched blade |
| Imperial Commander | Marengo presentation sword | Ivory grip under gold wire, laurel-chased bow, eagle's-head pommel |

**A sword is the length of the real one, and it is held out of the man's own silhouette.** Both are
easy to get wrong in ways that look like a broken model rather than a wrong number. The Emperor's
dress sabre was fitted at 0.72 of his height — a 1.26 m blade, longer than the trooper's An XI, on a
man who stood 1.69 m — and every Napoleonic blade rested at `(-0.05, 1, 0.14)`: straight up, leaning
a shade *toward* the spine. The fist sits at about half a figure's height, so anything longer than
half a body reaches past the crown, and the inward lean walks it up the middle of the silhouette:
that sabre crossed head height at x = 0.219, the exact edge of the bicorne, so from the board's
camera the Emperor's own blade was drawn across his face. Fixed by measurement, not by taste — the
dress sabre is 0.54 (95 cm overall, so *shorter* than the cuirassier's 0.63, which was already
right) and the court sword 0.58, while `BLADE_AT_REST` rakes all three out ≈27° and forward ≈15°.
The blade now leaves the fist heading away from the body, tops out at jaw height instead of above
the hat, and reads as a diagonal in the open half of the square. The primitive fallbacks were
shortened in the blade only, never the hilt: a hilt is the size of a hand whatever the blade does.
| Napoléon / Commander | An XIII officer's flintlock | Chequered half stock, gilt side plate and butt cap, brass fore-end cap |

The hard part is not downloading them. **A generated weapon arrives in an arbitrary pose**: the
cuirassier sword measures 0.97 × 1.00 × 0.96 because it lies along the diagonal of its own bounding
box, so nothing in the file says which way the blade runs, which end is the point, or which side the
trigger guard is on. Rather than eyeball six rotations, `src/scene/armoury.ts` **measures** each
sculpt and fits it into the exact local frame the primitives are authored in — length up `+Y`, butt
on the origin:

1. **Long axis** from the principal axes of the vertex cloud (a bounding box cannot answer this for
   a diagonal model — all three sides are equal and none of them is the blade).
2. **Which end is the point** from the cross-section at each end: muzzles, bayonets and blade tips
   taper, butt plates and bowl guards do not. The Marengo sword arrives hilt-last and the pistol
   muzzle-first; neither needs a special case.
3. **Roll** from the two remaining axes. A blade keeps its flat across the swing (`±X`, matching
   `curvedBlade`), so a sculpted sabre still swings edge-first. A firearm's lock plane stands in the
   barrel's own plane (`±Z`), with the trigger-guard side found by stepping from the **bore out to
   the stock**: the slice just behind the muzzle is bare barrel, the butt quarter is all wood and
   furniture, and a gun's stock hangs *below* its bore — so the offset between those two bands
   points at the underside, whatever else is bolted to the weapon. That is what keeps
   `gunOrientation`'s promise (guard forward when carried upright, floorward when levelled) true for
   a mesh nobody rotated by hand.

   This was read off the **centroid** until it bit: muzzle third against the middle of the whole
   vertex cloud, which is the same answer only while nothing but the gun pulls that centroid off the
   bore. The Versailles rifle does — its slack sling loops `0.34` of the weapon's length clear of
   the stock, four times the rifle's own lateral thickness (`0.087`) — and it dragged the centroid
   past the barrel. Both long arms were therefore fitted **upside down**: sling arcing over the
   barrel, lock and trigger guard turned at the sky, on every line infantryman and every marksman
   that carried one, in every clip. The flintlock pistol has no sling to fool the test and reads the
   same under either rule, which is why the Emperor's hold never looked wrong.
4. **Which way round** — the *sign* of that roll, which an eigenvector cannot give: `±narrow` both
   put the flat across the swing, so which one came back was decided by whichever way the Jacobi
   sweep happened to fall. On a straight blade that is invisible; on a curved one it is the entire
   silhouette, and it is why the Emperor was seen holding his sabre like a sickle. A blade therefore
   settles it by **the bow of its own curve**: the belly — the convex side — is put on `+X`, the side
   `curvedBlade` sweeps toward and `knuckleBow` bulges toward in the primitives these sculpts stand
   in for. A straight court blade has no curve to read (the Marengo sword bows 0.03% of its length),
   so it falls back to the hilt's own lump, which on a presentation sword is the knuckle bow.

   Which way that belly faces on a *figure* is the mount's business, not the fitter's:
   `restOrientation` projects the **body's** front, and the body's front does not mirror with the
   hand, so a prop's own `+X` lands on the body's `+X` — the figure's left — whichever fist holds it
   (measured: `(0.90, ∓0.45, 0)` for both hands). An `edged` blade is therefore rolled half a turn
   (`EDGED_FLIP`) in the fist where `+X` is the *outward* side, so the belly always bows across the
   body and the point sweeps away from its owner. Bowed the other way, on the Emperor's own rig, his
   dress sabre came to rest with the point at 0.80 out and 1.68 up on a 1.70 m figure — its tangent
   turning back in over the crown of his bicorne. Bowed across, the point carries on outward (0.85)
   and clear of him. Only the three curved Napoleonic blades are flagged `edged`; a straight sword
   rolled half a turn looks identical, so the medieval and Sun Empire arms are untouched.

Only two numbers per weapon are authored: the **fist** and the **bore**, as fractions of the
weapon's length, because no measurement finds a trigger. Both were read off each sculpt's own
cross-section profile — the bulge of the lock, the gap between pommel and guard — and land within a
couple of percent of the hand-built props they replace (the rifle's fist at 0.30 of its length
against the primitive's 0.30; the musket's bore at 0.80 against 0.77). On the musket the marker is
the bayonet **socket**, not the bayonet point: the flash has to leave the barrel, not the blade
beyond it. `src/scene/armoury.test.ts` throws a primitive-built sword and musket into a random
orientation and checks they come back standing on their butts, point up, guard forward — a **slung**
musket besides, its loop authored far enough off the underside to drag the centroid past the bore, so
the roll can never quietly regress to the centroid test — and a **swept sabre** fed in from both
halves of the roll, which has to come back belly-on-`+X` from either, so the sickle cannot come back
either.

Everything downstream is untouched by the swap. The sculpt supplies grip and muzzle; the *loadout*
still owns the rest angle, the wrist offset and the pose-driven `hold`, so the marksman still kneels
and levels, the Emperor still carries low, and `muzzleOrigin()` still finds the bore. Sculpts are
downloaded **with** the rosters (`armSculptWarmJobs`, in the shared window in
`src/scene/gltfQueue.ts`) rather than after them, because a figure is armed the instant it is built —
a weapon that lands late is a musket the rest of the game never sees. Geometry and textures are
shared across the army, only materials are per figure (the highlight, fade and dissolve write into
them), and any sculpt whose download fails falls straight back to the primitives: a plain musket
beats an unarmed soldier.

## Swapping in your own models

Every army is one entry in `ARMY_SKINS` (`src/assets/generated.ts`) — label, blurb, rank names,
weapon family, sculpt URLs, clip URLs and voices:

```ts
export const ARMY_SKINS: Record<ArmySkinId, ArmySkin> = {
  ivory: {
    label: "Ivory Kingdom",
    arsenal: "kingdom",   // weapon family in src/scene/weapons.ts
    native: "w",          // the side it was painted for
    still: { k: "…king.glb", q: "…queen.glb", /* … */ },
    animated: { /* rigged GLB + one GLB per clip, per rank */ },
    cries: { /* one voice per rank */ },
  },
  /* sun, empire … */
};
```

A fourth army is that one entry plus a `LOADOUT` row in `src/scene/weapons.ts`; it then shows up
in **Settings → Armies** on its own (the panel renders `ARMY_SKIN_ORDER`).

Drop glTF/GLB characters into `web/public/models/` and point the entries at
`/models/your-king.glb`. Requirements:

- **Orientation** — Y-up, facing +Z, or edit `PIECE_MODEL_ORIENTATION` in the same file; the
  loader derives the correction quaternion from the declared front/up axes.
- **Scale** — any. `PieceFactory.normalize()` measures the model, rescales it to the height in
  `PIECE_HEIGHT` (`src/scene/pieces.ts`), centres it on X/Z and grounds it on Y.

`PIECE_HEIGHT` is deliberately **two tiers, not six**. The board only has to say one thing about
a figure at camera distance: is that a footsoldier, or is it somebody. So the knight, the mage
and the tower guardian stand in the royal band with the queen (0.98 / 1.00 / 0.99 against her
1.00) and only the king rises above them at 1.12; the pawn stands a tier below at 0.78. Their old
0.84-0.88 put them barely a hand over the pawn, and three officers reading as footsoldiers is a
board that lies about itself. Everything hung off a figure follows the number — the crest above
its crown, its pick collider, its held weapons, the sole line the dissolve burns up from — so
the rest of this is one edit, with two exceptions worth knowing:

- **Crests and map tokens are re-ranked with them** (`BADGE_SCALE`, `TOKEN_SCALE` in
  `src/scene/rankBadges.ts`). A minor-piece crest floating over a royal-sized figure reads as an
  undersized sticker, and the flat overhead map keeps the same two tiers so switching views does
  not silently re-rank the army.
- **The footsoldier is not a token** (0.78, up from 0.70). Sixteen of the thirty-two figures on the
  board are pawns, so they are what the hall mostly *is*; at 0.70 a man stood barely two thirds of
  the tile he occupied and read as a marker on his square rather than a soldier holding it. 0.78
  still leaves a fifth of a square of daylight up to the officer band, which is what keeps the two
  tiers separable at camera distance.
- **The battery's gun is sized against its crew, and pays for it out of its track**
  (`WeaponSpec.bulk` / `WeaponSpec.track`). A real Gribeauval 6-pounder rolls on wheels about four
  fifths of a man's height and is longer than a man is tall; at the old `bulk: 0.85` this gun's
  wheels reached barely a third of the artillery guard's height, so the rank read as an officer
  wheeling a toy. It cannot simply be scaled up either — one square is `TILE` wide, and a uniformly
  grown carriage puts a wheel down on the neighbouring piece's tile. So `bulk` rises to **1.22**
  (wheels at roughly half the guard's height, trail-to-muzzle just under a square) while
  **`track: 0.8`** squeezes the gun on its *own X* — the axle. That is the one axis the eye does not
  audit: the wheels stand in the YZ plane, so narrowing the track only thins their tyres, it never
  turns a wheel into an ellipse. With the park pulled in to `(0.2, 0, -0.04)` and the hauling yaw
  eased from 0.14 to 0.07 rad (yaw trades length for width), the bigger gun overhangs its tile by
  **0.03 units instead of the old 0.11** — half again the gun, in less of the neighbour's file.
- **Materials** are cloned per instance and tinted per faction in `applyFactionLook()`.

If a rigged model fails to download the loader falls back to the static sculpt, and if that
fails too, to a procedural primitive figure — **the game always stays playable**.

To animate your own characters, fill the army's `animated` roster with a rigged GLB plus one
GLB per clip; any missing clip is simply skipped (no `walk` clip just means that rank slides),
and a clip that fails to download is retried on demand the next time the game needs it.

For shipping, compress the GLBs instead of streaming them from a remote host:

```bash
bunx @gltf-transform/cli optimize king.glb public/models/king.glb \
  --compress draco --texture-compress webp --texture-size 1024
```

## Audio

MP3s are streamed once and decoded into Web Audio buffers: an ambience bed, a score bed and a
tension stem that crossfades in during check and the endgame, plus place, capture, check-horn
and fanfare one-shots. Death cries come from whichever army each side is mustering (`cries` on
its `ARMY_SKINS` entry) and are lazily loaded after the mixer unlocks, since they are only
needed on a capture; each is a real one-second take, panned by the dying figure's screen
position and pitch-jittered per playback. They are cached by URL, so switching armies back and
forth costs nothing.

All three armies have their own set of six, and the sets are written against the way that army
dies. The Grande Armée's are gunshot reactions rather than melee cries — Napoléon bites a grunt
off through his teeth, the commander takes a sharp breath and lets a low gasp fall away, the
marshal is hit on the knee he fires from, the cuirassier's bellow is boxed in by his helmet, the
artillery guard's groan sags with his weight, and the line infantryman's cry is young, thin and
snapped short.

Footsteps, the wooden set-down knock, the claim motif fired when a square changes hands
(`conquest()`), body falls and UI blips are synthesised with oscillators
and noise buffers — no files. Everything routes through one master gain
for the mute toggle, and playback only starts after the first user gesture (browser autoplay
policy).

> **Note on hosted assets.** Out of the box, the models and audio are streamed from remote
> URLs listed in `src/assets/generated.ts`. If you fork this for production, mirror them into
> `web/public/` and update those constants so your build does not depend on someone else's CDN.

## Scripts

Run from `web/`:

| Script | What it does |
| --- | --- |
| `bun run dev` | Vite dev server with HMR |
| `bun run build` | Type-checked production build into `dist/` |
| `bun run preview` | Serve the production build locally |
| `bun run lint` | ESLint over the whole project |
| `bun run test` | Node unit tests **and** the Playwright-backed browser tests |
| `bun run test:watch` | Vitest in watch mode |
| `bun run test:browser` | Browser-mode Vitest only |

## Fitting the hall to the screen

`scene/viewport.ts` — every camera shot in the engine was authored against a wide desktop
window, and a perspective camera's `fov` is its **vertical** angle. So the narrower the screen,
the less of the board's *width* fits in frame: on a phone held upright (aspect ≈ 0.46) a 46°
lens sees barely half the files. And the fix is never "pull straight back", because **the
colonnade stands at radius 12.5** — a shot dragged out past it puts the hall's own pillars and
curtain wall between the player and the board.

So the framing is **solved**, not authored. Given the board's reach (the eight files plus a
margin for the figures and their crests) the engine works out the distance and the lens that
put the whole board on the *narrow* axis, then takes the extra distance as **height** rather
than ground reach — the camera climbs over the colonnade instead of backing into it.

| Screen | Lens | Distance | Ground reach | Height |
| --- | --- | --- | --- | --- |
| Desktop 16:9 | 46.6° (authored) | 10.5 | 8.6 | 6.4 |
| Phone, landscape | 46.6° | 10.5 | 8.6 | 6.4 |
| Tablet, portrait | 63.6° | 10.5 | 7.7 | 7.5 |
| Phone, portrait | 68° | 14.5 | **10.6** (inside the pillars) | 10.3 |

A desktop window never reaches for any of this and keeps its authored shot exactly.

What else the solved framing carries:

- **The board can never be hidden by the hall.** `confineCamera()` runs every frame: any ground
  reach past radius 11 is converted into height, keeping the same distance to whatever is being
  framed. Orbit controls can only cap angle and distance *independently*, so a long pull-back at
  a low angle used to walk the camera straight through the pillars — that is the bug this closes.
  The intro fly-in is exempt: it deliberately comes in from outside the walls.
- **The showcase follow rig solves that wall itself, up front.** A net that corrects the *camera*
  after the smoothing has run is fine for a hand on the mouse, but it was wrong for a rig that
  asks for an illegal eye on every near-side move: each frame the chase stepped outward, the wall
  shoved it back, and the height came back through a square root. Simulating the real loop against
  a figure marching down the near file, the clamp fired on **98% of frames**, doubled the camera's
  mean frame-to-frame jerk and spiked it to **0.5% of screen height in single frames** — the
  shudder people saw in showcase mode. `solveFollowEye()` now cuts the rig's ground reach to what
  the hall has room for *before* the smoothing, paying first out of distance (18%) and only then
  out of elevation. Same intent as the clamp, but continuous: the clamp never fires while
  following, the jerk drops ~11×, and the eye settles **lower** than the old correction left it
  (7.4 rather than 9.6 on the worst corner).
- **The follow rig leans rather than chases.** Holding the figure dead centre dragged the eye a
  full board-width sideways — which is what pushed it into the wall in the first place. It now
  travels 72% of the way to the action: the figure sits a fifth of the frame off centre, the rest
  of the position stays in shot, and the camera moves noticeably less between moves.
- **A phone is never given the near-ground angle.** At eye level the board is a line and the
  screen is all hall, so a handheld view is capped at ~20° above the horizon and framed from
  higher up — which also means a tap lands on the square the finger is actually over. A pinch
  cannot come closer than 5.8 units either, so the camera can't be buried inside the front rank.
- **The 2D tactical map is solved the same way.** Its 28° overhead lens showed six files on a
  phone; it now opens to whatever the aspect needs (~50° in portrait) and keeps its distance.
- **Battle lens punches are proportions, not constants.** A 5.5–8.5° push-in barely registers
  against a 68° framing, so every punch is scaled by the framing in force. Rotating the phone
  mid-fight can no longer restore the wrong lens either — the beats read the live framing rather
  than a value captured when the strike began.
- **Rotating the device re-frames the board** (holding the side you were watching from), while a
  browser toolbar sliding away does not: the shot is only re-solved when the aspect really moved.
- **Handheld is a capability test**, not a user-agent guess: a coarse pointer on a hand-sized
  screen. A phone in desktop mode and a narrow desktop window both get the same treatment.
- **The interface tightens at the two ends** on a phone: 34px icon buttons, a compact turn slate,
  and the two controls that are either duplicated in the camera menu (flip) or ignored by the
  platform (fullscreen on iOS) give up their place in the row.
- **The notch and the home bar are respected.** The hall itself is drawn edge to edge
  (`viewport-fit=cover`), but nothing you have to read or press is: every surface pinned to a
  screen edge pays `env(safe-area-inset-*)` on that edge — see
  [Safe areas on notched phones](#safe-areas-on-notched-phones).

## Safe areas on notched phones

On an iPhone with a Dynamic Island or a notch the turn slate and the icon rail were drawn *under*
the cutout, and the chronicle sigil sat behind the home bar.

**The cause was one missing token.** The interface was laid out with plain padding
(`p-3 sm:p-4`, `bottom-0 left-0`) against the raw viewport, and the document's viewport meta had
no `viewport-fit=cover`. Without that opt-in iOS reports **every** `env(safe-area-inset-*)` as
`0px` — so even had the CSS asked for the insets, it would have been handed nothing. The screen
is also genuinely edge-to-edge for the 3D hall, which is what we want; only the interface needed
pulling in.

**The fix** — `viewport-fit=cover` in `web/index.html`, then four variables in `medieval.css`
(`--mc-safe-top/right/bottom/left`) that every edge-anchored surface spends on **its own edge and
no other**:

- **Top bar** (`.mc-hud-top`) — top inset for the cutout, plus both horizontal insets, because
  held sideways the cutout moves to a flank and the turn slate is the first thing under it. The
  bottom edge stays untouched: the bar only ever grows downwards.
- **Chronicle corner** (`.mc-hud-corner`) — bottom inset for the home bar, left inset for a side
  cutout. Its base padding still steps 0.5 → 0.75 → 1 rem with the screen, so the inset is added
  to the right number rather than replacing it.
- **AI vs AI transport, clean-capture button, frame counter, flank rail** — each shifted off the
  corner it is docked in. The transport's `max-width` subtracts the horizontal insets too, so it
  wraps instead of running under a rounded corner.
- **Full-screen panels** (menu, settings, result) use `.mc-modal-pad`. The dimmed backdrop is
  deliberately left at `inset-0`: inset it and the lit hall shows through in the band beside the
  cutout. Only the content inside is padded.
- **Tooltips** cap their width against the *safe* width, so one opening beside a landscape notch
  is not clipped by it.

All four variables resolve to `0px` on every screen without a cutout, so desktop and Android
layouts are byte-for-byte what they were. Nothing here is a user-agent check.

## Browser support

Any browser with **WebGL 2** and **Web Audio**: current Chrome, Edge, Firefox and Safari 16+,
on phone, tablet and desktop. Touch orbit, pinch zoom and tap-to-move are supported, the
framing is solved for the screen it is drawn into (see
[Fitting the hall to the screen](#fitting-the-hall-to-the-screen)), and on narrow screens the
move ledger leaves the flank rail for a corner button so the board keeps the whole viewport.

On Linux, check `chrome://gpu` / `about:support` first: without hardware acceleration the browser
falls back to llvmpipe, and the scene is then rendered by the CPU. The game still runs — see
[Black-screen recovery](#black-screen-recovery) — but expect Low preset frame rates.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the
workflow, coding conventions and the **English Conventional Commits** message format used in
this repository.

## License

[MIT](LICENSE) © the King's Gambit contributors.

Bundled dependencies keep their own licences: three.js (MIT), chess.js (BSD-2-Clause),
React (MIT), Tailwind CSS (MIT), Radix UI / shadcn/ui (MIT), lucide (ISC).

The 3D characters and audio shipped with the project were generated for it and may be reused
under the same terms; if you replace them, credit the new authors here.
