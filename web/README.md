# King's Gambit — the app

This folder holds the game itself. For the project overview, features, architecture notes and
contribution guide, read the [root README](../README.md) and [CONTRIBUTING.md](../CONTRIBUTING.md).

A cinematic 3D chess game: sculpted medieval, Mesoamerican and Napoleonic figures fighting on a
marble-and-basalt board. Built with Vite + React + TypeScript + three.js, with chess.js for
the rules and a Web Worker search engine for the computer opponent.

## Setup

```bash
bun install   # or npm install
bun run dev   # or npm run dev  → http://localhost:5173
bun run build # production bundle in dist/
bun run preview
```

## Controls

| Action | Input |
| --- | --- |
| Orbit / zoom | Drag, mouse wheel (pinch on touch) |
| Playing on a phone | Nothing to set — the framing is solved for the screen, see [Screen framing](#screen-framing) |
| Select a figure | Click it (legal squares glow green, captures red) |
| Promotion | Tap a candidate, or press `Q` `R` `B` `N` — see [The promotion picker](#the-promotion-picker) |
| Move | Click a highlighted square — including one standing behind a figure, see [Clicking a square behind a figure](#clicking-a-square-behind-a-figure) (click the figure again to deselect) |
| Camera | Camera icon in the top bar (presets, flip, tactical) |
| Two players on one screen | The board does **not** turn itself between turns — see [Hotseat: the view holds still](#hotseat-the-view-holds-still) |
| Armies & battleground | Picked on the main menu before the duel; read-only in settings once a duel is running |
| What a button does | Hover, focus or tap it — every icon carries a tooltip |
| Skip the intro | Click anywhere during the opening sweep |
| Settings | Gear icon (graphics preset, brightness, capture cinematics, board swing, rank crests, sound) |

There is no drag-and-drop; both selecting and moving resolve on pointer release, and a press
that travels more than 8px (16px for a finger) counts as a camera swing instead.

Key hints are printed only on devices that have keys — see [Key hints only where there are
keys](#key-hints-only-where-there-are-keys).

| Key | Action |
| --- | --- |
| `F` | Flip the camera to the other side |
| `T` | Toggle the 2D tactical view |
| `H` | Open / fold the chronicle |
| `C` | Cinema mode — hide the whole overlay |
| `Space` | Pause / resume a showcase duel |
| `Esc` | Close the settings panel, camera menu, chronicle or tooltip |

### Key hints only where there are keys

Every shortcut hint was unconditional, so a phone was told to press keys it does not have in **13
places**: 4 key caps still reachable in the tooltips (`T`, `H`, `C`, `Space` — `F` was already
`wideOnly`), 3 native `title` reminders (`(T)`, `(F)` in the camera menu, `(C)` on the cinema restore
button), and 6 lines of copy (the promotion banner's *OR PRESS Q R B N*, the menu's *SCROLL TO ZOOM ·
CLICK A FIGURE*, *CLICK TO SKIP*, the hotseat and AI-vs-AI blurbs, the board-swing note). That is
noise on the screen with the least room for it, and it also mis-describes the gesture: there is no
scroll wheel to zoom with and no click to skip an intro.

`src/ui/inputMode.ts` answers the one question that matters — `useHasKeyboard()`:

- The test is `(pointer: coarse) and (hover: none)`, not a user-agent string. A touchscreen laptop
  still reports `hover: hover` because it also has a trackpad, so it keeps its key caps.
- **A real keydown overrides the media query.** An iPad in a case keyboard proves it has keys the
  first time one arrives, and every hint reappears — trusted events only, and keys typed into an
  `input`/`textarea`/`contenteditable` are ignored, because an on-screen keyboard fires those too.
- One `useSyncExternalStore` subscription is shared by all callers (~20 tooltips), so the twenty
  controls do not open twenty media listeners.

`Tooltip.tsx` drops the cap itself, so callers keep passing `keys="T"` unconditionally and no control
has to know what it is being read on. Where the gesture genuinely differs the copy changes rather
than disappearing: *PINCH TO ZOOM*, *TAP A FIGURE TO COMMAND IT*, *TAP TO SKIP*, and “flip from the
camera menu” instead of “flip with `F`”. The shortcuts themselves are untouched — this is about what
is advertised, not what works.

### Hotseat: the view holds still

Two-player hotseat used to swing the camera a **half turn round the hall after every ply**, on by
default. That is the single heaviest camera move in the game, and in hotseat it fires **twice a
minute** — at chess pace, roughly every 15–30 seconds, forever. It also fires *unbidden*, at the end
of a move the player was already tracking, which is exactly the recipe for motion sickness: a large
vestibular-conflict movement the viewer did not initiate and cannot predict. Players sitting side by
side at one screen do not need the board re-oriented anyway — they need to keep their bearings.

So `rotateBoard` now defaults to **off** and the choice is **remembered** (`kg.table` in
`localStorage`, alongside the render and army prefs). Reaching for it is one toggle in settings
(*Swing camera between turns*), and when it is on the swing is slower than it was — **1.15s → 1.8s**,
so it reads as the hall turning rather than a cut. The manual flip is untouched: `F`, or the flip
button in the camera menu, still turns the view instantly whenever a player wants it, and being asked
for is what makes it comfortable.

### Clicking a square behind a figure

The figures are life-size people standing on 1.02 m squares and the camera is low, so a
destination is normally *behind* a body rather than beside one. Sampled on the opening position
with the real framing and colliders: a knight's own two squares are **88% hidden** on a 1440×900
window (61–67% on a 390×844 phone), and `a3` is 47% hidden by the pawn on `a2`.

Every figure carries an invisible collider and the nearest hit wins, which is the right rule for
*choosing* a figure and the wrong one for *playing a move*: only **11%** of the pixels inside `f3`
resolved to `f3` — the other 89% hit the `f2` pawn in front, so the selection jumped to the pawn and
the knight stayed put. That is the board appearing to ignore the player.

`pickTarget()` now decides between the two with one rule: **a figure speaks for the ground it
stands on, and no further.** While a piece is selected, if the pointer is inside a lit
destination's own projected outline, that destination wins — unless the pointer is *also* inside
the outline of the square the ray hit (its feet, its base, its own tile), which keeps
tap-to-select, tap-to-deselect and tap-the-enemy-to-attack exactly as they were.

The outline test needs no tolerance to tune: the board is a single plane, so its 64 outlines tile
the screen with no gaps and no overlaps, and at most one can contain the pointer. Re-sampling the
same cases: `f3` and `c3` go from 11% to **100%** clickable on desktop and 34% → 98% on the phone,
`a3` from 49% to 100%, `e4` (never occluded) stays at 100%, and every figure remains 100%
selectable over its own ground.

Seeing the square is the other half. A marker that only exists on the stone is invisible under a
body, so `board.ts` draws each destination reticle a second time with `depthTest: false`,
additively, at `XRAY_OPACITY` (0.26–0.38 of full) — an occluded square reads as light bleeding
through the figure. Locked to the marker's own scale and spin at 0.9×, so where nothing is in the
way the two read as one mark rather than a double exposure.

### The promotion picker

A promoting pawn opens the only genuinely modal moment in the game, and it used to be the least
readable thing on screen: four unlabelled sculpts at board depth. Sampled with the shipped framing,
each candidate stood **103px tall on a 1440×900 window and 38px on a 390×844 phone**, with
**32–37% (desktop) and 94–100% (phone)** of every silhouette overlapped by the army behind it. The
sculpt cannot carry the choice on its own either — every officer here is royal-height and rook,
bishop and queen differ only in what they hold, a few pixels of weapon at picker size.

So the picker is staged as a modal. `buildPromotionPicker()` gives each candidate a plinth and a
sprite **name plate** carrying the rank's crest, the rank spelled out and the key that picks it (the
plate is the biggest click target of the four). `layoutPromotionPicker()` anchors the group to the
**camera** rather than the board — a solved distance forward, `lookAt` the camera — so it reads the
same at every framing and can never end up inside a rank of figures. The distance is solved from the
lens so the grid fills `PROMOTION_FILL` (84%) of the binding axis, four across on a wide screen and a
**2×2 grid** below `aspect 1.05`: the 38px phone figure becomes ~115px. The figure turns inside its
own `spin` child so the idle rotation never swings the plate out of line, and a full-screen scrim is
hung behind the group with the cinematic depth of field refocused onto the picker.

**Depth-ignoring overlays have to stand down while it is up.** Rank crests (`renderOrder 40`) and the
x-ray reticles (`renderOrder 9`) are drawn with `depthTest: false` on purpose, and that licence let
them punch straight through the picker — the crests of the army behind landed on top of the
candidates and their name plates. Render order alone cannot fix it: the plinths and sculpts are
opaque, so three.js draws them in the opaque pass *before* every transparent sprite, whatever their
`renderOrder`. The overlays leave instead — `setBoardOverlaysMuted()` calls `PieceView.setBadgeMuted()`
and `Board.setOverlaysMuted()`, a **separate mute from the player's crest preference**, restored when
the picker closes. Only the plate keeps `depthTest: false`, at `renderOrder 60`, so it is never cut
by its own plinth.

`Q` `R` `B` `N` (or `1`–`4`) answer from the keyboard: while the picker is open `GameShell`'s key
handler routes everything into `choosePromotion()` and nothing else. Hover lifts the candidate,
brightens its plinth and plate, and chirps once on entry rather than per frame.

## Screen framing

`scene/viewport.ts`. A perspective camera's `fov` is its **vertical** angle, and every shot in
the engine was authored on a wide desktop window — so the narrower the screen, the less of the
board's *width* fits in frame. Pulling straight back is not the answer either: the colonnade
stands at radius 12.5, so a shot dragged out past it puts the hall in front of the board.

`frameShot()` therefore solves each authored shot for the live viewport: it works out the
distance and lens that fit the board's reach on the narrow axis, then takes the extra distance
as **height** (`groundedPhi`) so the camera climbs over the colonnade. A phone in portrait ends
up at 68° / radius 14.5 / ground reach 10.6; a desktop window keeps its authored 46° shot
untouched.

- `confineCamera()` runs every frame and converts any ground reach past radius 11 into height,
  because orbit controls can only cap angle and distance independently. The intro fly-in is
  exempt — it comes in from outside the walls on purpose.
- The showcase follow rig does **not** rely on that net. `solveFollowEye()` cuts the rig's ground
  reach to the positive root of `|focus + reach · heading| = 10.6` *before* the exponential
  smoothing, spending `FOLLOW_GIVE` (18%) of the distance before it steepens `phi`. Correcting the
  camera after the lerp instead put a hard projection inside the loop: replaying the real frame
  loop against a march down the near file, the clamp fired on 354/360 frames and spiked the
  per-frame jerk to `5.3e-2` world units (0.5% of screen height) against `8.6e-3` for a clean
  path — the showcase shudder. Solving up front leaves the clamp dormant while following.
- `FOLLOW_LEAN` (0.72) holds the rig a fraction of the way from the board centre to the figure, so
  the eye covers part of the board rather than all of it — less travel per move, and the reach
  rarely runs out in the first place.
- `orbitLimits()` gives handheld screens a steeper elevation cap, a longer minimum pinch
  distance, a slower rotate speed and a fatter tap tolerance.
- `lensFov` holds the framing currently in force; battle-beat punch-ins are scaled against it
  (`lensPunch`) and read it live, so a rotation mid-fight can never restore the wrong lens.
- The tactical map is solved through the same path, so its overhead lens opens up in portrait
  instead of cropping the outer files.
- `readViewport()` decides "handheld" from a coarse pointer on a hand-sized screen — a capability
  test, not a user-agent string.

## Overlay

`GameShell.tsx` owns the phases (loading → menu → playing), the settings, attract mode and the
keyboard shortcuts; `Hud.tsx` is everything on screen during a game. The board keeps the
viewport: the turn slate (with the field tally under it) and the icon rail sit in the top corners,
the right flank carries the rail (`.mc-side-rail`) with the spoils above and the **move record**
below it, desktop and tablet only,
phones get 34px buttons and drop the two redundant icons (flip lives in the camera menu,
fullscreen is ignored by iOS),
the record folds behind the corner sigil (`H`) there, and the showcase transport is a slim
bottom-right rail that folds down to a single icon.

**Where the ledger is mounted.** Exactly one `MoveLedger` is alive at a time: docked in the flank
rail at `≥ 1024px`, folded into the bottom-left chronicle panel below it. The breakpoint is read in
JS (`useRoomForRail` in `Hud.tsx`), not with `lg:hidden` on two copies — two mounted ledgers would
both drive the board's move preview and both fight over the scroll pin. The rail is anchored top
**and** bottom so the record grows into the height the screen has left, stopping clear of the
bottom-right transport.

**Safe areas.** `index.html` opts into `viewport-fit=cover` so the hall fills a notched screen —
and so `env(safe-area-inset-*)` reports real pixels at all (without it iOS returns `0px` for every
inset, which is why the turn slate used to sit under the Dynamic Island). `medieval.css` turns
those into `--mc-safe-top/right/bottom/left`, and each edge-anchored surface spends only the inset
for the edge it is pinned to: `.mc-hud-top` (top + both flanks, since a landscape cutout moves to
the side), `.mc-hud-corner` (bottom + left), `.mc-demo-dock`, `.mc-cinema-restore`, `.mc-fps`,
`.mc-side-rail`, and `.mc-modal-pad` for the full-screen panels — whose dimmed backdrop stays at
`inset-0` on purpose, or the hall would show through beside the cutout. Base padding still steps
with the breakpoint (`--mc-edge`: 0.5 → 0.75 → 1 rem); the inset is added to it. Every variable is
`0px` on a screen without a cutout, so nothing else changes.

**Field tally** (`.mc-tally`, `FieldTally` in `Hud.tsx`). One row per army under the turn slate:
crest, figures **lost**, time **on the field**, with the battle's total in the header. The row for
the army on the move is lit — full opacity, a wash and an inset hairline in its own azure/ember — so
the panel shows whose meter runs without another label, and a fresh burial swells and flares its
loss count (`mc-tally-toll`). The panel is `pointer-events-none`: it is read, never touched, so taps
in that corner still reach the board.

Elapsed time is **not** the countdown. `ClockState` runs down and only exists when a clock was
chosen; `ElapsedState` always accumulates, so an untimed duel still reports per-side time.
`GameController.syncElapsed()` charges wall time to whoever is on the move and re-points the meter
on every event that changes who is thinking (move, pause, undo, game over), so a paused showcase
charges nobody. `FieldTally` reads it live via `controller.getElapsed()` on its own 500 ms interval
instead of off the snapshot — the core publishes only on real events, and a passing second must not
re-render the whole overlay.

`Tooltip.tsx` explains the icon-only controls — name, one sentence, and a key cap when there is a
shortcut *and* `useHasKeyboard()` says there are keys. It opens after 110 ms, then instantly for the rest of a sweep along the rail, aligns to
whichever screen edge keeps it visible, flashes for 1.8 s on a touch press, and closes on Escape,
blur or scroll. It renders inside its anchor rather than a body portal so it survives fullscreen.

Nothing on this layer is raised by the engine any more. The marksman's rifle shot used to close a
full-screen sight picture over the interface — a dark tube, a brass reticle, a rolled hand tremor,
a recoil that threw the picture off the mark (`SceneCallbacks.onScope` → `ScopeOverlay.tsx`,
`.mc-scope`). It is gone, along with the 8.5° lens punch-in it was paced against: the shot is now
watched in the hall like every other kill, and what sells it is the man dropping onto one knee in
frame rather than an effect wrapped around him.

## Architecture

Rendering is fully decoupled from the rules: the chess core emits events and the scene
subscribes to them. Nothing in `src/core` imports three.js.

```
src/
  core/            chess state, no rendering
    gameController.ts  owns chess.js, clocks, undo, AI turns, snapshots
    types.ts           shared game types (MoveEvent, GameSnapshot, …)
    emitter.ts         tiny typed event emitter
  ai/
    engine.worker.ts   negamax + alpha-beta + quiescence + iterative deepening
    aiClient.ts        main-thread handle, cancels stale searches
  scene/             three.js only
    sceneEngine.ts     renderer, camera, interaction, marching, combat choreography
    environment.ts     hall, lighting, torches, particles, PMREM environment
    arena.ts           the four battleground looks
    battlefield.ts     siege props, camps, fires, birds
    jungle.ts          canopy, palms, vines, pollen for the Sun Temple
    board.ts           tiles, base, engraved labels, highlight pool
    pieces.ts          rigged GLB loading, skeletal clips, faction materials, mixers
    weapons.ts         arms per rank: primitives, loadouts, hand/bone mounting
    armoury.ts         fits the generated Napoleonic weapons into the prop frame
    gltfQueue.ts       the one download window every GLB fetch shares
    rankBadges.ts      floating heraldic crests + flat map tokens
    effects.ts         particle bursts, flashes, dissolve, camera shake and rumble
    alarm.ts           the red lamp that stands over a king in check
    strikes.ts         per-rank blow visuals (slash arc, ground wave, pillar)
    spells.ts          fireball orbs, per-army fire, the shared light pool
    gunfire.ts         muzzle flashes, rounds in flight, powder smoke banks
    ammunition.ts      the four rounds: pistol/musket ball, Minié bullet, iron round shot
    tracer.ts          the short 3D streak swept along the path a round actually flew
    postfx.ts          EffectComposer pipeline (bloom, SSAO, DOF, grade, SMAA, clarity)
    textures.ts        procedural marble, basalt, bronze, cloth
    quality.ts         graphics presets + auto-detection
    viewport.ts        solves the framing (distance, elevation, lens) for the live screen
    tween.ts           promise-based tween engine
  ui/                plain React + CSS overlay
    GameShell.tsx      phases, settings, attract mode, shortcuts
    Hud.tsx            top bar, field tally, spoils, chronicle sigil, showcase rail
    Tooltip.tsx        themed tooltip for the icon-only controls
    MainMenu.tsx / MoveLedger.tsx / SettingsPanel.tsx / GameOverModal.tsx / Heraldry.tsx
    medieval.css       the whole overlay's look
  audio/             Web Audio mixer with layered score stems
  assets/generated.ts  army skins (sculpts, clips, arms, voices per civilisation) + audio URLs
```

### Move flow

1. The player (or the worker) produces a move → `GameController.tryMove`.
2. chess.js validates it and the controller builds a `MoveEvent` (captures, castling
   rook trip, en passant square, promotion, check flags).
3. The controller awaits the animator the scene registered, so the AI never moves while
   a figure is still gliding.
4. React re-renders from the immutable snapshot published after every change.

### The computer opponent

- **Easy** — random legal move, prefers captures, always takes a mate in one.
- **Medium** — depth 3 negamax with alpha-beta, material + piece-square tables, 0.7s budget.
- **Hard** — depth 5 iterative deepening with alpha-beta, MVV-LVA ordering and quiescence
  on captures, 3.2s budget.

All searches run in `engine.worker.ts`, so the render loop never blocks.

## Graphics presets

| Preset | Post-processing | Shadows | Particles |
| --- | --- | --- | --- |
| Low | none (direct render) | off | none |
| Medium | bloom, grade, SMAA | 1024 | light |
| High | + depth of field in cinematics | 2048 | full |
| Ultra | + SSAO | 4096 | dense |

The preset is auto-detected on first load from the GPU string, core count and memory, and
the engine steps down once automatically if the measured frame rate stays under 40 FPS.
Pixel ratio is capped at 2 (1 on Low), and WebGL context loss shows a reload prompt.

### Black-screen recovery

Drivers that render an all-black scene under a working interface (Mesa's software rasterisers on
Linux above all) are handled in three places:

- `scene/diagnostics.ts` — `probeGpu` names the driver, `reflectionProbeWorks` renders a white
  sphere lit only by the freshly built PMREM probe into an 8×8 buffer and reads it back. Black or
  `NaN` means the probe is unusable, so `SceneEngine.applyEnvironment` drops it and turns up an
  ambient skylight of the same colour instead.
- `SceneEngine.guardAgainstBlackFrames` — samples the frame at five points (centre plus quadrants)
  five times over the first eight seconds. All five points must read black before anything is
  dropped; each failed sample peels off one more layer: composer → reflection probe → safe mode.
- **Settings → Picture** — a brightness slider (exposure ×0.6–1.8) and a `Safe rendering` toggle
  (`SceneEngine.setSafeMode`: no composer, no probe, no shadow maps, +20% exposure). Both are
  persisted in `localStorage` under `kg.render`, and `?safe=1` forces safe rendering from boot.

An AI vs AI duel adds a **clarity grade** on top of the preset (`Postfx.setClarity`): no depth of
field, grain ×0.3, vignette ×0.5 and bloom ×0.62 at a higher threshold, because a duel that is
watched rather than played needs the sculpts and the squares to read.

### The verdict card

`GameOverModal.tsx` closes every battle, an AI vs AI duel included. The old render condition was
`… && !snapshot.demo?.autoRematch`, so a looping AI vs AI session — the mode most likely to be watched —
never named a winner: the board just reset. It now takes an optional `ShowcaseOutcome` and adapts:

- **Framing** — duel number, winning crest, how the game ended, `Squire/Knight/Warlord` for each
  engine, the move count, the PGN, then **Another duel** / **Great hall**.
- **A thin backdrop** — `bg-black/35` and no blur for AI vs AI (a played game keeps `bg-black/65`
  plus blur). When the duel is watched the final position is the picture, so the card must not bury it.
- **It waits for the cinematic** — `SHOWCASE_VERDICT_DELAY_MS` (2.2 s) in `GameShell.tsx` holds the
  card back while `playEndCinematic` dollies onto the fallen king (~2.4 s).
- **The loop, made visible** — with auto-rematch armed, `NextDuelCountdown` shows a
  **NEXT DUEL IN _n_s** bar plus **HOLD** (`setDemoAutoRematch(false)`). It polls
  `controller.getDemoRematchRemaining()` on its **own 100 ms interval**, the same reason
  `FieldTally` does: the core publishes on real events and a ticking second must not re-render the
  overlay. `DEMO_REMATCH_DELAY_MS` went 6.5 s → **9 s** so the result can be read before the reset.
- **Another duel** calls `controller.restartDemo()` when `mode === "demo"`. Routing it through
  `startMatch` (as `handleRematch` used to for every mode) mapped `demo` → `ai`, silently turning a
  watched duel into a game against the computer and resetting the duel counter.

## Armies

Three army skins, chosen per side in **Settings → Armies** and remembered in `localStorage`
under `kg.armies`:

| Id | Army | Arms (`ArsenalId`) |
| --- | --- | --- |
| `ivory` | Ivory Kingdom — King, Queen, Mage, Knight, Guardian, Footman | `kingdom` |
| `sun` | Sun Empire — Emperor, Priestess, Serpent Priest, Jaguar Warrior, Temple Guardian, Eagle Warrior | `sun` |
| `empire` | Grande Armée — Napoléon, Imperial Commander (flintlock + Marengo sword), Marshal-Tirailleur, Cuirassier, Artillery Guard, Line Infantry | `empire` — **generated sculpts**, see [Sculpted arms](#sculpted-arms-the-napoleonic-weapons) |

One skin (`ARMY_SKINS` in `src/assets/generated.ts`) carries its own six sculpts, five or six
clips per rank, weapon family (`LOADOUT` in `weapons.ts`), rank names and its own six death
cries (`DEATH_CRIES`) — no skin borrows another's voices, and the Grande Armée's are gunshot
reactions (punched-out air, then the voice) rather than melee cries.
`SceneEngine.setArmySkins` runs the swap in the background: it waits for any move animation to
finish, marks the factory stale and rebuilds (taking the old figures down before their shared
geometry is freed), reloads the rosters, stands the new army up and repoints the mixer's voices.
With the same skin on both sides only the skin's `native` faction keeps its painted textures;
the other side falls through `applyFactionLook()` and is tinted into dark livery.

### Telling the two armies apart

The sculpt cannot be trusted to answer "whose is that?". Mirror matches render the *same* sculpt
for both sides, and two *different* armies both keep their own painted textures (`ownLivery`), so
at camera distance in a torchlit hall thirty-two dark figures read as one crowd. The side is
therefore stated in **three** independent channels, tuned so no single one has to carry it
(`FACTION_RING`, `FACTION_RING_SHAPE`, `FACTION_RIM` in `pieces.ts`):

| Channel | Near side (`w`) | Far side (`b`) | Why |
| --- | --- | --- | --- |
| Band on the tile | azure `0x5fb0ff`, **plain double band** | ember `0xff5230`, **spiked sun collar** | Read from any camera height; the *shape* differs too, so it survives colour blindness. `factionRingTexture()` paints one white canvas per shape and the material tints it |
| Rim light on the silhouette | azure `0x74baff` | ember `0xff6134` | Separates a figure from the piece behind it, not just from the ground. A fresnel term injected next to the dissolve (`installDissolve()`) and added right after `opaque_fragment`, so it is tone-mapped with the frame instead of sitting on it as a decal. Weapons carry it too — the silhouette includes the musket |
| Rank crest | azure field, gothic heater shield | ember field, stepped sun disc | The plates used to be near-black on both sides with only their bezel metal differing: at badge size that is two dark lozenges |

The band is **painted, not added** (`NormalBlending`, `toneMapped: false`, resting opacity
`RING_REST` = 0.3). The old additive glow at 0.16 vanished into a lit marble square, which is
most of the board. Selection, hover, the check alarm and the landing flare still push above the
resting level, clamped at 1.

**Three channels means each one runs quiet.** The first pass at this ran all three loud at once
and the board went blue and orange: the mark stopped identifying the figures and started hiding
them. Both offenders were painting the *sculpt*, not the space around it:

- **The rim reached inside the silhouette.** It is added to the shaded colour, so its fresnel
  exponent decides how far in it travels. At `2.7` the term was still strong a long way from the
  contour — enough to flatten braid, facings and musket furniture into one hue. `RIM_FALLOFF` is
  now `4.6`, confining it to the grazing few degrees that actually do the separating, which let
  `RIM_STRENGTH` drop `0.62 → 0.26` and still read against the darkest map.
- **The band's floor wash bounced up the legs.** The widest, brightest part of the mark sat
  directly beneath the figure (`0.34` alpha out to `0.46` of the tile). Now `0.12` out to `0.4`,
  with the bleed halo behind the crisp line narrowed (`0.11 → 0.07` wide, `0.24 → 0.14` alpha) so
  the bloom pass has less to grab. The *shape* of the band was always the signal; brightness only
  has to make the shape visible.

The crests were left alone. A sprite above the crown covers no part of the model, so it is the one
channel that can afford to be loud — which is why the other two can afford not to be.

**One army wearing both sides is loaded once.** Only the `native` faction's six rosters are
downloaded; the other side renders the *same* `Template` objects, sharing one `scene` and — the
part that matters — one `clips` object, so a clip fetched for either side is bound to both.

**Musters are serialised** (`PieceFactory.load` / `reload` both queue through `muster()`), and a
muster whose armies are already standing is a no-op. Two of them writing into the roster map at
once is what used to break exactly this case: the shell records the armies remembered from last
visit and *then* calls `load()`, so any non-default choice kicked off a swap and the first
download simultaneously. Both runs filled `templates`, leaving the borrowed roster pointing at
run A's sculpt while the roster it borrowed from had been replaced by run B's. The two stopped
sharing a `clips` object, and a borrowed roster carried no clip URLs of its own — so that side
could never fetch a stride, a strike or a death again. It slid across the board and killed
without swinging, while the other side animated perfectly. Two things close it for good:
`setSkins()` reports "no reload needed" until something has actually been mustered (the pending
load reads the choice itself), and a borrowed roster is now handed the lender's clip URLs under
its own key as well, so it can always name its own clips.

## Character animation

Every figure is a rigged (skinned) character with up to six skeletal clips, listed per kind in
its army's `animated` roster (`ARMY_SKINS`, `src/assets/generated.ts`):

| Clip | When it plays |
| --- | --- |
| `idle` | Looping combat stance, desynced per figure so the army does not breathe in lockstep. The Grande Armée's marshal stands at the ready with the rifle lowered — he used to wait out the *whole game* on one knee, which read as a man permanently in cover; the kneel is worth something only as the thing he does to take a shot |
| `walk` | Looping in-place stride, retimed to the cadence of the move under way. The stride length inside the clip is **measured** (`gaitCycle()`): the generator returns anything from one cycle (`spear-walk`, 1.13 s) to three (`casual-walk`, 4.23 s). It must still be a walk — a sprint cycle stretched over one square judders instead of marching, which is why the line infantry advances on the musket-across-the-body walk rather than the rifle charge on the same rig |
| `run` | Looping in-place run — the knight charging through its leap (knights only) |
| `attack` | One-shot strike the moment the attacker lands a capture (sparks, shake and clash sound are timed to the hit frame). For the queen and the mage the same clip is the incantation, and its hit frame releases the fire — except under the `empire` arsenal, where the commander draws and shoots instead; for the Grande Armée's **standing** gunpowder ranks it is the **firing drill**, played at its own readable length (`GUNS[kind].drill`) with the hit frame on the shot. The marshal-tirailleur carries **no** `attack` at all — he fires out of his kneeling `aim` (see Ranged captures) |
| `death` | One-shot fall played by the captured figure before it dissolves into dust |
| `reload` | One-shot drill run after a shot (powder, ball, ramrod). Only the Grande Armée carries one — the marshal's is a kneeling reload served from the knee he fired from, the rook's is at the muzzle, the king's and the commander's are done standing |
| `rise` | One-shot stance change between one knee and both feet, authored kneeling→standing and played in **both** directions: reversed by `playKneel()` to go down onto the knee, forwards by `playRise()` to come back up. Only the marshal has one. Measured on the hips it opens at 48 units and stands at 92 by the 70% mark, so `RISE_SPAN` runs both directions over that part and never shows the still tail |
| `aim` | Looping sight picture held *before* — and, for a kneeling gunner, **through** — the shot: the weapon comes up and stays on the body while the shooter settles (`PieceView.playAim()`). Napoléon (pistol levelled), the Imperial Commander, the line infantry (musket into the shoulder) and the marshal (on one knee, rifle up and scanning) all carry one; only the battery has none — laying the gun already is its aim. `setAimDrift()` slows the lateral scan almost to a stop once the shot is away, so a man who has fired watches what he hit instead of going back to sweeping the board |

How it is wired (`src/scene/pieces.ts`):

- The **rigged** GLB is the visual — the plain GLB has no skeleton, so clips bound to it do
  nothing. Each animation GLB contributes one clip, renamed to `idle` / `walk` / `run` /
  `attack` / `death`.
- Every instance is cloned with `SkeletonUtils.clone` (never `Object3D.clone`) and gets its
  own `AnimationMixer`; one-shots use `LoopOnce` + `clampWhenFinished`, and the strike
  crossfades back to the stance on the mixer's `finished` event.
- Clip root motion is stripped on X/Z so a figure never walks off its square; the death clip
  keeps its motion so the fall reads properly. Locomotion clips are **in-place** cycles — board
  travel belongs to the container tween, so a clip carrying root translation would double it.
- **The preset governs the stance, not animation.** `idleAnimations` (off on **Low**) is the
  ambient breath — thirty-two skeletons ticked every frame — and without it a figure holds the
  first frame of its stance. The **stride, strike and death play on every preset**; a march is
  one mixer for a second or two. Only the flat tactical map and a rig-less sculpt fall back to a
  slide. `returnToStance()` hands the body back honouring the preset, so a `Low` figure does not
  start breathing once it has finished a move.
- One `characterAnimations` flag used to gate the stance *and* the walk cycle, and
  `detectQualityPreset()` puts touch devices on **Low** — so every phone slid statues while the
  same figures swung and died in full animation. `navigator.deviceMemory` is Chromium-only, so
  iOS reported nothing, the unknown was defaulted to 4 GiB and tested against `>= 6`: no iPhone
  ever cleared it. Unknown memory is no longer read as a small device, and a current phone opens
  on **Medium**.
- **Clips load in waves.** Over seventy GLBs fired at once made the browser drop requests
  (`TypeError: Failed to fetch`), which cost figures their strike — a capture then looked like a
  piece dying untouched. The rig plus its `idle` load first, then `PieceFactory.warmClips()`
  fetches `walk` → `run` → `attack` → `death` → `reload` → `aim` two downloads wide and binds
  each clip onto the figures already on the board (`PieceView.installClip`). **Strides go first**
  because the opening move is made seconds after the board stands up.
- **Every beat arms itself.** A capture calls `ensureClip` for the attacker's strike and the
  victim's death (waiting up to 2.4 s rather than skipping the beat), and `glide()` calls
  `armStride()` for the walk or run it is about to play (up to 0.6 s). Without the latter the
  first move of a game was staged before its stride had landed and the figure slid on its
  stance — which read as that rank having lost its walk animation.
- **A downloaded clip lands on every roster that wanted it.** Downloads are deduplicated by URL,
  and `bindClip()` then binds the result onto each roster whose clip URL matches — not just the
  one that happened to ask first — and reports them all to `installClip`. A clip URL that comes
  back dead is written off after `MAX_CLIP_ATTEMPTS` requests (ten network attempts): the
  Emperor's rig has **no** reload take on the server, and chasing it charged every one of his
  shots a full round of failed fetches before the beat could continue. He now simply lowers the
  pistol — regenerate a reload on that rig to give him the drill back.
- With no strike clip at all, `SceneEngine.lunge()` swings by hand (wind-up, twist, lean back,
  blow over the top); the tilt is held by `PieceView.setStrikeTilt()` so the mixer cannot wipe it.

### Marching and footsteps

`SceneEngine.glide()` runs one stride clock per move. `GAITS[kind]` declares steps per square,
cadence, boot timbre and loudness, so `steps = tiles × stepsPerTile` and the duration is
`steps / cadence` — a longer move takes **more steps**, not a faster slide.
`PieceView.startMarch(clip, stepRate)` retimes the walk cycle so one gait cycle is exactly two
footfalls at that rate — measuring that cycle with `gaitCycle()`, which autocorrelates a leg
bone's swing and caches the answer per clip. Assuming the whole clip was one cycle is what cost
the heavy ranks their march: `casual-walk-inplace` (king, queen, tower, battery) is 4.23 s of
three cycles, so the time scale asked for saturated its ceiling and the legs blurred at one fixed
rate whatever the move — the tower read as sliding with no animation. `strideEasing()` gives a
push-off, a cruise and a settle (a fully eased curve would leave the feet skating), every whole
step fires `audio.footstep()` plus a grit puff at the contact point, and the battery's hauled gun
pitches on its axle once per footfall (`rumbleTrain()`) instead of gliding along beside the crew. The four timbres (`scuff` / `leather` / `plate` / `regal`) are
synthesised in `src/audio/audioManager.ts` — body thump, band-passed sole transient, metallic
afterring — panned by screen position and pitch-jittered.

### Strike weight by rank

The hand-to-hand beat is one piece of choreography, but its weight comes from `STRIKES[kind]`
in `src/scene/sceneEngine.ts`. The pawn's line is the original beat and is unchanged; each rank
above it adds something: the knight a crescent of steel and a dust wake on the charge, the rook a
wave rolling across the stone with a low slam and a long aftershock, the king a column of light
dropped on the condemned, a bell, and a gold arc plus gold ground wave. Ranged captures follow
the same idea — `MAGE_SPELL` throws one bolt, `QUEEN_SPELL` gathers longer and throws a volley of
three that leaves fire burning on the square. Visuals live in `src/scene/strikes.ts`, and the
swing / slam / bell voices are synthesised in the mixer.

### Taking the square

All three battle beats end the same way: the body is cleared and the victor marches onto the
square. That arrival used to get the same generic set-down clack as a quiet move, over a
*softer* landing than usual — so the moment that actually wins a game of chess was the quietest
thing in the fight. `claimSquare()` fires once from `runMove()` after `landOn()`, which covers
every path including captures made with the cinematics off or on the flat tactical map:

- **`audio.conquest()`** — a boot on the stone, then a brass motif rising a perfect fifth, then
  high inharmonic partials left ringing. Notes are scooped into from under pitch through a
  filter that opens on the attack (that is what makes it brass, not a sawtooth), rooted on G3 —
  the same fundamental as the judgement bell. Synthesised, so it lands on the frame regardless
  of the network.
- **`spawnConquestClaim()`** — the victor's colour drawn **inward**: a wide loop closing tight
  around the tile, brightening as it converges, sealing into the army's sunburst mark. Every
  other ring in the game travels outward, so the reversed motion is the signature.
- **`drawUp()`** — the shoulders come back off the blow and spring level on `outElastic`, driven
  off the runtime node so unrigged sculpts get it too. A lean, not a victory pose: it has to
  finish inside the pause before the reply.

All of it scales off `CONQUEST_WEIGHT[victim.kind]` — the only weight on the board that belongs
to the victim. Heavier captures drop the root by up to half an octave, add an octave as a third
note, hold the ring closed longer and throw more chips, so a queen falling is audibly not a pawn
trade.

### Ranged captures

`RANGED_KINDS` routes the queen (`q`) and the mage (`b`) to `playSpellCinematic()`: both sides turn
to face each other, fire gathers at the staff crystal through the strike clip's wind-up, the bolt
flies to the target's chest and breaks open — and the victim **dies and is cleared away before the
caster takes a single step** onto the square.

The Grande Armée's ranks fight the same distance with powder instead (`playGunCinematic()`). That
beat is **aim → drill → trigger → shot**: the `aim` clip is held for `GUNS[kind].aim` seconds so the barrel is
seen coming up on the body, then the firing clip runs at its own length with the report on its own
frame (`GUNS[kind].drill = { seconds, impact }`). Every barrel is framed the same way — a modest lens
punch-in held over the beat — since the rifle's sight-picture overlay and its extra zoom were removed.

**One stance per shot** (`GUNS[kind].stance`). The profile states whether the shot is taken standing or
from one knee, and that decides *which pose the gun is fired from*:

- **Standing gunners** play their firing drill — those clips start and end on their feet, so the drill
  agrees with the stance around it.
- **The marshal-tirailleur kneels, and gets no firing clip.** His rig's shooting take is
  `Female_Crouch_Pick_Gun_Point_Forward`, whose name is a trap: measured on the hips it opens at 92
  units (standing), dips to 68 and is back at 93 by the 70% mark, so its authored ignition frame at
  0.6 lands with the man **upright**. Run between a kneeling `aim` (hips 48) and a kneeling `reload`
  (42) it stood him up to fire and dropped him again — three stance flips inside one shot, which is
  what read as bobbing up and down. His beat is now **drop → hold → fire → die → reload → rise**:
  `playKneel()` puts him down over `stance.drop` (0.85 s, the rise clip reversed, so the knee plants
  instead of the body sinking), the sights are held for `aim` (0.55 s), the trigger and report are
  timed off `drill` **out of that held aim**, the recoil rocks him where he kneels, the victim dies,
  the reload is served from the same knee, and only then does `riseToFeet()` bring him up
  (`playRise()`, ~0.95 s, with the boot heard taking his weight) before he marches onto the square.
  From the knee going down to the body being cleared, his stance never changes.
- `reload()` hands only a **standing** gunner back to his stance; standing a kneeling one up there
  would drop a stance change into the middle of the one beat meant to hold still.

**Each barrel fires its own round** (`SHOT_MODELS` for the sculpts, `src/scene/ammunition.ts` for the
procedural fallbacks, chosen by `GUNS[kind].ammo`). Every round is a real mesh normalised
nose-along-travel, one unit nose-to-base, so a shot only scales it by its gauge:

| Round | Barrel | Built from | In flight |
| --- | --- | --- | --- |
| `pistolBall` | king, commander | cast lead sphere, mould seam + sprue stub | tumbles, wanders ~0.9 calibres |
| `musketBall` | line infantry, cuirassier | the same ball, fatter and dented by the ramrod | tumbles, wanders ~1.6 calibres |
| `minieBullet` | marshal-tirailleur | lathed ogive, three grease grooves, hollow base skirt | spins about its nose, dead straight |
| `roundShot` | battery | pitted sand-cast iron ball with casting seam | glows out of the bore and cools; passes through |

Two materials serve the fallbacks: cast lead (`0xb4bac2`, `metalness 0.62`, `roughness 0.44`) and
sand-cast iron (`0x3b3936`) with an emissive animated per shot. Both stay *off* full mirror metal with
a floor of self-lit grey, and `legible()` applies the same treatment to every sculpt's own materials
on load — a near-mirror sphere a few pixels wide has nothing to reflect in a dark hall and renders as
a black dot. **No round is a tracer**: black powder never fired one.

**Why a shot is visible at all.** True to scale a ball is one pixel for one frame, so three dials are
deliberately cinematic while the physics stays honest: `AMMUNITION[kind].gauge` (1.7–2.6× the bore)
for how large the round is *drawn*; `GUNS[kind].speed` (0.082–0.125 s per tile, clamped to
0.17–0.58 s) for a flight the eye can follow; and a **nose blur** — `tracerTexture()` on a tapered
cone laid along the travel vector (not billboarded), lengthening with the round's actual pace and
opening from a stub over the first frames, now held to half its authored length (`NOSE_BLUR`). A small
glint sprite carries torchlight on the metal, and the round spawns clear of the bore rather than
inside its own muzzle flash. The orange glow, the borrowed light and the dragged-along wake still
belong to the iron alone.

**The path itself is drawn** (`src/scene/tracer.ts`). Everything above rides *with* the round, so none
of it said where the shot had been. `TracerStreak` sweeps a short 3D ribbon along the round's own
flown samples — real geometry, so it holds up from any camera angle, is occluded like an object, and
**bends where a smoothbore ball wandered**. Section is a three-bladed tube (12–26 rings by preset via
`trailRings()`), in two layers on one spine: a wide faint sheath of disturbed air and a thin bright
filament that only lights the calibres right behind the metal. Radius tapers on `u^0.55` and
brightness on `u^falloff`, so the tail pinches to a needle; the arc is held to `StreakLook.span`
(4.2–9 ball diameters ≈ one square, never muzzle-to-target, or it reads as a laser) by *sliding* the
oldest sample along its segment rather than dropping it, which is what keeps the tail from stuttering
backwards. On impact `releaseStreak()` fades it over 0.16 s under the debris instead of cutting it.

**The flash is sized off the round it launches.** `GUNS[kind].flare` is a *ratio* (4.4–6.0), not a
width: `muzzleFlare(gun) = ball × AMMUNITION[ammo].gauge × flare` drives the flash, the ember shower,
the reach of the borrowed light and the spawn offset alike, so a change to a round's gauge can never
leave its flash behind — which is exactly what had happened once the rounds became sculpts drawn
1.7–2.6× the bore and started out-shining the charge that fired them. Period flame is 4–8 bore
diameters, so the clean-burning rifle sits lowest (4.9) and the field gun highest (6.0).

`spawnMuzzleFlash()` stacks four layers, because one additive sprite is capped at opacity 1 and cannot
be made brighter: the billboarded **star** (`muzzleFlashTexture()` — thirteen petals, three long
primary jets, and a halo holding flat white out to a fifth of its radius, since the bloom pass only
grips what already clips); a small pure-white **core** stacked over it; a **jet** cone laid along the
aim (*not* billboarded, so the flame grows down the barrel and shows which way the round went); and
the warmer **lead bloom** a barrel's width out. All four are **held at full brightness for the first
fifth of the life** (`IGNITION`) before falling off on `(1-t)²·¹` with a flicker — powder ignites in one
frame, and a flash that starts decaying on frame one never registers at 60 fps.

All four are flown as *generated* sculpts (`SHOT_MODELS`, primed by `primeShotModel()`); each sculpt
is reported *directionless*, so its measured long axis is taken as the nose. A kind whose GLB has not
landed yet is forged procedurally instead, so gunfire never waits on a download.

Each barrel also fires a recorded take (`GUN_AUDIO_URLS` + `GUNS[kind].voice`) with a per-barrel
amount of synthesised voice left underneath it for weight (`SHOT_VOICES` — 34 % under the musket's
hard transient, 60 % under the flintlock's much more diffuse one), and the ball's arrival has its own
whine-into-thud (`audio.ballImpact()`). Anything not yet decoded falls back to the synth.

**Every take is aligned and levelled off the audio itself**, because a generated sound effect is a
clip rather than an event. `analyseTake()` finds each shot's true onset — from the loudest 4 ms window
walked *backwards* to the foot of the attack, since a threshold crossing just latches onto the room
tone — and playback starts there, so the report lands on the frame it is asked for. The first set of
barrels measured 54 ms of silence in front of the musket's crack and did not peak until 171 ms in on
the rifle: the shot was seen, then heard. Levels are normalised to a common peak as well, since
recordings came back across a 9× spread that swamped the authored mix.

**The trigger is its own sound.** `GUNS[kind].lock` is real lock time — the 38–120 ms a muzzle-loader
takes to get from the sear releasing to the charge in the barrel lighting. `audio.triggerPull()`
(sear break, flint on the frizzen, priming hiss) fires on the frame the trigger is pulled and
`audio.gunshot()` follows one lock time later, on the same frame as the muzzle flash. The marksman's
hand-fitted piece has the fastest ignition on the board; the field gun's vent has the slowest, with a
longer, lower fuse hiss in place of the flint scrape.

**The arrival breaks the body open** (`src/scene/shatter.ts`, `spawnImpactShatter()`). The far end of
a shot used to be the same warm sprite burst as a sword blow, which reads as magic rather than as
impact, so it is now built from geometry in two instanced draw calls:

- **A punch ring** square to the line of flight (not billboarded), snapped open and gone inside
  0.18 s — it exists only to say *where* the round went in.
- **Sparks** as stretched four-sided slivers oriented along their own velocity, so each one draws a
  streak that turns as it flies and its length tracks its speed. They leave in a cone thrown *back*
  at the shooter (spall comes off the struck face), cool white → orange → dull red on their own
  clocks via per-instance colour, gutter rather than fade, skitter off the flagstones, and a few
  always outlive the rest so the shower does not stop like a switch.
- **Fragments** — crushed tetrahedra with per-instance colour, tumbling on their own axes under
  gravity, bouncing off `BOARD_TOP` with material-specific restitution and tangential friction,
  coming to rest and then pulled under in the last quarter of their life.

What comes off is read off the **victim**, not the shooter: `impactBody()` maps army × rank onto
`marble` (kingdom stone), `obsidian` (Sun Empire glass — long flake slivers, jade fleck),
`uniform` (navy wool, buff leather, gilt braid, brass), `plate` (steel spall and the brightest spark
shower on the board, for the cuirassier and the guardians) or `flagstone` for the round shot's
ricochet. How hard it breaks comes from the round: `AMMUNITION[kind].shatter` (0.72 pistol → 2.5
round shot) and `.through`, which decides whether there is exit spall as well as entry. The dust the
caller layers over the top is tinted by `impactDust(body)`, and the instance count is capped by
`captureParticles`, so the whole thing scales down with the graphics preset.

**The powder bank is built as air, not as a sprite pop.** Each lobe of `spawnPowderCloud()` runs on
its own clock, integrated from its absolute age (closed form, so it looks identical at any frame
rate) through three phases: lobes are **born in sequence** across the vent (0.17 s smoothbore,
0.10 s rifle) with the first gas shoved hardest, that speed is then eaten by the air
(`jet/drag · (1 − e^−drag·age)` — a lunge of about a square, then a stall), and from there only
buoyancy (building as `age²`, so smoke sags off the barrel before it climbs), `HALL_DRAFT` and a
per-lobe `sin` curl move it. It dissolves because it **spreads**: opacity carries
`(seed/width)^1.35` on top of its fade, lifetimes vary per lobe, and `floor` flattens anything that
sags to `BOARD_TOP` instead of sinking through the stone. `GUNS[kind].smokeHang` states the linger
(1.7 s flintlock → 3.8 s field gun) and `boreTrickle()` keeps emitting wisps at the **live**
`muzzleOrigin()` afterwards, so the thread of smoke follows the barrel as the weapon comes down.

`GUNS[kind]` also carries the character of the *smoke* as well as the bore. The marksman's rifled
barrel fires a small, tight-patched charge that burns almost completely, so its bank is built from
`fineSmokeTexture()` — a pale, threadier bloom — tinted a fixed ash grey (`0xdfe4ea`) instead of
the faction livery, at 0.74 density. Less smoke than a musket is answered with **more, smaller
lobes** (12 against 8) that leave faster, stall sooner and lift harder — hanging 3.2 s with the bore
trickling 1.5 s after — rather than with a thicker cloud. Every other barrel keeps the dirty
livery-tinted bank.

**A held firearm has no rest angle.** Blades and staves are parented to a hand bone at a fixed
body-space angle, which is fine for a blade at rest but leaves a rifle standing upright
through an aiming clip. Firearms declare `hold` in `weapons.ts` instead and are re-solved against
the live skeleton every frame (`AttachedArms.align()`, called right after the mixer):

- `"longArm"` (marksman's rifle, line musket) is laid **downrange** — along the figure's own front,
  since a shooter has already turned to face what he is shooting at — with the two fists supplying
  only the cant (`LONG_ARM_CANT`, 0.4) and the elevation (`LONG_ARM_PITCH`, 0.8, clamped to ±0.6).
  A levelled musket therefore lies about 20° across the body, butt in the firing shoulder and muzzle
  crossing toward the support hand, and the muzzle marker follows.

  It used to take the barrel line *straight* from the vector between the two fists, on the assumption
  that a shouldered clip puts the support hand out on the forestock. Measured on the rigs that
  actually shoot, that assumption is false. The Grande Armée's aim takes are archery clips, and in
  them the fists sit side by side **across the chest**: the hand line runs 0.90–1.00 along the
  figure's lateral axis, leaving almost nothing along its front — and the residue that was being used
  as the barrel's direction changes sign several times per loop. The line infantry's aim reads front
  = −0.24, −0.23, +0.27, +0.54, +0.40, −0.22, +0.02, −0.28 across one scan, and its firing clip is at
  −0.26 on the authored ignition frame, so the musket swung between pointing downrange and pointing
  back over its owner's shoulder — and the shot was taken from the reversed half. Under the current
  rule every clip on both rigs (stance, aim, strike, march, reload, rise, death) sits 3–22° off the
  front with no sign changes anywhere.
- `"sidearm"` (the officer's flintlock) follows the forearm through the wrist, lifted toward the
  figure's front so an arm hanging at rest carries the pistol low rather than aiming at its own boot.
  That front bias is why the pistols never reversed — the Emperor's and the commander's aim clips are
  the *same* mirrored archery takes, but their barrels were already guaranteed downrange. The long
  arm simply lacked the equivalent guarantee.

Roll is taken from the barrel pitched a quarter turn about the figure's lateral axis — the one rule
that holds at both ends of the swing (trigger guard forward when upright, floorward when levelled)
without flipping in between; projecting the body's front, as the blades do, collapses the moment a
gun points where the figure is looking. Carried guns are also exempt from the floor-clearance clamp
that slides grounded shafts up through the fist — that clamp is what had the crouching marksman
holding his rifle by the butt plate.

The fire's light comes from `SpellLightPool` (`src/scene/spells.ts`): three point lights created
once with the scene and lent out per bolt. A light per fireball crashed the tab — three.js keys
its shader programs on the scene's light counts, so the whole hall recompiled mid-fight. Pooled
lights are never removed *or hidden* (an invisible light leaves the render state, which changes
the count just as removing it would); they are dimmed to zero and handed back, and a fourth
simultaneous bolt simply gets no light.

## Sculpted arms: the Napoleonic weapons

`weapons.ts` builds arms out of boxes, cylinders and extrusions, which is the right answer for the
medieval and Sun Empire families — nobody can hold a fantasy greatsword up against an original. The
Grande Armée's arms are different: a Charleville Model 1777, an An XI cuirassier sword and an An XIII
officer's flintlock are documented objects, so all six are **generated meshes** listed in
`ARM_SCULPTS` (`src/assets/generated.ts`) — musket with fixed bayonet, Versailles rifled carbine,
cuirassier sword, general's dress sabre, Marengo presentation sword, officer's pistol.

The work is not the download, it is the pose. **A generated weapon arrives lying anywhere**: the
cuirassier sword measures 0.97 × 1.00 × 0.96 because it runs along the diagonal of its own bounding
box, so its file says nothing about which way the blade goes, which end is the point, or which side
the trigger guard is on. `armoury.ts` therefore *measures* each sculpt (`fitArmSculpt`) and fits it
into the same local frame the primitives are authored in — length up `+Y`, butt on the origin:

- **Long axis** from the principal axes of the vertex cloud (Jacobi on the covariance). A bounding
  box cannot answer it for a diagonal model: all three sides are equal and none is the blade.
- **Which end is the point** from the cross-section at each end — muzzles, bayonets and blade tips
  taper; butt plates and bowl guards do not. The Marengo sword arrives hilt-last, the pistol
  muzzle-first, and neither needs a special case.
- **Roll** from the remaining two axes. A blade keeps its flat across the swing (`±X`, as
  `curvedBlade` authors it) so a sculpted sabre still cuts edge-first; a firearm's lock plane stands
  in the barrel's plane (`±Z`), with the guard side found by stepping from the **bore to the stock**:
  the slice behind the muzzle is bare barrel, the butt quarter is all wood and furniture, and a gun's
  stock hangs *below* its bore, so the offset between the two points at the underside. That keeps
  `gunOrientation`'s guard-forward promise true for a mesh nobody rotated by hand.

  This used to be read off the **centroid** — muzzle third against the middle of the whole cloud —
  which says the same thing only while nothing but the gun pulls that centroid off the bore. The
  Versailles rifle broke it: its slack sling loops `0.34` of the weapon's length clear of the stock,
  four times the rifle's own lateral thickness (`0.087`), which dragged the centroid past the barrel.
  Both long arms were therefore fitted **upside down** — sling arcing over the barrel, lock and
  trigger guard turned at the sky — on every figure that carried one. The pistol, with no sling to
  fool it, was right all along and reads the same under either rule.
- **Which way round** — the *sign* of that roll, which no eigenvector can give: `±narrow` both put
  the flat across the swing, so which one came back was whatever the Jacobi sweep happened to hand
  over. Invisible on a straight blade, and the entire silhouette on a curved one. A blade therefore
  settles it by the **bow of its own curve**: the belly (convex side) is put on `+X`, the side
  `curvedBlade` sweeps toward and `knuckleBow` bulges toward. A straight court sword has no curve to
  read (the Marengo sword bows 0.03% of its length), so it falls back to the hilt's own lump.

  Which way that belly has to face on a *figure* is not the fitter's business, because
  `restOrientation` projects the **body's** front and the body's front does not mirror with the hand:
  the prop's `+X` lands on the body's `+X` — the figure's left — whichever fist holds it. So a
  `WeaponSpec.edged` blade is rolled half a turn (`EDGED_FLIP`) in the fist where `+X` is the outward
  side, and the belly always bows *across* the body. That is the difference between a sabre and a
  sickle: on the Emperor's rig, bowed outward his dress sabre came to rest with the point at 0.80 out
  and 1.68 up on a 1.70 figure, its tangent curling back in over the crown of his own bicorne; bowed
  across, the point keeps going outward (0.85) and away from him.

Only the **fist** and the **bore** are authored, as fractions of the weapon's length, because no
measurement finds a trigger. Both were read off each sculpt's cross-section profile and land within a
couple of percent of the props they replace (rifle fist 0.30 vs 0.30, musket bore 0.80 vs 0.77). The
musket's marker is the bayonet *socket*, not its point — the flash leaves the barrel, not the blade
beyond it. `armoury.test.ts` throws a primitive sword and musket into a random orientation and checks
they come back on their butts, point up, guard forward — plus a **slung** musket, whose loop is
authored far enough off the underside to move the centroid past the bore, so the roll can never
regress to the centroid test again, and a **swept sabre** fed in from both halves of the roll, which
has to come back belly-on-`+X` either way.

The swap is invisible to everything downstream: the sculpt supplies grip and muzzle, the loadout
still owns rest angle, wrist offset and `hold`, so the marksman kneels and levels exactly as before.
Sculpts download **with** the rosters (`armSculptWarmJobs`, sharing the one window in `gltfQueue.ts`)
because a figure is armed the instant it is built — a weapon that lands late is a musket the rest of
the game never sees. Geometry and textures are shared army-wide, materials are per figure (highlight,
fade and dissolve write into them), and a failed download falls back to the primitives.

## Swapping in different character models

The static fallback sculpts are the `still` roster of each army in `src/assets/generated.ts`:

```ts
export const ARMY_SKINS: Record<ArmySkinId, ArmySkin> = {
  ivory: {
    arsenal: "kingdom",
    native: "w",
    still: { k: "…king.glb", q: "…queen.glb", /* … */ },
    animated: { /* rigged GLB + one GLB per clip */ },
    cries: { /* one voice per rank */ },
  },
  /* sun, empire … */
};
```

Drop higher-quality glTF/GLB characters into `public/models/` and point the entries at
`/models/your-king.glb`. Requirements:

- Y-up, facing +Z (or edit `PIECE_MODEL_ORIENTATION` in the same file — the loader derives
  the correction quaternion from the declared front/up axes).
- Any scale: `PieceFactory.normalize()` measures the model and rescales it to the height in
  `PIECE_HEIGHT` (`src/scene/pieces.ts`), then centres it on X/Z and grounds it on Y.

`PIECE_HEIGHT` is **two tiers, not six**: knight, mage and tower guardian stand in the royal band
with the queen (0.98 / 1.00 / 0.99 vs 1.00), the king alone rises to 1.12, the pawn holds the lower
tier at 0.78. At their old 0.84-0.88 the three officers read as footsoldiers at camera distance, and
at its old 0.70 the pawn — sixteen of the thirty-two figures on the board — read as a token sitting
on its square rather than a soldier holding it. Crests and flat map tokens are re-ranked with them
(`BADGE_SCALE`, `TOKEN_SCALE` in `scene/rankBadges.ts`).

The battery's towed gun is sized against the **crewman**, not against the sculpt it was drawn at:
`WeaponSpec.bulk` is 1.22, which puts the wheels at about half the artillery guard's height (a real
Gribeauval rolls on wheels four fifths of a man's height — the old 0.85 left them at a third, and the
rank read as an officer wheeling a toy). Because one square is only `TILE` wide, the extra size is
paid for by **`WeaponSpec.track` (0.8)**, a squeeze on the gun's own X — the axle. Wheels stand in
the YZ plane, so a narrower track only thins their tyres and never turns a wheel into an ellipse.
With the park at `(0.2, 0, -0.04)` and the hauling yaw eased to 0.07 rad, the enlarged carriage
overhangs its tile by 0.03 units where the smaller one overhung 0.11.
- Materials are cloned per instance and tinted per faction in `applyFactionLook()`.

If a rigged model fails to download the loader falls back to the static sculpt, and if that
fails too, to a procedural primitive figure — the game always stays playable.

To animate your own characters, fill that army's `animated` roster with a rigged GLB plus a GLB
per clip; any missing clip is simply skipped, and a clip whose download failed is retried on
demand the next time the game needs it. A new army is one `ARMY_SKINS` entry plus a `LOADOUT`
row in `weapons.ts` — the settings panel renders `ARMY_SKIN_ORDER`, so it appears on its own.

For shipping, compress the GLBs instead of streaming them from a remote host:

```bash
bunx @gltf-transform/cli optimize king.glb public/models/king.glb \
  --compress draco --texture-compress webp --texture-size 1024
```

## Audio

Generated MP3s are streamed once and decoded into Web Audio buffers: an ambience bed, a
score bed and a tension stem that crossfades in during check and the endgame, plus piece,
clash, horn and fanfare one-shots. UI blips, footsteps, the wooden set-down knock and the claim
motif played when a square changes hands (`conquest()`) are synthesised with oscillators and
noise buffers. Everything routes through one master gain for the mute toggle, and playback only
starts after the first user gesture (browser autoplay policy).
