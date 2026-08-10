import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { ARMY_SKINS, SHOT_MODELS, type ArmySkinId, type ArsenalId, type GunVoice } from "../assets/generated";
import type { GameController } from "../core/gameController";
import { PIECE_LABEL, type Faction, type GameSnapshot, type MoveEvent, type PieceKind, type SquareId } from "../core/types";
import { audio, type FootstepTimbre } from "../audio/audioManager";
import type { ArenaTheme } from "./arena";
import { ARENA_LOOKS, DEFAULT_ARENA } from "./arena";
import { Battlefield } from "./battlefield";
import { JungleOverlay } from "./jungle";
import { BOARD_TOP, BoardView, type HighlightKind, TILE, squareToWorld, worldToSquare } from "./board";
import { CastleHall, buildEnvironmentMap } from "./environment";
import { describeGpu, probeGpu, reflectionProbeWorks, type GpuReport } from "./diagnostics";
import { CheckAlarm } from "./alarm";
import { EffectsSystem, ShakeSystem } from "./effects";
import {
  FACTION_ACCENT,
  PieceFactory,
  PieceView,
  type ClipName,
  type MarchClip,
  type TemplateKey,
} from "./pieces";
import { PLAQUE_ASPECT, promotionPlaqueTexture } from "./rankBadges";
import { PostFX } from "./postfx";
import { QUALITY_SETTINGS, type QualityPreset } from "./quality";
import { AMMUNITION, type AmmoKind } from "./ammunition";
import { disposeShatterAssets, impactDust, spawnImpactShatter, type ImpactBody } from "./shatter";
import {
  GUN_LOOK,
  disposeGunAssets,
  flyShot,
  primeShotModel,
  spawnMuzzleFlash,
  spawnPowderCloud,
} from "./gunfire";
import { SPELL_LOOK, SpellLightPool, SpellOrb } from "./spells";
import {
  disposeStrikeAssets,
  spawnConquestClaim,
  spawnGroundWave,
  spawnPillar,
  spawnSlash,
} from "./strikes";
import { Ease, type Easing, TweenManager, wait } from "./tween";
import {
  HALL_INNER_RADIUS,
  frameShot,
  lensCeiling,
  orbitLimits,
  readViewport,
  type Framing,
  type OrbitLimits,
  type ViewportProfile,
} from "./viewport";

export type CameraPreset = "white" | "black" | "top" | "cinematic";

/**
 * How the camera behaves during a computer-vs-computer showcase.
 *
 * - `still` holds one framing and never moves on its own.
 * - `orbit` drifts slowly around the board (the old behaviour).
 * - `follow` keeps the figure on the move — and the fight it walks into —
 *   centred in frame, pulling in tighter for the kill.
 */
export type ShowcaseCamera = "still" | "orbit" | "follow";

export interface SceneCallbacks {
  onLoadProgress: (ratio: number) => void;
  onReady: () => void;
  onPromotionOpen: (open: boolean) => void;
  onQualityAdjusted: (preset: QualityPreset) => void;
  onFps: (fps: number) => void;
  onContextLost: () => void;
  onCameraFlipped?: (flipped: boolean) => void;
  onTacticalView?: (active: boolean) => void;
  /**
   * Fired when the engine had to drop part of the pipeline to get a picture on
   * screen. `safe` is true once it has fallen all the way back to safe
   * rendering, so the UI can persist that choice for the next visit.
   */
  onRenderFallback?: (message: string, safe: boolean) => void;
}

interface CameraShot {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

const CAMERA_SHOTS: Record<CameraPreset, CameraShot> = {
  white: { position: new THREE.Vector3(0, 6.4, 8.6), target: new THREE.Vector3(0, 0.35, 0) },
  black: { position: new THREE.Vector3(0, 6.4, -8.6), target: new THREE.Vector3(0, 0.35, 0) },
  top: { position: new THREE.Vector3(0, 12.4, 0.35), target: new THREE.Vector3(0, 0.2, 0) },
  cinematic: { position: new THREE.Vector3(9.6, 3.6, 6.8), target: new THREE.Vector3(-0.4, 0.5, -0.4) },
};

/**
 * The showcase framing: higher and further back than the cinematic shot, so the
 * whole board reads at once and no figure is seen through the haze at floor
 * level. This is the angle a still showcase holds for the entire duel.
 */
const SHOWCASE_SHOT: CameraShot = {
  position: new THREE.Vector3(7.1, 6.5, 8.2),
  target: new THREE.Vector3(0, 0.35, 0),
};

/** What the follow camera looks at between moves. */
const BOARD_FOCUS = new THREE.Vector3(0, 0.45, 0);

/**
 * How far the follow rig leans towards the action, as a fraction of the way from
 * the board centre to the figure being followed.
 *
 * A full chase (1) puts the figure dead centre, but it also drags the eye a full
 * board-width sideways — straight into the hall wall on every near-side move.
 * Leaning keeps the whole position in frame and the rig in open air.
 */
const FOLLOW_LEAN = 0.72;

/**
 * How much of its distance the follow rig gives up before it starts to climb,
 * when the hall has run out of room behind the action. A step closer costs the
 * picture far less than a climb towards a top-down view does.
 */
const FOLLOW_GIVE = 0.18;

/** Clearance held between the follow rig's eye and the hall wall. */
const FOLLOW_WALL_MARGIN = 0.4;

/**
 * The flat tactical map: high above the board, dead centre and shot through a
 * narrow lens so the squares read as a grid instead of a receding perspective.
 */
const TACTICAL_SHOT: CameraShot = {
  position: new THREE.Vector3(0, 22, 0.55),
  target: new THREE.Vector3(0, 0, 0),
};
const TACTICAL_FOV = 28;
const DEFAULT_FOV = 46;

/**
 * The four corners of a square, walked around its perimeter as `(x, z)` steps of
 * half a tile. Order matters: the winding is what makes a point-in-quad test out
 * of four edge crossings.
 */
const FOOTPRINT_CORNERS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

/**
 * The window the shots above were authored against. Every framing is re-solved
 * for the surface actually being drawn into (`scene/viewport.ts`) — a phone held
 * upright needs a different distance, elevation and lens to see the same board.
 */
const AUTHORED_VIEW: ViewportProfile = {
  width: 1440,
  height: 900,
  aspect: 1.6,
  handheld: false,
  portrait: false,
};

/**
 * What a pawn may become, and the key that picks it. The order is the order they
 * are laid out in — best first, so the common choice is the leftmost thing the
 * eye lands on.
 */
const PROMOTION_CHOICES: readonly { kind: PieceKind; key: string }[] = [
  { kind: "q", key: "Q" },
  { kind: "r", key: "R" },
  { kind: "b", key: "B" },
  { kind: "n", key: "N" },
];

/** Candidate figure scale, and the world gaps between plinths. */
const PROMOTION_SLOT_SCALE = 0.92;
const PROMOTION_SPACING = 1.5;
const PROMOTION_ROW_GAP = 2;
/** Height of one slot's contents (plinth, figure, name plate) in world units. */
const PROMOTION_SLOT_HEIGHT = 1.75;
/** Widest point of one slot — the name plate, not the figure. */
const PROMOTION_SLOT_WIDTH = 1.3;
/** Share of the viewport's narrow axis the whole picker is solved to fill. */
const PROMOTION_FILL = 0.84;
/** How far behind the candidates the scrim hangs. */
const PROMOTION_SCRIM_DEPTH = 1.8;

/** One candidate: its plinth, its spinning figure and its name plate. */
interface PromotionSlot {
  kind: PieceKind;
  /** Positioned by the layout solve every frame. */
  group: THREE.Group;
  /** Holds the figure only, so the idle turn does not swing the name plate. */
  spin: THREE.Group;
  view: PieceView;
  plaque: THREE.Sprite;
  pedestal: THREE.Mesh;
  /** 0 at rest, 1 under the pointer; smoothed, drives lift and glow. */
  attention: number;
}

/**
 * When the frame is sampled for the black-screen watchdog, in seconds since the
 * first frame. The first check is late enough that the hall is standing and the
 * intro has moved off its opening frame.
 */
const DARK_FRAME_CHECKS = [2, 3.4, 4.8, 6.2, 8];

/**
 * How each rank sounds when it goes down: the court and the big bodies die
 * louder and a shade lower, footsoldiers thinner and higher.
 */
const CRY_WEIGHT: Record<PieceKind, { volume: number; rate: number }> = {
  k: { volume: 1.1, rate: 0.94 },
  q: { volume: 1.05, rate: 0.98 },
  r: { volume: 1, rate: 0.92 },
  b: { volume: 0.92, rate: 1 },
  n: { volume: 0.95, rate: 1.01 },
  p: { volume: 0.85, rate: 1.05 },
};

/**
 * The colour of the motes a body leaves behind as it burns away: cold
 * soul-light for the ivory kingdom, live embers for the Sun Empire.
 */
const EMBER_COLOR: Record<Faction, number> = {
  w: 0xbcd8ff,
  b: 0xff8a3c,
};

/**
 * How heavy each rank feels against the board — drives the pitch, ring and
 * loudness of the wooden knock when a figure is lifted or set down.
 */
const WOOD_WEIGHT: Record<PieceKind, number> = {
  k: 1,
  q: 0.88,
  r: 0.82,
  b: 0.52,
  n: 0.58,
  p: 0.3,
};

/** How one rank crosses the board on its own legs. */
interface Gait {
  /** Footfalls put down per square of travel — the length of the stride. */
  stepsPerTile: number;
  /** Footfalls per second — the cadence of the march. */
  cadence: number;
  /** What the boot sounds like against the stone. */
  timbre: FootstepTimbre;
  /** Loudness of one footfall. */
  volume: number;
}

/**
 * The twelve figures do not walk alike. Footsoldiers take short, quick, scuffing
 * steps; the tower guardians tread slowly in full plate; the crown crosses the
 * board at a deliberate pace that nothing on the board hurries.
 */
const GAITS: Record<PieceKind, Gait> = {
  k: { stepsPerTile: 1.55, cadence: 1.85, timbre: "regal", volume: 1 },
  q: { stepsPerTile: 1.7, cadence: 2.1, timbre: "regal", volume: 0.88 },
  r: { stepsPerTile: 1.5, cadence: 1.95, timbre: "plate", volume: 1.12 },
  b: { stepsPerTile: 1.9, cadence: 2.45, timbre: "leather", volume: 0.78 },
  n: { stepsPerTile: 2, cadence: 2.9, timbre: "plate", volume: 0.95 },
  p: { stepsPerTile: 2, cadence: 2.7, timbre: "scuff", volume: 0.72 },
};

/**
 * The two ranks that never touch what they kill: the sorceress queen and the
 * staff-bearing mage. Both open the fight from where they stand, throwing a
 * ball of fire down the line, and only walk onto the square once the body on it
 * has burned away. Under the Grande Armée's arsenal the same two ranks keep the
 * distance but trade the fire for powder (see {@link attackStyle}).
 */
const RANGED_KINDS: PieceKind[] = ["q", "b"];

/**
 * How a rank opens a fight, once its army's arsenal is taken into account.
 *
 * - `melee` — walk in and strike (see {@link STRIKES}).
 * - `spell` — gather fire on the spot and throw it (see {@link SPELLS}).
 * - `gun` — level a barrel and fire (see {@link GUNS}).
 *
 * The Grande Aréme is the one army that fights with powder: its Emperor and his
 * commander settle matters with a flintlock, its marshal with a rifle from one
 * knee, its line infantry with a musket volley and its battery with the field
 * gun it hauls. Only the cuirassier still closes, sabre first — which is exactly
 * what a cavalryman is for. Nobody in this army casts anything.
 */
type AttackStyle = "melee" | "spell" | "gun";

const GUNPOWDER_KINDS: PieceKind[] = ["k", "q", "b", "r", "p"];

function attackStyle(kind: PieceKind, arsenal: ArsenalId): AttackStyle {
  if (arsenal === "empire" && GUNPOWDER_KINDS.includes(kind)) return "gun";
  return RANGED_KINDS.includes(kind) ? "spell" : "melee";
}

/**
 * How one rank's blow is staged. The shape of a hand-to-hand kill never changes
 * — charge, square up, strike, crumble — but its weight does, and it climbs
 * with rank: a footsoldier stabs and moves on, a rider cuts on the charge, a
 * tower guardian puts the floor out of shape, and the crown calls the light
 * down before it swings.
 */
interface StrikeProfile {
  /** Degrees of lens punch-in held over the beat. */
  zoom: number;
  /** March-speed multiplier on the run into the stand-off. */
  charge: number;
  /** Held breath between arriving and swinging. */
  wind: number;
  /** Scales the flash, the sparks, the board hit and the camera kick. */
  power: number;
  /** Loudness of the swing through the air; 0 keeps the wind-up silent. */
  swing: number;
  /** 0 = a light blade, 1 = a siege weapon being hauled round. */
  heft: number;
  /** Arc of steel left hanging where the blade went through. */
  slash: { size: number; color: number } | null;
  /** Wave rolling out across the stone, for a blow that reaches the floor. */
  wave: { radius: number; color: number } | null;
  /** Column of light dropped on the condemned before the blow. */
  pillar: { radius: number; color: number } | null;
  /** Dust torn up along the line of a charge. */
  wake: boolean;
  /** Second tremor a beat after the strike; 0 leaves the hall still. */
  aftershock: number;
  /** Hitstop on the frame of contact, before the body starts to go down. */
  hold: number;
}

/**
 * The six blows, in order of what the rank is worth. The footsoldier's line is
 * the original beat and is deliberately left untouched — everything above it is
 * measured against it.
 */
const STRIKES: Record<PieceKind, StrikeProfile> = {
  p: {
    zoom: 5.5,
    charge: 1.35,
    wind: 0.1,
    power: 1,
    swing: 0,
    heft: 0,
    slash: null,
    wave: null,
    pillar: null,
    wake: false,
    aftershock: 0,
    hold: 0,
  },
  // The rider arrives faster than it can be answered and cuts on the way past.
  n: {
    zoom: 7.2,
    charge: 1.75,
    wind: 0.04,
    power: 1.35,
    swing: 0.7,
    heft: 0.3,
    slash: { size: 1.7, color: 0xfff3d8 },
    wave: null,
    pillar: null,
    wake: true,
    aftershock: 0.12,
    hold: 0.05,
  },
  // The mage only ever fights at range; this is a safety net, not a beat.
  b: {
    zoom: 6,
    charge: 1.4,
    wind: 0.12,
    power: 1.15,
    swing: 0.45,
    heft: 0.15,
    slash: { size: 1.2, color: 0xd8e6ff },
    wave: null,
    pillar: null,
    wake: false,
    aftershock: 0,
    hold: 0.03,
  },
  // Plate and a hammer: slow in, and the stone takes most of the blow.
  r: {
    zoom: 8.6,
    charge: 1.1,
    wind: 0.24,
    power: 1.8,
    swing: 1,
    heft: 0.95,
    slash: null,
    wave: { radius: 3.2, color: 0xffa257 },
    pillar: null,
    wake: false,
    aftershock: 0.3,
    hold: 0.09,
  },
  // Never reached — the sorceress burns her victims from her own square.
  q: {
    zoom: 8,
    charge: 1.3,
    wind: 0.16,
    power: 1.6,
    swing: 0.6,
    heft: 0.35,
    slash: { size: 1.5, color: 0xffe0b0 },
    wave: null,
    pillar: null,
    wake: false,
    aftershock: 0.14,
    hold: 0.06,
  },
  // An execution, not a fight: the light comes down, the bell rings, then gold.
  k: {
    zoom: 11,
    charge: 1.2,
    wind: 0.3,
    power: 2.25,
    swing: 1,
    heft: 0.7,
    slash: { size: 2, color: 0xffdf9a },
    wave: { radius: 3.7, color: 0xffcf7a },
    pillar: { radius: 0.6, color: 0xffe3a8 },
    wake: false,
    aftershock: 0.34,
    hold: 0.13,
  },
};

/**
 * How big a capture reads, by what was taken — not by who took it.
 *
 * This is the one weight on the board that belongs to the *victim*: a pawn
 * trading itself off and a queen going down are the same choreography, and the
 * only thing that can tell them apart at the moment the square changes hands is
 * how much noise and light the claim is allowed to make. Ordered as the ranks
 * are actually valued, so the ear reads the exchange without checking the tray.
 */
const CONQUEST_WEIGHT: Record<PieceKind, number> = {
  p: 0.16,
  n: 0.42,
  b: 0.46,
  r: 0.64,
  q: 0.88,
  k: 1,
};

/** How much fire a caster throws, and what it does when it lands. */
interface SpellProfile {
  /** Degrees of lens punch-in held over the beat. */
  zoom: number;
  /** Seconds of wind-up added on top of the cast clip. */
  gather: number;
  /** Size of the ball held at the head of the staff. */
  orb: number;
  /** How many bolts go down the line. */
  bolts: number;
  /** Scales the blast at the far end. */
  blast: number;
  /** Radius of the fire rolled out across the square; 0 for none. */
  ring: number;
}

/** The mage: one bolt, thrown clean. */
const MAGE_SPELL: SpellProfile = { zoom: 4.5, gather: 0, orb: 0.42, bolts: 1, blast: 1, ring: 0 };

/**
 * The sorceress: a longer, heavier gather and a volley of three — two leaders
 * that break on the body and a killing bolt behind them that takes the square
 * with it.
 */
const QUEEN_SPELL: SpellProfile = { zoom: 7.5, gather: 0.28, orb: 0.66, bolts: 3, blast: 1.75, ring: 3.4 };

function spellProfile(kind: PieceKind): SpellProfile {
  return kind === "q" ? QUEEN_SPELL : MAGE_SPELL;
}

/**
 * How one barrel behaves. Everything scales off the bore: a flintlock pistol is
 * a crack and a puff of smoke, a musket puts a man down, and a field gun
 * rearranges the square it is laid on.
 */
interface GunProfile {
  /** Degrees of lens punch-in held over the beat. */
  zoom: number;
  /** Held breath between levelling the barrel and firing. */
  aim: number;
  /** Which recorded barrel this rank fires (see `GUN_AUDIO_URLS`). */
  voice: GunVoice;
  /**
   * Lock time: seconds from the trigger breaking to the main charge lighting.
   *
   * Real, and audible. A flintlock takes 40-70ms to get from the sear releasing
   * to the ball moving — sear, flint on frizzen, pan flash, then the barrel — and
   * a field gun touched off at the vent takes longer still. The engine plays the
   * mechanical half of the shot this far ahead of the report so the ear can hear
   * the trigger being pulled and then hear the gun answer it.
   */
  lock: number;
  /**
   * How long the firing drill is allowed to take, in seconds, and the fraction
   * of it at which the ball leaves the muzzle.
   *
   * Firearm clips are drills, not swings: the arm comes up, the barrel is
   * levelled, the head goes down to the sights and only then does the hammer
   * fall. Played at a swordsman's length the whole thing is over in a third of a
   * second and the shot looks like a flash appearing out of a stance — which is
   * exactly what it used to look like. Each barrel therefore names its own
   * readable length and its own moment of ignition.
   */
  drill: { seconds: number; impact: number };
  /** 0 = pistol lock, 0.5 = musket, 1 = field gun — drives the whole mix. */
  calibre: number;
  /**
   * Width of the muzzle flash, as a multiple of the round's *rendered* diameter
   * (`ball` × the ammunition's `gauge`) rather than as an absolute size.
   *
   * This has to be a ratio, not a number of world units. The rounds are drawn at
   * a legible gauge — 1.7–2.6× the true bore — and when the flash was authored
   * independently the two drifted apart: a sculpted Minié bullet came out of a
   * flame barely three ball-widths across, so the projectile out-shone the charge
   * that launched it. Tie the flame to the same number that sizes the ball and a
   * bigger round always gets a bigger flash, for free.
   *
   * Real black powder vents roughly 4–8 bore diameters of flame; a clean-burning
   * rifled barrel sits at the bottom of that range and a field gun at the top.
   */
  flare: number;
  /**
   * Which round is rammed down this barrel (see `scene/ammunition.ts`). It
   * decides the shape of the thing that crosses the board, whether it flies a
   * true line or wanders, and whether it arrives cold or still glowing.
   */
  ammo: AmmoKind;
  /** Diameter of the bore in world units — the round is scaled off it. */
  ball: number;
  /**
   * Seconds the ball spends crossing one tile.
   *
   * Nothing here is muzzle velocity: a real ball crosses eight squares of this
   * hall in about a hundredth of a second, which is one frame, which is why the
   * shot could not be seen at all. These are film speeds — slow enough to pick
   * the round up as it leaves the bore and follow it into the body, fast enough
   * that it still reads as shot rather than as a thrown stone. The order between
   * barrels is kept true: rifled fastest, field gun slowest.
   */
  speed: number;
  /** Puffs in the bank of smoke left hanging in front of the barrel. */
  smoke: number;
  /**
   * Colour of the powder smoke, or null to take the faction's livery tint. A
   * rifled barrel fires a small, tight-patched charge that burns almost
   * completely, so its smoke is pale ash grey where a smoothbore's is soot.
   */
  smokeTint: number | null;
  /** How thick the bank reads. 1 = a musket volley; below that it is sheer. */
  smokeDensity: number;
  /** Fine-grain powder: paler, threadier puffs that lift and tear apart fast. */
  fineSmoke: boolean;
  /**
   * Seconds from the hammer falling to the last thread of the bank dissolving.
   *
   * Powder smoke is the slowest thing a gun produces — the flash is three frames
   * and the ball is half a second, but the cloud is still drifting over the
   * square long after both. This used to be derived from the calibre and then
   * *shortened* for a rifled barrel, which had the marksman's shot clearing the
   * air almost before the body fell. It is now stated per barrel, and every one
   * of them outlives its own shot.
   */
  smokeHang: number;
  /**
   * Seconds the bore keeps trickling smoke after the shot, and how many wisps
   * come out of it. Unlike the bank — which is made once and left hanging in
   * the air where it was fired — this is emitted at the *live* muzzle, so it
   * follows the barrel as the man lowers his weapon. 0 for none.
   */
  boreSmoke: { seconds: number; wisps: number };
  /** Scales the hit at the far end: flash, sparks, tile strike and shake. */
  blast: number;
  /** How far the body is thrown back by the shot, in tiles. */
  kick: number;
  /** How far a towed gun rolls back on its wheels, in figure heights. */
  recoil: number;
  /** Wave rolled out across the stone where the shot lands; null for none. */
  wave: { radius: number; color: number } | null;
  /** Hitstop on the frame the ball arrives. */
  hold: number;
  /** Second tremor a beat after the shot; 0 leaves the hall still. */
  aftershock: number;
  /**
   * Whether the shot is taken standing or from one knee, and — for a kneeling
   * gunner — how long the drop onto the stone takes.
   *
   * This is not decoration: it decides *which pose the gun is fired from*. A
   * standing gunner plays his firing drill, because every one of those clips
   * starts and ends on its feet, so the drill agrees with the stance around it.
   * A kneeling gunner has no such clip — the generator's kneeling-looking take
   * measures as a stand-crouch-stand cycle whose ignition frame lands with the
   * man upright (see the marksman's note in `assets/generated.ts`) — so he holds
   * his kneeling aim through the trigger, the report and the recoil, reloads
   * still on the knee, and only rises once the body is cleared. One stance per
   * shot: nobody bobs up and down mid-kill.
   */
  stance: { kneel: false } | { kneel: true; drop: number };
}

/**
 * The barrels of the Grande Armée, in order of what they are worth.
 *
 * The pistol is deliberately the quietest kill on the board — the Emperor does
 * not need spectacle — and the field gun is by far the loudest thing in the
 * hall, louder even than the crown's judgement.
 */
const GUNS: Record<PieceKind, GunProfile> = {
  // Officer's flintlock: raised, fired, done. No smoke bank worth the name.
  k: {
    zoom: 7,
    aim: 0.34,
    voice: "pistol",
    // A well-tuned duelling lock: the fastest ignition in the hall.
    lock: 0.042,
    // A quick draw is meant to be quick, but the pistol still has to be seen to
    // come up and be pointed before it goes off.
    drill: { seconds: 1.15, impact: 0.5 },
    calibre: 0.06,
    flare: 4.4,
    ammo: "pistolBall",
    ball: 0.055,
    speed: 0.1,
    smoke: 5,
    smokeTint: null,
    smokeDensity: 0.85,
    fineSmoke: false,
    smokeHang: 1.7,
    boreSmoke: { seconds: 0.7, wisps: 3 },
    blast: 1.1,
    kick: 0.05,
    recoil: 0,
    wave: null,
    hold: 0.06,
    aftershock: 0,
    // Settled where he stands: the Emperor does not kneel to shoot a man.
    stance: { kneel: false },
  },
  // Charleville musket: shouldered, a hard crack and a bank of white smoke.
  p: {
    zoom: 5.5,
    aim: 0.3,
    voice: "musket",
    // A service musket lock, coarse-primed: slower than an officer's pistol.
    lock: 0.058,
    // Musket off the shoulder, levelled, fired: the report lands past halfway.
    drill: { seconds: 1.3, impact: 0.56 },
    calibre: 0.44,
    flare: 4.7,
    // .69 of soft lead — the fattest small-arms round on the board, and the one
    // that bellies furthest off the line of sight.
    ammo: "musketBall",
    ball: 0.078,
    speed: 0.108,
    smoke: 8,
    smokeTint: null,
    smokeDensity: 1,
    fineSmoke: false,
    smokeHang: 2.5,
    boreSmoke: { seconds: 1, wisps: 4 },
    blast: 1,
    kick: 0.07,
    recoil: 0,
    wave: null,
    hold: 0.05,
    aftershock: 0,
    // The line fires standing, shoulder to shoulder — that is what a line is.
    stance: { kneel: false },
  },
  // Field gun: the crew stands clear, the piece rolls back and the stone rings.
  r: {
    zoom: 10,
    aim: 0.42,
    voice: "cannon",
    // Not a lock at all: a portfire brought down to the vent, the priming taking,
    // then the charge. By far the longest wait between the order and the boom.
    lock: 0.12,
    // The crew steps in to the trail and leans on the lanyard — unhurried.
    drill: { seconds: 1.25, impact: 0.52 },
    calibre: 1,
    // The heaviest charge in the hall, and the widest sheet of flame with it.
    flare: 6,
    // Solid iron, straight out of the sand mould and still hot from the bore.
    ammo: "roundShot",
    // The one round on the board heavy enough to watch travel on its own merits.
    ball: 0.17,
    speed: 0.125,
    smoke: 14,
    smokeTint: null,
    smokeDensity: 1.15,
    fineSmoke: false,
    smokeHang: 3.8,
    boreSmoke: { seconds: 1.6, wisps: 6 },
    blast: 2.1,
    kick: 0.04,
    recoil: 0.19,
    wave: { radius: 3.6, color: 0xffb271 },
    hold: 0.12,
    aftershock: 0.32,
    // The crew serves the piece on its feet; only the reload goes to a knee.
    stance: { kneel: false },
  },
  // Rifled long arm, fired from one knee: the longest held breath on the board
  // and the flattest, fastest ball. Less flame and less smoke than the line's
  // musket — a marksman is a single clean crack, not a volley. Its charge is
  // small and tightly patched, so it burns clean: the bank off this barrel is
  // pale ash grey, sheer enough to see the target through, and gone in a beat.
  b: {
    // Framed like every other shot in the hall. This used to be the hardest
    // punch-in on the board, paced to a full-screen sight picture that closed
    // over the interface; both are gone. The kill is now watched from the same
    // distance as the line infantry's volley — the man kneeling in frame is the
    // thing to look at, not a lens effect wrapped around him.
    zoom: 5.5,
    // The held breath *after* he is down and before the trigger — the drop onto
    // the knee is now a beat of its own (see `stance.drop`), so this no longer
    // has to cover it.
    aim: 0.55,
    voice: "rifle",
    // A marksman's piece, hand-fitted and finely primed — a fast lock, because a
    // slow one throws the shot off at the range he is expected to hit at.
    lock: 0.038,
    // Still the longest wait on the board between the barrel coming up and the
    // hammer falling. No clip is retimed by these numbers any more — the kneeling
    // shot is fired out of a held aim rather than out of a drill (see `stance`) —
    // so they are now purely the *beat*: 1.02s of held sights before the shot.
    drill: { seconds: 1.7, impact: 0.6 },
    calibre: 0.5,
    // A small, tightly patched charge burning almost completely: the least flame
    // of any barrel on the board, in keeping with its pale ash smoke.
    flare: 4.9,
    // The only round in the army with rifling behind it: conical, spun hard,
    // and dead straight where every ball on the board wanders.
    ammo: "minieBullet",
    ball: 0.05,
    // Flattest and fastest thing fired in the hall, as rifling should be.
    speed: 0.082,
    // The marksman's signature. A rifled charge makes far less smoke than the
    // line's musket, so the answer is never to make it *thicker* — it is to make
    // more of it, thinner, and let it stand in the air long enough to watch it
    // come apart. Pale ash grey, sheer enough to read the board through, and the
    // bore goes on smoking in his hands for a beat and a half after the crack.
    smoke: 12,
    smokeTint: 0xdfe4ea,
    smokeDensity: 0.74,
    fineSmoke: true,
    smokeHang: 3.2,
    boreSmoke: { seconds: 1.5, wisps: 6 },
    blast: 1.2,
    kick: 0.06,
    recoil: 0,
    wave: null,
    hold: 0.08,
    aftershock: 0,
    // The one man on the board who fights off the stone. 0.85s is what going
    // down on a knee under arms actually takes — the rise clip run backwards
    // covers it, so the knee plants instead of the body sinking.
    stance: { kneel: true, drop: 0.85 },
  },
  // The commander's flintlock: the Emperor's own weapon, held a beat longer.
  // She takes the shot standing at full height with the Marengo sword still in
  // her left hand, so the drill is unhurried and the report is a shade fuller
  // than his — an order being carried out, not a duel being won.
  q: {
    zoom: 7.5,
    aim: 0.4,
    voice: "pistol",
    lock: 0.046,
    drill: { seconds: 1.35, impact: 0.54 },
    calibre: 0.12,
    flare: 4.6,
    ammo: "pistolBall",
    ball: 0.058,
    speed: 0.096,
    smoke: 6,
    smokeTint: null,
    smokeDensity: 0.9,
    fineSmoke: false,
    smokeHang: 1.9,
    boreSmoke: { seconds: 0.8, wisps: 3 },
    blast: 1.25,
    kick: 0.055,
    recoil: 0,
    wave: null,
    hold: 0.07,
    aftershock: 0,
    // Standing at full height, sword still in her left hand.
    stance: { kneel: false },
  },
  n: {
    zoom: 6,
    aim: 0.16,
    voice: "musket",
    // A carbine lock, worked from the saddle: quick and a little rough.
    lock: 0.052,
    drill: { seconds: 1.1, impact: 0.5 },
    calibre: 0.4,
    flare: 4.6,
    // A cavalry carbine: the same ball as the line, off a shorter barrel.
    ammo: "musketBall",
    ball: 0.072,
    speed: 0.106,
    smoke: 6,
    smokeTint: null,
    smokeDensity: 1,
    fineSmoke: false,
    smokeHang: 2.1,
    boreSmoke: { seconds: 0.8, wisps: 4 },
    blast: 1,
    kick: 0.06,
    recoil: 0,
    wave: null,
    hold: 0.05,
    aftershock: 0,
    // A cavalryman does not kneel; he barely stops moving.
    stance: { kneel: false },
  },
};

/**
 * How wide the flame off a given barrel is drawn, in world units.
 *
 * The single source of truth for the size of a shot: the round's rendered
 * diameter (bore × the legibility gauge from `ammunition.ts`) times the barrel's
 * own {@link GunProfile.flare}. Everything at the muzzle — the flash, the ember
 * shower, and how far clear of the bore the ball is spawned — is scaled off this
 * one number, so a change to a round's gauge can never leave its flash behind.
 */
function muzzleFlare(gun: GunProfile): number {
  return gun.ball * AMMUNITION[gun.ammo].gauge * gun.flare;
}

/**
 * Spine samples in a round's streak, read off the particle budget.
 *
 * The trail is geometry rebuilt every frame, so its cost is the sample count and
 * nothing else. Even the floor value still draws a readable streak — the shape
 * of the path is carried by a handful of rings; the rest is smoothness on the
 * curve a wandering ball flies.
 */
function trailRings(budget: number): number {
  if (budget >= 60) return 26;
  if (budget >= 34) return 20;
  return 12;
}

/**
 * The hall's own air, in world units per second.
 *
 * Barely a breath — a couple of centimetres a second — but it is what turns a
 * powder bank from a cloud that dims where it was made into one that is *carried
 * off the square*. Every gun on the board shares it, so smoke from both armies
 * drifts the same way and the board reads as one room.
 */
const HALL_DRAFT = new THREE.Vector3(0.075, 0.012, -0.045);

/**
 * A marching distance profile: a short push-off, a long stretch at constant
 * speed, then a brief settle. The stride clock runs at a fixed cadence, so an
 * eased-all-the-way curve (what a sliding piece uses) would leave the feet
 * visibly skating at both ends of the move.
 *
 * @param ramp fraction of the move spent accelerating, and again decelerating
 */
function strideEasing(ramp: number): Easing {
  const r = Math.min(0.4, Math.max(0.02, ramp));
  // Distance covered by the ramp-up + cruise + ramp-down, before normalising.
  const span = 1 - r;
  return (t: number): number => {
    if (t <= r) return t * t * 0.5 / r / span;
    if (t >= 1 - r) {
      const rest = 1 - t;
      return (span - rest * rest * 0.5 / r) / span;
    }
    return (t - r * 0.5) / span;
  };
}

/**
 * Owns every three.js object. The chess core drives it through events and the
 * animator hook; React only calls the small imperative API at the bottom.
 */
export class SceneEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private hall: CastleHall;
  private battlefield: Battlefield;
  /** Rainforest dressing — only staged by the Sun Temple map. */
  private jungle: JungleOverlay;
  private board = new BoardView();
  private effects = new EffectsSystem();
  /** Red light over whichever king is in check (see {@link CheckAlarm}). */
  private alarm = new CheckAlarm();
  /**
   * The only point lights sorcery is ever allowed to use. They are added to the
   * scene once and reused, because every change to the scene's light count makes
   * three.js recompile every material in the hall — the sorceress' three-bolt
   * volley used to do that eight times in a second and hang the tab.
   */
  private spellLights: SpellLightPool;
  private shake = new ShakeSystem();
  private tweens = new TweenManager();
  private factory = new PieceFactory();
  private postfx: PostFX;

  private pieces = new Map<SquareId, PieceView>();
  private captured: PieceView[] = [];
  /**
   * Figures mid-move. They are removed from `pieces` for the duration of the
   * animation, so without this set their mixers would never be ticked and the
   * strike / death clips would sit frozen on their first frame.
   */
  private motion = new Set<PieceView>();
  /**
   * Bumped every time the board is rebuilt from the chess core (quality change,
   * undo, new game). A move animation that was already running is holding views
   * that no longer exist, so it checks this after every await and bails out
   * instead of putting a dead figure back on a square — an orphan left standing
   * in the hall was the ghost model seen after an automatic graphics downgrade.
   */
  private boardRevision = 0;
  /** Move animations currently in flight. */
  private movesInFlight = 0;
  /** A rebuild waiting for the board to go quiet (see {@link setQuality}). */
  private rebuildPending = false;
  /** Armies the player has asked for, applied by {@link syncArmies}. */
  private wantedSkins: Record<Faction, ArmySkinId> | null = null;
  /** True while the sculpts are being swapped, so requests queue instead of racing. */
  private swappingArmies = false;
  private promotionGroup: THREE.Group | null = null;
  private promotionViews: PieceView[] = [];
  private promotionSlots: PromotionSlot[] = [];
  /** Dark panel hung behind the candidates so the board stops competing. */
  private promotionScrim: THREE.Mesh | null = null;
  /** Which candidate the pointer is over, if any. */
  private promotionHover: PieceKind | null = null;
  private promotionResolve: ((kind: PieceKind) => void) | null = null;
  /** Scratch vector for the picker's placement, to keep the frame allocation-free. */
  private pickerScratch = new THREE.Vector3();

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private selected: SquareId | null = null;
  private hoveredPiece: PieceView | null = null;
  private pointerDownAt: { x: number; y: number; square: SquareId | null } | null = null;
  private legalTargets = new Map<SquareId, boolean>();
  private previewing = false;
  /**
   * True while the current selection is aimed at a board that does not exist
   * yet: the machine is still on the clock and the tap will queue a move rather
   * than play one.
   */
  private premoving = false;
  /** The queued chain, oldest link first, held so it can be re-lit. */
  private premoveChain: { from: SquareId; to: SquareId }[] = [];
  /** Pointer is resting on the queued move's dismiss coin. */
  private premoveCancelHovered = false;

  private lastFrameTime = 0;
  private elapsed = 0;
  private frameId = 0;
  private running = false;
  private disposed = false;
  private frameErrors = 0;
  /** How many times the frame has been sampled for the black-screen check. */
  private darkFrameChecks = 0;
  /** How far the engine has already fallen back (see `escalateFallback`). */
  private fallbackStage = 0;
  /** What this driver is, and what it can do. */
  private gpu: GpuReport;
  /**
   * Safe rendering: no composer, no reflection probe, no shadow maps. Every one
   * of those has been seen to render an all-black hall on Mesa drivers, so this
   * is the switch that always gets a picture up.
   */
  private safeMode = false;
  /** Player-side exposure multiplier, for screens that read too dark. */
  private brightness = 1;
  /** The probe currently lighting the scene, kept so it can be disposed. */
  private environmentMap: THREE.Texture | null = null;
  /**
   * Null until the probe has been tested on this driver, then false forever if
   * the test failed — there is no point rebuilding it on every arena change.
   */
  private environmentUsable: boolean | null = null;
  /** Stands in for the probe's ambient contribution when the probe is off. */
  private ambientFallback: THREE.AmbientLight;

  private preset: QualityPreset;
  private arena: ArenaTheme = DEFAULT_ARENA;
  /** Travels with the camera so the near face of every figure stays readable. */
  private cameraLamp: THREE.DirectionalLight;
  private captureCinematics = true;
  /**
   * Hotseat: whether a played turn swings the view round to the other side. Off
   * unless the player asks for it — a half turn of the hall between every ply is
   * the heaviest motion in the game and it fires twice a minute.
   */
  private rotateBoard = false;
  private rankBadges = true;
  private interactive = true;
  private attract = false;
  /** Computer-vs-computer showcase: crisp grade and a chosen camera behaviour. */
  private showcase = false;
  private showcaseCamera: ShowcaseCamera = "follow";
  private showcaseOrbitSpeed = 0.32;
  /** Elapsed time of the last manual camera drag (auto orbit yields to it). */
  private lastManualCameraAt = -999;
  /** The figure the follow camera is tracking, if any. */
  private followPiece: PieceView | null = null;
  /** A fixed point the follow camera holds when no figure is moving. */
  private followPoint: THREE.Vector3 | null = null;
  /** Radius multiplier: a fight pulls the rig in closer than a plain march. */
  private followTightness = 1;
  /** The eased point actually being framed, so a jumping focus never snaps. */
  private followedFocus = new THREE.Vector3(0, 0.45, 0);
  /** Azimuth, elevation and distance the follow camera holds. */
  private followRig = new THREE.Spherical(7.6, 0.92, Math.PI * 0.32);
  private followOffset = new THREE.Spherical();
  private scratchFocus = new THREE.Vector3();
  private scratchLean = new THREE.Vector3();
  private scratchDesired = new THREE.Vector3();
  private scratchCornerA = new THREE.Vector3();
  private scratchCornerB = new THREE.Vector3();
  /** True while the engine itself is moving the camera (never counts as input). */
  private cameraDriven = false;
  /** True while a scripted camera move (intro, dolly, preset) is running. */
  private cameraScripted = false;
  private introPlaying = false;
  private introSkipped = false;
  private orbiting = false;
  private cameraFlipped = false;
  /** Flat top-down map: sculpts swap for counters and the world is struck. */
  private tactical = false;
  /** The 3D framing to drop back into when the map is folded away. */
  private tacticalReturn: CameraShot | null = null;
  /** Dressing hidden while the map is up, so it can be put back exactly. */
  private struck: THREE.Object3D[] = [];

  /** The surface being drawn into: its shape decides the whole framing. */
  private view: ViewportProfile = AUTHORED_VIEW;
  /** True once the first real framing has been solved for the live viewport. */
  private viewportFitted = false;
  /**
   * The lens the current framing asks for. Battle beats punch in *from* this
   * rather than from a constant, so a phone's wider framing keeps its punch and
   * a mid-fight rotation never restores the wrong lens.
   */
  private lensFov = DEFAULT_FOV;
  /** Distance the current framing settled on — drives the orbit and follow rigs. */
  private fitRadius = 10.5;
  /** The *authored* shot the camera was last sent to, re-solved on every resize. */
  private framedShot: CameraShot = CAMERA_SHOTS.white;
  /** Orbit and tap tolerances for this viewport. */
  private limits: OrbitLimits = orbitLimits(AUTHORED_VIEW, 10.5);

  private fpsSamples: number[] = [];
  private autoAdjusted = false;
  private lastFpsReport = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private controller: GameController,
    private callbacks: SceneCallbacks,
    preset: QualityPreset,
    arena: ArenaTheme = DEFAULT_ARENA,
  ) {
    this.preset = preset;
    this.arena = arena;
    const look = ARENA_LOOKS[arena];
    const settings = QUALITY_SETTINGS[preset];

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: settings.msaaSamples > 0,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.maxPixelRatio));
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.gpu = probeGpu(this.renderer);
    console.info(`[scene] gpu: ${describeGpu(this.gpu)}`);
    this.applyExposure(look.exposure);

    this.scene.background = new THREE.Color(look.background);
    // Thinner, warmer haze than a sealed hall would use: the siege camps and
    // the armies beyond the broken wall have to read through it.
    this.scene.fog = new THREE.FogExp2(look.fog.color, look.fog.density);

    this.camera = new THREE.PerspectiveCamera(DEFAULT_FOV, 1, 0.1, 260);
    this.camera.position.copy(CAMERA_SHOTS.white.position);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    // Distances, elevation limits and rotate speed all come from the viewport —
    // see `applyOrbitLimits`, called from the resize handler below.
    this.controls.enablePan = false;
    this.controls.target.copy(CAMERA_SHOTS.white.target);
    this.controls.autoRotateSpeed = 0.45;

    this.hall = new CastleHall(preset, look);
    this.scene.add(this.hall.group);
    this.battlefield = new Battlefield(preset, look);
    this.scene.add(this.battlefield.group);
    this.jungle = new JungleOverlay(preset, look);
    this.scene.add(this.jungle.group);
    this.scene.add(this.board.group);
    this.board.applyArena(look);
    this.scene.add(this.effects.group);
    this.scene.add(this.alarm.group);
    // Three slots: the gathering fire, the killing bolt and a judgement column
    // can all be alight at once. Anything beyond that goes unlit rather than
    // growing the set. Presets without post-processing stay entirely unlit.
    this.spellLights = new SpellLightPool(this.scene, settings.postFx ? 3 : 0);

    // A soft lamp parented to the camera: whichever way the board is turned,
    // the faces and shields pointing at the player are never in shadow.
    this.cameraLamp = new THREE.DirectionalLight(look.lamp.color, look.lamp.intensity);
    this.cameraLamp.position.set(0, 1.5, 2.5);
    this.camera.add(this.cameraLamp);
    this.camera.add(this.cameraLamp.target);
    this.cameraLamp.target.position.set(0, 0, -1);
    this.scene.add(this.camera);

    // Skylight stand-in: silent while the reflection probe is doing its job,
    // turned up the moment the probe is dropped so nothing goes unlit.
    this.ambientFallback = new THREE.AmbientLight(look.environment.top, 0);
    this.scene.add(this.ambientFallback);
    this.applyEnvironment();

    this.postfx = new PostFX(this.renderer, this.scene, this.camera);
    this.postfx.setGrade(look.grade);
    this.postfx.setBloom(look.bloom);
    this.postfx.setPreset(preset);

    this.bindEvents();
    this.factory.onClip((keys, name, clip) => this.adoptClip(keys, name, clip));
    this.controller.setAnimator((event) => this.animateMove(event));
    this.controller.on("state", (snapshot) => this.onState(snapshot));
    this.controller.on("reset", () => this.rebuildPieces());
    this.controller.on("illegal", ({ from }) => this.rejectMove(from));
    this.controller.on("gameover", () => void this.playEndCinematic());
    this.controller.on("premove", (premoves) => this.onPremoveChanged(premoves));
    this.controller.on("premovefailed", ({ from, to, dropped, reason }) =>
      void this.flashPremoveLost(from, to, dropped, reason),
    );
    this.handleResize();
  }

  // ---------------------------------------------------------------- lifecycle

  async load(): Promise<void> {
    await this.factory.load((done, total) => this.callbacks.onLoadProgress(done / total));
    if (this.disposed) return;
    this.rebuildPieces();
    this.callbacks.onReady();
    // The magazine, fetched behind the game: one sculpt per round in the army's
    // barrels, a couple of thousand triangles each, and none of them needed until
    // somebody pulls a trigger. Until a sculpt lands the round is turned
    // procedurally instead (`scene/ammunition.ts`), so the first shot of a game is
    // never a blank.
    for (const source of SHOT_MODELS) void primeShotModel(source);
    // The rigs and their stances are in; the strikes, deaths and strides come
    // down behind the game so the first move never waits on seventy GLBs.
    void this.factory.warmClips();
  }

  /**
   * A clip finished downloading after the board was already standing: hand it to
   * every figure of that roster on the board, in the tray and mid-move, so a
   * piece built during the opening is not left without a strike for the game.
   */
  private adoptClip(keys: TemplateKey[], name: ClipName, clip: THREE.AnimationClip): void {
    const wanted = new Set<TemplateKey>(keys);
    const install = (piece: PieceView): void => {
      if (wanted.has(`${piece.color}${piece.kind}`)) piece.installClip(name, clip);
    };
    for (const piece of this.pieces.values()) install(piece);
    for (const piece of this.motion) install(piece);
    for (const piece of this.captured) install(piece);
    for (const piece of this.promotionViews) install(piece);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrameTime = performance.now();
    const loop = (): void => {
      if (!this.running) return;
      this.frameId = requestAnimationFrame(loop);
      try {
        this.frame();
      } catch (error) {
        this.frameErrors += 1;
        if (this.frameErrors <= 3) console.error("[scene] frame failed", error);
        // A misbehaving effect must never take the whole hall down with it.
        if (this.frameErrors === 3) this.postfx.forceDirect("repeated frame errors");
      }
    };
    this.frameId = requestAnimationFrame(loop);
  }

  private frame(): void {
    const now = performance.now();
    const delta = Math.min(0.05, Math.max(0, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;
    this.elapsed += delta;

    this.tweens.update(delta);
    this.hall.update(delta);
    this.battlefield.update(delta, this.camera);
    this.jungle.update(delta, this.camera);
    this.board.update(delta);
    this.effects.update(delta);
    this.alarm.update(delta);
    this.shake.update(delta);

    for (const piece of this.pieces.values()) piece.update(delta, this.elapsed);
    for (const piece of this.motion) piece.update(delta, this.elapsed);
    for (const piece of this.captured) piece.update(delta, this.elapsed);
    for (const piece of this.promotionViews) piece.update(delta, this.elapsed);

    if (this.promotionGroup) this.layoutPromotionPicker(delta);

    if (this.tactical) this.alignTokens();

    // Auto orbit for the attract loop, and for a showcase only when the viewer
    // has actually asked for one. Never fight the hand on the mouse: a drag
    // suspends it for a few seconds.
    const orbitIdle = this.elapsed - this.lastManualCameraAt > 3.2;
    const showcaseOrbit = this.showcase && this.showcaseCamera === "orbit" && orbitIdle;
    this.controls.autoRotate = !this.tactical && (this.attract || showcaseOrbit);
    this.controls.autoRotateSpeed = this.attract ? 0.45 : this.showcaseOrbitSpeed;

    // The follow camera writes the camera itself, so `change` events fired by
    // the controls below must not be mistaken for the viewer grabbing the view.
    this.cameraDriven = this.updateFollowCamera(delta);
    this.controls.update();
    this.cameraDriven = false;
    this.confineCamera();

    this.camera.position.add(this.shake.offset);
    this.postfx.render(delta);
    this.camera.position.sub(this.shake.offset);

    this.guardAgainstBlackFrames();
    this.sampleFps(delta);
  }

  /**
   * Black-screen watchdog.
   *
   * Several driver stacks — Mesa's software rasterisers above all, which is what
   * a Linux box without working hardware acceleration falls back to — render an
   * all-black hall while the interface above it is perfectly fine. The cause is
   * never the same twice: sometimes the composer returns an empty buffer,
   * sometimes the reflection probe samples as NaN and poisons every lit
   * surface, sometimes it is the shadow maps.
   *
   * So rather than guessing, the frame itself is sampled five times over the
   * first seconds and each failed sample drops one more layer, in increasing
   * order of how much it costs to lose.
   */
  private guardAgainstBlackFrames(): void {
    if (this.darkFrameChecks >= DARK_FRAME_CHECKS.length) return;
    if (this.elapsed < DARK_FRAME_CHECKS[this.darkFrameChecks]) return;
    if (typeof document !== "undefined" && document.hidden) return;
    this.darkFrameChecks += 1;
    if (!this.isFrameBlack()) {
      // A picture is on screen — stand the watchdog down for good.
      this.darkFrameChecks = DARK_FRAME_CHECKS.length;
      return;
    }
    this.escalateFallback();
  }

  /**
   * Reads five small patches spread across the frame (centre plus the four
   * quadrants). Every one of them has to come back black before anything is
   * dropped, so a dark corner or a night-time arena never triggers this.
   */
  private isFrameBlack(): boolean {
    const gl = this.renderer.getContext();
    const { width, height } = this.renderer.domElement;
    const span = 6;
    if (width < span * 4 || height < span * 4) return false;
    const spots: [number, number][] = [
      [0.5, 0.5],
      [0.28, 0.32],
      [0.72, 0.32],
      [0.28, 0.7],
      [0.72, 0.7],
    ];
    const pixels = new Uint8Array(span * span * 4);
    for (const [u, v] of spots) {
      try {
        gl.readPixels(
          Math.floor(width * u - span / 2),
          Math.floor(height * v - span / 2),
          span,
          span,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixels,
        );
      } catch {
        return false;
      }
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] > 10 || pixels[i + 1] > 10 || pixels[i + 2] > 10) return false;
      }
    }
    return true;
  }

  /** Drops the next layer of the pipeline and tells the interface why. */
  private escalateFallback(): void {
    this.fallbackStage += 1;
    switch (this.fallbackStage) {
      case 1:
        if (this.postfx.isBypassed) {
          this.escalateFallback();
          return;
        }
        this.postfx.setBypassed(true);
        this.report("Post-processing produced an empty frame on this driver — cinematic effects turned off.", false);
        return;
      case 2:
        if (this.environmentUsable === false) {
          this.escalateFallback();
          return;
        }
        this.environmentUsable = false;
        this.applyEnvironment();
        this.report("This driver cannot sample the reflection probe — switched to plain skylight.", false);
        return;
      default:
        if (this.safeMode) {
          console.warn("[scene] still rendering black after every fallback", describeGpu(this.gpu));
          this.darkFrameChecks = DARK_FRAME_CHECKS.length;
          return;
        }
        this.setSafeMode(true);
        this.report("Switched to safe rendering — your graphics driver could not draw the full scene.", true);
        return;
    }
  }

  private report(message: string, safe: boolean): void {
    console.warn(`[scene] ${message} (${describeGpu(this.gpu)})`);
    this.callbacks.onRenderFallback?.(message, safe);
  }

  // -------------------------------------------------------------- render health

  /** Tone mapping exposure, with the player's brightness on top of the theme. */
  private applyExposure(base = this.baseExposure()): void {
    this.renderer.toneMappingExposure = base * this.brightness * (this.safeMode ? 1.2 : 1);
  }

  private baseExposure(): number {
    const look = ARENA_LOOKS[this.arena];
    return this.tactical ? look.exposure * 1.12 : look.exposure;
  }

  /**
   * (Re)builds the reflection probe for the current arena, self-tests it once on
   * this driver, and falls back to a plain ambient skylight if it cannot be
   * trusted. A NaN probe blacks out every lit surface in the hall, so this is
   * the single most likely cause of an all-black scene.
   */
  private applyEnvironment(): void {
    const look = ARENA_LOOKS[this.arena];
    const previous = this.environmentMap;
    this.environmentMap = null;
    this.scene.environment = null;
    previous?.dispose();

    const allowed = !this.safeMode && this.environmentUsable !== false && this.gpu.halfFloatBuffer;
    if (allowed) {
      try {
        const map = buildEnvironmentMap(this.renderer, look);
        if (this.environmentUsable === null) {
          this.environmentUsable = reflectionProbeWorks(this.renderer, map);
          if (!this.environmentUsable) console.warn("[scene] reflection probe renders black — using ambient skylight");
        }
        if (this.environmentUsable) {
          this.environmentMap = map;
          this.scene.environment = map;
          this.scene.environmentIntensity = look.environment.intensity;
        } else {
          map.dispose();
        }
      } catch (error) {
        this.environmentUsable = false;
        console.warn("[scene] could not build the reflection probe", error);
      }
    }

    // Without a probe the ambient term has to come from somewhere, or armour and
    // marble read as pure silhouettes.
    const lit = this.environmentMap !== null;
    this.ambientFallback.color.setHex(look.environment.top).lerp(new THREE.Color(look.environment.warm), 0.4);
    this.ambientFallback.intensity = lit ? 0 : look.environment.intensity * 1.15;
    this.refreshMaterials();
  }

  /**
   * Forces a shader rebuild on every material in the scene. Needed whenever the
   * shadow map is switched on or off at runtime, which otherwise leaves stale
   * programs behind.
   */
  private refreshMaterials(): void {
    this.scene.traverse((object) => {
      const material = (object as THREE.Mesh).material;
      if (!material) return;
      if (Array.isArray(material)) material.forEach((entry) => (entry.needsUpdate = true));
      else material.needsUpdate = true;
    });
  }

  private sampleFps(delta: number): void {
    if (delta <= 0) return;
    this.fpsSamples.push(1 / delta);
    if (this.fpsSamples.length > 120) this.fpsSamples.shift();
    if (this.elapsed - this.lastFpsReport < 1) return;
    this.lastFpsReport = this.elapsed;
    const average = this.fpsSamples.reduce((sum, value) => sum + value, 0) / this.fpsSamples.length;
    this.callbacks.onFps(Math.round(average));

    // One automatic step down if the detected preset is clearly too heavy.
    if (this.autoAdjusted || this.elapsed < 8 || this.fpsSamples.length < 100) return;
    if (average >= 40) return;
    const order: QualityPreset[] = ["low", "medium", "high", "ultra"];
    const index = order.indexOf(this.preset);
    if (index <= 0) {
      this.autoAdjusted = true;
      return;
    }
    this.autoAdjusted = true;
    const next = order[index - 1];
    this.setQuality(next);
    this.callbacks.onQualityAdjusted(next);
  }

  // ------------------------------------------------------------------- pieces

  private rebuildPieces(): void {
    // Any beat still running belongs to the old board: invalidate it first so it
    // cannot re-register the figure it is carrying once its awaits resolve.
    this.boardRevision += 1;
    this.rebuildPending = false;
    for (const piece of this.pieces.values()) piece.dispose();
    // Figures mid-march, mid-strike or mid-death are not in `pieces` — without
    // this they would stay in the scene forever as a frozen double of the figure
    // the rebuild puts back on their square.
    for (const piece of this.motion) piece.dispose();
    for (const piece of this.captured) piece.dispose();
    this.pieces.clear();
    this.motion.clear();
    this.hoveredPiece = null;
    this.followPiece = null;
    this.captured = [];
    this.selected = null;
    this.legalTargets.clear();
    this.board.clearHighlights();
    if (!this.factory.isReady) return;

    const settings = QUALITY_SETTINGS[this.preset];
    for (const entry of this.controller.getBoard()) {
      const view = this.factory.create(entry.kind, entry.color, {
        contactShadows: settings.contactShadows,
        idleAnimation: settings.idleAnimations,
        rankBadge: this.rankBadges,
      });
      if (this.tactical) view.setFlat(true);
      view.container.position.copy(squareToWorld(entry.square));
      this.scene.add(view.container);
      this.pieces.set(entry.square, view);
    }
  }

  private trayPosition(color: Faction, index: number): THREE.Vector3 {
    const column = Math.floor(index / 8);
    const row = index % 8;
    const side = color === "b" ? 1 : -1;
    const x = side * (TILE * 4 + 0.95 + column * 0.62);
    const z = -TILE * 3.2 + row * 0.92;
    return new THREE.Vector3(x, 0, z);
  }

  private async sendToTray(piece: PieceView): Promise<void> {
    this.motion.delete(piece);
    const index = this.captured.filter((entry) => entry.color === piece.color).length;
    this.captured.push(piece);
    // The fallen figure stands back up once it reaches the tray.
    piece.resetPose();
    const destination = this.trayPosition(piece.color, index);
    piece.container.scale.setScalar(0.55);
    piece.container.position.copy(destination);
    piece.setOpacity(0);
    await this.tweens.to({
      duration: 0.5,
      easing: Ease.outCubic,
      onUpdate: (t) => piece.setOpacity(t * 0.95),
    });
  }

  // ---------------------------------------------------------------- animation

  private async animateMove(event: MoveEvent): Promise<void> {
    this.movesInFlight += 1;
    try {
      await this.runMove(event);
    } finally {
      this.movesInFlight -= 1;
      // A quality change that arrived mid-fight was held back; run it now.
      if (this.movesInFlight === 0 && this.rebuildPending) this.rebuildPieces();
    }
  }

  /**
   * True when the board has been rebuilt under a running beat, which means every
   * view that beat is holding has already been disposed.
   */
  private isStale(revision: number): boolean {
    return revision !== this.boardRevision || this.disposed;
  }

  private async runMove(event: MoveEvent): Promise<void> {
    const piece = this.pieces.get(event.from);
    if (!piece) return;
    const revision = this.boardRevision;

    this.clearSelection();
    this.board.clearHighlights();
    this.pieces.delete(event.from);
    this.motion.add(piece);

    const victim = event.capture ? this.pieces.get(event.capture.square) : null;
    if (event.capture) this.pieces.delete(event.capture.square);
    if (victim) this.motion.add(victim);

    const from = squareToWorld(event.from);
    const to = squareToWorld(event.to);

    // Showcase follow camera: ride with the figure that is on the move, and
    // sit in a shade closer when it is walking into a fight.
    this.focusPiece(piece, victim ? 0.86 : 0.98);

    if (victim) {
      const strikeSquare = event.capture ? event.capture.square : event.to;
      // The battle beat is a camera performance — it has no meaning on the map.
      if (this.captureCinematics && !this.tactical) {
        // The strike and the fall are the whole beat: make sure both figures
        // actually hold those clips before the fight starts.
        await this.armCombat(piece, victim);
        try {
          // Casters burn their victims and gunners shoot them, both from where
          // they stand; everyone else has to walk into the blow.
          const style = attackStyle(piece.kind, piece.arsenal);
          if (style === "spell")
            await this.playSpellCinematic(piece, victim, from, to, strikeSquare);
          else if (style === "gun")
            await this.playGunCinematic(piece, victim, from, to, strikeSquare);
          else await this.playCaptureCinematic(piece, victim, from, to, strikeSquare);
        } catch (error) {
          // A broken effect must never strand a figure in the middle of a fight:
          // finish the kill the plain way so the board stays consistent.
          console.warn("[scene] battle beat failed", error);
          this.camera.fov = this.lensFov;
          this.camera.updateProjectionMatrix();
          piece.setStrikeTilt(0);
          if (!victim.isSlain) await this.crumble(victim, from);
        }
      } else {
        const approach = squareToWorld(event.from);
        await this.glide(piece, from, to, event.kind === "n");
        this.strikeImpact(strikeSquare, 0.8);
        await this.crumble(victim, approach);
      }
      if (this.isStale(revision)) return;
      void this.sendToTray(victim);
    } else {
      await this.glide(piece, from, to, event.kind === "n");
      audio.play("place", 0.55);
    }

    if (this.isStale(revision)) return;
    piece.container.position.copy(to);
    this.motion.delete(piece);
    this.pieces.set(event.to, piece);
    // The move is over: hold on the square that was just taken.
    this.focusPoint(to, 1);
    // Taking the square: dust ring, tile dip and the figure settling its weight.
    // Softer after a kill — the strike already shook the stone.
    this.landOn(piece, event.to, victim ? 0.7 : event.kind === "n" ? 1.25 : 1);
    // ...and if that square was somebody else's, it is now claimed.
    if (victim) this.claimSquare(piece, event.to, victim.kind);
    // Arrived: face the enemy side again rather than holding the march heading.
    // A promoting figure is about to be replaced, so it is left alone.
    if (!event.promotion) void piece.turnHome(this.tweens, 0.3);

    if (event.rook) {
      const rook = this.pieces.get(event.rook.from);
      if (rook) {
        this.pieces.delete(event.rook.from);
        this.motion.add(rook);
        // The tower walks its own path after the king has taken its square, so
        // castling reads as two moves rather than one synchronised slide.
        await this.glide(rook, squareToWorld(event.rook.from), squareToWorld(event.rook.to), false);
        if (this.isStale(revision)) return;
        this.motion.delete(rook);
        this.pieces.set(event.rook.to, rook);
        audio.play("place", 0.4);
        this.landOn(rook, event.rook.to, 0.85);
        void rook.turnHome(this.tweens, 0.3);
      }
    }

    if (event.promotion) {
      piece.dispose();
      this.pieces.delete(event.to);
      const view = this.factory.create(event.promotion, event.color, {
        contactShadows: QUALITY_SETTINGS[this.preset].contactShadows,
        idleAnimation: QUALITY_SETTINGS[this.preset].idleAnimations,
        rankBadge: this.rankBadges,
      });
      if (this.tactical) view.setFlat(true);
      view.container.position.copy(to);
      view.container.scale.setScalar(0.01);
      this.scene.add(view.container);
      this.pieces.set(event.to, view);
      this.effects.spawnBurst(to.clone().setY(0.4), FACTION_ACCENT[event.color], 40, { speed: 2.6, life: 0.8 });
      this.effects.spawnFlash(to.clone().setY(0.6), 2.4, 0.4);
      await this.tweens.to({
        duration: 0.6,
        easing: Ease.outBack,
        onUpdate: (t) => view.container.scale.setScalar(Math.max(0.01, t)),
      });
      if (this.isStale(revision)) return;
      view.container.scale.setScalar(1);
      this.landOn(view, event.to, 1.3);
    }

    this.board.setHighlight(event.from, "last");
    this.board.setHighlight(event.to, "last");
    // A move queued during this beat was wiped by the clear above; it is still
    // waiting, so it goes back on the stone.
    this.applyPremoveHighlight();

    if (event.isCheck) {
      audio.play("check", 0.55);
      // The alarm was already lit by the state publish, but the *declaration* is
      // this beat — the moment the move actually lands on the board — so the
      // surge and the rumble are fired from here rather than from `onState`.
      // A rumble, not a jolt: nothing struck the camera, the hall reacted. Kept
      // deliberately faint and short — enough to be felt at the edge of
      // attention, not enough to move the board under the player's eye.
      this.alarm.strike();
      this.shake.tremor(0.16, 0.6);
    }

    if (
      this.rotateBoard &&
      !this.tactical &&
      this.controller.getSnapshot().mode === "hotseat" &&
      !event.isGameOver
    ) {
      await this.swingCamera();
    }
  }

  /**
   * Both fighters are handed the clips their beat is built on. They are fetched
   * in the background at start-up, but a request dropped during the opening
   * burst would otherwise leave a figure that kills without ever swinging — so
   * a capture asks for them again here, behind a ceiling that keeps a bad
   * network from stopping the game.
   */
  private async armCombat(attacker: PieceView, victim: PieceView): Promise<void> {
    const ready = attacker.hasClip("attack") && (victim.hasClip("death") || !victim.hasAnimations);
    if (ready) return;
    await Promise.race([
      Promise.all([
        this.factory.ensureClip(attacker.color, attacker.kind, "attack"),
        this.factory.ensureClip(victim.color, victim.kind, "death"),
      ]),
      wait(2.4),
    ]);
  }

  /**
   * Hands a figure the stride it is about to move on. The strides are warmed in
   * the background, so without this the first move of a game was made before the
   * walk clip had landed and the figure slid across the board on its stance —
   * which read as a rank having lost its animation altogether. Capped, so a slow
   * network costs the move a fraction of a second rather than stalling the board.
   *
   * @returns whether the clip is now bound to this figure
   */
  private async armStride(piece: PieceView, name: MarchClip): Promise<boolean> {
    if (piece.hasClip(name)) return true;
    await Promise.race([this.factory.ensureClip(piece.color, piece.kind, name), wait(0.6)]);
    return piece.hasClip(name);
  }

  /**
   * Moving a figure between two squares. A rigged sculpt turns to face its
   * destination, crosses the distance on its own legs and puts a real footfall
   * down on every step: the walk clip is retimed to the cadence of its rank, so
   * the skeleton and the stride clock that fires the footstep sounds and the
   * grit puffs are the same clock — nothing skates.
   *
   * The knight keeps its leap and runs through the air instead of walking.
   * Sculpts with no rig (and the low preset, where skeletal animation is off)
   * keep the old smooth slide, but still step audibly so the board is not silent.
   *
   * @param hurry cadence multiplier — above 1 the figure presses forward, which
   *   is what a charge into a standoff needs.
   */
  private async glide(piece: PieceView, from: THREE.Vector3, to: THREE.Vector3, arc: boolean, hurry = 1) {
    const settings = QUALITY_SETTINGS[this.preset];
    const distance = from.distanceTo(to);
    const gait = GAITS[piece.kind];
    // Walking is not a luxury the graphics preset gets to take away: a march is
    // one mixer for a second or two, the same cost as the strike and the death
    // clips that already play on every preset. Only the flat tactical map (where
    // no sculpt is on screen) and a sculpt with no rig at all fall back to a slide.
    const wantsLegs = !this.tactical && piece.hasAnimations;
    // The stride has to be in hand *before* the move is staged, not merely
    // downloaded at some point: the opening move is made seconds after the board
    // stands up, which is exactly when the stride clips are still in the air.
    const clip: MarchClip =
      wantsLegs && arc && (await this.armStride(piece, "run")) ? "run" : "walk";
    const onFoot = wantsLegs && (clip === "run" || (await this.armStride(piece, "walk")));

    // Longer moves take more steps rather than a faster slide.
    const tiles = Math.max(0.6, distance / TILE);
    const steps = Math.max(2, Math.round(tiles * gait.stepsPerTile * (arc ? 0.8 : 1)));
    const cadence = gait.cadence * hurry * (arc ? 1.5 : 1);
    const time = onFoot
      ? THREE.MathUtils.clamp(steps / cadence, 0.34, 2.4)
      : Math.min(0.72, 0.24 + distance * 0.055) / hurry;
    // The realised cadence, after the clamp — this is what the legs must match.
    const stepRate = steps / time;
    const height = arc ? 0.85 + distance * 0.08 : 0.06;
    const trails = settings.captureParticles >= 34 && distance > TILE * 0.6;
    let nextTrail = 0.18;
    // A fraction of a step, so the first boot lands just after the push-off
    // instead of on the frame the figure starts to move.
    let nextStep = 0.34;

    if (arc) {
      // Kicking off: grit thrown back off the tile the rider leaves behind.
      piece.flareAura(0.4);
      this.effects.spawnBurst(from.clone().setY(BOARD_TOP + 0.06), 0xc7ac82, trails ? 10 : 5, {
        speed: 1.4,
        life: 0.4,
      });
    } else if (onFoot) {
      // Nobody walks backwards: square up on the destination before setting off.
      await piece.turnTowards(to, this.tweens, Math.min(0.22, 0.5 / cadence));
    }

    const marching = onFoot && piece.startMarch(clip, stepRate);
    // A ground march holds a constant speed through the middle of the move; a
    // slide and a leap keep their eased curves.
    const easing: Easing = arc
      ? Ease.inOutCubic
      : marching
        ? strideEasing(Math.min(0.3, 1.1 / steps))
        : Ease.inOutQuart;

    await this.tweens.to({
      duration: time,
      easing,
      onUpdate: (t) => {
        piece.container.position.lerpVectors(from, to, t);
        piece.container.position.y = from.y + Math.sin(Math.PI * t) * height;
        // Footfalls: the boot itself, plus the grit it lifts off the stone. The
        // rider is in the air, so its run makes no contact until it lands.
        if (!arc && steps > 0) {
          const taken = t * steps;
          while (taken >= nextStep && nextStep <= steps) {
            this.footfall(piece, gait, Math.round(nextStep), trails);
            nextStep += 1;
          }
        }
        // A thin wake of dust follows a sliding figure or a leaping rider.
        if (trails && !marching && t >= nextTrail && t < 0.88) {
          nextTrail += arc ? 0.2 : 0.24;
          this.effects.spawnSmoke(piece.container.position.clone().setY(BOARD_TOP + 0.07), {
            count: 2,
            radius: 0.22,
            scale: arc ? 0.4 : 0.3,
            growth: 2.1,
            life: 0.55,
            speed: 0.3,
            rise: 0.1,
            color: 0x9d9078,
            opacity: arc ? 0.24 : 0.16,
          });
        }
      },
    });
    piece.container.position.copy(to);
    if (marching) piece.stopMarch(0.2);
    if (arc) this.shake.add(0.05);
  }

  /**
   * One boot going down mid-march: the step itself, panned to where the figure
   * is on screen and pitch-jittered so a long march never turns metronomic,
   * plus a small puff of grit lifted exactly where the foot struck.
   */
  private footfall(piece: PieceView, gait: Gait, index: number, dust: boolean): void {
    const at = piece.container.position;
    audio.footstep({
      pan: this.stereoPan(at),
      timbre: gait.timbre,
      // Alternating feet are never quite equal, and neither are two steps.
      volume: gait.volume * (index % 2 === 0 ? 1 : 0.93),
      jitter: (Math.random() - 0.5) * 0.16,
    });
    if (!dust) return;
    this.effects.spawnSmoke(at.clone().setY(BOARD_TOP + 0.05), {
      count: 2,
      radius: 0.16,
      scale: 0.24 + gait.volume * 0.12,
      growth: 2.2,
      life: 0.5,
      speed: 0.26,
      rise: 0.08,
      color: 0xa2947c,
      opacity: 0.15,
    });
  }

  /**
   * The arrival beat on a destination square: a dust ring rolls out from under
   * the figure, the tile dips, the team aura flares and the body takes the
   * weight with a short squash that springs back. `weight` scales the whole
   * thing — a knight dropping out of its arc lands harder than a bishop slid
   * across the board, and a victor stepping onto a corpse lands softer still.
   */
  private landOn(piece: PieceView, square: SquareId, weight = 1): void {
    const settings = QUALITY_SETTINGS[this.preset];
    const heavy = piece.kind === "k" || piece.kind === "q" || piece.kind === "r";
    const strength = Math.min(1.6, weight * (heavy ? 1.18 : 0.92));
    const centre = squareToWorld(square, BOARD_TOP + 0.05);

    this.board.land(square, FACTION_ACCENT[piece.color], strength);
    this.woodKnock(piece, centre, strength);
    this.landingSteps(piece, centre, strength);
    piece.flareAura(Math.min(1, 0.8 * strength));
    if (strength > 0.9) this.shake.add(0.035 * strength);

    const grit = Math.max(5, Math.round(settings.captureParticles * 0.2 * strength));
    this.effects.spawnBurst(centre, 0xd9bd8e, grit, { speed: 1.15 * strength, life: 0.45 });
    if (settings.captureParticles >= 34) {
      this.effects.spawnSmoke(centre.clone().setY(BOARD_TOP + 0.08), {
        count: Math.max(2, Math.round(grit * 0.25)),
        radius: 0.42,
        scale: 0.42,
        growth: 2.5,
        life: 0.75,
        speed: 0.6 * strength,
        rise: 0.1,
        color: 0xa2947c,
        opacity: 0.26,
      });
    }

    void this.settle(piece, strength);
  }

  /**
   * The soft wooden tock of a figure meeting the board, panned to the square it
   * lands on. Heavier ranks knock lower and longer; a light touch-down (a victor
   * stepping onto a cleared square) barely registers.
   */
  private woodKnock(piece: PieceView, at: THREE.Vector3, strength: number): void {
    audio.woodTap({
      pan: this.stereoPan(at),
      weight: WOOD_WEIGHT[piece.kind],
      volume: Math.min(1.05, 0.5 + strength * 0.42),
    });
  }

  /**
   * Boots taking the square. Everyone puts one foot down as they arrive; the
   * rider drops out of its leap onto both, a beat apart, which is what makes
   * the landing read as weight rather than a touch-down.
   */
  private landingSteps(piece: PieceView, at: THREE.Vector3, strength: number): void {
    const gait = GAITS[piece.kind];
    const pan = this.stereoPan(at);
    const volume = gait.volume * Math.min(1.4, 0.85 + strength * 0.45);
    audio.footstep({ pan, timbre: gait.timbre, volume });
    if (piece.kind !== "n") return;
    audio.footstep({ pan, timbre: gait.timbre, volume: volume * 1.15, delay: 0.07, jitter: -0.09 });
  }

  /**
   * The square changing hands.
   *
   * Every kill on this board already had a *violent* punctuation — the blow, the
   * cry, the body thrown clear — but the thing that actually wins a game of
   * chess happened silently: a figure stepped onto a square that belonged to
   * somebody else and the board sounded exactly as it does on a quiet move.
   * This is that moment given its own beat, and it is deliberately small: the
   * fight was the spectacle, this is the full stop after it.
   *
   * Three things, all keyed to what was taken rather than to who took it (see
   * {@link CONQUEST_WEIGHT}), so trading a pawn never sounds like felling a queen:
   *
   * - the claim signature — a boot on the stone under a rising brass motif;
   * - the victor's colours closing inward over the tile it has just cleared;
   * - the figure itself drawing up to its full height on the new square.
   */
  private claimSquare(victor: PieceView, square: SquareId, taken: PieceKind): void {
    const settings = QUALITY_SETTINGS[this.preset];
    const weight = CONQUEST_WEIGHT[taken];
    const accent = FACTION_ACCENT[victor.color];
    const centre = squareToWorld(square, BOARD_TOP + 0.032);

    audio.conquest({
      pan: this.stereoPan(centre),
      weight,
      volume: 0.78 + weight * 0.3,
    });

    void spawnConquestClaim(this.scene, this.tweens, centre, {
      color: accent,
      radius: TILE * (2.1 + weight * 0.7),
      height: BOARD_TOP + 0.028,
      weight,
    });

    // Chips of the old occupant's tile thrown up as the mark seals — fired on a
    // short delay so they land with the ring closing, not with the footfall.
    const chips = Math.max(4, Math.round(settings.captureParticles * (0.16 + weight * 0.16)));
    void (async () => {
      await wait(0.26);
      if (this.disposed) return;
      this.effects.spawnBurst(centre.clone().setY(BOARD_TOP + 0.1), accent, chips, {
        speed: 0.9 + weight * 0.7,
        life: 0.6,
        gravity: 2.6,
        radius: 0.34,
        size: 0.1,
        growth: 0.6,
        rise: 0.5,
        drag: 1.2,
      });
      this.effects.spawnFlash(centre.clone().setY(BOARD_TOP + 0.18), 1.1 + weight * 0.9, 0.26);
    })();

    // The team ring under the figure answers its own colour arriving.
    victor.flareAura(Math.min(1.5, 1 + weight * 0.5));
    void this.drawUp(victor, weight);
  }

  /**
   * The victor drawing itself up on the square it has taken: the shoulders come
   * back off the blow for a beat and spring level again. Driven off the runtime
   * node rather than a clip, so every figure gets it — rigged or not, and
   * whichever of the three battle beats it just finished.
   *
   * Deliberately a *lean*, not a pose: it has to finish inside the pause before
   * the opponent replies, or the board reads as waiting for a victory dance.
   */
  private async drawUp(piece: PieceView, weight: number): Promise<void> {
    const lean = 0.045 + weight * 0.055;
    await this.tweens.to({
      duration: 0.13,
      easing: Ease.outCubic,
      onUpdate: (t) => piece.setStrikeTilt(-lean * t),
    });
    await this.tweens.to({
      duration: 0.5,
      easing: Ease.outElastic,
      onUpdate: (t) => piece.setStrikeTilt(-lean * (1 - t)),
    });
    piece.setStrikeTilt(0);
  }

  /** Knees taking the load: a fast compression that springs back out. */
  private async settle(piece: PieceView, strength: number): Promise<void> {
    const depth = Math.min(1, 0.5 + strength * 0.45);
    await this.tweens.to({
      duration: 0.09,
      easing: Ease.outCubic,
      onUpdate: (t) => piece.setSquash(depth * t),
    });
    await this.tweens.to({
      duration: 0.62,
      easing: Ease.outElastic,
      onUpdate: (t) => piece.setSquash(depth * (1 - t)),
    });
    piece.setSquash(0);
  }

  /**
   * The hand-to-hand battle beat: charge, square up, strike, crumble. How hard
   * it hits is read out of {@link STRIKES} for the attacking rank, so the same
   * choreography carries a footsoldier's stab and a royal execution without
   * either one borrowing the other's weight.
   */
  private async playCaptureCinematic(
    attacker: PieceView,
    victim: PieceView,
    from: THREE.Vector3,
    to: THREE.Vector3,
    strikeSquare: SquareId,
  ): Promise<void> {
    const profile = STRIKES[attacker.kind];
    const settings = QUALITY_SETTINGS[this.preset];
    const direction = to.clone().sub(from).normalize();
    const standoff = to.clone().sub(direction.clone().multiplyScalar(TILE * 0.52));
    // The fight is the shot: frame the two bodies and pull the rig in.
    this.focusPoint(standoff.clone().lerp(to, 0.5), 0.68);
    // En passant kills a pawn on a different square than the one moved to.
    const victimSpot = victim.container.position.clone();
    const blow = victimSpot.clone().sub(standoff).setY(0);
    if (blow.lengthSq() < 1e-6) blow.copy(direction);
    blow.normalize();

    const punch = this.lensPunch(profile.zoom);
    void this.tweens.to({
      duration: 0.22,
      easing: Ease.outCubic,
      onUpdate: (t) => {
        this.camera.fov = this.lensFov - punch * t;
        this.camera.updateProjectionMatrix();
      },
    });

    // Both fighters square up: the attacker charges in, the defender turns to
    // meet its killer so the blow never lands on the back of a head.
    await Promise.all([
      // Pressing forward into the blow: the same march, a quicker cadence.
      this.glide(attacker, from, standoff, attacker.kind === "n", profile.charge),
      victim.turnTowards(standoff, this.tweens, 0.3),
    ]);
    attacker.faceTowards(victimSpot);
    // Arrival beat: the march has stopped and the figure is squared up on its
    // target. A held breath here is what makes the blow read as its own action
    // rather than the tail of the walk. The heavier the rank, the longer it
    // stands there before it commits.
    await wait(profile.wind);

    // Sentence before execution: the crown drops a column of light on the
    // condemned and the hall is told what is coming.
    if (profile.pillar) await this.passSentence(victim, victimSpot, profile.pillar, settings.postFx);

    // Strike: the skeletal attack clip when the rig carries one, otherwise a
    // wind-up and lunge driven off the runtime node so the board anchor stays
    // put. Note this asks for the clip itself, not merely for a rig — a figure
    // whose strike failed to download must still visibly attack.
    const strike = attacker.hasClip("attack") ? attacker.playAttack() : null;
    if (profile.swing > 0) {
      // The weapon is heard coming round just before it arrives.
      const lead = strike && strike.duration > 0 ? Math.max(0, strike.impact - 0.18) : 0.05;
      audio.bladeWhoosh({
        pan: this.stereoPan(standoff),
        volume: profile.swing,
        weight: profile.heft,
        delay: lead,
      });
    }
    if (strike && strike.duration > 0) await wait(strike.impact);
    else await this.lunge(attacker, direction, profile.heft);

    const impact = victimSpot.clone().setY(0.55);
    const power = profile.power;
    audio.play("capture", Math.min(1, 0.85 * power));
    // The board itself is capped: past a point the tiles stop reading as stone.
    this.strikeImpact(strikeSquare, Math.min(1.5, power));
    this.effects.spawnFlash(impact, Math.min(4.4, 2.2 * power), 0.24);
    this.effects.spawnBurst(impact, 0xffc978, Math.round(settings.captureParticles * power), {
      speed: 3.4 * (0.9 + power * 0.1),
      life: 0.75,
    });
    this.shake.add(Math.min(1, 0.55 * power));

    // Steel: the cut hangs in the air for a couple of frames after the blade.
    if (profile.slash) {
      void spawnSlash(this.scene, this.tweens, impact, {
        color: profile.slash.color,
        size: profile.slash.size,
        tilt: -0.55 - Math.random() * 0.35,
      });
    }

    // Weight: a blow that carries into the floor sends a wave across the stone.
    if (profile.wave) {
      audio.groundSlam({ pan: this.stereoPan(victimSpot), volume: Math.min(1, power * 0.6) });
      void spawnGroundWave(this.scene, this.tweens, victimSpot, {
        color: profile.wave.color,
        radius: profile.wave.radius,
        height: BOARD_TOP + 0.03,
        echo: profile.aftershock > 0.2,
      });
      this.effects.spawnSmoke(victimSpot.clone().setY(BOARD_TOP + 0.14), {
        count: Math.max(4, Math.round(settings.captureParticles * 0.3)),
        radius: 0.5,
        scale: 0.8,
        growth: 3.2,
        life: 1.2,
        speed: 2.4,
        rise: 0.1,
        color: 0x9c8f7d,
        opacity: 0.5,
      });
    }

    // A charge does not stop where it strikes: dust keeps going past the body.
    if (profile.wake) {
      this.effects.spawnSmoke(standoff.clone().setY(BOARD_TOP + 0.12), {
        count: Math.max(3, Math.round(settings.captureParticles * 0.2)),
        radius: 0.34,
        scale: 0.6,
        growth: 2.8,
        life: 0.9,
        speed: 0.8,
        rise: 0.15,
        color: 0xa5977f,
        opacity: 0.4,
        drift: direction.clone().multiplyScalar(2.1),
      });
    }

    // Hitstop: on a heavy blow the whole beat holds for a frame or two on
    // contact, which is what makes the hit feel like it connected with mass.
    if (profile.hold > 0) await wait(profile.hold);

    if (!strike || strike.duration === 0) this.recover(attacker, direction, profile.heft);

    // The hall answers a beat later.
    if (profile.aftershock > 0) void this.aftershock(strikeSquare, profile.aftershock);

    // The defender goes down while the attacker finishes following through.
    const recovery = strike ? Math.min(0.45, Math.max(0, strike.duration - strike.impact)) : 0.18;
    await Promise.all([this.slay(victim, blow), wait(recovery)]);

    void this.tweens.to({
      duration: 0.45,
      easing: Ease.outCubic,
      onUpdate: (t) => {
        this.camera.fov = this.lensFov - punch * (1 - t);
        this.camera.updateProjectionMatrix();
      },
    });

    // The corpse is thrown clear in smoke as the victor takes the square. The
    // arrival itself is punctuated by the claim beat (see `claimSquare`), not by
    // the generic set-down clack a quiet move gets.
    await Promise.all([
      this.banish(victim, blow),
      // The last stride onto the square it has just cleared.
      this.glide(attacker, standoff, to, false, 1.5),
    ]);
  }

  /**
   * The crown's prerogative: before the blow, a column of light is dropped on
   * the condemned, a bell is rung over it, and motes are drawn up off the stone
   * around its feet. Nothing else on the board is allowed this beat.
   */
  private async passSentence(
    victim: PieceView,
    at: THREE.Vector3,
    pillar: { radius: number; color: number },
    withLight: boolean,
  ): Promise<void> {
    const settings = QUALITY_SETTINGS[this.preset];
    audio.judgementToll({ pan: this.stereoPan(at), volume: 0.95 });
    void spawnPillar(this.scene, this.tweens, at, {
      color: pillar.color,
      radius: pillar.radius,
      height: 5.6,
      floor: BOARD_TOP,
      hold: 0.46,
      light: withLight ? this.spellLights.acquire(pillar.color, 5.2) : null,
    });
    // Light pulling the dust up off the floor around the condemned.
    this.effects.spawnBurst(at.clone().setY(BOARD_TOP + 0.1), 0xffe6b4, Math.round(settings.captureParticles * 0.4), {
      speed: 0.5,
      life: 1,
      gravity: -1.6,
      radius: pillar.radius * 0.9,
      size: 0.08,
      growth: 0.4,
      drag: 1.4,
      rise: 0.7,
    });
    victim.flareAura(0.8);
    await wait(0.36);
  }

  /**
   * The stone still moving after a heavy blow: a second, softer kick through the
   * tiles and a low cloud of grit rolling off the square.
   */
  private async aftershock(square: SquareId, strength: number): Promise<void> {
    await wait(0.18);
    const settings = QUALITY_SETTINGS[this.preset];
    this.shake.add(strength);
    this.board.impact(square, 0xffa457, strength * 0.7);
    const ground = squareToWorld(square, BOARD_TOP + 0.06);
    this.effects.spawnBurst(ground, 0xd8b285, Math.round(settings.captureParticles * 0.3), {
      speed: 1.4,
      life: 0.9,
      gravity: 2.2,
      radius: 0.55,
    });
  }

  /**
   * The caster's beat. Nothing about this fight is fought at arm's length: the
   * sorceress and the mage stay on their own square, level the staff down the
   * line, gather fire at the crystal and throw it. The target burns where it
   * stands — and only once the body is gone does the caster walk the whole
   * distance and take the square, footsteps and all.
   */
  private async playSpellCinematic(
    attacker: PieceView,
    victim: PieceView,
    from: THREE.Vector3,
    to: THREE.Vector3,
    strikeSquare: SquareId,
  ): Promise<void> {
    // En passant aside, the victim stands on the destination square; either way
    // the fire flies at the body, and the blast throws it away from the caster.
    const victimSpot = victim.container.position.clone();
    const blow = victimSpot.clone().sub(from).setY(0);
    if (blow.lengthSq() < 1e-6) blow.copy(to.clone().sub(from).setY(0));
    if (blow.lengthSq() < 1e-6) blow.set(0, 0, 1);
    blow.normalize();

    const spell = spellProfile(attacker.kind);
    // A duel at range: hold both ends of the bolt in frame.
    this.focusPoint(from.clone().lerp(victimSpot, 0.55), 0.92);
    const punch = this.lensPunch(spell.zoom);
    void this.tweens.to({
      duration: 0.28,
      easing: Ease.outCubic,
      onUpdate: (t) => {
        this.camera.fov = this.lensFov - punch * t;
        this.camera.updateProjectionMatrix();
      },
    });

    // The caster levels its staff; the target sees what is coming for it.
    await Promise.all([
      attacker.turnTowards(victimSpot, this.tweens, 0.34),
      victim.turnTowards(from, this.tweens, 0.32),
    ]);
    attacker.faceTowards(victimSpot);

    // The strike clip doubles as the incantation: fire builds at the crystal
    // right up to the frame the clip would have landed its blow. The sorceress
    // holds hers longer, and holds far more of it.
    const cast = attacker.hasClip("attack") ? attacker.playAttack() : null;
    const gather = (cast && cast.duration > 0 ? Math.max(0.34, cast.impact) : 0.55) + spell.gather;
    // No cast clip on this rig: the body does the casting instead of the
    // skeleton — it leans back over the fire it is gathering.
    const byHand = !cast || cast.duration <= 0;
    if (byHand) void this.castWind(attacker, gather);
    await this.gatherSpell(attacker, gather, spell.orb);
    // ...and throws itself after the bolt as it leaves the staff.
    if (byHand) this.castRelease(attacker, blow);

    const impact = victimSpot.clone().setY(0.62);
    if (spell.bolts > 1) {
      // A volley: leaders go first and break on the body, the killing bolt lands
      // behind them and is the one that takes the square.
      const leaders: Promise<void>[] = [];
      for (let i = 0; i < spell.bolts - 1; i += 1) {
        leaders.push(this.throwFireball(attacker, impact, { size: 0.34, delay: i * 0.11, leader: true }));
      }
      await wait(0.18);
      await this.throwFireball(attacker, impact, { size: 0.64 });
      await Promise.all(leaders);
    } else {
      await this.throwFireball(attacker, impact);
    }
    this.spellBurst(attacker.color, impact, strikeSquare, spell.blast, spell.ring);

    // Dead before the caster has taken a single step.
    await this.slay(victim, blow);

    void this.tweens.to({
      duration: 0.45,
      easing: Ease.outCubic,
      onUpdate: (t) => {
        this.camera.fov = this.lensFov - punch * (1 - t);
        this.camera.updateProjectionMatrix();
      },
    });

    // The body is cleared off the board, and only then is the square walked to.
    await this.banish(victim, blow);
    if (cast) attacker.playIdle(0.2);
    this.focusPiece(attacker, 0.94);
    await this.glide(attacker, from, to, false, 1.15);
  }

  /**
   * The gunpowder beat. The Grande Armée never walks into a fight it can settle
   * from where it stands: the barrel is levelled, the hammer goes back, the
   * shot crosses the board flat and fast, and the body is already down and
   * cleared before the shooter takes a single step onto the square. Which
   * barrel is doing the talking is read out of {@link GUNS} for the rank — the
   * Emperor's flintlock, the line's musket, or the battery's field gun.
   */
  private async playGunCinematic(
    attacker: PieceView,
    victim: PieceView,
    from: THREE.Vector3,
    to: THREE.Vector3,
    strikeSquare: SquareId,
  ): Promise<void> {
    const gun = GUNS[attacker.kind];
    const settings = QUALITY_SETTINGS[this.preset];
    const look = GUN_LOOK[attacker.color];

    // En passant aside the victim stands on the destination square; either way
    // the ball flies at the body and throws it away from the shooter.
    const victimSpot = victim.container.position.clone();
    const blow = victimSpot.clone().sub(from).setY(0);
    if (blow.lengthSq() < 1e-6) blow.copy(to.clone().sub(from).setY(0));
    if (blow.lengthSq() < 1e-6) blow.set(0, 0, 1);
    blow.normalize();

    // A duel at range: hold both ends of the shot in frame.
    this.focusPoint(from.clone().lerp(victimSpot, 0.55), 0.92);
    const punch = this.lensPunch(gun.zoom);

    void this.tweens.to({
      duration: 0.26,
      easing: Ease.outCubic,
      onUpdate: (t) => {
        this.camera.fov = this.lensFov - punch * t;
        this.camera.updateProjectionMatrix();
      },
    });

    // The barrel comes round; the target sees what is pointed at it.
    await Promise.all([
      attacker.turnTowards(victimSpot, this.tweens, 0.32),
      victim.turnTowards(from, this.tweens, 0.32),
    ]);
    attacker.faceTowards(victimSpot);

    // Lock, ramrod or linstock: the mechanical tick that says "firearm".
    audio.gunLock({
      pan: this.stereoPan(from),
      weight: gun.calibre,
      volume: 0.5 + gun.calibre * 0.5,
    });

    // ---- going down on the knee ----------------------------------------
    // A kneeling gunner gets there before anything else happens, and he gets
    // there on an articulated clip (the rise run backwards) rather than by being
    // blended downwards, so the knee plants on the stone instead of the whole
    // body sinking through it.
    const kneeling = gun.stance.kneel;
    if (kneeling) {
      const drop = attacker.playKneel(gun.stance.drop);
      if (drop > 0) {
        // The knee and the hand taking the weight of the rifle, on the frame the
        // stone is actually reached.
        audio.footstep({
          pan: this.stereoPan(from),
          timbre: "scuff",
          volume: 0.42,
          delay: drop * 0.82,
          jitter: -0.3,
        });
        await wait(drop);
      }
    }

    // ---- taking aim ----------------------------------------------------
    // The weapon comes up and is held on the body. A rig that carries a sight
    // picture loops it here; one that does not leans into the shot by hand, so
    // every gunner is visibly aiming before anything is fired.
    const aiming = attacker.playAim(kneeling ? 0.3 : 0.18);
    if (!aiming) {
      void this.tweens.to({
        duration: Math.max(0.12, gun.aim),
        easing: Ease.outCubic,
        onUpdate: (t) => attacker.setStrikeTilt(-0.1 * t),
      });
    }
    await wait(gun.aim);

    // ---- the drill -----------------------------------------------------
    // A standing gunner plays his firing clip at its own readable length (see
    // GunProfile.drill) and the shot leaves on the frame the hammer falls, not
    // halfway through the wind-up.
    //
    // A kneeling gunner plays no firing clip at all, on purpose: every shooting
    // take the generator produces starts and ends on its feet, so playing one out
    // of a kneel had him stand up to fire and drop back down afterwards — the
    // bobbing this branch exists to stop. He fires out of the held kneel, and the
    // whole shot (trigger, report, recoil) is timed off the drill numbers rather
    // than off a clip. A rig whose clip never arrived levels the barrel by hand.
    const fire = !kneeling && attacker.hasClip("attack")
      ? attacker.playAttack({ seconds: gun.drill.seconds, impactAt: gun.drill.impact })
      : null;
    const byHand = !fire || fire.duration <= 0;
    // Without a clip the beat still keeps the barrel's authored spacing: the
    // marksman's held sights are a second of stillness, not a third of one.
    const untilShot = byHand
      ? Math.max(0.24, gun.drill.seconds * gun.drill.impact * (kneeling ? 1 : 0.32))
      : fire.impact;
    if (byHand) {
      // The lean is no longer awaited: the two waits below own the clock, so the
      // trigger and the report keep their spacing whether or not a clip arrived.
      // A kneeling shooter is braced against his own leg, so he settles onto the
      // sights instead of leaning into them.
      const settle = kneeling ? -0.05 : -0.14 * (aiming ? 1 : 0.6);
      void this.tweens.to({
        duration: untilShot,
        easing: Ease.outCubic,
        onUpdate: (t) => attacker.setStrikeTilt(settle - (kneeling ? 0.02 : 0.06) * t),
      });
    }

    // ---- the trigger ---------------------------------------------------
    // A muzzle-loader is two sounds, not one. The sear breaks, the flint rakes
    // the frizzen and the pan flashes; the charge in the barrel lights one lock
    // time later. So the mechanical half is played `gun.lock` seconds *before*
    // the report, and the report itself still lands on the authored ignition
    // frame alongside the muzzle flash. That is what makes the shot audibly
    // belong to the finger that pulled it rather than merely happening near it.
    const lock = Math.min(gun.lock, untilShot * 0.5);
    await wait(untilShot - lock);
    audio.triggerPull({
      pan: this.stereoPan(attacker.muzzleOrigin()),
      weight: gun.calibre,
      volume: 0.8 + gun.calibre * 0.4,
    });
    await wait(lock);

    // ---- the shot ------------------------------------------------------
    const muzzle = attacker.muzzleOrigin();
    const chest = victimSpot.clone().setY(0.58);
    const line = chest.clone().sub(muzzle);
    const distance = Math.max(0.001, line.length());
    const aim = line.divideScalar(distance);

    audio.gunshot({
      pan: this.stereoPan(muzzle),
      weight: gun.calibre,
      volume: 1,
      voice: gun.voice,
    });
    this.shake.add(Math.min(1, 0.3 + gun.calibre * 0.7));

    // Flame width is read off the round that is about to leave the bore, so the
    // charge always out-shines its own projectile.
    const flame = muzzleFlare(gun);
    void spawnMuzzleFlash(this.scene, this.tweens, muzzle, {
      look,
      size: flame,
      direction: aim,
      // Held a shade longer than before: the flash now has an ignition plateau to
      // sit on, and a couple of extra frames is the difference between a shot you
      // see and a shot you only hear.
      life: 0.12 + gun.calibre * 0.07,
      // A wider sheet of flame throws light further into the hall, so the
      // borrowed slot's reach grows with the charge rather than staying fixed.
      light: settings.postFx ? this.spellLights.acquire(look.light, 4.4 + flame * 2.6) : null,
    });
    // A smoothbore leaves soot in the faction's livery tint; the marksman's
    // rifled barrel leaves pale ash grey you can see the hall through.
    const powder = gun.smokeTint ?? look.smoke;
    void spawnPowderCloud(this.scene, this.tweens, muzzle, {
      look,
      size: 0.34 + gun.calibre * 0.7,
      direction: aim,
      count: Math.max(3, Math.round(gun.smoke * (settings.captureParticles >= 34 ? 1 : 0.55))),
      life: gun.smokeHang,
      tint: powder,
      density: gun.smokeDensity,
      fine: gun.fineSmoke,
      // Carried off the square by the hall's air and rolled out along the stone
      // rather than sinking through it.
      draft: HALL_DRAFT,
      floor: BOARD_TOP + 0.05,
    });
    // The bore goes on smoking in his hands after the crack — emitted at the live
    // muzzle, so it stays with the barrel as the weapon comes down.
    this.boreTrickle(attacker, gun, powder);
    // Sparks and burning grains thrown out of the pan and the bore. Sized off the
    // flame rather than off a constant, so the grains stay in scale with it: a
    // field gun throws visible embers, a pistol lock throws a pinch of them.
    this.effects.spawnBurst(muzzle, look.ball, Math.round(settings.captureParticles * 0.44 * (0.5 + gun.calibre)), {
      speed: 2.6 + gun.calibre * 3,
      life: 0.55,
      gravity: 2.4,
      radius: 0.06 + flame * 0.06,
      size: 0.07 + flame * 0.055,
      drag: 2.4,
    });

    // Recoil: the body rocks back off the shot, and a towed gun runs back on
    // its wheels before the crew heaves it up to the mark again.
    this.kickBack(attacker, blow, gun);

    // Shot travels flat: no arc, no easing. Which round crosses the hall — a cast
    // lead ball that wanders, a rifled Minié that does not, or a glowing lump of
    // iron — is read off the barrel's loadout.
    //
    // The round leaves from just clear of the bore rather than from the muzzle
    // point itself: started dead on the muzzle it spawns inside the flash and the
    // powder bank, and the first third of its flight is invisible.
    // With a bigger flame this offset has to grow with it, or the round spends its
    // opening frames inside the fire it was launched by.
    const clear = muzzle.clone().addScaledVector(aim, Math.min(0.42, flame * 0.44));
    const smoking = settings.captureParticles >= 34;
    let nextWisp = 0.12;
    await flyShot(this.scene, this.tweens, clear, chest, {
      look,
      ammo: gun.ammo,
      size: gun.ball,
      flight: THREE.MathUtils.clamp((distance / TILE) * gun.speed, 0.17, 0.58),
      light: gun.ammo === "roundShot" && settings.postFx ? this.spellLights.acquire(0xff7a2e, 3.2) : null,
      // The streak along the path the round flew — the thing that makes a shot
      // followable rather than merely audible. Its spine resolution is the one
      // cost that scales with the preset.
      trailDetail: trailRings(settings.captureParticles),
      onTrail: (at, t) => {
        if (!smoking || t < nextWisp) return;
        nextWisp += 0.22;
        this.effects.spawnSmoke(at.clone(), {
          count: 1,
          radius: 0.06,
          scale: (0.2 + gun.calibre * 0.22) * (gun.fineSmoke ? 0.75 : 1),
          growth: 2.4,
          life: gun.fineSmoke ? 0.34 : 0.5,
          speed: 0.2,
          rise: gun.fineSmoke ? 0.3 : 0.16,
          color: powder,
          opacity: 0.2,
        });
      },
    });

    // ---- the hit -------------------------------------------------------
    const power = gun.blast;
    // The ball arriving, ahead of the generic capture hit: whine into a thud.
    audio.ballImpact({ pan: this.stereoPan(chest), volume: Math.min(1.1, 0.7 + gun.calibre * 0.5) });
    audio.play("capture", Math.min(1, 0.7 * power));
    this.strikeImpact(strikeSquare, Math.min(1.5, power));
    this.effects.spawnFlash(chest, Math.min(4.6, 1.9 * power), 0.2);

    // The moment itself: the body breaks open where the round went in. Which
    // debris comes off it is read off the victim rather than off the shooter —
    // kingdom marble chips, Sun Empire obsidian flakes, steel spall off a
    // cuirass, or wool and gilt braid off a Grande Armée coat. The round decides
    // how hard: a pistol ball barely marks the stone, a six-pounder guts it.
    const round = AMMUNITION[gun.ammo];
    const body = this.impactBody(victim);
    const violence = round.shatter * (0.75 + power * 0.25);
    void spawnImpactShatter(this.scene, this.tweens, chest, {
      body,
      along: aim,
      power: violence,
      floor: BOARD_TOP,
      through: round.through,
      budget: Math.round(settings.captureParticles * 0.85),
      light: settings.postFx ? this.spellLights.acquire(0xffd7a0, 3.4) : null,
    });
    // A thinner warm burst on top of the debris: the powder that came with the
    // round, not the round itself.
    this.effects.spawnBurst(chest, look.flash, Math.round(settings.captureParticles * 0.34 * power), {
      speed: 3.6 * (0.9 + power * 0.1),
      life: 0.45,
      gravity: 2.2,
      radius: 0.1,
      drag: 2.6,
    });
    // The haze the wreckage lifts is the colour of what just broke.
    this.effects.spawnSmoke(chest, {
      count: Math.max(2, Math.round(settings.captureParticles * 0.14 * power)),
      radius: 0.24 * power,
      scale: 0.45 * power,
      growth: 2.6,
      life: 0.9,
      speed: 1,
      rise: 0.5,
      color: impactDust(body),
      opacity: 0.4,
    });
    this.shake.add(Math.min(1, 0.3 * power));

    // Solid shot does not stay in the man it hits. A six-pound lump of iron
    // carries clean through and goes on to skip off the stone behind him, which
    // is the one thing that tells the eye this was a cannon and not a big musket.
    if (gun.ammo === "roundShot") {
      const beyond = chest.clone().addScaledVector(aim, TILE * 1.7).setY(BOARD_TOP + 0.05);
      void (async () => {
        await flyShot(this.scene, this.tweens, chest, beyond, {
          look,
          ammo: gun.ammo,
          size: gun.ball,
          flight: 0.24,
          light: null,
          trailDetail: trailRings(settings.captureParticles),
        });
        audio.ballImpact({ pan: this.stereoPan(beyond), volume: 0.42 });
        // Hot iron on flagstone: the ricochet throws stone chips and a long
        // shower of sparks that skitter away across the floor.
        void spawnImpactShatter(this.scene, this.tweens, beyond, {
          body: "flagstone",
          // Skipping off the floor, so the spall comes up out of the stone.
          along: aim.clone().setY(-0.75).normalize(),
          power: 1.5,
          floor: BOARD_TOP,
          through: false,
          budget: Math.round(settings.captureParticles * 0.5),
          light: null,
        });
        this.effects.spawnSmoke(beyond, {
          count: 2,
          radius: 0.2,
          scale: 0.5,
          growth: 2.8,
          life: 0.8,
          speed: 0.9,
          rise: 0.35,
          color: 0x9a8f7e,
          opacity: 0.3,
        });
      })();
    }

    // A field gun does not stop at the body: the stone takes the rest of it.
    if (gun.wave) {
      audio.groundSlam({ pan: this.stereoPan(victimSpot), volume: Math.min(1, power * 0.5) });
      void spawnGroundWave(this.scene, this.tweens, victimSpot, {
        color: gun.wave.color,
        radius: gun.wave.radius,
        height: BOARD_TOP + 0.03,
        echo: true,
      });
      this.effects.spawnSmoke(victimSpot.clone().setY(BOARD_TOP + 0.12), {
        count: Math.max(4, Math.round(settings.captureParticles * 0.28)),
        radius: 0.52,
        scale: 0.8,
        growth: 3.2,
        life: 1.3,
        speed: 2.2,
        rise: 0.1,
        color: 0x9c8f7d,
        opacity: 0.5,
      });
    }

    if (gun.hold > 0) await wait(gun.hold);
    if (gun.aftershock > 0) void this.aftershock(strikeSquare, gun.aftershock);

    // The sight picture stops sweeping the moment the shot is away: a man who
    // has fired watches what he hit. The kneel is held — nothing about the body
    // changes between the report and the man across the board going down.
    if (aiming) attacker.setAimDrift(0.18);

    // Shot dead where it stood, before the shooter has moved a boot.
    await this.slay(victim, blow);

    void this.tweens.to({
      duration: 0.45,
      easing: Ease.outCubic,
      onUpdate: (t) => {
        this.camera.fov = this.lensFov - punch * (1 - t);
        this.camera.updateProjectionMatrix();
      },
    });

    // The body is cleared while the gun is served again — nobody advances on a
    // square with an empty barrel. A kneeling gunner reloads *on the knee* he
    // fired from and is not stood up by that beat.
    await Promise.all([this.banish(victim, blow), this.reload(attacker, gun)]);

    // ...then, and only then, he comes up off the stone.
    if (kneeling) await this.riseToFeet(attacker, from);

    // ...and only now is the square walked to.
    this.focusPiece(attacker, 0.94);
    await this.glide(attacker, from, to, false, 1.1);
  }

  /**
   * Up off the knee, once the shot is over and the body is gone.
   *
   * This is deliberately its own beat rather than a side effect of the reload or
   * of the march: the whole point of the kneeling shot is that the man holds one
   * stance from the moment he goes down until the moment there is nothing left to
   * shoot at. Standing up is the *reward* for that, so it is allowed the time it
   * takes and is heard — the boot taking his weight as the leg straightens.
   *
   * A rig whose rise clip has not landed falls back to a long crossfade into the
   * stance, which is slower than the old 0.22s snap and reads as getting up
   * rather than as popping upright.
   */
  private async riseToFeet(attacker: PieceView, at: THREE.Vector3): Promise<void> {
    const pan = this.stereoPan(at);
    const length = attacker.playRise(0.95);
    if (length <= 0) {
      attacker.playIdle(0.5);
      await wait(0.4);
      return;
    }
    audio.footstep({ pan, timbre: "scuff", volume: 0.5, delay: length * 0.55, jitter: -0.2 });
    await wait(length);
    // The clip is clamped on its standing frame, so the stance blends out of a
    // body that is already on its feet.
    attacker.playIdle(0.2);
  }

  /**
   * The barrel still smoking after the shot.
   *
   * The powder bank is made once, at the point the gun was fired, and left in
   * the air — which is right, because air does not follow a man around. But a
   * fouled bore keeps venting for a second or two afterwards, and *that* smoke
   * belongs to the weapon: it has to come out of the muzzle wherever the muzzle
   * has got to. So the wisps are emitted on a clock, each one reading
   * {@link PieceView.muzzleOrigin} at the moment it is made, and the thread of
   * smoke visibly trails the barrel as the marksman brings his rifle down out of
   * the kneel.
   *
   * Each wisp is thinner and slower than the last: the bore is cooling.
   */
  private boreTrickle(attacker: PieceView, gun: GunProfile, tint: number): void {
    const settings = QUALITY_SETTINGS[this.preset];
    // The lowest preset has no budget for smoke that is not part of the kill.
    if (settings.captureParticles < 34 || gun.boreSmoke.wisps <= 0) return;
    const { seconds, wisps } = gun.boreSmoke;
    const width = 0.1 + gun.calibre * 0.18;
    let next = 0;
    void this.tweens.to({
      duration: seconds,
      easing: (t: number) => t,
      onUpdate: (t: number) => {
        if (t < next) return;
        next += 1 / wisps;
        // 0 on the frame after the shot, 1 as the bore goes cold.
        const cooling = Math.min(1, t);
        this.effects.spawnSmoke(attacker.muzzleOrigin(), {
          count: 1,
          radius: width * 0.5,
          scale: width * (0.7 + cooling * 0.75),
          growth: 2.9,
          // The last threads hang around longest — they have the least to lose.
          life: (gun.fineSmoke ? 0.85 : 1.1) * (0.8 + cooling * 0.7),
          // Barely pushed: this is leaking out of the bore, not being blown out.
          speed: 0.16 * (1 - cooling * 0.5),
          rise: (gun.fineSmoke ? 0.34 : 0.24) * (1 - cooling * 0.3),
          color: tint,
          opacity: (gun.fineSmoke ? 0.2 : 0.28) * (1 - cooling * 0.55),
          drift: HALL_DRAFT,
        });
      },
    });
  }

  /**
   * Recoil. The shooter rocks back off the shot and settles; a towed gun runs
   * back hard on its wheels and is heaved up to the mark again, which is what
   * sells the weight of the charge more than any amount of smoke.
   */
  private kickBack(attacker: PieceView, blow: THREE.Vector3, gun: GunProfile): void {
    const reach = TILE * gun.kick;
    void (async () => {
      await this.tweens.to({
        duration: 0.07,
        easing: Ease.outQuint,
        onUpdate: (t) => {
          attacker.runtime.position.x = -blow.x * reach * t;
          attacker.runtime.position.z = -blow.z * reach * t;
          attacker.setStrikeTilt(-0.16 * t);
        },
      });
      await this.tweens.to({
        duration: 0.34,
        easing: Ease.outCubic,
        onUpdate: (t) => {
          attacker.runtime.position.x = -blow.x * reach * (1 - t);
          attacker.runtime.position.z = -blow.z * reach * (1 - t);
          attacker.setStrikeTilt(-0.16 * (1 - t));
        },
      });
      attacker.runtime.position.x = 0;
      attacker.runtime.position.z = 0;
      attacker.setStrikeTilt(0);
    })();

    if (gun.recoil <= 0 || !attacker.hasTrain) return;
    this.gunRecoil(attacker, gun);
  }

  /**
   * A field gun going off. The piece is not nudged — it is thrown: the wheels
   * leave the stone, the muzzle jumps, the carriage runs back the length of its
   * own trail, drops, rolls a little further, and is only then heaved up to the
   * mark again. Dust is hammered out from under the wheels on the frame it
   * fires, and the stone is heard taking the shock of the recoil a moment after
   * the report itself.
   */
  private gunRecoil(attacker: PieceView, gun: GunProfile): void {
    const settings = QUALITY_SETTINGS[this.preset];
    const carriage = attacker.trainOrigin();
    if (carriage) {
      const pan = this.stereoPan(carriage);
      // The trail slamming back over the stone, just behind the report.
      audio.groundSlam({ pan, volume: 0.34, delay: 0.05 });
      // ...and the wheels coming down again at the end of the run-back.
      audio.footstep({ pan, timbre: "plate", volume: 0.5, delay: 0.2, jitter: -0.18 });
      this.effects.spawnSmoke(carriage.clone().setY(BOARD_TOP + 0.05), {
        count: Math.max(3, Math.round(settings.captureParticles * 0.2)),
        radius: 0.34,
        scale: 0.5,
        growth: 2.8,
        life: 1,
        speed: 1.5,
        rise: 0.08,
        color: 0x9c8f7d,
        opacity: 0.42,
      });
      this.effects.spawnBurst(carriage.clone().setY(BOARD_TOP + 0.04), 0xc7ac82, Math.round(settings.captureParticles * 0.2), {
        speed: 2.6,
        life: 0.5,
        gravity: 3.2,
        radius: 0.16,
        size: 0.06,
        drag: 2.6,
      });
    }

    void (async () => {
      // The charge takes it: back and up in under a tenth of a second.
      await this.tweens.to({
        duration: 0.07,
        easing: Ease.outQuint,
        onUpdate: (t) => attacker.setTrainRecoil(gun.recoil * t, t),
      });
      // The wheels find the stone again while the piece is still running back.
      await this.tweens.to({
        duration: 0.22,
        easing: Ease.outCubic,
        onUpdate: (t) =>
          attacker.setTrainRecoil(gun.recoil * (1 + t * 0.14), Math.pow(1 - t, 1.6)),
      });
      // Then the crew heaves it up to the mark: slow, as it would be.
      await this.tweens.to({
        duration: 0.86,
        easing: Ease.inOutCubic,
        onUpdate: (t) => attacker.setTrainRecoil(gun.recoil * 1.14 * (1 - t)),
      });
      attacker.setTrainRecoil(0);
    })();

    // The hall takes the recoil a beat after the shot, not with it.
    void (async () => {
      await wait(0.06);
      this.shake.add(0.34);
    })();
  }

  /**
   * Serving the piece again after a shot: the drill clip if the rig carries one,
   * with the ramrod and the lock heard over it. Kept to the length of the body
   * being cleared away, so the beat costs the fight nothing.
   *
   * A standing gunner is handed back to his stance at the end of it. A kneeling
   * one is **not**: his reload is authored on the knee, and standing him up here
   * would put a stance change in the middle of the beat that is supposed to be
   * the one thing he does without moving. He is stood up afterwards, once, by
   * {@link SceneEngine.riseToFeet}.
   */
  private async reload(attacker: PieceView, gun: GunProfile): Promise<void> {
    if (!attacker.hasClip("reload")) return;
    const pan = this.stereoPan(attacker.container.position);
    const length = attacker.playReload();
    if (length <= 0) return;
    audio.gunLock({ pan, weight: gun.calibre, volume: 0.42, delay: length * 0.28 });
    audio.gunLock({ pan, weight: gun.calibre * 0.6, volume: 0.32, delay: length * 0.62 });
    await wait(Math.min(length, 0.95));
    if (!gun.stance.kneel) attacker.playIdle(0.22);
  }

  /** Caster with no clip: the shoulders go back over the gathering fire. */
  private async castWind(attacker: PieceView, duration: number): Promise<void> {
    await this.tweens.to({
      duration: Math.max(0.14, duration * 0.85),
      easing: Ease.outCubic,
      onUpdate: (t) => attacker.setStrikeTilt(-0.22 * t),
    });
  }

  /** The release: the staff comes down and the body follows the bolt out. */
  private castRelease(attacker: PieceView, direction: THREE.Vector3): void {
    const reach = TILE * 0.2;
    const push = (offset: number, tilt: number) => {
      attacker.runtime.position.x = direction.x * offset;
      attacker.runtime.position.z = direction.z * offset;
      attacker.setStrikeTilt(tilt);
    };
    void (async () => {
      await this.tweens.to({
        duration: 0.14,
        easing: Ease.outQuint,
        onUpdate: (t) => push(reach * t, THREE.MathUtils.lerp(-0.22, 0.26, t)),
      });
      await this.tweens.to({
        duration: 0.38,
        easing: Ease.outCubic,
        onUpdate: (t) => push(reach * (1 - t), 0.26 * (1 - t)),
      });
      push(0, 0);
    })();
  }

  /**
   * The wind-up: a ball of fire drawn together at the head of the staff, fed by
   * embers pulled in out of the air around it, over a rising charge in the mix.
   * The fire is repositioned every frame from the prop's own casting point, so
   * it stays in the crystal however the casting arm swings.
   */
  private async gatherSpell(attacker: PieceView, duration: number, size: number): Promise<void> {
    const settings = QUALITY_SETTINGS[this.preset];
    const look = SPELL_LOOK[attacker.color];
    const orb = new SpellOrb(look, size, this.spellLights.acquire(look.light, 4.6));
    orb.group.position.copy(attacker.castOrigin());
    this.scene.add(orb.group);

    audio.spellCharge({ pan: this.stereoPan(orb.group.position), duration, volume: size * 2 });
    attacker.flareAura(Math.min(1.2, size * 1.4));

    const motes = Math.max(3, Math.round(settings.captureParticles * 0.14 * (size * 2.4)));
    let nextMote = 0.14;
    try {
      await this.tweens.to({
        duration,
        easing: Ease.linear,
        onUpdate: (t) => {
          const at = attacker.castOrigin();
          orb.group.position.copy(at);
          // Slow to catch, then it runs away with itself.
          orb.setIntensity(t * t * 1.15);
          orb.animate(this.elapsed);
          if (t >= nextMote) {
            nextMote += 0.16;
            // Motes falling inward: thrown out wide, dragged back by the pull.
            this.effects.spawnBurst(at, look.ember, motes, {
              speed: 0.55,
              life: 0.45,
              gravity: -1.1,
              radius: 0.36,
              size: 0.075,
              growth: 0.28,
              drag: 2.6,
              rise: 0.2,
            });
          }
        },
      });
    } finally {
      orb.dispose();
    }
  }

  /**
   * One bolt: a flat, fast arc from the staff to the target's chest, shedding
   * embers and a thin trail of smoke the whole way. Longer shots take
   * proportionally longer, so the distance across the board is felt.
   *
   * A `leader` is one of the smaller balls the sorceress sends ahead of the
   * killing bolt — it is thrown off-centre, breaks on the body on its own and
   * never takes the square with it.
   */
  private async throwFireball(
    attacker: PieceView,
    target: THREE.Vector3,
    options: { size?: number; delay?: number; leader?: boolean } = {},
  ): Promise<void> {
    if (options.delay && options.delay > 0) await wait(options.delay);
    const settings = QUALITY_SETTINGS[this.preset];
    const look = SPELL_LOOK[attacker.color];
    const start = attacker.castOrigin();
    const size = options.size ?? 0.52;
    const leader = options.leader === true;
    // Leaders come in off the shoulder rather than straight down the line.
    const aim = target.clone();
    if (leader) {
      const side = new THREE.Vector3(0, 1, 0).cross(target.clone().sub(start).setY(0).normalize());
      aim.addScaledVector(side, (Math.random() - 0.5) * 0.5).setY(target.y + (Math.random() - 0.4) * 0.3);
    }
    const distance = start.distanceTo(aim);
    const flight = THREE.MathUtils.clamp(distance * 0.1, 0.22, 0.62);
    const lift = 0.1 + distance * 0.05;
    const motes = Math.max(3, Math.round(settings.captureParticles * 0.16 * (leader ? 0.6 : 1)));
    const smoking = settings.captureParticles >= 34 && !leader;

    // Only the killing bolt lights the hall: the leaders it is sent ahead of
    // would be fighting over the same three slots for a few frames each.
    const orb = new SpellOrb(look, size, leader ? null : this.spellLights.acquire(look.light, 4.6));
    orb.group.position.copy(start);
    orb.setIntensity(1);
    this.scene.add(orb.group);

    audio.spellCast({ pan: this.stereoPan(start), volume: leader ? 0.5 : 1 });
    this.shake.add(leader ? 0.04 : 0.08);

    const at = new THREE.Vector3();
    let nextTrail = 0;
    try {
      await this.tweens.to({
        duration: flight,
        easing: Ease.linear,
        onUpdate: (t) => {
          at.lerpVectors(start, target, t);
          at.y += Math.sin(Math.PI * t) * lift;
          orb.group.position.copy(at);
          // It tightens and brightens as it closes on the body.
          orb.setIntensity(1 + t * 0.4);
          orb.animate(this.elapsed);
          if (t >= nextTrail) {
            nextTrail += 0.1;
            this.effects.spawnBurst(at.clone(), look.ember, motes, {
              speed: 0.7,
              life: 0.65,
              gravity: -0.4,
              radius: 0.12,
              size: 0.09,
              growth: 0.35,
              drag: 2.2,
              rise: 0.1,
            });
            if (smoking) {
              this.effects.spawnSmoke(at.clone(), {
                count: 2,
                radius: 0.12,
                scale: 0.32,
                growth: 2.6,
                life: 0.6,
                speed: 0.25,
                rise: 0.18,
                color: 0x8a7d6e,
                opacity: 0.22,
              });
            }
          }
        },
      });
    } finally {
      orb.dispose();
    }

    // A leader breaks on its own: a small clap of fire, no square taken.
    if (leader) {
      audio.spellImpact({ pan: this.stereoPan(aim), volume: 0.4 });
      this.effects.spawnFlash(aim, 1.5, 0.2);
      this.effects.spawnBurst(aim, look.core, Math.round(settings.captureParticles * 0.35), {
        speed: 2.8,
        life: 0.45,
        gravity: 1.8,
        radius: 0.12,
      });
      this.shake.add(0.14);
    }
  }

  /**
   * The bolt breaking open on the body: a hard white flash, a shell of fire
   * thrown outward, embers left hanging on the air and the square itself struck
   * as hard as any blade would have struck it. `scale` is how much fire the
   * caster put behind it, and `ring` rolls the blast out across the stone — the
   * sorceress leaves one, the mage does not.
   */
  private spellBurst(color: Faction, at: THREE.Vector3, square: SquareId, scale = 1, ring = 0): void {
    const settings = QUALITY_SETTINGS[this.preset];
    const look = SPELL_LOOK[color];

    audio.spellImpact({ pan: this.stereoPan(at), volume: Math.min(1.4, scale) });
    audio.play("capture", Math.min(1, 0.5 * scale));
    this.strikeImpact(square, Math.min(1.5, 1.1 * scale));
    this.effects.spawnFlash(at, Math.min(6, 3.4 * scale), 0.3);
    this.effects.spawnBurst(at, look.core, Math.round(settings.captureParticles * scale), {
      speed: 4.4 * (0.9 + scale * 0.1),
      life: 0.55,
      gravity: 2.6,
      radius: 0.1,
    });
    this.effects.spawnBurst(at, look.ember, Math.round(settings.captureParticles * 0.7 * scale), {
      speed: 1.5,
      life: 1.5,
      gravity: -0.7,
      radius: 0.3 * scale,
      size: 0.1,
      growth: 0.38,
      drag: 1.6,
      rise: 0.5,
    });
    this.effects.spawnSmoke(at, {
      count: Math.max(3, Math.round(settings.captureParticles * 0.22 * scale)),
      radius: 0.34 * scale,
      scale: 0.7 * scale,
      growth: 2.8,
      life: 1.1,
      speed: 1.2,
      rise: 0.6,
      color: 0x7d7062,
      opacity: 0.55,
    });
    this.shake.add(Math.min(1, 0.6 * scale));

    if (ring > 0) {
      // Fire thrown out flat across the square, and the floor answering it.
      audio.groundSlam({ pan: this.stereoPan(at), volume: 0.5 });
      void spawnGroundWave(this.scene, this.tweens, at, {
        color: look.flame,
        radius: ring,
        height: BOARD_TOP + 0.03,
        life: 0.62,
        echo: true,
      });
      this.effects.spawnBurst(at.clone().setY(BOARD_TOP + 0.12), look.ember, Math.round(settings.captureParticles * 0.5), {
        speed: 3.6,
        life: 0.9,
        gravity: 1.2,
        radius: 0.2,
        size: 0.1,
        growth: 0.5,
        drag: 1.8,
      });
    }
  }

  /**
   * The strike for a figure with no attack clip — an unrigged sculpt, or one
   * whose clip never arrived. It winds up away from its target, leaning back and
   * twisting out of line, then unloads everything forward and brings the blow
   * over the top; it resolves exactly as the blow lands, so the impact beat the
   * caller plays is unchanged. The tilt is held through {@link PieceView} so the
   * skeleton, which owns the pose on a rigged sculpt, cannot wipe the swing.
   *
   * @param heft 0 = a light blade, 1 = a siege weapon hauled round
   */
  private async lunge(attacker: PieceView, direction: THREE.Vector3, heft = 0): Promise<void> {
    const reach = TILE * (0.36 + heft * 0.1);
    const wind = -reach * 0.45;
    const twist = 0.44 + heft * 0.22;
    const chop = 0.3 + heft * 0.14;
    const push = (offset: number, yaw: number, tilt: number) => {
      attacker.runtime.position.x = direction.x * offset;
      attacker.runtime.position.z = direction.z * offset;
      attacker.runtime.rotation.y = yaw;
      attacker.setStrikeTilt(tilt);
    };

    // Weight shifts back onto the rear foot, shoulders turning out of line and
    // the weapon taken back behind the body.
    await this.tweens.to({
      duration: 0.2 + heft * 0.14,
      easing: Ease.outCubic,
      onUpdate: (t) => push(wind * t, -twist * t, -0.18 * t),
    });
    // Then everything unloads forward at once and the blow comes over the top.
    await this.tweens.to({
      duration: 0.11,
      easing: Ease.inCubic,
      onUpdate: (t) =>
        push(
          THREE.MathUtils.lerp(wind, reach, t),
          THREE.MathUtils.lerp(-twist, 0.3, t),
          THREE.MathUtils.lerp(-0.18, chop, t),
        ),
    });
  }

  /** Coming out of a lunge: the body unwinds back over its own square. */
  private recover(attacker: PieceView, direction: THREE.Vector3, heft = 0): void {
    const reach = TILE * (0.36 + heft * 0.1);
    const chop = 0.3 + heft * 0.14;
    void this.tweens.to({
      duration: 0.32 + heft * 0.1,
      easing: Ease.outCubic,
      onUpdate: (t) => {
        attacker.runtime.position.x = direction.x * reach * (1 - t);
        attacker.runtime.position.z = direction.z * reach * (1 - t);
        attacker.runtime.rotation.y = 0.3 * (1 - t);
        attacker.setStrikeTilt(chop * (1 - t));
      },
    });
  }

  /**
   * The death beat: a hit flinch driven off the blow direction, the full skeletal
   * death clip (the figure keeps its fallen pose), then a short hold on the body
   * before it is cleared. Unrigged sculpts fall back to a topple.
   */
  private async slay(victim: PieceView, blow: THREE.Vector3): Promise<void> {
    const settings = QUALITY_SETTINGS[this.preset];
    victim.takeHit();
    audio.bodyFall(0.8);

    const chest = victim.container.position.clone().setY(0.5);
    this.cryOut(victim, chest);
    this.effects.spawnBurst(chest, 0xff5a3a, Math.round(settings.captureParticles * 0.5), {
      speed: 2.8,
      life: 0.55,
    });

    if (!victim.hasAnimations) {
      await this.topple(victim, blow, 0.55);
      return;
    }

    const death = victim.playDeath();
    if (death <= 0) {
      await this.topple(victim, blow, 0.55);
      return;
    }

    // Knocked back off its feet, then dragged to a stop as the body settles.
    void this.tweens.to({
      duration: Math.min(0.5, death * 0.6),
      easing: Ease.outQuint,
      onUpdate: (t) => {
        victim.runtime.position.x = blow.x * t * 0.22;
        victim.runtime.position.z = blow.z * t * 0.22;
      },
    });

    await wait(death);
    // Dust kicked up as the body lands, then a beat to let the fall register.
    this.effects.spawnBurst(victim.container.position.clone().setY(0.16), 0x9c8a6a, 24, {
      speed: 1.3,
      life: 0.8,
    });
    this.effects.spawnSmoke(victim.container.position.clone().setY(0.12), {
      count: Math.max(3, Math.round(settings.captureParticles * 0.16)),
      radius: 0.42,
      scale: 0.7,
      growth: 2.2,
      life: 1,
      speed: 0.8,
      rise: 0.2,
      color: 0x8f8172,
      opacity: 0.5,
    });
    await wait(0.14);
  }

  /**
   * The exit: a fallen figure never simply blinks out. Footsoldiers and riders
   * are hurled clear of the board in a tumbling arc, the heavy court pieces are
   * dragged down into a boiling column of smoke — and in both cases the body
   * itself burns away through a noise field, thinning into embers on the air.
   */
  private async banish(victim: PieceView, blow: THREE.Vector3): Promise<void> {
    const heavy = victim.kind === "k" || victim.kind === "q" || victim.kind === "r";
    if (heavy) await this.swallow(victim);
    else await this.hurl(victim, blow);
  }

  /** Knocked off the board: ballistic arc, end-over-end tumble, smoke trail. */
  private async hurl(victim: PieceView, blow: THREE.Vector3): Promise<void> {
    const settings = QUALITY_SETTINGS[this.preset];
    const start = victim.container.position.clone();
    const rest = victim.container.quaternion.clone();
    const plume = Math.max(4, Math.round(settings.captureParticles * 0.22));

    victim.setAirborne(true);
    audio.bodyFall(0.32);
    this.shake.add(0.16);

    // Torn loose from the stone: grit off the tile and the first breath of smoke.
    this.effects.spawnBurst(start.clone().setY(0.18), 0xc0a075, Math.round(settings.captureParticles * 0.4), {
      speed: 2.6,
      life: 0.6,
    });
    this.effects.spawnSmoke(start.clone().setY(0.28), {
      count: plume,
      radius: 0.42,
      scale: 0.85,
      growth: 2.6,
      life: 1.2,
      speed: 1.1,
      rise: 0.5,
      color: 0x9b8b76,
      opacity: 0.7,
    });

    const lateral = new THREE.Vector3(-blow.z, 0, blow.x).multiplyScalar((Math.random() - 0.5) * TILE * 0.7);
    const distance = TILE * 2.5;
    const spinAxis = new THREE.Vector3(-blow.z, 0.35, blow.x).normalize();
    const spin = Math.PI * (1.7 + Math.random() * 1.1);
    const tumble = new THREE.Quaternion();
    const position = new THREE.Vector3();
    let nextTrail = 0.14;
    let nextEmber = 0.2;
    const motes = Math.max(4, Math.round(settings.captureParticles * 0.16));

    await this.tweens.to({
      duration: 0.82,
      easing: Ease.linear,
      onUpdate: (t) => {
        position.copy(start).addScaledVector(blow, distance * t).addScaledVector(lateral, t * t);
        // Hard launch that is still climbing when the body comes apart.
        position.y = start.y + Math.sin(Math.PI * t * 0.78) * 1.5;
        victim.container.position.copy(position);
        tumble.setFromAxisAngle(spinAxis, spin * t);
        victim.container.quaternion.copy(tumble).multiply(rest);
        victim.container.scale.setScalar(1 - t * 0.2);
        // Two layers of leaving: the surface burns open from the soles up while
        // whatever is left of it thins out against the light.
        victim.setDissolve(Math.max(0, (t - 0.2) / 0.74));
        victim.setOpacity(1 - 0.7 * Math.max(0, (t - 0.3) / 0.7));
        if (t >= nextEmber) {
          nextEmber += 0.09;
          // Embers peeled off the burn edge, left hanging where the body was.
          this.effects.spawnBurst(position.clone().setY(position.y + 0.3), EMBER_COLOR[victim.color], motes, {
            speed: 0.5,
            life: 1.5,
            gravity: -0.5,
            radius: 0.32,
            size: 0.085,
            growth: 0.35,
            drag: 1.9,
            rise: 0.3,
          });
        }
        if (t >= nextTrail) {
          nextTrail += 0.16;
          this.effects.spawnSmoke(position.clone().setY(position.y + 0.35), {
            count: Math.max(2, Math.round(plume * 0.4)),
            radius: 0.2,
            scale: 0.55,
            growth: 2.3,
            life: 0.9,
            speed: 0.45,
            rise: 0.3,
            color: 0x94897b,
            opacity: 0.45,
          });
        }
      },
    });

    // It never lands — the body burns through mid-flight and is gone.
    const end = position.clone();
    this.effects.spawnBurst(end, EMBER_COLOR[victim.color], motes * 3, {
      speed: 0.85,
      life: 1.9,
      gravity: -0.6,
      radius: 0.42,
      size: 0.1,
      growth: 0.3,
      drag: 1.6,
      rise: 0.45,
    });
    this.effects.spawnSmoke(end, {
      count: plume + 4,
      radius: 0.45,
      scale: 1.05,
      growth: 3,
      life: 1.3,
      speed: 1.3,
      rise: 0.45,
      color: 0x8d8174,
      opacity: 0.75,
      drift: blow.clone().multiplyScalar(0.55),
    });
    this.effects.spawnBurst(end, 0xffa561, Math.round(settings.captureParticles * 0.35), {
      speed: 2.3,
      life: 0.7,
    });

    victim.setDissolve(1);
    victim.setOpacity(0);
    victim.container.scale.setScalar(1);
    victim.container.quaternion.copy(rest);
    victim.container.position.copy(start);
    victim.setAirborne(false);
  }

  /** Court pieces go down with the board: sunk and turned into a smoke column. */
  private async swallow(victim: PieceView): Promise<void> {
    const settings = QUALITY_SETTINGS[this.preset];
    const start = victim.container.position.clone();
    const rest = victim.container.quaternion.clone();
    const plume = Math.max(5, Math.round(settings.captureParticles * 0.3));
    const up = new THREE.Vector3(0, 1, 0);
    const swirl = new THREE.Quaternion();

    audio.bodyFall(0.45);
    this.shake.add(0.12);
    this.effects.spawnSmoke(start.clone().setY(0.14), {
      count: plume,
      radius: 0.5,
      scale: 1,
      growth: 3.1,
      life: 1.5,
      speed: 1.4,
      rise: 0.85,
      color: 0x746757,
      opacity: 0.85,
    });
    this.effects.spawnBurst(start.clone().setY(0.2), 0xb59a72, Math.round(settings.captureParticles * 0.35), {
      speed: 1.8,
      life: 0.7,
    });

    let nextPuff = 0.22;
    let nextEmber = 0.16;
    const motes = Math.max(5, Math.round(settings.captureParticles * 0.2));
    await this.tweens.to({
      duration: 0.86,
      easing: Ease.inCubic,
      onUpdate: (t) => {
        victim.container.position.y = start.y - t * 0.4;
        victim.container.scale.setScalar(1 - t * 0.22);
        swirl.setFromAxisAngle(up, t * 0.8);
        victim.container.quaternion.copy(swirl).multiply(rest);
        // Royalty is unmade slowly: the burn climbs the body as it sinks and
        // what is left of it turns to haze on the way down.
        victim.setDissolve(Math.max(0, (t - 0.12) / 0.8));
        victim.setOpacity(Math.max(0.12, 1 - t * 0.85));
        if (t >= nextEmber) {
          nextEmber += 0.1;
          this.effects.spawnBurst(start.clone().setY(0.34 + t * 0.5), EMBER_COLOR[victim.color], motes, {
            speed: 0.42,
            life: 1.8,
            gravity: -0.62,
            radius: 0.3,
            size: 0.095,
            growth: 0.32,
            drag: 1.7,
            rise: 0.5,
          });
        }
        if (t >= nextPuff) {
          nextPuff += 0.24;
          this.effects.spawnSmoke(start.clone().setY(0.2), {
            count: Math.max(3, Math.round(plume * 0.45)),
            radius: 0.45,
            scale: 0.8,
            growth: 2.6,
            life: 1.2,
            speed: 1,
            rise: 0.65,
            color: 0x8b7d6d,
            opacity: 0.6,
          });
        }
      },
    });

    // The last of it goes up as a slow column of embers over its own square.
    this.effects.spawnBurst(start.clone().setY(0.5), EMBER_COLOR[victim.color], motes * 3, {
      speed: 0.35,
      life: 2.2,
      gravity: -0.7,
      radius: 0.34,
      size: 0.105,
      growth: 0.28,
      drag: 1.4,
      rise: 0.6,
    });

    // A low pool of smoke is left drifting over the square it held.
    this.effects.spawnSmoke(start.clone().setY(0.1), {
      count: Math.max(4, Math.round(plume * 0.6)),
      radius: 0.6,
      scale: 0.9,
      growth: 2.8,
      life: 1.6,
      speed: 0.7,
      rise: 0.15,
      color: 0x8f8272,
      opacity: 0.5,
    });

    victim.setDissolve(1);
    victim.setOpacity(0);
    victim.container.scale.setScalar(1);
    victim.container.quaternion.copy(rest);
    victim.container.position.copy(start);
  }

  /**
   * The figure's own dying voice. Each rank in each army has its own recorded
   * cry, panned to where the body is on screen and pitch-jittered so repeats
   * never sound identical; heavier ranks die louder and a touch lower.
   */
  private cryOut(victim: PieceView, chest: THREE.Vector3): void {
    const weight = CRY_WEIGHT[victim.kind];
    audio.deathCry(victim.color, victim.kind, {
      pan: this.stereoPan(chest),
      volume: weight.volume,
      rate: weight.rate * (0.95 + Math.random() * 0.1),
      delay: 0.03 + Math.random() * 0.05,
    });
  }

  /** Where a world point sits across the screen, as a -1..1 stereo position. */
  private stereoPan(position: THREE.Vector3): number {
    const projected = position.clone().project(this.camera);
    if (!Number.isFinite(projected.x)) return 0;
    return Math.max(-1, Math.min(1, projected.x));
  }

  /** Rigid topple for sculpts with no skeleton: knocked over, face down. */
  private async topple(victim: PieceView, blow: THREE.Vector3, duration: number): Promise<void> {
    const start = victim.container.position.clone();
    const axis = new THREE.Vector3(blow.z, 0, -blow.x).normalize();
    const fallen = new THREE.Quaternion().setFromAxisAngle(axis, -Math.PI * 0.46);
    const rest = victim.container.quaternion.clone();
    const target = fallen.multiply(rest);
    await this.tweens.to({
      duration,
      easing: Ease.outBounce,
      onUpdate: (t) => {
        victim.container.quaternion.slerpQuaternions(rest, target, t);
        victim.container.position.y = start.y + Math.sin(Math.PI * t) * 0.06;
        victim.container.position.x = start.x + blow.x * t * 0.12;
        victim.container.position.z = start.z + blow.z * t * 0.12;
      },
    });
    this.effects.spawnBurst(start.clone().setY(0.12), 0x9c8a6a, 22, { speed: 1.4, life: 0.7 });
    await wait(0.2);
    victim.container.quaternion.copy(rest);
    victim.container.position.copy(start);
  }

  /**
   * Board-level hit feedback on the square being taken: a white flash decaying
   * into a shockwave ring, the tiles jolting out of place, sparks off the stone
   * and a short camera kick.
   */
  private strikeImpact(square: SquareId, strength: number): void {
    const settings = QUALITY_SETTINGS[this.preset];
    this.board.impact(square, 0xff7a3a, strength);
    this.shake.add(0.22 * strength);
    const ground = squareToWorld(square, BOARD_TOP + 0.05);
    this.effects.spawnFlash(ground.clone().setY(BOARD_TOP + 0.18), 1.5 * strength, 0.2);
    this.effects.spawnBurst(ground, 0xffb066, Math.round(settings.captureParticles * 0.45 * strength), {
      speed: 2.1,
      life: 0.5,
    });
  }

  /**
   * What a round finds when it arrives.
   *
   * The debris a hit throws has to be made of the *victim*, not of the shooter's
   * powder — a ball into a Sun Empire obsidian idol cannot spray the same warm
   * grit as a ball into a wool coat. So the material is read off the army the
   * body belongs to, with the fully-armoured ranks answering as steel whatever
   * livery they wear: the cuirassier's breastplate and the tower guardian's
   * plate both spark instead of chipping.
   */
  private impactBody(victim: PieceView): ImpactBody {
    const armoured = victim.kind === "n" || victim.kind === "r";
    switch (this.factory.getSkins()[victim.color]) {
      case "empire":
        return armoured ? "plate" : "uniform";
      case "sun":
        // Obsidian and jade: it does not chip, it flakes into glass.
        return armoured ? "plate" : "obsidian";
      default:
        return armoured ? "plate" : "marble";
    }
  }

  /**
   * Death without the cinematic: the figure still plays its death clip and is
   * knocked off its feet, just without the camera work and the stand-off.
   */
  private async crumble(victim: PieceView, killer: THREE.Vector3): Promise<void> {
    const blow = victim.container.position.clone().sub(killer).setY(0);
    if (blow.lengthSq() < 1e-6) blow.set(0, 0, 1);
    blow.normalize();
    victim.faceTowards(killer);
    await this.slay(victim, blow);
    await this.banish(victim, blow);
  }

  private async rejectMove(square: SquareId): Promise<void> {
    const piece = this.pieces.get(square);
    audio.blip("deny");
    if (!piece) return;
    await this.tweens.to({
      duration: 0.32,
      easing: Ease.linear,
      onUpdate: (t) => {
        piece.runtime.position.x = Math.sin(t * Math.PI * 6) * 0.07 * (1 - t);
      },
    });
    piece.runtime.position.x = 0;
  }

  // ------------------------------------------------------------------- camera

  /**
   * A battle beat's lens punch, scaled to the framing in force. A phone frames
   * the board through a much wider lens, so a fixed 6° push-in would barely
   * register there; the punch is a proportion of the shot, not a constant.
   */
  private lensPunch(degrees: number): number {
    return degrees * (this.lensFov / DEFAULT_FOV);
  }

  async moveCameraTo(shot: CameraShot, duration = 1.1): Promise<void> {
    const fromPosition = this.camera.position.clone();
    const fromTarget = this.controls.target.clone();
    this.controls.enabled = false;
    this.cameraScripted = true;
    try {
      await this.tweens.to({
        duration,
        easing: Ease.inOutCubic,
        onUpdate: (t) => {
          this.camera.position.lerpVectors(fromPosition, shot.position, t);
          this.controls.target.lerpVectors(fromTarget, shot.target, t);
        },
      });
    } finally {
      this.cameraScripted = false;
      this.captureFollowRig();
    }
    this.controls.enabled = this.interactive;
  }

  // ------------------------------------------------------------ follow camera

  /**
   * The showcase follow camera. It holds one angle and one distance — whatever
   * the viewer last left the view on — and only ever slides that rig sideways
   * to keep the action in frame, so the board never spins under the fight.
   *
   * @returns true while the engine is the one writing the camera.
   */
  private updateFollowCamera(delta: number): boolean {
    if (!this.showcase || this.showcaseCamera !== "follow") return false;
    if (this.tactical || this.orbiting || this.cameraScripted || this.introPlaying) return false;
    // A hand on the mouse always wins; tracking resumes a couple of seconds later.
    if (this.elapsed - this.lastManualCameraAt < 2.4) return false;

    const subject = this.followPiece?.container.position ?? this.followPoint ?? BOARD_FOCUS;
    // Lean towards the action instead of sitting rigidly behind it: the eye
    // covers a fraction of the board rather than all of it, which both keeps the
    // rest of the position in shot and keeps the rig clear of the hall.
    this.scratchFocus
      .copy(BOARD_FOCUS)
      .addScaledVector(this.scratchLean.copy(subject).sub(BOARD_FOCUS), FOLLOW_LEAN)
      .setY(THREE.MathUtils.clamp(subject.y + 0.45, 0.35, 1.1));
    this.followedFocus.lerp(this.scratchFocus, 1 - Math.exp(-delta * 3.6));

    const desired = this.solveFollowEye(
      THREE.MathUtils.clamp(
        this.followRig.radius * this.followTightness,
        this.limits.minDistance,
        this.limits.maxDistance,
      ),
    );
    const smooth = 1 - Math.exp(-delta * 2.4);
    this.camera.position.lerp(desired, smooth);
    this.controls.target.lerp(this.followedFocus, smooth);
    return true;
  }

  /**
   * The eye the follow rig is asking for, already solved to stand inside the
   * hall.
   *
   * This is what stops the showcase camera shuddering. The rig is anchored on
   * the action, so tracking anything on the near half of the board asks for an
   * eye behind the wall — and correcting that on the *camera*, after the
   * smoothing has already run (which is all {@link confineCamera} can do), puts
   * a hard projection in the loop: every frame the chase steps outward and the
   * wall shoves it back, and the height is re-derived through a square root each
   * time. Measured against a figure marching down the near file, that doubled
   * the camera's mean frame-to-frame jerk and spiked it to half a percent of
   * screen height in single frames — a visible shudder on almost every move.
   *
   * So the wall is solved here instead, before anything moves: the rig's ground
   * reach is cut to whatever the hall actually has room for, paid for first out
   * of distance and only then out of elevation. The result is a legal target for
   * the same exponential smoothing, `confineCamera` never fires while following,
   * and the eye ends up *lower* than the old clamp left it.
   */
  private solveFollowEye(radius: number): THREE.Vector3 {
    const focus = this.followedFocus;
    const { phi, theta } = this.followRig;
    const room = HALL_INNER_RADIUS - FOLLOW_WALL_MARGIN;
    // How far the eye may travel along the rig's heading before it leaves the
    // hall: the positive root of |focus + reach · heading| = room.
    const towards = Math.sin(theta) * focus.x + Math.cos(theta) * focus.z;
    const span = towards * towards - (focus.x * focus.x + focus.z * focus.z) + room * room;
    const available = span <= 0 ? 0 : Math.max(0, Math.sqrt(span) - towards);
    const reach = Math.min(radius * Math.sin(phi), available);
    // Pay in distance first, down to the floor; the elevation covers the rest.
    const pulled = THREE.MathUtils.clamp(
      reach / Math.max(1e-3, Math.sin(phi)),
      Math.max(this.limits.minDistance, radius * (1 - FOLLOW_GIVE)),
      radius,
    );
    this.followOffset.set(
      pulled,
      Math.max(this.limits.minPolarAngle, Math.asin(THREE.MathUtils.clamp(reach / pulled, 0, 1))),
      theta,
    );
    return this.scratchDesired.setFromSpherical(this.followOffset).add(focus);
  }

  /**
   * Remembers the angle and distance the view is currently sitting at, so the
   * follow camera tracks the action from wherever the viewer put the camera
   * rather than snapping back to a canned shot.
   */
  private captureFollowRig(): void {
    const offset = this.scratchDesired.copy(this.camera.position).sub(this.controls.target);
    if (offset.lengthSq() < 1e-4) return;
    const spherical = new THREE.Spherical().setFromVector3(offset);
    this.followRig.phi = spherical.phi;
    this.followRig.theta = spherical.theta;
    this.followRig.radius = THREE.MathUtils.clamp(
      spherical.radius / Math.max(0.4, this.followTightness),
      this.limits.minDistance + 0.9,
      Math.max(13, this.fitRadius * 1.05),
    );
  }

  /** Follow-camera subject: the figure currently crossing the board. */
  private focusPiece(piece: PieceView | null, tightness = 1): void {
    this.followPiece = piece;
    if (piece) this.followPoint = null;
    this.followTightness = tightness;
  }

  /** Follow-camera subject: a fixed point — the fight, or the square taken. */
  private focusPoint(point: THREE.Vector3 | null, tightness = 1): void {
    this.followPiece = null;
    this.followPoint = point ? point.clone() : null;
    this.followTightness = tightness;
  }

  setCameraPreset(preset: CameraPreset): void {
    // Picking a 3D shot always folds the flat map away first.
    if (this.tactical) {
      this.setTacticalView(false, CAMERA_SHOTS[preset]);
      return;
    }
    this.framedShot = CAMERA_SHOTS[preset];
    const framing = this.framingFor(this.framedShot);
    this.adoptFraming(framing);
    void this.moveCameraTo(framing);
  }

  // --------------------------------------------------------- tactical 2D view

  /** True while the board is being read as a flat overhead map. */
  isTacticalView(): boolean {
    return this.tactical;
  }

  /**
   * Folds the hall away and reads the board as a 2D map: the camera climbs to
   * a narrow-lens overhead shot, every figure is replaced by a flat counter
   * stamped with its rank, and the world around the board is struck so nothing
   * can stand between the player and a square.
   */
  setTacticalView(active: boolean, exitShot?: CameraShot): void {
    if (this.tactical === active) return;
    this.tactical = active;
    this.callbacks.onTacticalView?.(active);

    if (active) {
      this.tacticalReturn = {
        position: this.camera.position.clone(),
        target: this.controls.target.clone(),
      };
      this.strikeWorld();
      this.applyTacticalAtmosphere();
      for (const piece of this.allPieces()) piece.setFlat(true);
      this.alignTokens();

      this.controls.enableRotate = false;
      this.controls.autoRotate = false;
      this.framedShot = TACTICAL_SHOT;
      void this.flyTo(this.framingFor(TACTICAL_SHOT));
      return;
    }

    const look = ARENA_LOOKS[this.arena];
    this.restoreWorld();
    (this.scene.background as THREE.Color).setHex(look.background);
    const fog = this.scene.fog as THREE.FogExp2 | null;
    if (fog) fog.density = look.fog.density;
    this.applyExposure(look.exposure);
    for (const piece of this.allPieces()) piece.setFlat(false);

    this.controls.enableRotate = true;
    const shot = exitShot ?? this.tacticalReturn ?? CAMERA_SHOTS.white;
    this.tacticalReturn = null;
    this.framedShot = shot;
    void this.flyTo(this.framingFor(shot));
  }

  /** Camera move that also eases the lens between the 3D and map framings. */
  private async flyTo(framing: Framing): Promise<void> {
    const fromPosition = this.camera.position.clone();
    const fromTarget = this.controls.target.clone();
    const fromFov = this.camera.fov;
    const fov = framing.fov;
    this.lensFov = fov;
    this.fitRadius = framing.radius;
    this.applyOrbitLimits();
    this.controls.enabled = false;
    this.cameraScripted = true;
    await this.tweens.to({
      duration: 0.95,
      easing: Ease.inOutCubic,
      onUpdate: (t) => {
        this.camera.position.lerpVectors(fromPosition, framing.position, t);
        this.controls.target.lerpVectors(fromTarget, framing.target, t);
        this.camera.fov = fromFov + (fov - fromFov) * t;
        this.camera.updateProjectionMatrix();
      },
    });
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    this.cameraScripted = false;
    this.captureFollowRig();
    this.controls.enabled = this.interactive;
  }

  /** A dark, theme-tinted void: no haze, nothing to read but the board. */
  private applyTacticalAtmosphere(): void {
    const look = ARENA_LOOKS[this.arena];
    (this.scene.background as THREE.Color).setHex(look.background).multiplyScalar(0.16);
    const fog = this.scene.fog as THREE.FogExp2 | null;
    if (fog) fog.density = 0;
    this.applyExposure(look.exposure * 1.12);
  }

  /**
   * Hides the staged world while keeping every light burning — the board still
   * has to be lit by the same key, fill and torches it had a moment ago.
   */
  private strikeWorld(): void {
    for (const group of [this.hall.group, this.battlefield.group, this.jungle.group]) {
      for (const child of group.children) {
        if ((child as THREE.Light).isLight || !child.visible) continue;
        child.visible = false;
        this.struck.push(child);
      }
    }
  }

  private restoreWorld(): void {
    for (const object of this.struck) object.visible = true;
    this.struck = [];
  }

  /**
   * Spins every counter so its stamped rank stays upright on screen, whichever
   * way the map has been turned.
   */
  private alignTokens(): void {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const yaw = Math.atan2(-up.x, -up.z);
    for (const piece of this.allPieces()) piece.setTokenYaw(yaw);
  }

  /** Every figure the engine currently owns, wherever it is in its life. */
  private *allPieces(): Generator<PieceView> {
    for (const piece of this.pieces.values()) yield piece;
    for (const piece of this.motion) yield piece;
    for (const piece of this.captured) yield piece;
  }

  /**
   * Orbit the camera around the board centre by `deltaTheta` radians, keeping
   * the current distance and elevation so the framing never jumps.
   */
  private async orbitBy(deltaTheta: number, duration: number): Promise<void> {
    if (this.orbiting) return;
    this.orbiting = true;
    const target = this.controls.target.clone();
    const spherical = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(target));
    const startTheta = spherical.theta;
    const wasEnabled = this.controls.enabled;
    this.controls.enabled = false;
    try {
      await this.tweens.to({
        duration,
        easing: Ease.inOutCubic,
        onUpdate: (t) => {
          spherical.theta = startTheta + deltaTheta * t;
          this.camera.position.copy(target.clone().add(new THREE.Vector3().setFromSpherical(spherical)));
          this.camera.lookAt(target);
        },
      });
    } finally {
      this.orbiting = false;
      this.controls.enabled = wasEnabled && this.interactive;
    }
  }

  /**
   * HUD control: spin the view a half turn so the player can read the board
   * from the opponent's side. Works from any preset or hand-dragged angle.
   */
  flipCamera(): void {
    if (this.orbiting) return;
    this.cameraFlipped = !this.cameraFlipped;
    this.callbacks.onCameraFlipped?.(this.cameraFlipped);
    void this.orbitBy(Math.PI, 0.95);
  }

  /** True when the view currently sits on the far side of its starting shot. */
  isCameraFlipped(): boolean {
    return this.cameraFlipped;
  }

  /**
   * Hotseat: swing the camera round the board between turns. Opt-in, and slower
   * than the hand flip (1.15s -> 1.8s): a flip is asked for and watched, whereas
   * this one arrives unbidden at the end of a move the player was already
   * following, so it has to read as the hall turning rather than a cut.
   */
  private async swingCamera(): Promise<void> {
    await this.orbitBy(Math.PI, 1.8);
  }

  async playIntro(): Promise<void> {
    if (this.introPlaying) return;
    this.introPlaying = true;
    this.introSkipped = false;
    this.interactive = false;
    this.controls.enabled = false;
    this.postfx.setCinematic(true, 7);

    // The fly-in is a performance and keeps its authored path, but the shot it
    // lands on is the one the player will play from — so that one is solved for
    // the screen like every other framing.
    this.framedShot = CAMERA_SHOTS.white;
    const rest = this.framingFor(CAMERA_SHOTS.white);
    this.adoptFraming(rest);
    const path: CameraShot[] = [
      { position: new THREE.Vector3(13.5, 2.1, 12.5), target: new THREE.Vector3(5, 3.2, 3.5) },
      { position: new THREE.Vector3(8.5, 2.4, 10.5), target: new THREE.Vector3(0, 1.4, 0) },
      { position: new THREE.Vector3(2.6, 4.2, 9.6), target: new THREE.Vector3(0, 0.6, 0) },
      rest,
    ];
    this.camera.position.copy(path[0].position);
    this.controls.target.copy(path[0].target);

    for (let i = 1; i < path.length; i += 1) {
      if (this.introSkipped) break;
      await this.moveCameraTo(path[i], i === path.length - 1 ? 2.2 : 2.4);
      this.controls.enabled = false;
    }

    this.camera.position.copy(rest.position);
    this.controls.target.copy(rest.target);
    this.postfx.setCinematic(false);
    this.introPlaying = false;
    this.interactive = true;
    this.controls.enabled = true;
  }

  skipIntro(): void {
    if (!this.introPlaying) return;
    this.introSkipped = true;
    this.tweens.cancelAll();
  }

  private async playEndCinematic(): Promise<void> {
    const snapshot = this.controller.getSnapshot();
    const result = snapshot.result;
    if (!result) return;
    audio.play("fanfare", 0.7);
    // The map holds its framing: no dolly, no depth of field.
    if (this.tactical) return;

    const loser: Faction | null = result.winner ? (result.winner === "w" ? "b" : "w") : null;
    let focus = new THREE.Vector3(0, 0.6, 0);
    if (loser) {
      for (const [square, piece] of this.pieces) {
        if (piece.kind === "k" && piece.color === loser) {
          focus = squareToWorld(square, 0.7);
          break;
        }
      }
    }
    this.postfx.setCinematic(true, Math.max(4, this.camera.position.distanceTo(focus) * 0.55));
    const direction = this.camera.position.clone().sub(focus).normalize();
    const shot: CameraShot = {
      position: focus.clone().add(direction.multiplyScalar(3.4)).setY(1.9),
      target: focus,
    };
    this.shake.add(0.35);
    await this.moveCameraTo(shot, 2.4);
  }

  // ---------------------------------------------------------------- promotion

  /**
   * Builds the four candidates a promoting pawn may become.
   *
   * This is a modal moment, so it is staged like one: a dark panel drops behind
   * the candidates, and each stands on its own plinth over a plaque naming the
   * rank and the key that picks it. Four bare sculpts is not a choice a player
   * can read — every officer in this army is royal-height and the differences
   * live in their hands, which at picker size is a few pixels of weapon.
   */
  private buildPromotionPicker(color: Faction): void {
    this.closePromotionPicker();
    const group = new THREE.Group();
    const pedestalGeometry = new THREE.CylinderGeometry(0.44, 0.54, 0.22, 24);
    const accent = new THREE.Color(FACTION_ACCENT[color]);

    PROMOTION_CHOICES.forEach(({ kind, key }) => {
      const slot = new THREE.Group();
      const pedestal = new THREE.Mesh(
        pedestalGeometry,
        new THREE.MeshStandardMaterial({
          color: 0x3a332a,
          roughness: 0.5,
          metalness: 0.7,
          emissive: accent.clone().multiplyScalar(0.4),
          emissiveIntensity: 0.5,
        }),
      );
      pedestal.position.y = -0.11;
      pedestal.userData.promotion = kind;
      slot.add(pedestal);

      const view = this.factory.create(kind, color, {
        contactShadows: false,
        idleAnimation: true,
        rankBadge: false,
      });
      view.container.scale.setScalar(PROMOTION_SLOT_SCALE);
      for (const mesh of view.hitMeshes) mesh.userData.promotion = kind;
      // The figure turns inside its own group, so the idle spin never swings the
      // name plate out of line.
      const spin = new THREE.Group();
      spin.add(view.container);
      slot.add(spin);

      const plaque = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: promotionPlaqueTexture(kind, color, PIECE_LABEL[kind], key),
          transparent: true,
          depthTest: false,
          depthWrite: false,
        }),
      );
      plaque.scale.set(PROMOTION_SLOT_WIDTH, PROMOTION_SLOT_WIDTH / PLAQUE_ASPECT, 1);
      plaque.position.y = -0.5;
      plaque.renderOrder = 60;
      plaque.frustumCulled = false;
      // The plate is the easiest thing to aim at, so it picks too.
      plaque.userData.promotion = kind;
      slot.add(plaque);

      this.promotionViews.push(view);
      this.promotionSlots.push({ kind, group: slot, spin, view, plaque, pedestal, attention: 0 });
      group.add(slot);
    });

    // Scrim: hung behind the candidates and resized to the viewport every frame,
    // so the far army reads as a dimmed backdrop instead of clutter the
    // candidates have to fight. Measured on a phone, board figures covered
    // 94-100% of every candidate's silhouette before this.
    const scrim = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x04060c, transparent: true, opacity: 0, depthWrite: false }),
    );
    scrim.position.z = -PROMOTION_SCRIM_DEPTH;
    scrim.renderOrder = -1;
    scrim.frustumCulled = false;
    group.add(scrim);
    this.promotionScrim = scrim;

    this.scene.add(group);
    this.promotionGroup = group;
    this.promotionHover = null;
    this.setBoardOverlaysMuted(true);
    this.layoutPromotionPicker(0);
    this.callbacks.onPromotionOpen(true);
  }

  /**
   * Places the picker in front of the camera and solves its size from the
   * viewport: four across on a wide screen, a 2x2 grid where the screen is too
   * narrow to hold four readable figures side by side. Measured on a phone, the
   * old board-anchored row drew each candidate 38px tall inside the far army;
   * the solved grid gets the same figure to ~115px over the scrim.
   */
  private layoutPromotionPicker(delta: number): void {
    const group = this.promotionGroup;
    if (!group) return;

    const aspect = Math.max(0.35, this.camera.aspect);
    const columns = aspect < 1.05 ? 2 : PROMOTION_CHOICES.length;
    const rows = Math.ceil(PROMOTION_CHOICES.length / columns);
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const spanWide = (columns - 1) * PROMOTION_SPACING + PROMOTION_SLOT_WIDTH;
    const spanTall = (rows - 1) * PROMOTION_ROW_GAP + PROMOTION_SLOT_HEIGHT;
    const distance = THREE.MathUtils.clamp(
      Math.max(spanWide / (PROMOTION_FILL * 2 * halfHeight * aspect), spanTall / (PROMOTION_FILL * 2 * halfHeight)),
      3,
      9,
    );

    // Anchored to the camera, not to the board: the picker then reads the same on
    // every screen and can never end up hidden inside a rank of figures.
    const forward = this.camera.getWorldDirection(this.pickerScratch);
    group.position.copy(this.camera.position).addScaledVector(forward, distance);
    if (this.tactical) {
      // Looking straight down, "up" is meaningless — borrow the camera's own
      // orientation so the grid stays square to the screen.
      group.quaternion.copy(this.camera.quaternion);
    } else {
      group.rotation.set(0, 0, 0);
      group.lookAt(this.camera.position);
    }

    this.promotionSlots.forEach((slot, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const hovered = this.promotionHover === slot.kind;
      slot.attention += ((hovered ? 1 : 0) - slot.attention) * Math.min(1, delta * 12);
      slot.group.position.set(
        (column - (columns - 1) / 2) * PROMOTION_SPACING,
        ((rows - 1) / 2 - row) * PROMOTION_ROW_GAP + PROMOTION_SLOT_HEIGHT * 0.1 + slot.attention * 0.12,
        slot.attention * 0.18,
      );
      slot.group.scale.setScalar(1 + slot.attention * 0.06);
      slot.spin.rotation.y = this.elapsed * 0.7 + index * 0.5;
      const pedestal = slot.pedestal.material as THREE.MeshStandardMaterial;
      pedestal.emissiveIntensity = 0.5 + slot.attention * 1.6;
      (slot.plaque.material as THREE.SpriteMaterial).opacity = 0.9 + slot.attention * 0.1;
    });

    if (this.promotionScrim) {
      const depth = distance + PROMOTION_SCRIM_DEPTH;
      const height = 2 * halfHeight * depth * 1.25;
      this.promotionScrim.scale.set(height * aspect * 1.25, height, 1);
      const material = this.promotionScrim.material as THREE.MeshBasicMaterial;
      material.opacity = Math.min(0.72, material.opacity + delta * 3);
    }

    this.postfx.setCinematic(true, distance + 0.4);
  }

  private closePromotionPicker(): void {
    if (this.promotionGroup) {
      this.scene.remove(this.promotionGroup);
      this.promotionGroup.traverse((node) => {
        const carrier = node as THREE.Mesh | THREE.Sprite;
        if ((carrier as THREE.Mesh).isMesh && (carrier as THREE.Mesh).geometry) (carrier as THREE.Mesh).geometry.dispose();
        // The sculpts belong to their PieceView and are disposed with it; only the
        // picker's own plinths, plates and scrim are freed here.
        if (!carrier.userData.promotion && !(carrier as THREE.Sprite).isSprite) return;
        const material = carrier.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) for (const entry of material) entry.dispose();
        else material?.dispose();
      });
      this.promotionGroup = null;
    }
    for (const view of this.promotionViews) view.dispose();
    this.promotionViews = [];
    this.promotionSlots = [];
    this.promotionScrim = null;
    this.promotionHover = null;
    this.setBoardOverlaysMuted(false);
    this.postfx.setCinematic(false);
    this.callbacks.onPromotionOpen(false);
  }

  /**
   * Stands the depth-ignoring board overlays down while the picker is up.
   *
   * Rank crests and the x-ray reticles are drawn with `depthTest: false` on
   * purpose — a crest hidden behind the figure in front of it would be useless.
   * The same licence lets them punch through a modal panel: the crests of the
   * army standing behind the picker were landing on top of the candidates and
   * their name plates. Render order alone cannot fix it, because the plinths and
   * sculpts are opaque and so are drawn before every transparent sprite; the
   * overlays have to leave instead. The player's own crest preference is left
   * untouched — this is a separate mute, restored when the picker closes.
   */
  private setBoardOverlaysMuted(muted: boolean): void {
    for (const piece of this.pieces.values()) piece.setBadgeMuted(muted);
    for (const piece of this.motion) piece.setBadgeMuted(muted);
    for (const piece of this.captured) piece.setBadgeMuted(muted);
    this.board.setOverlaysMuted(muted);
  }

  /** Which candidate, if any, the pointer ray currently reaches. */
  private pickPromotion(): PieceKind | null {
    if (!this.promotionGroup) return null;
    const targets: THREE.Object3D[] = [];
    this.promotionGroup.traverse((node) => {
      if ((node as THREE.Mesh).isMesh || (node as THREE.Sprite).isSprite) targets.push(node);
    });
    for (const hit of this.raycaster.intersectObjects(targets, false)) {
      let node: THREE.Object3D | null = hit.object;
      while (node) {
        const kind = node.userData.promotion as PieceKind | undefined;
        if (kind) return kind;
        node = node.parent;
      }
    }
    return null;
  }

  /**
   * Takes the choice from outside the canvas — the keyboard shortcuts printed on
   * each plaque. No-op unless a promotion is actually waiting.
   */
  choosePromotion(kind: PieceKind): boolean {
    if (!this.promotionResolve) return false;
    if (!PROMOTION_CHOICES.some((choice) => choice.kind === kind)) return false;
    audio.blip("press");
    this.promotionResolve(kind);
    return true;
  }

  private requestPromotion(color: Faction): Promise<PieceKind> {
    this.buildPromotionPicker(color);
    return new Promise<PieceKind>((resolve) => {
      this.promotionResolve = (kind) => {
        this.promotionResolve = null;
        this.closePromotionPicker();
        resolve(kind);
      };
    });
  }

  // -------------------------------------------------------------- interaction

  private bindEvents(): void {
    this.controls.addEventListener("start", this.onManualCamera);
    this.controls.addEventListener("change", this.onManualCameraChange);
    this.controls.addEventListener("end", this.onManualCameraEnd);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("resize", this.handleResize);
    this.canvas.addEventListener("webglcontextlost", this.onContextLost);
    this.canvas.addEventListener("webglcontextrestored", this.onContextRestored);
  }

  private updatePointer(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  /**
   * Resolves what the pointer is over.
   *
   * Figures are life-size humans, so a sculpt covers the squares *behind* it on
   * screen. Testing the tiles alone therefore hands back the wrong square as
   * soon as the player clicks a figure's body — the click silently lands two
   * ranks further up the board. Every figure carries an invisible collider, and
   * whichever of collider/tile the ray reaches first wins.
   *
   * That rule is right for choosing a figure and wrong for playing a move, and
   * the difference is what {@link reachUnderPointer} settles.
   */
  private pickTarget(exclude?: PieceView | null): { square: SquareId | null; piece: PieceView | null } {
    const hit = this.rayPick(exclude);
    const reach = this.reachUnderPointer();
    if (reach === null || reach === hit.square) return hit;

    // A figure speaks for the ground it stands on, and no further. The pointer is
    // inside a lit destination's own footprint here, so unless it is *also* over
    // the square whatever-is-in-front occupies — its feet, its base, the tile it
    // was picked for — the destination is what the player is aiming at.
    if (hit.square !== null && this.pointerOverSquare(hit.square)) return hit;
    return { square: reach, piece: this.pieces.get(reach) ?? null };
  }

  /** The nearest solid thing under the ray: a figure's collider, or the stone. */
  private rayPick(exclude?: PieceView | null): { square: SquareId | null; piece: PieceView | null } {
    const colliders: THREE.Mesh[] = [];
    for (const piece of this.pieces.values()) {
      if (piece === exclude) continue;
      colliders.push(...piece.hitMeshes);
    }
    const pieceHit = this.raycaster.intersectObjects(colliders, false)[0] ?? null;
    const tileHit = this.raycaster.intersectObjects(this.board.tiles, false)[0] ?? null;

    if (pieceHit && (!tileHit || pieceHit.distance <= tileHit.distance)) {
      const piece = (pieceHit.object.userData.piece as PieceView | undefined) ?? null;
      const square = piece ? this.squareOf(piece) : null;
      if (square) return { square, piece };
    }

    const square = tileHit
      ? ((tileHit.object.userData.square as SquareId | undefined) ?? null)
      : this.squareUnderRay();
    return { square, piece: square ? (this.pieces.get(square) ?? null) : null };
  }

  /**
   * The lit destination the pointer is over, **ignoring depth**.
   *
   * The board is played from a low camera among life-size figures, so a legal
   * square is usually behind a body rather than beside one: on the opening
   * position a knight's own two destinations are 88% hidden behind the pawns in
   * front of them on a desktop window, and ~64% on a phone. Every one of those
   * clicks used to be eaten by the pawn — the selection jumped to it instead of
   * the knight moving, which reads as the board ignoring the player.
   *
   * The pointer being inside a square's projected outline is exactly the test
   * "the player is pointing at that square", and it needs no tolerance to tune:
   * the board is one plane, so its 64 outlines tile the screen without gaps or
   * overlaps, and at most one can contain the pointer.
   */
  private reachUnderPointer(): SquareId | null {
    if (this.selected === null || this.legalTargets.size === 0) return null;
    for (const square of this.legalTargets.keys()) {
      if (this.pointerOverSquare(square)) return square;
    }
    return null;
  }

  /** Is the pointer inside this square's own footprint on screen? */
  private pointerOverSquare(square: SquareId): boolean {
    const centre = squareToWorld(square, BOARD_TOP);
    const half = TILE / 2;
    let side = 0;
    for (let index = 0; index < 4; index += 1) {
      const from = this.footprintCorner(this.scratchCornerA, centre, half, index);
      const to = this.footprintCorner(this.scratchCornerB, centre, half, (index + 1) % 4);
      // A corner behind the eye makes the projection meaningless, and a tile that
      // close is not one anybody is trying to click.
      if (from.z > 1 || to.z > 1) return false;
      const cross =
        (to.x - from.x) * (this.pointer.y - from.y) - (to.y - from.y) * (this.pointer.x - from.x);
      const turn = Math.sign(cross);
      if (turn === 0) continue;
      if (side === 0) side = turn;
      else if (turn !== side) return false;
    }
    return true;
  }

  /** Corner `index` of a square, walked around the perimeter, in clip space. */
  private footprintCorner(
    out: THREE.Vector3,
    centre: THREE.Vector3,
    half: number,
    index: number,
  ): THREE.Vector3 {
    const step = FOOTPRINT_CORNERS[index];
    return out.set(centre.x + step[0] * half, BOARD_TOP, centre.z + step[1] * half).project(this.camera);
  }

  private squareUnderRay(): SquareId | null {
    const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.boardPlane, point)) return null;
    return worldToSquare(point.x, point.z);
  }

  private squareOf(piece: PieceView): SquareId | null {
    for (const [square, view] of this.pieces) {
      if (view === piece) return square;
    }
    return null;
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.interactive) return;
    this.updatePointer(event);

    if (this.promotionGroup) {
      this.board.setHover(null);
      const kind = this.pickPromotion();
      if (kind !== this.promotionHover) {
        if (kind) audio.blip("hover");
        this.promotionHover = kind;
      }
      this.canvas.style.cursor = kind ? "pointer" : "default";
      return;
    }

    // The dismiss coin sits in front of everything, so it answers the pointer
    // before the board does — otherwise the square behind it would steal the
    // hover and the player would be aiming at the coin while the stone lit up.
    if (this.premoveCancelUnderPointer()) {
      if (!this.premoveCancelHovered) {
        this.premoveCancelHovered = true;
        this.board.setPremoveCancelHot(true);
        audio.blip("hover");
      }
      if (this.hoveredPiece) {
        this.hoveredPiece.setHovered(false);
        this.hoveredPiece = null;
      }
      this.board.setHover(null);
      this.canvas.style.cursor = "pointer";
      return;
    }
    if (this.premoveCancelHovered) {
      this.premoveCancelHovered = false;
      this.board.setPremoveCancelHot(false);
    }

    const { square: hoveredSquare, piece } = this.pickTarget();
    const snapshot = this.controller.getSnapshot();
    // Two ways a figure is touchable: it is your turn and the figure is yours,
    // or the machine is still on the clock and the figure is yours to aim.
    const canTouch =
      piece !== null &&
      snapshot.status === "playing" &&
      (this.controller.isHumanTurn()
        ? piece.color === snapshot.turn
        : this.controller.canPremove() && piece.color === snapshot.playerColor);

    if (this.hoveredPiece && this.hoveredPiece !== piece) {
      this.hoveredPiece.setHovered(false);
      this.hoveredPiece = null;
    }
    if (canTouch && piece) {
      if (this.hoveredPiece !== piece) audio.blip("hover");
      piece.setHovered(true);
      this.hoveredPiece = piece;
    }

    this.board.setHover(hoveredSquare);
    this.canvas.style.cursor =
      canTouch || (this.selected && hoveredSquare !== null && this.legalTargets.has(hoveredSquare))
        ? "pointer"
        : "default";
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.interactive || event.button !== 0) return;
    this.updatePointer(event);

    if (this.promotionGroup) {
      const kind = this.pickPromotion();
      if (kind) this.choosePromotion(kind);
      return;
    }

    // Only the press position is recorded here — the board is played entirely
    // by tapping (pick a figure, then tap its destination), so acting on release
    // lets a press that turns into a camera orbit be discarded.
    const { square } = this.pickTarget();
    this.pointerDownAt = { x: event.clientX, y: event.clientY, square };
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.interactive) return;
    const down = this.pointerDownAt;
    this.pointerDownAt = null;
    if (!down) return;

    // A press that travelled was the camera being swung around, not a tap on a
    // square, so it must never move a figure or change the selection. A finger
    // is allowed more slop than a mouse — a tap on glass always drifts a little.
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > this.limits.tapSlop) return;

    this.updatePointer(event);

    // Tapping the coin takes the last queued move back, whatever else is under
    // it. One link at a time: it is the chain's undo, not its bin.
    if (this.premoveCancelUnderPointer()) {
      this.premoveCancelHovered = false;
      this.board.setPremoveCancelHot(false);
      audio.blip("deny");
      this.controller.popPremove();
      return;
    }

    const { square, piece } = this.pickTarget();

    if (!square) {
      this.clearSelection();
      return;
    }

    const snapshot = this.controller.getSnapshot();
    if (snapshot.status !== "playing") return;

    // The machine still holds the board: a tap aims a move at the position that
    // is about to exist rather than at the one on the stone.
    if (!this.controller.isHumanTurn()) {
      if (this.controller.canPremove()) this.handlePremoveTap(square, piece, snapshot);
      return;
    }

    if (this.selected && square !== this.selected) {
      if (this.legalTargets.has(square)) {
        void this.commitMove(this.selected, square);
        return;
      }
      if (piece && piece.color === snapshot.turn) this.selectWithTap(square, piece);
      else {
        void this.rejectMove(this.selected);
        this.clearSelection();
      }
      return;
    }

    if (this.selected === square) {
      this.clearSelection();
      return;
    }

    if (piece && piece.color === snapshot.turn) this.selectWithTap(square, piece);
  };

  // ---------------------------------------------------------------- premoves

  /**
   * One tap inside the waiting window: pick a figure, aim it, or stand down.
   *
   * Everything here is read off the *projected* board rather than off the
   * stone. Once a link is queued its figure is, as far as the plan is
   * concerned, already on the far square — so that is where the next link is
   * picked up from, even though the wood has not moved.
   */
  private handlePremoveTap(square: SquareId, piece: PieceView | null, snapshot: GameSnapshot): void {
    const projected = this.controller.premovePieceAt(square);
    const mine = projected !== null && projected.color === snapshot.playerColor;

    if (this.premoving && this.selected) {
      if (square === this.selected) {
        this.clearSelection();
        return;
      }
      if (this.legalTargets.has(square)) {
        void this.queuePremove(this.selected, square);
        return;
      }
      if (mine) {
        this.selectPremoveWithTap(square, piece);
        return;
      }
      this.clearSelection();
      return;
    }

    // Tapping a link's starting square takes that link back — and with it every
    // link behind it, which was aimed at a board that will now never happen.
    const index = this.controller.premoveIndexFrom(square);
    if (index >= 0) {
      this.controller.truncatePremoves(index);
      return;
    }
    if (mine) this.selectPremoveWithTap(square, piece);
    else this.controller.clearPremove();
  }

  /**
   * Picking a figure for a queued move. The tap is the same gesture as a normal
   * selection but deliberately quieter — this is a promise, not a placement.
   */
  private selectPremoveWithTap(square: SquareId, piece: PieceView | null): void {
    this.selectPremove(square);
    const projected = this.controller.premovePieceAt(square);
    if (!projected) return;
    audio.woodTap({
      // A figure picked up further down the chain has no wood on that square
      // yet, so the tap is panned by where the plan puts it.
      pan: this.stereoPan(piece ? piece.container.position : squareToWorld(square)),
      weight: WOOD_WEIGHT[projected.kind],
      volume: 0.5,
      lift: false,
    });
  }

  /**
   * Lights the squares a figure could ever step to, read off its geometry
   * rather than off the position — see `GameController.premoveTargets`.
   */
  private selectPremove(square: SquareId): void {
    this.previewing = false;
    this.clearSelection();
    if (!this.controller.premovePieceAt(square)) return;
    this.selected = square;
    this.premoving = true;
    // Deeper in the chain the square is bare stone: the figure is still standing
    // where it started, so only the square can be lit.
    this.pieces.get(square)?.setSelected(true);
    this.board.setHighlight(square, "select");

    const origin = squareToWorld(square);
    const targets = this.controller
      .premoveTargets(square)
      .map((to) => ({ to, distance: squareToWorld(to).distanceTo(origin) }));
    targets.sort((a, b) => a.distance - b.distance);
    for (const target of targets) {
      this.legalTargets.set(target.to, false);
      this.board.setHighlight(target.to, "premove", false, Math.min(target.distance * 0.02, 0.14));
    }
    this.board.setShroud([square, ...targets.map((target) => target.to)], square);
    if (targets.length > 0) audio.blip("hover");
  }

  /** Hands the aimed move to the controller, asking for a crown first if needed. */
  private async queuePremove(from: SquareId, to: SquareId): Promise<void> {
    const projected = this.controller.premovePieceAt(from);
    let promotion: PieceKind | undefined;
    if (this.controller.isPremovePromotion(from, to)) {
      const color = this.controller.getSnapshot().playerColor;
      this.clearSelection();
      promotion = await this.requestPromotion(color);
    }
    if (!this.controller.setPremove(from, to, promotion)) {
      // Either the window closed while the picker was open, or the queue is
      // already as deep as it is allowed to be. Both end the same way: nothing
      // is queued, and the deny blip says the tap was heard, not swallowed.
      audio.blip("deny");
      this.clearSelection();
      return;
    }
    if (!projected) return;
    const piece = this.pieces.get(from);
    audio.woodTap({
      pan: this.stereoPan(piece ? piece.container.position : squareToWorld(from)),
      weight: WOOD_WEIGHT[projected.kind],
      volume: 0.42,
      lift: false,
    });
    // The knock alone said "a figure was touched", which is also what picking
    // one up says. The note is what says *it is in the queue* — and it steps up
    // the ladder with the link, so a chain is heard being built. It is panned
    // where the plan *lands*, not where the wood is: the mark just appeared
    // there.
    audio.premoveChime({
      pan: this.stereoPan(squareToWorld(to)),
      index: this.controller.getPremoves().length - 1,
    });
  }

  /** Is the pointer on the dismiss coin of a queued move? */
  private premoveCancelUnderPointer(): boolean {
    const handle = this.board.premoveCancelHandle();
    if (!handle) return false;
    return this.raycaster.intersectObject(handle, false).length > 0;
  }

  /** The controller's queue changed: repaint the chain. */
  private onPremoveChanged(premoves: { from: SquareId; to: SquareId }[]): void {
    this.premoveChain = premoves.map((move) => ({ from: move.from, to: move.to }));
    if (premoves.length === 0) {
      this.premoveCancelHovered = false;
      this.board.setPremoveCancelHot(false);
    }
    this.clearSelection();
  }

  /**
   * Lights the queued move, if there is one, on top of the ambient markers.
   *
   * The two ends are deliberately *not* dressed alike. The origin already has a
   * figure standing on it to explain itself; the destination is bare stone and
   * is the half the player actually needs to read back, so it gets the bright
   * bracketed border and the origin is left as a dim hollow ring. Same pewter
   * family, one clearly the head of the arrow.
   */
  private applyPremoveHighlight(): void {
    this.board.setPremoveLinks(this.premoveChain);
    // Which square is *third* cannot be read off the marks: the rings are all
    // alike and the threads cross. The numerals sit on the destinations, so
    // they read in the same order the moves will run.
    this.board.setPremoveOrders(this.premoveChain.map((link) => link.to));
    const last = this.premoveChain.length > 0 ? this.premoveChain[this.premoveChain.length - 1] : null;
    // The dismiss coin only makes sense while a move is still waiting, and it
    // hangs over the *end* of the chain because that is the link it takes back.
    this.board.setPremoveCancel(last ? last.to : null);
    if (!last) return;
    // A chain is one arrow, not a pile of them: every waypoint keeps the dim
    // hollow ring and only the square the plan finishes on gets the bright head.
    for (const link of this.premoveChain) {
      this.board.setHighlight(link.from, "queued", false);
      if (link !== last) this.board.setHighlight(link.to, "queued", false);
    }
    this.board.setHighlight(last.to, "queuedTarget", true);
  }

  /**
   * The reply left the queued move unplayable. One short red beat on both
   * squares and it is gone — the player just watched the move that killed it,
   * so there is nothing to explain and nothing to dismiss.
   *
   * A check is the exception. The king's own square is already beating red and
   * the banner is already up; two reds at once is two messages for one event,
   * and the louder one is not the queue. So a chain lost to a check leaves with
   * the sound and the tremor only, and the board keeps the check to itself.
   */
  private async flashPremoveLost(
    from: SquareId,
    to: SquareId,
    dropped: number,
    reason: "illegal" | "check",
  ): Promise<void> {
    this.premoveChain = [];
    this.board.setPremoveCancel(null);
    this.board.setPremoveOrders([]);
    // A whole plan going down deserves more than the same beat as one move.
    if (dropped > 1) this.shake.tremor(0.09, 0.4);
    this.premoveCancelHovered = false;
    audio.blip("deny");
    if (reason === "check") {
      this.restoreBaseHighlights();
      return;
    }
    this.board.setHighlight(from, "capture", true);
    this.board.setHighlight(to, "capture", true);
    await wait(0.55);
    if (this.disposed) return;
    this.restoreBaseHighlights();
  }

  /** Selecting by tap: the figure stands to attention with a dry wooden tick. */
  private selectWithTap(square: SquareId, piece: PieceView): void {
    this.select(square);
    audio.woodTap({
      pan: this.stereoPan(piece.container.position),
      weight: WOOD_WEIGHT[piece.kind],
      volume: 0.8,
      lift: true,
    });
  }

  private async commitMove(from: SquareId, to: SquareId): Promise<void> {
    let promotion: PieceKind | undefined;
    if (this.controller.isPromotion(from, to)) {
      const color = this.controller.getSnapshot().turn;
      this.clearSelection();
      promotion = await this.requestPromotion(color);
    }
    const ok = await this.controller.tryMove(from, to, promotion);
    if (!ok) void this.rejectMove(from);
  }

  private select(square: SquareId): void {
    this.previewing = false;
    this.clearSelection();
    const piece = this.pieces.get(square);
    if (!piece) return;
    this.selected = square;
    piece.setSelected(true);
    this.board.setHighlight(square, "select");

    // Legal squares ripple outward from the piece so the fan of options reads
    // as one motion instead of 20 markers blinking on at once.
    const origin = squareToWorld(square);
    const targets = this.controller.legalTargets(square).map((target) => ({
      ...target,
      distance: squareToWorld(target.to).distanceTo(origin),
    }));
    targets.sort((a, b) => a.distance - b.distance);
    for (const target of targets) {
      this.legalTargets.set(target.to, target.capture);
      const delay = Math.min(target.distance * 0.02, 0.14);
      // Colour-coded by move type: red for captures, violet for promotions,
      // azure for castling, emerald for a quiet advance.
      const kind: HighlightKind = target.capture
        ? "capture"
        : target.promotion
          ? "promote"
          : target.castle
            ? "castle"
            : "move";
      this.board.setHighlight(target.to, kind, target.capture || target.promotion, delay);
    }

    // Everything the piece cannot reach falls into shadow so the lit squares
    // are unmistakable even when several of them share a colour.
    this.board.setShroud([square, ...targets.map((target) => target.to)], square);
    if (targets.length > 0) audio.blip("hover");
  }

  private clearSelection(): void {
    if (this.selected) {
      const piece = this.pieces.get(this.selected);
      piece?.setSelected(false);
    }
    this.selected = null;
    this.legalTargets.clear();
    this.previewing = false;
    this.premoving = false;
    this.board.setShroud(null);
    this.restoreBaseHighlights();
  }

  /** Re-lights the ambient markers (last move, check, queued move). */
  private restoreBaseHighlights(): void {
    this.board.clearHighlights();
    const snapshot = this.controller.getSnapshot();
    if (snapshot.lastMove) {
      this.board.setHighlight(snapshot.lastMove.from, "last");
      this.board.setHighlight(snapshot.lastMove.to, "last");
    }
    this.applyCheckHighlight(snapshot);
    this.applyPremoveHighlight();
  }

  /**
   * Lights the two squares of a move picked from the move ledger. Ignored while
   * a piece is selected so it never fights the legal-move markers.
   */
  previewMove(move: { from: SquareId; to: SquareId } | null): void {
    if (this.selected) return;
    if (!move) {
      if (!this.previewing) return;
      this.previewing = false;
      this.restoreBaseHighlights();
      return;
    }
    this.board.clearHighlights();
    this.board.setHighlight(move.from, "hint", true);
    this.board.setHighlight(move.to, "hint", true);
    this.previewing = true;
  }

  private applyCheckHighlight(snapshot: GameSnapshot): void {
    for (const piece of this.pieces.values()) piece.setAlarm(0);
    const threatened = this.threatenedKing(snapshot);
    // The alarm is driven off the *state*, not off the move that caused it, so it
    // is also right after an undo, a rebuild or a mid-game graphics change — and
    // it always stands down when the king walks out of check.
    this.alarm.setThreat(threatened ? squareToWorld(threatened.square) : null);
    if (!threatened) return;
    threatened.piece.setAlarm(1);
    this.board.setHighlight(threatened.square, "check", true);
  }

  /** The king currently in check, if the game is still being played. */
  private threatenedKing(snapshot: GameSnapshot): { square: SquareId; piece: PieceView } | null {
    if (!snapshot.inCheck || snapshot.status !== "playing") return null;
    for (const [square, piece] of this.pieces) {
      if (piece.kind === "k" && piece.color === snapshot.turn) return { square, piece };
    }
    return null;
  }

  private onState(snapshot: GameSnapshot): void {
    this.applyCheckHighlight(snapshot);
    const intensity = snapshot.inCheck ? 1 : snapshot.captured.length >= 12 ? 0.6 : 0;
    audio.setIntensity(intensity);
  }

  // ------------------------------------------------------------------ options

  /**
   * Switches the map the board is staged in. Every subsystem repaints in place
   * — no geometry is rebuilt — so the change lands within a single frame even
   * mid-game, and only the reflection probe is regenerated.
   */
  setArena(theme: ArenaTheme): void {
    if (theme === this.arena) return;
    this.arena = theme;
    const look = ARENA_LOOKS[theme];

    this.applyExposure(look.exposure);
    (this.scene.background as THREE.Color).setHex(look.background);
    const fog = this.scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.color.setHex(look.fog.color);
      fog.density = look.fog.density;
    }

    this.hall.applyArena(look);
    this.battlefield.applyArena(look);
    this.jungle.applyArena(look);
    this.board.applyArena(look);
    this.postfx.setGrade(look.grade);
    this.postfx.setBloom(look.bloom);

    this.cameraLamp.color.setHex(look.lamp.color);
    this.cameraLamp.intensity = look.lamp.intensity;

    // Re-stage the strike against the new dressing, then put the void back.
    if (this.tactical) {
      this.restoreWorld();
      this.strikeWorld();
      this.applyTacticalAtmosphere();
    }

    this.applyEnvironment();
  }

  /** The map currently staged. */
  getArena(): ArenaTheme {
    return this.arena;
  }

  setQuality(preset: QualityPreset): void {
    if (preset === this.preset) return;
    this.preset = preset;
    const settings = QUALITY_SETTINGS[preset];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.maxPixelRatio));
    this.renderer.shadowMap.enabled = settings.shadows && !this.safeMode;
    this.hall.applyQuality(preset);
    this.battlefield.applyQuality(preset);
    this.jungle.applyQuality(preset);
    this.postfx.setPreset(preset);
    this.handleResize();
    // Rebuilding the figures mid-fight would tear down the ones that are
    // marching, striking or dying and cut their beat short, so an automatic
    // downgrade (which usually fires *because* a fight is on screen) waits for
    // the board to go quiet. The rebuild then runs from `animateMove`.
    if (this.movesInFlight > 0) this.rebuildPending = true;
    else this.rebuildPieces();
    if (this.tactical) {
      this.restoreWorld();
      this.strikeWorld();
    }
  }

  /**
   * Safe rendering. Drops the three things that have been seen to render an
   * all-black scene on Linux/Mesa drivers — the post-processing composer, the
   * reflection probe and the shadow maps — and lifts the exposure a touch to
   * make up for the lost ambient. Fully reversible.
   */
  setSafeMode(active: boolean): void {
    if (this.safeMode === active) return;
    this.safeMode = active;
    this.postfx.setBypassed(active);
    this.renderer.shadowMap.enabled = !active && QUALITY_SETTINGS[this.preset].shadows;
    // A probe that was never tested deserves another chance when safe mode is
    // switched off by hand; one that failed its self-test stays off.
    this.applyEnvironment();
    this.applyExposure();
    this.refreshMaterials();
  }

  isSafeMode(): boolean {
    return this.safeMode;
  }

  /** Player-side exposure multiplier (0.6–1.8) for screens that read too dark. */
  setBrightness(value: number): void {
    const clamped = Math.min(1.8, Math.max(0.6, value));
    if (Math.abs(clamped - this.brightness) < 0.001) return;
    this.brightness = clamped;
    this.applyExposure();
  }

  /** One line naming the driver, for the settings panel and bug reports. */
  getGpuSummary(): string {
    return describeGpu(this.gpu);
  }

  /**
   * Musters a different army on one or both sides. The sculpts have to be
   * re-downloaded, so the swap runs in the background: any beat in flight is
   * allowed to finish, every standing figure comes down (its geometry belongs to
   * a template about to be freed), the new rosters load, and the board is stood
   * back up. A request arriving during a swap replaces the pending one.
   */
  setArmySkins(skins: Record<Faction, ArmySkinId>): void {
    this.wantedSkins = { w: skins.w, b: skins.b };
    void this.syncArmies();
  }

  /** The army each side is currently mustering. */
  getArmySkins(): Record<Faction, ArmySkinId> {
    return this.factory.getSkins();
  }

  private async syncArmies(): Promise<void> {
    if (this.swappingArmies) return;
    this.swappingArmies = true;
    try {
      while (!this.disposed) {
        const wanted = this.wantedSkins;
        this.wantedSkins = null;
        if (!wanted || !this.factory.setSkins(wanted)) break;

        // A figure caught mid-march would be holding a sculpt that is about to
        // be freed, so the fight on screen finishes first.
        while (this.movesInFlight > 0 && !this.disposed) await wait(0.1);
        if (this.disposed) return;

        // Stale first, so the rebuild only tears the old army down.
        this.factory.markStale();
        this.rebuildPieces();
        try {
          await this.factory.reload();
        } catch (error) {
          console.warn("[scene] could not muster the new army", error);
        }
        if (this.disposed) return;
        this.rebuildPieces();
        const skins = this.factory.getSkins();
        audio.setArmyCries({ w: ARMY_SKINS[skins.w].cries, b: ARMY_SKINS[skins.b].cries });
        void this.factory.warmClips();
      }
    } finally {
      this.swappingArmies = false;
    }
  }

  /** Rebuilds every figure from the chess core (used after undo). */
  resync(): void {
    this.rebuildPieces();
    const snapshot = this.controller.getSnapshot();
    if (snapshot.lastMove) {
      this.board.setHighlight(snapshot.lastMove.from, "last");
      this.board.setHighlight(snapshot.lastMove.to, "last");
    }
    this.applyCheckHighlight(snapshot);
  }

  setCaptureCinematics(enabled: boolean): void {
    this.captureCinematics = enabled;
  }

  setRotateBoard(enabled: boolean): void {
    this.rotateBoard = enabled;
  }

  /** Floating rank crests above every figure on the board. */
  setRankBadges(enabled: boolean): void {
    if (this.rankBadges === enabled) return;
    this.rankBadges = enabled;
    for (const piece of this.pieces.values()) piece.setBadgeEnabled(enabled);
    for (const piece of this.motion) piece.setBadgeEnabled(enabled);
    for (const piece of this.captured) piece.setBadgeEnabled(enabled);
  }

  /**
   * Showcase presentation for computer-vs-computer duels.
   *
   * The viewer is only ever watching here, so the picture is tuned for reading
   * the board rather than for atmosphere: no depth of field at all (that soft
   * wash was blurring the whole hall), grain, vignette and bloom pulled back,
   * and one held framing instead of a permanent orbit. The camera behaviour is
   * the viewer's choice — see {@link ShowcaseCamera}.
   */
  setShowcase(active: boolean, camera: ShowcaseCamera = "follow", orbitSpeed = 0.32): void {
    const changed = this.showcase !== active;
    this.showcase = active;
    this.showcaseOrbitSpeed = orbitSpeed;
    this.showcaseCamera = camera;
    // A showcase is watched, never squinted at: keep it sharp.
    this.postfx.setCinematic(false);
    this.postfx.setClarity(active);
    if (!active) {
      this.controls.autoRotate = false;
      this.focusPoint(null);
      return;
    }
    if (camera !== "orbit") this.controls.autoRotate = false;
    if (changed && !this.tactical) {
      this.followedFocus.copy(BOARD_FOCUS);
      this.framedShot = SHOWCASE_SHOT;
      const framing = this.framingFor(SHOWCASE_SHOT);
      this.adoptFraming(framing);
      void this.moveCameraTo(framing, 1.4);
    }
  }

  /** Switches the showcase camera between a held angle, an orbit and following. */
  setShowcaseCamera(camera: ShowcaseCamera): void {
    if (this.showcaseCamera === camera) return;
    this.showcaseCamera = camera;
    if (camera !== "orbit") this.controls.autoRotate = false;
    if (camera === "follow") {
      // Track from wherever the view is sitting right now.
      this.captureFollowRig();
      this.followedFocus.copy(this.controls.target);
    }
  }

  /** The showcase camera behaviour currently in force. */
  getShowcaseCamera(): ShowcaseCamera {
    return this.showcaseCamera;
  }

  setAttract(active: boolean): void {
    this.attract = active;
    this.postfx.setCinematic(false);
    this.postfx.setClarity(active || this.showcase);
    if (active) {
      this.controls.enabled = false;
      this.framedShot = CAMERA_SHOTS.cinematic;
      const framing = this.framingFor(CAMERA_SHOTS.cinematic);
      this.adoptFraming(framing);
      void this.moveCameraTo(framing, 2);
    } else {
      this.controls.enabled = this.interactive;
    }
  }

  setInteractive(interactive: boolean): void {
    this.interactive = interactive;
    this.controls.enabled = interactive && !this.introPlaying && !this.attract;
    if (!interactive) {
      this.clearSelection();
      this.hoveredPiece?.setHovered(false);
      this.hoveredPiece = null;
    }
  }

  handleResize = (): void => {
    const parent = this.canvas.parentElement;
    const width = parent?.clientWidth ?? window.innerWidth;
    const height = parent?.clientHeight ?? window.innerHeight;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.postfx.setSize(width, height);
    this.applyViewport(width, height);
  };

  // ------------------------------------------------------------- screen fitting

  /**
   * Re-solve the framing for the surface actually on screen: the lens, the orbit
   * limits, and — when the *shape* of the screen changed rather than just its
   * size — the shot itself.
   *
   * A browser toolbar sliding away only changes the height by a few percent, and
   * re-flying the camera for that would fight the player's own zoom, so the shot
   * is only re-solved when the aspect really moved (a rotation, a phone/desktop
   * switch, a window drag).
   */
  private applyViewport(width: number, height: number): void {
    const previous = this.view;
    this.view = readViewport(width, height);
    const reshaped =
      !this.viewportFitted ||
      previous.portrait !== this.view.portrait ||
      previous.handheld !== this.view.handheld ||
      Math.abs(previous.aspect - this.view.aspect) > 0.06;

    const framing = this.framingFor(this.framedShot);
    this.adoptFraming(framing);
    if (!reshaped) return;

    const first = !this.viewportFitted;
    this.viewportFitted = true;
    this.reframeCamera(framing, first ? 0 : 0.7);
  }

  /** Solves an authored shot for the live viewport. */
  private framingFor(shot: CameraShot): Framing {
    const base = this.tactical ? TACTICAL_FOV : DEFAULT_FOV;
    return frameShot(shot.position, shot.target, this.view, {
      fov: base,
      maxFov: lensCeiling(this.view, base),
      // The map is read from straight above, so it may climb much further out.
      maxDistance: this.tactical ? 30 : 19,
    });
  }

  /** Takes on a framing's lens and reach without moving the camera. */
  private adoptFraming(framing: Framing): void {
    this.lensFov = framing.fov;
    this.fitRadius = framing.radius;
    this.camera.fov = framing.fov;
    this.camera.updateProjectionMatrix();
    this.applyOrbitLimits();
  }

  private applyOrbitLimits(): void {
    this.limits = orbitLimits(this.view, this.fitRadius);
    this.controls.rotateSpeed = this.limits.rotateSpeed;
    this.controls.minPolarAngle = this.limits.minPolarAngle;
    this.controls.maxPolarAngle = this.limits.maxPolarAngle;
    if (this.tactical) {
      this.controls.minDistance = Math.min(11, this.fitRadius * 0.62);
      this.controls.maxDistance = Math.max(34, this.fitRadius * 1.5);
      return;
    }
    this.controls.minDistance = this.limits.minDistance;
    this.controls.maxDistance = this.limits.maxDistance;
  }

  /**
   * Puts the camera on a solved framing while keeping the side of the board the
   * player was watching from — a rotation re-frames the board, it never spins it.
   */
  private reframeCamera(framing: Framing, duration: number): void {
    if (this.introPlaying || this.cameraScripted) return;
    const current = new THREE.Spherical().setFromVector3(
      this.scratchDesired.copy(this.camera.position).sub(this.controls.target),
    );
    const wanted = new THREE.Spherical().setFromVector3(framing.position.clone().sub(framing.target));
    if (current.radius > 1e-3) wanted.theta = current.theta;
    wanted.makeSafe();
    const position = new THREE.Vector3().setFromSpherical(wanted).add(framing.target);
    if (duration <= 0) {
      this.camera.position.copy(position);
      this.controls.target.copy(framing.target);
      this.captureFollowRig();
      return;
    }
    void this.moveCameraTo({ position, target: framing.target.clone() }, duration);
  }

  /**
   * The camera is never allowed out of the hall.
   *
   * Orbit controls can only cap angle and distance independently, so a framing
   * that needs to sit further back — which is exactly what a narrow screen needs
   * — walks the camera straight out through the colonnade at radius 12.5, and
   * the pillars and curtain wall end up standing in front of the board. Any
   * ground reach past the pillars is converted into height here instead, every
   * frame, so the view climbs over the hall rather than backing into it.
   */
  private confineCamera(): void {
    // The intro deliberately flies in from outside the walls.
    if (this.introPlaying || this.cameraScripted) return;
    const ground = Math.hypot(this.camera.position.x, this.camera.position.z);
    if (ground <= HALL_INNER_RADIUS) return;
    const target = this.controls.target;
    const distance = this.camera.position.distanceTo(target);
    const scale = HALL_INNER_RADIUS / ground;
    this.camera.position.x *= scale;
    this.camera.position.z *= scale;
    const flat = Math.hypot(this.camera.position.x - target.x, this.camera.position.z - target.z);
    // Climb by whatever the pull-back was worth, so the framing keeps its size.
    this.camera.position.y = target.y + Math.sqrt(Math.max(0.25, distance * distance - flat * flat));
  }

  private onManualCamera = (): void => {
    this.lastManualCameraAt = this.elapsed;
  };

  /** Damping keeps firing `change` after a drag; only count real user input. */
  private onManualCameraChange = (): void => {
    if (this.controls.autoRotate || this.orbiting || this.cameraDriven || this.cameraScripted) return;
    this.lastManualCameraAt = this.elapsed;
  };

  /** The angle and distance the viewer just chose become the follow rig. */
  private onManualCameraEnd = (): void => {
    this.captureFollowRig();
  };

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    this.running = false;
    cancelAnimationFrame(this.frameId);
    this.callbacks.onContextLost();
  };

  private onContextRestored = (): void => {
    this.postfx.setPreset(this.preset);
    this.handleResize();
    this.start();
  };

  dispose(): void {
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.frameId);
    this.tweens.cancelAll();
    this.controller.setAnimator(null);
    this.controls.removeEventListener("start", this.onManualCamera);
    this.controls.removeEventListener("change", this.onManualCameraChange);
    this.controls.removeEventListener("end", this.onManualCameraEnd);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("resize", this.handleResize);
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    this.closePromotionPicker();
    for (const piece of this.pieces.values()) piece.dispose();
    for (const piece of this.captured) piece.dispose();
    this.pieces.clear();
    this.captured = [];
    this.effects.dispose();
    this.alarm.dispose();
    this.spellLights.dispose();
    disposeStrikeAssets();
    disposeGunAssets();
    disposeShatterAssets();
    this.board.dispose();
    this.hall.dispose();
    this.battlefield.dispose();
    this.jungle.dispose();
    this.factory.dispose();
    this.environmentMap?.dispose();
    this.environmentMap = null;
    this.scene.environment = null;
    this.postfx.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
