import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

import {
  ARMY_SKINS,
  DEFAULT_ARMY_SKINS,
  PIECE_MODEL_ORIENTATION,
  type ArmySkin,
  type ArmySkinId,
  type ArsenalId,
  type PieceAnimationSet,
} from "../assets/generated";
import type { Faction, PieceKind } from "../core/types";
import { loadGltf } from "./gltfQueue";
import { BADGE_LIFT, BADGE_SCALE, TOKEN_SCALE, rankBadgeTexture, tacticalTokenTexture } from "./rankBadges";
import { factionRingTexture, radialTexture } from "./textures";
import { Ease, type TweenManager } from "./tween";
import { armSculptWarmJobs, attachWeapons, type AttachedArms } from "./weapons";

/**
 * Rendered height (world units, 1 unit = 1 board square) per piece kind.
 *
 * Only two tiers read at camera distance: the men the crown sends out, and the
 * crown itself. The three officer ranks therefore stand in the royal band beside
 * the queen — a knight, a mage and a tower guardian are champions, not
 * footsoldiers, and at their old 0.84-0.88 they sat close enough to the pawn's
 * 0.7 to be mistaken for one. The king alone still stands over everything.
 *
 * The footsoldier sits at 0.78 rather than 0.7: sixteen of the thirty-two figures
 * on the board are pawns, so they are what the hall mostly *is*, and at 0.7 a
 * man stood barely two thirds of the tile he occupied — he read as a token on his
 * square instead of a soldier holding it. 0.78 still leaves a fifth of a square
 * of daylight to the officer band, which is what keeps the two tiers separable.
 */
export const PIECE_HEIGHT: Record<PieceKind, number> = {
  p: 0.78,
  n: 0.98,
  b: 1.0,
  r: 0.99,
  q: 1.0,
  k: 1.12,
};

export const FACTION_ACCENT: Record<Faction, number> = {
  w: 0x6ea8ff,
  b: 0xff5a4a,
};

/**
 * The two identity signals every figure carries, whatever army it is wearing.
 *
 * Skins alone cannot answer "whose is that?": when both sides muster the same
 * army the sculpts are identical, and when they muster *different* ones both
 * keep their own painted textures (see {@link applyFactionLook}) — so at camera
 * distance, in a torchlit hall, thirty-two dark figures read as one crowd. The
 * side is therefore stated twice, in two channels that fail differently:
 *
 *  - `ring` — a band painted on the tile the figure stands on, in the army's
 *    colour *and its own shape* (see {@link factionRingTexture}), so the
 *    distinction survives even for a colour-blind player.
 *  - `rim` — a light that rides the silhouette's edge, so a figure is separable
 *    against the piece behind it and against the floor, not just above its feet.
 */
const FACTION_RING: Record<Faction, number> = {
  w: 0x5fb0ff,
  b: 0xff5230,
};

/** Shape of the tile band — the half of the signal that is not colour. */
const FACTION_RING_SHAPE: Record<Faction, "band" | "sunburst"> = {
  w: "band",
  b: "sunburst",
};

/** Edge light along the silhouette, in the army's colour. */
const FACTION_RIM: Record<Faction, number> = {
  w: 0x74baff,
  b: 0xff6134,
};

/**
 * Resting opacity of the tile band. Enough to be read at a glance from a
 * standing camera without lighting the square like a marker — selection and the
 * check alarm still have room above it (see {@link PieceView.update}).
 *
 * Deliberately below half: the band sits *under* the figure, so every point of
 * opacity it gains also spills team colour up onto the boots and the hem. The
 * shape of the band (see {@link factionRingTexture}) carries the signal; the
 * brightness only has to make that shape visible.
 */
const RING_REST = 0.3;

/**
 * How hard the rim light rides the silhouette, and how tightly it hugs the edge
 * (the fresnel exponent, see {@link installDissolve}).
 *
 * These two numbers trade off, and the tight-and-faint end is the right one: a
 * broad, strong rim does not outline a uniform, it *repaints* it — the term is
 * added to the shaded colour, so at a low exponent it reaches well inside the
 * silhouette and drowns braid, facings and musket furniture in one flat hue. A
 * high exponent confines it to the grazing few degrees at the contour, which is
 * the only part that has to separate a figure from the piece behind it, and lets
 * the strength drop to a whisper while still reading. The sculpt's own paint
 * stays the thing you look at.
 */
const RIM_STRENGTH = 0.26;
const RIM_FALLOFF = 4.6;

/** Light that burns along the dissolving edge — one hue per civilisation. */
const DISSOLVE_EMBER: Record<Faction, number> = {
  w: 0xa8ccff,
  b: 0xff7a32,
};

/**
 * Shared uniform block driving one figure's burn-away and its faction rim light
 * across all of its materials — body and weapons alike.
 */
interface DissolveUniforms {
  uDissolve: { value: number };
  uDissolveEdge: { value: number };
  uDissolveScale: { value: number };
  /** (sole line, figure height) in the sculpt's own units. */
  uDissolveSpan: { value: THREE.Vector2 };
  uDissolveEmber: { value: THREE.Color };
  /** Faction edge light, in linear space (it is added after tone mapping). */
  uRimColor: { value: THREE.Color };
  uRimStrength: { value: number };
}

/** Cheap trilinear value noise — two octaves are enough for a burn edge. */
const DISSOLVE_NOISE = `
float dvHash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}
float dvNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = dvHash(i);
  float n100 = dvHash(i + vec3(1.0, 0.0, 0.0));
  float n010 = dvHash(i + vec3(0.0, 1.0, 0.0));
  float n110 = dvHash(i + vec3(1.0, 1.0, 0.0));
  float n001 = dvHash(i + vec3(0.0, 0.0, 1.0));
  float n101 = dvHash(i + vec3(1.0, 0.0, 1.0));
  float n011 = dvHash(i + vec3(0.0, 1.0, 1.0));
  float n111 = dvHash(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}
`;

/**
 * Injects two things into a lit material: a noise burn-away, and the faction rim
 * light.
 *
 * The burn erodes the surface through a drifting noise field with a hot edge, so
 * a fallen figure comes apart into the air instead of blinking out.
 *
 * The rim is a fresnel term added *after* `opaque_fragment`, which is where the
 * shaded colour has just been written and tone mapping has not yet run — so the
 * edge light is graded with the rest of the frame instead of sitting on top of it
 * as a flat decal. It is what makes an army's silhouette readable against the
 * figure behind it, at any camera height, in a hall lit by torches.
 *
 * @param heightBias how much the burn sweeps from the soles upward (0 = even)
 */
function installDissolve(
  material: THREE.MeshStandardMaterial,
  uniforms: DissolveUniforms,
  heightBias: number,
): void {
  const bias = heightBias.toFixed(3);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vDissolveP;\nvarying vec3 vRimView;",
      )
      .replace(
        "#include <project_vertex>",
        `vDissolveP = transformed;
vRimView = -(modelViewMatrix * vec4(transformed, 1.0)).xyz;
#include <project_vertex>`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uDissolve;
uniform float uDissolveEdge;
uniform float uDissolveScale;
uniform vec2 uDissolveSpan;
uniform vec3 uDissolveEmber;
uniform vec3 uRimColor;
uniform float uRimStrength;
varying vec3 vDissolveP;
varying vec3 vRimView;
${DISSOLVE_NOISE}`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
float dvGlow = 0.0;
if (uDissolve > 0.001) {
  vec3 dvP = vDissolveP * uDissolveScale;
  float dvN = dvNoise(dvP) * 0.65 + dvNoise(dvP * 2.7 + 11.3) * 0.35;
  float dvH = clamp((vDissolveP.y - uDissolveSpan.x) / max(uDissolveSpan.y, 0.0001), 0.0, 1.0);
  float dvMask = mix(dvN, dvN * 0.45 + dvH * 0.55, ${bias});
  float dvCut = mix(-uDissolveEdge, 1.0 + uDissolveEdge, uDissolve);
  if (dvMask < dvCut) discard;
  dvGlow = (1.0 - smoothstep(0.0, uDissolveEdge * 1.6, dvMask - dvCut)) *
           smoothstep(0.0, 0.06, uDissolve);
}`,
      )
      .replace(
        "#include <opaque_fragment>",
        `float rimFacing = 1.0 - clamp(dot(normalize(normal), normalize(vRimView)), 0.0, 1.0);
float rimAmount = pow(rimFacing, ${RIM_FALLOFF.toFixed(1)}) * uRimStrength * (1.0 - uDissolve);
#include <opaque_fragment>
gl_FragColor.rgb += uRimColor * rimAmount;
gl_FragColor.rgb += uDissolveEmber * dvGlow * 3.2;`,
      );
  };
  // Two materials with identical parameters but different injected source would
  // otherwise share one compiled program.
  material.customProgramCacheKey = () => `dissolve-${bias}`;
  material.needsUpdate = true;
}

const AXIS_VECTORS = {
  positiveX: new THREE.Vector3(1, 0, 0),
  negativeX: new THREE.Vector3(-1, 0, 0),
  positiveY: new THREE.Vector3(0, 1, 0),
  negativeY: new THREE.Vector3(0, -1, 0),
  positiveZ: new THREE.Vector3(0, 0, 1),
  negativeZ: new THREE.Vector3(0, 0, -1),
} as const;

type AxisName = keyof typeof AXIS_VECTORS;

function basisQuaternion(front: THREE.Vector3, up: THREE.Vector3): THREE.Quaternion {
  const f = front.clone().normalize();
  const r = new THREE.Vector3().crossVectors(up, f).normalize();
  const u = new THREE.Vector3().crossVectors(f, r).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, u, f));
}

/**
 * Rotates a generated model so its classified local front axis points along
 * `desiredWorldForward` while its local up axis stays world up.
 */
function orientationCorrection(desiredWorldForward: THREE.Vector3): THREE.Quaternion {
  const local = basisQuaternion(
    AXIS_VECTORS[PIECE_MODEL_ORIENTATION.localFrontAxis as AxisName],
    AXIS_VECTORS[PIECE_MODEL_ORIENTATION.localUpAxis as AxisName],
  );
  const world = basisQuaternion(desiredWorldForward, new THREE.Vector3(0, 1, 0));
  return world.multiply(local.invert());
}

/** Bounds as actually rendered, skinning-aware (see three-js asset guide). */
function measureModel(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true);
  const rootInverse = object.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  const childBox = new THREE.Box3();
  const toRoot = new THREE.Matrix4();
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const skinned = node as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh) {
      skinned.skeleton.update();
      skinned.computeBoundingBox();
      childBox.copy(skinned.boundingBox ?? new THREE.Box3());
    } else {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      childBox.copy(mesh.geometry.boundingBox ?? new THREE.Box3());
    }
    toRoot.multiplyMatrices(rootInverse, mesh.matrixWorld);
    box.union(childBox.applyMatrix4(toRoot));
  });
  return box;
}

/** Skeletal clips a figure can play, all bound to the same auto-rig. */
export interface PieceClips {
  idle?: THREE.AnimationClip;
  attack?: THREE.AnimationClip;
  death?: THREE.AnimationClip;
  /** Looping in-place stride used to cross the board on foot. */
  walk?: THREE.AnimationClip;
  /** Looping in-place run — the knight charging through its leap. */
  run?: THREE.AnimationClip;
  /**
   * One-shot drill played after a shot is fired. Only the gunpowder army
   * carries it — a swordsman has nothing to reload.
   */
  reload?: THREE.AnimationClip;
  /**
   * Looping sight picture: the barrel up and levelled on a body, held while the
   * shooter settles. Only the gunpowder army carries one — it is what makes a
   * shot read as aimed rather than as a flash appearing out of a stance.
   */
  aim?: THREE.AnimationClip;
  /**
   * One-shot stance change between one knee and both feet. Authored kneeling to
   * standing, and played in both directions: forwards to come up off the knee,
   * backwards to go down onto it (see {@link PieceView.playKneel} and
   * {@link PieceView.playRise}). Only a figure that fights from a kneel has one.
   */
  rise?: THREE.AnimationClip;
}

export type ClipName = keyof PieceClips;

/**
 * Every clip a rig can carry, in the order the game needs them. The strides
 * come straight after the stance: the first thing any game does is *move* a
 * figure, and a stride that has not landed yet costs that move its legs. The
 * strikes and deaths sit behind them because a capture asks for those by name
 * before it plays (see {@link PieceFactory.ensureClip}), so they can never be
 * missed — a stride, until now, could be.
 */
export const CLIP_ORDER: ClipName[] = ["idle", "walk", "run", "attack", "death", "reload", "aim", "rise"];

/**
 * How much of the rise clip is the man actually getting up.
 *
 * Measured on the hips of the marksman's take: it opens on the knee at 48 units
 * and is standing at full height (92) by the 70% mark, after which it holds
 * still. Playing or reversing the whole 2.6s would therefore spend a third of
 * the beat on a figure that has already finished moving — so both directions run
 * over this span of it and the dead tail is never shown.
 */
const RISE_SPAN = 0.72;

/**
 * Fetched together with the rig itself. Everything else is pulled in afterwards
 * (see {@link PieceFactory.warmClips}) so the opening does not fire seventy
 * requests at once — that burst is what used to cost figures their strike.
 */
const OPENING_CLIPS: ClipName[] = ["idle"];

/** The two locomotion loops, as opposed to the stance and the one-shots. */
export type MarchClip = "walk" | "run";

interface Template {
  scene: THREE.Object3D;
  scale: number;
  offset: THREE.Vector3;
  skinned: boolean;
  clips: PieceClips;
  /** Figure height in the sculpt's own units — the weapon size reference. */
  unit: number;
  /** Sole line in the sculpt's own units, so props can be kept off the floor. */
  baseY: number;
  /**
   * True when the sculpt was authored for this exact army. Those keep their own
   * painted textures; shared sculpts are re-tinted into faction livery instead.
   */
  ownLivery: boolean;
  /** Weapon family the figure is armed from. */
  arsenal: ArsenalId;
}

export interface PieceVisualOptions {
  contactShadows: boolean;
  /** Loop the combat stance. One-shots (strike / death) always play. */
  idleAnimation?: boolean;
  /** Floating rank crest above the figure's head. */
  rankBadge?: boolean;
}

/** The crown: king and queen move slower and stand taller than the soldiery. */
const ROYAL_KINDS: PieceKind[] = ["k", "q"];

/**
 * Target playback lengths. Soldiers snap through their strike; royalty takes a
 * long, deliberate beat so the blow reads as a sentence, not a scuffle.
 */
function oneShotSeconds(kind: PieceKind, name: OneShot): number {
  const royal = ROYAL_KINDS.includes(kind);
  if (name === "attack") return royal ? 1.5 : 0.95;
  // The drill is never hurried: powder, ball, ramrod, back to the shoulder.
  if (name === "reload") return royal ? 1.25 : 1.05;
  return royal ? 1.15 : 0.85;
}

/** Clips that play once and hand the body back to its stance afterwards. */
type OneShot = "attack" | "death" | "reload";

/** Measured stride period per clip, so a clip is only ever analysed once. */
const GAIT_PERIODS = new WeakMap<THREE.AnimationClip, number>();

/** Leg bones, in the order they answer the question "how long is one stride?". */
const LEG_BONES = [/upleg/i, /thigh/i, /(^|[^a-z])leg/i, /foot/i];

/**
 * Length of **one** stride cycle (two footfalls) inside a locomotion clip, in
 * seconds.
 *
 * The generator does not hand back one cycle per clip: `spear-walk` is a single
 * 1.13s cycle, but `casual-walk` is 4.23s of *three* cycles, `confident-strut`
 * 2.7s of two and `sneaky-walk` 2.9s of two and a half. Retiming a clip as if
 * its whole length were one cycle therefore asked the mixer for a 3-4x time
 * scale, which saturated the ceiling in {@link PieceView.startMarch}: the legs
 * whirred at a fixed blur no matter how far the figure was going, out of step
 * with the footfall clock, and the march stopped reading as walking at all.
 * The heavy ranks felt it worst — king, queen and tower all march on
 * `casual-walk`.
 *
 * The period is read out of the clip itself (autocorrelation of a leg bone's
 * swing) so a swapped-in stride is measured rather than guessed, and cached
 * per clip because the answer never changes.
 */
function gaitCycle(clip: THREE.AnimationClip): number {
  const cached = GAIT_PERIODS.get(clip);
  if (cached !== undefined) return cached;
  const period = measureGaitCycle(clip);
  GAIT_PERIODS.set(clip, period);
  return period;
}

function measureGaitCycle(clip: THREE.AnimationClip): number {
  const track = findLegTrack(clip);
  // Nothing leg-shaped to read: treat the clip as the single cycle it usually is.
  if (!track || track.times.length < 12) return clip.duration;

  // Signal: how far the leg has swung away from its first frame. One walk cycle
  // brings it back, so the signal's period is the stride's period.
  const frames = track.times.length;
  const signal = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    let dot = 0;
    for (let c = 0; c < 4; c += 1) dot += track.values[i * 4 + c] * track.values[c];
    signal[i] = 2 * Math.acos(Math.min(1, Math.abs(dot)));
  }

  let mean = 0;
  for (const value of signal) mean += value;
  mean /= frames;
  let energy = 0;
  for (let i = 0; i < frames; i += 1) {
    signal[i] -= mean;
    energy += signal[i] * signal[i];
  }
  // A leg that never swings (a clip driving something other than a gait).
  if (energy < 1e-6) return clip.duration;

  // Autocorrelation, taken at the first peak *after* the curve has fallen away
  // from lag zero — the global maximum would happily answer with two strides.
  const limit = Math.floor(frames * 0.8);
  const correlation = new Float32Array(limit);
  for (let lag = 0; lag < limit; lag += 1) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i + lag < frames; i += 1) {
      sum += signal[i] * signal[i + lag];
      count += 1;
    }
    correlation[lag] = sum / count / (energy / frames);
  }
  let lag = 1;
  while (lag < limit && correlation[lag] > 0.1) lag += 1;
  let period = 0;
  for (; lag < limit - 1; lag += 1) {
    if (correlation[lag] > correlation[lag - 1] && correlation[lag] >= correlation[lag + 1]) {
      if (correlation[lag] > 0.55) period = lag;
      break;
    }
  }
  if (period <= 0) return clip.duration;

  const step = (track.times[frames - 1] - track.times[0]) / (frames - 1);
  const seconds = period * step;
  // A period within a hair of the whole clip is the whole clip; anything shorter
  // than a third of a second is noise, not a stride.
  if (seconds < 0.3 || seconds > clip.duration * 0.8) return clip.duration;
  return seconds;
}

/** The most swing-heavy leg track in a clip: upper leg first, toes last. */
function findLegTrack(clip: THREE.AnimationClip): THREE.QuaternionKeyframeTrack | null {
  for (const pattern of LEG_BONES) {
    for (const track of clip.tracks) {
      if (!track.name.endsWith(".quaternion")) continue;
      if (track.values.length / 4 !== track.times.length) continue;
      if (pattern.test(track.name)) return track as THREE.QuaternionKeyframeTrack;
    }
  }
  return null;
}

/**
 * One rendered figure. Follows the placement contract:
 * container (board placement) → runtime (idle sway, strikes) → visual
 * (one-time scale / orientation / centring of the generated sculpt).
 */
export class PieceView {
  readonly container = new THREE.Group();
  readonly runtime = new THREE.Group();
  readonly visual = new THREE.Group();
  readonly kind: PieceKind;
  readonly color: Faction;
  /** Weapon family this figure was armed from — the fight reads its style off it. */
  readonly arsenal: ArsenalId;

  private materials: THREE.MeshStandardMaterial[] = [];
  private baseEmissive = 0.05;
  private glow: THREE.Mesh;
  private shadow: THREE.Mesh | null = null;
  private phase = Math.random() * Math.PI * 2;
  private hovered = false;
  private selected = false;
  private alarm = 0;
  /** 1 right after a blow lands, decaying — drives the red hit flash. */
  private hit = 0;
  /** 1 right after the figure sets down, decaying — flares the ground aura. */
  private aura = 0;
  /** Set once the death clip starts so nothing pulls the corpse back up. */
  private slain = false;
  /** Resting orientation (facing the enemy side) to return to after a fight. */
  private homeFacing = new THREE.Quaternion();
  /**
   * Invisible pick proxy. Raycasting the sculpt itself is both slow (tens of
   * thousands of skinned triangles per figure) and unreliable, so every figure
   * carries one cheap box that stands exactly on its square.
   */
  private readonly collider: THREE.Mesh;

  private arms: AttachedArms | null = null;
  private readonly majestic: boolean;

  /** Every mesh of the sculpt and its arms — shadows are pulled while burning. */
  private meshes: THREE.Mesh[] = [];
  /** 0 solid → 1 fully scattered. Drives the burn-away shader. */
  private dissolveAmount = 0;
  private readonly dissolveUniforms: DissolveUniforms;

  /**
   * Flat overhead counter used by the tactical view. Built the first time the
   * board is flattened, then kept for the rest of the figure's life.
   */
  private token: THREE.Mesh | null = null;
  private tokenMaterial: THREE.MeshBasicMaterial | null = null;
  /** True while the board is read from straight above as a 2D map. */
  private flat = false;
  /** Ease between sculpt and counter, so the swap is not a hard cut. */
  private tokenFade = 0;
  /** In-plane spin that keeps the stamped rank upright on screen. */
  private tokenYaw = 0;

  /** Floating rank crest; billboards itself because it is a sprite. */
  private badge: THREE.Sprite | null = null;
  private badgeWanted = true;
  /** Held down while something modal owns the screen (the promotion picker). */
  private badgeMuted = false;
  private badgeOpacity = 0;
  /** Global fade applied by the tray / death choreography. */
  private fade = 1;

  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<ClipName, THREE.AnimationAction>();
  private activeOneShot: ClipName | null = null;
  private idleLooping = false;
  /** Locomotion loop currently carrying the figure across the board. */
  private marchLoop: MarchClip | null = null;
  /** Footfalls a second the current march is being walked at. */
  private marchRate = 0;
  /** True while the figure is holding its aim on a body. */
  private aiming = false;
  /** Root bone + its bind translation, used to strip clip root motion. */
  private rootBone: THREE.Bone | null = null;
  private rootRest = new THREE.Vector3();
  private lockRootMotion = true;
  /** Whether this figure is allowed to loop its stance (quality setting). */
  private idleWanted = true;
  /**
   * Body tilt held by a hand-driven strike. The mixer rewrites the runtime
   * rotation every frame, so a procedural swing has to be re-applied after it —
   * without this a figure whose attack clip is missing only slid forward.
   */
  private strikeTilt = 0;

  constructor(
    kind: PieceKind,
    color: Faction,
    model: THREE.Object3D,
    options: PieceVisualOptions,
    clips: PieceClips = {},
    unit = 1,
    baseY = 0,
    ownLivery = false,
    arsenal: ArsenalId = "kingdom",
  ) {
    this.kind = kind;
    this.color = color;
    this.arsenal = arsenal;
    this.majestic = ROYAL_KINDS.includes(kind);

    this.container.name = `piece_${color}${kind}`;
    this.container.add(this.runtime);
    this.runtime.add(this.visual);
    this.visual.add(model);
    this.container.userData.piece = this;

    this.collider = new THREE.Mesh(sharedColliderGeometry(kind), sharedColliderMaterial());
    this.collider.position.y = PIECE_HEIGHT[kind] * 0.55;
    this.collider.castShadow = false;
    this.collider.receiveShadow = false;
    this.collider.userData.piece = this;
    this.container.add(this.collider);

    const span = Math.max(unit, 1e-3);
    this.dissolveUniforms = {
      uDissolve: { value: 0 },
      uDissolveEdge: { value: 0.14 },
      // Roughly ten noise cells across the body, whatever units it was authored in.
      uDissolveScale: { value: 10 / span },
      uDissolveSpan: { value: new THREE.Vector2(baseY, span) },
      uDissolveEmber: { value: new THREE.Color(DISSOLVE_EMBER[color]) },
      uRimColor: { value: new THREE.Color(FACTION_RIM[color]).convertSRGBToLinear() },
      uRimStrength: { value: RIM_STRENGTH },
    };

    model.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.piece = this;
      const source = mesh.material as THREE.MeshStandardMaterial;
      const material = source.clone();
      applyFactionLook(material, color, ownLivery);
      installDissolve(material, this.dissolveUniforms, 0.85);
      mesh.material = material;
      this.materials.push(material);
      this.meshes.push(mesh);
    });

    // Painted onto the tile rather than added to it: an additive glow tinted the
    // army's colour disappears into a lit marble square (which is most of the
    // board), and disappearing is the one thing this must not do.
    const glowMaterial = new THREE.MeshBasicMaterial({
      map: sharedRingTexture(color),
      color: FACTION_RING[color],
      transparent: true,
      opacity: RING_REST,
      depthWrite: false,
      // The band is an instrument, not lit stone: keep it out of the grade so it
      // reads the same in a bright hall and a dark one.
      toneMapped: false,
    });
    this.glow = new THREE.Mesh(sharedDiscGeometry(), glowMaterial);
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.012;
    this.glow.renderOrder = 3;
    this.container.add(this.glow);

    if (options.contactShadows) {
      const shadowMaterial = new THREE.MeshBasicMaterial({
        map: sharedShadowTexture(),
        color: 0x000000,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      });
      this.shadow = new THREE.Mesh(sharedDiscGeometry(), shadowMaterial);
      this.shadow.rotation.x = -Math.PI / 2;
      this.shadow.position.y = 0.006;
      this.shadow.scale.setScalar(0.85);
      this.shadow.renderOrder = 1;
      this.container.add(this.shadow);
    }

    this.badgeWanted = options.rankBadge !== false;
    this.buildBadge();

    this.setupAnimations(model, clips, options.idleAnimation !== false);
    this.equipArms(model, unit, baseY, arsenal);
  }

  /** Crest sprite, parked just above the figure's crown. */
  private buildBadge(): void {
    const material = new THREE.SpriteMaterial({
      map: rankBadgeTexture(this.kind, this.color),
      transparent: true,
      // Always legible: a crest hidden behind the piece in front of it would
      // defeat the whole point of putting it there.
      depthTest: false,
      depthWrite: false,
      opacity: 0,
      sizeAttenuation: true,
    });
    const badge = new THREE.Sprite(material);
    badge.scale.setScalar(BADGE_SCALE[this.kind]);
    badge.position.y = PIECE_HEIGHT[this.kind] + BADGE_LIFT;
    badge.renderOrder = 40;
    badge.visible = this.badgeWanted;
    badge.frustumCulled = false;
    this.badge = badge;
    this.container.add(badge);
  }

  /** Board-wide toggle for the floating crests. */
  setBadgeEnabled(enabled: boolean): void {
    this.badgeWanted = enabled;
    if (!this.badge) return;
    this.badge.visible = enabled && !this.badgeMuted && !this.slain;
    if (!enabled) {
      this.badgeOpacity = 0;
      (this.badge.material as THREE.SpriteMaterial).opacity = 0;
    }
  }

  /**
   * Pulls the crest off screen without touching the player's preference. A crest
   * ignores the depth buffer on purpose, so while a modal panel is up it would
   * otherwise punch straight through it.
   */
  setBadgeMuted(muted: boolean): void {
    if (this.badgeMuted === muted) return;
    this.badgeMuted = muted;
    if (!this.badge) return;
    if (muted) {
      this.badge.visible = false;
      this.badgeOpacity = 0;
      (this.badge.material as THREE.SpriteMaterial).opacity = 0;
    } else {
      this.badge.visible = this.badgeWanted && !this.slain && !this.flat;
    }
  }

  // ------------------------------------------------------------ tactical view

  /**
   * Swaps the sculpt for a flat overhead counter. In the top-down view a
   * life-size figure hides the squares around it, so the tactical board trades
   * every statue for a painted disc lying on its tile.
   */
  setFlat(enabled: boolean): void {
    if (this.flat === enabled) return;
    this.flat = enabled;
    if (enabled && !this.token) this.buildToken();
    this.visual.visible = !enabled;
    if (this.shadow) this.shadow.visible = !enabled;
    if (this.badge) this.badge.visible = !enabled && this.badgeWanted && !this.badgeMuted && !this.slain;
    if (this.token) this.token.visible = enabled;
    // A strike frozen mid-clip while the board was flat has to be released.
    if (!enabled && !this.slain && this.mixer) this.returnToStance(0.2);
  }

  /** Screen-up direction, in board yaw — keeps every stamped rank readable. */
  setTokenYaw(yaw: number): void {
    this.tokenYaw = yaw;
  }

  private buildToken(): void {
    const material = new THREE.MeshBasicMaterial({
      map: tacticalTokenTexture(this.kind, this.color),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      // The counter is an instrument, not lit stone: keep it out of the grade.
      toneMapped: false,
    });
    const token = new THREE.Mesh(sharedTokenGeometry(), material);
    token.rotation.x = -Math.PI / 2;
    token.position.y = 0.055;
    token.scale.setScalar(TOKEN_SCALE[this.kind]);
    token.renderOrder = 12;
    token.frustumCulled = false;
    token.visible = false;
    this.token = token;
    this.container.add(token);
    this.tokenMaterial = material;
  }

  private updateToken(delta: number, alarmPulse: number): void {
    const token = this.token;
    const material = this.tokenMaterial;
    if (!token || !material) return;

    if (this.flat) this.tokenFade = Math.min(1, this.tokenFade + delta * 5);
    else this.tokenFade = Math.max(0, this.tokenFade - delta * 7);

    token.visible = this.tokenFade > 0.01;
    if (!token.visible) return;

    token.rotation.z = this.tokenYaw;
    const settle = this.aura * this.aura;
    const pop =
      1 + (this.selected ? 0.14 : this.hovered ? 0.07 : 0) + alarmPulse * 0.2 + settle * 0.16;
    token.scale.setScalar(TOKEN_SCALE[this.kind] * pop * this.tokenFade);
    token.position.y = 0.055 + (this.selected ? 0.05 : 0);

    // Blows and the check alarm burn straight through the plate.
    const heat = Math.min(1, this.hit * this.hit + alarmPulse * 0.7);
    material.color.setRGB(1 + heat * 1.1, 1 - heat * 0.5, 1 - heat * 0.6);
    material.opacity = this.tokenFade * this.fade * (1 - this.dissolveAmount);
  }

  private updateBadge(delta: number, elapsed: number, alarmPulse: number): void {
    const badge = this.badge;
    if (!badge) return;
    const visible = this.badgeWanted && !this.badgeMuted && !this.slain && !this.flat;
    badge.visible = visible;
    if (!visible) return;

    const target = this.selected ? 1 : this.hovered ? 0.95 : 0.72;
    this.badgeOpacity += (target - this.badgeOpacity) * Math.min(1, delta * 6);
    const material = badge.material as THREE.SpriteMaterial;
    material.opacity = this.badgeOpacity * this.fade;

    const bob = Math.sin(elapsed * 1.5 + this.phase) * 0.022;
    badge.position.y =
      PIECE_HEIGHT[this.kind] + BADGE_LIFT + bob + (this.selected ? 0.05 : 0);
    const pop = 1 + (this.selected ? 0.16 : this.hovered ? 0.08 : 0) + alarmPulse * 0.22;
    badge.scale.setScalar(BADGE_SCALE[this.kind] * pop);
  }

  /**
   * Hands the figure its weapon once the stance pose is settled, so the prop is
   * aligned against the pose the player actually sees.
   */
  private equipArms(model: THREE.Object3D, unit: number, baseY: number, arsenal: ArsenalId): void {
    try {
      this.mixer?.update(0);
      const arms = attachWeapons(model, this.kind, this.color, unit, baseY, arsenal);
      this.arms = arms;
      for (const mesh of arms.meshes) mesh.userData.piece = this;
      // Props hang off bones, so they burn on the same clock but without the
      // ground-up sweep — their local space is not the figure's.
      for (const material of arms.materials) installDissolve(material, this.dissolveUniforms, 0);
      this.meshes.push(...arms.meshes);
    } catch (error) {
      console.warn(`[pieces] could not arm "${this.kind}"`, error);
    }
  }

  private setupAnimations(model: THREE.Object3D, clips: PieceClips, idleEnabled: boolean): void {
    const entries = (Object.keys(clips) as ClipName[]).filter((name) => clips[name]);
    this.idleWanted = idleEnabled;

    let rigged = false;
    model.traverse((node) => {
      const bone = node as THREE.Bone;
      if (bone.isBone) {
        rigged = true;
        if (!this.rootBone) {
          this.rootBone = bone;
          this.rootRest.copy(bone.position);
        }
      }
      const skinned = node as THREE.SkinnedMesh;
      // Skinned bounds change every frame; culling them by the bind pose pops.
      if (skinned.isSkinnedMesh) {
        rigged = true;
        skinned.frustumCulled = false;
      }
    });

    // A rig with no clips yet still gets its mixer: the combat clips arrive in
    // the background and are bound onto this figure as they land.
    if (!rigged && entries.length === 0) return;

    this.mixer = new THREE.AnimationMixer(model);
    for (const name of entries) {
      const clip = clips[name];
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      this.actions.set(name, action);
    }

    // A finished strike returns to the stance on its own; death stays clamped.
    this.mixer.addEventListener("finished", (event) => {
      const action = (event as unknown as { action: THREE.AnimationAction }).action;
      if (this.activeOneShot === "attack" && action === this.actions.get("attack")) {
        this.returnToStance(0.2);
      }
    });

    this.returnToStance(0);
  }

  /**
   * Binds a clip that arrived after the figure was built. Combat clips download
   * in the background, so a piece created during the opening must be able to
   * take its strike, death or stride later on without being rebuilt.
   */
  installClip(name: ClipName, clip: THREE.AnimationClip): void {
    if (!this.mixer || this.actions.has(name)) return;
    const action = this.mixer.clipAction(clip);
    action.enabled = true;
    this.actions.set(name, action);
    // The stance is the only clip that matters right now — the rest are asked
    // for by name the next time the figure fights or moves.
    if (name !== "idle" || this.slain || this.activeOneShot || this.marchLoop) return;
    if (this.idleWanted) this.playIdle(0.35);
    else this.poseFromIdle();
  }

  /**
   * Body tilt for a strike driven by hand rather than by a skeleton: negative
   * leans back off the target, positive drives the shoulders over the blow.
   */
  setStrikeTilt(tilt: number): void {
    this.strikeTilt = tilt;
  }

  get hasAnimations(): boolean {
    return this.mixer !== null;
  }

  /** Whether this sculpt actually carries a given clip (rigs differ per rank). */
  hasClip(name: ClipName): boolean {
    return this.actions.has(name);
  }

  get isMarching(): boolean {
    return this.marchLoop !== null;
  }

  /**
   * Puts the figure on its own legs for a board move. `stepRate` is how many
   * footfalls a second the march should take; the clip is one full gait cycle
   * (two steps), so it is retimed to that cadence and the caller's stride clock
   * and the skeleton stay locked to each other. Returns false when the sculpt
   * has no such clip, so the caller can fall back to a slide.
   */
  startMarch(name: MarchClip, stepRate: number): boolean {
    const action = this.actions.get(name);
    if (!action || !this.mixer || this.slain) return false;
    const clip = action.getClip();
    const cycles = Math.max(0.15, stepRate * 0.5);
    // Retimed against the clip's *own* stride length rather than its total
    // length: several of the generated strides hold three cycles back to back
    // (see {@link gaitCycle}), and pretending otherwise pinned the heavy ranks
    // to the ceiling below — legs blurring on the spot while the body slid.
    // Clamped so a very long or very short move never turns the stride into a
    // slideshow or a sprint of blurred legs.
    const timeScale = THREE.MathUtils.clamp(cycles * gaitCycle(clip), 0.4, 2.9);

    for (const [key, other] of this.actions) {
      if (key !== name) other.fadeOut(0.16);
    }
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.paused = false;
    action.setEffectiveTimeScale(timeScale);
    action.setEffectiveWeight(1);
    action.fadeIn(0.14).play();

    this.activeOneShot = null;
    this.idleLooping = false;
    this.marchLoop = name;
    // The realised cadence, so a hauled gun can jolt on the same clock.
    this.marchRate = Math.max(0.2, stepRate);
    this.lockRootMotion = true;
    return true;
  }

  /** Ends the march and eases the figure back into its combat stance. */
  stopMarch(fade = 0.22): void {
    if (!this.marchLoop) return;
    this.returnToStance(fade);
  }

  /**
   * Hands the body back to its resting stance after a march, a strike or an aim.
   * Whether that stance *breathes* is the preset's call, but leaving the march
   * running is nobody's: on the lowest preset this used to fall through to
   * {@link playIdle} anyway, so a figure that was meant to stand perfectly still
   * started breathing the moment it finished its first move.
   */
  private returnToStance(fade: number): void {
    if (this.idleWanted) {
      this.playIdle(fade);
      return;
    }
    if (this.marchLoop) {
      this.actions.get(this.marchLoop)?.fadeOut(Math.max(0.06, fade));
      this.marchLoop = null;
      this.settleTrain();
    }
    if (this.aiming) {
      this.actions.get("aim")?.fadeOut(Math.max(0.06, fade));
      this.aiming = false;
    }
    this.activeOneShot = null;
    this.idleLooping = false;
    this.lockRootMotion = true;
    this.poseFromIdle(fade);
  }

  /**
   * Freezes the first stance frame so "low" quality still reads as a fighter.
   * Faded in rather than cut when something was moving underneath it, so the
   * walk does not snap to attention on the last frame of a move.
   */
  private poseFromIdle(fade = 0): void {
    const idle = this.actions.get("idle");
    if (!idle || !this.mixer) return;
    idle.reset().play();
    if (fade > 0.01) idle.fadeIn(fade);
    idle.paused = true;
    this.mixer.update(0);
  }

  /**
   * Brings the weapon up and holds it on the target: a looping sight picture the
   * caller runs for as long as the shooter is settling. Returns false when this
   * rig never learned to aim, so the beat can fall back to a hand-driven lean.
   */
  playAim(fade = 0.2): boolean {
    const action = this.actions.get("aim");
    if (!action || !this.mixer || this.slain) return false;
    for (const [key, other] of this.actions) {
      if (key !== "aim") other.fadeOut(Math.max(0.06, fade));
    }
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.paused = false;
    // A shade under real time: a man levelling a barrel is deliberate.
    action.setEffectiveTimeScale(0.85);
    action.setEffectiveWeight(1);
    action.fadeIn(fade).play();

    this.activeOneShot = null;
    this.idleLooping = false;
    this.marchLoop = null;
    this.aiming = true;
    this.lockRootMotion = true;
    return true;
  }

  /**
   * Retimes the held sight picture. The aim clip carries a lateral scan, which is
   * right while a shooter is hunting for his mark and wrong once he has fired —
   * so the beat slows it almost to a stop after the shot and the marksman holds
   * what he is looking at instead of going back to sweeping the board.
   *
   * @param scale 1 = as authored, below that the scan drags.
   */
  setAimDrift(scale: number): void {
    if (!this.aiming) return;
    this.actions.get("aim")?.setEffectiveTimeScale(Math.max(0.04, scale));
  }

  /**
   * Down onto one knee: the rise clip run **backwards**, so the knee that goes
   * to the stone is the same knee the figure will come up off later.
   *
   * @returns how long the drop takes, or 0 when this rig has no such clip.
   */
  playKneel(seconds: number): number {
    return this.playStanceShift(-1, seconds);
  }

  /**
   * Back up onto both feet off the knee. The clip is left clamped on its last
   * standing frame, so the caller can hand over to the stance (or straight into
   * a march) without the body dropping again in between.
   *
   * @returns how long the rise takes, or 0 when this rig has no such clip.
   */
  playRise(seconds: number): number {
    return this.playStanceShift(1, seconds);
  }

  /**
   * The one clip that changes a figure's stance, played in whichever direction
   * the beat needs. Reverse playback is a first-class mixer feature: with
   * `LoopOnce` and a negative time scale the action clamps at time 0 and fires
   * `finished` exactly as it does at the far end.
   *
   * @param direction 1 rises off the knee, -1 goes down onto it.
   * @param seconds how long the move should take, whatever the clip's own length.
   */
  private playStanceShift(direction: 1 | -1, seconds: number): number {
    const action = this.actions.get("rise");
    if (!action || !this.mixer || this.slain) return 0;
    // Only the part of the clip that is the actual stance change (see RISE_SPAN).
    const span = action.getClip().duration * RISE_SPAN;
    const target = Math.max(0.2, seconds);
    const timeScale = THREE.MathUtils.clamp(span / target, 0.35, 3.4);
    const duration = span / timeScale;

    for (const [key, other] of this.actions) {
      if (key !== "rise") other.fadeOut(0.12);
    }
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.paused = false;
    action.time = direction > 0 ? 0 : span;
    action.setEffectiveTimeScale(direction * timeScale);
    action.setEffectiveWeight(1);
    action.fadeIn(0.12).play();

    this.activeOneShot = "rise";
    this.idleLooping = false;
    this.marchLoop = null;
    this.aiming = false;
    this.lockRootMotion = true;
    return duration;
  }

  /** Crossfades back to the looping combat stance. */
  playIdle(fade = 0.25): void {
    // A stride left running underneath would blend into the stance and keep the
    // legs walking on the spot.
    if (this.marchLoop) {
      this.actions.get(this.marchLoop)?.fadeOut(Math.max(0.06, fade));
      this.marchLoop = null;
      this.settleTrain();
    }
    // Likewise a held aim: left running it would blend the barrel back up.
    if (this.aiming) {
      this.actions.get("aim")?.fadeOut(Math.max(0.06, fade));
      this.aiming = false;
    }
    const idle = this.actions.get("idle");
    if (!idle) return;
    this.activeOneShot = null;
    this.lockRootMotion = true;
    if (this.idleLooping && idle.isRunning()) return;
    idle.reset();
    idle.setLoop(THREE.LoopRepeat, Infinity);
    idle.clampWhenFinished = false;
    idle.paused = false;
    // Desync the army so the whole board does not breathe in lockstep.
    idle.time = Math.random() * idle.getClip().duration;
    // Royalty holds the room: a slower, heavier breath than the soldiery.
    idle.setEffectiveTimeScale(
      this.majestic ? 0.52 + Math.random() * 0.08 : 0.9 + Math.random() * 0.2,
    );
    idle.fadeIn(fade).play();
    this.idleLooping = true;
  }

  /**
   * @param seconds explicit playback length, overriding the per-rank default.
   *   A firing drill has to be readable — the shot has to be seen to be aimed —
   *   so the gun beat asks for a longer, slower take than a sword swing.
   */
  private playOneShot(name: OneShot, seconds?: number): number {
    const action = this.actions.get(name);
    if (!action || !this.mixer) return 0;
    const clip = action.getClip();
    const target = seconds ?? oneShotSeconds(this.kind, name);
    // An explicitly asked-for length is allowed to slow the clip much further
    // than a default one: that is the whole point of asking.
    const floor = seconds !== undefined ? 0.3 : this.majestic ? 0.45 : 0.75;
    const timeScale = THREE.MathUtils.clamp(clip.duration / target, floor, this.majestic ? 1.6 : 2.6);
    const duration = clip.duration / timeScale;

    for (const [key, other] of this.actions) {
      if (key !== name) other.fadeOut(0.1);
    }
    this.marchLoop = null;
    this.aiming = false;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.paused = false;
    action.setEffectiveTimeScale(timeScale);
    action.setEffectiveWeight(1);
    action.fadeIn(0.08).play();

    this.activeOneShot = name;
    this.idleLooping = false;
    this.lockRootMotion = name !== "death";
    return duration;
  }

  /**
   * Starts the strike clip. Returns the playback length and the moment the
   * blade lands, so the caller can time sparks, sound and screen shake.
   *
   * @param options `seconds` overrides the playback length and `impactAt` the
   *   fraction of it at which the blow (or the shot) leaves. Firearms need both:
   *   their clips are long drills whose report lands well past the halfway mark.
   */
  playAttack(options: { seconds?: number; impactAt?: number } = {}): { duration: number; impact: number } {
    const duration = this.playOneShot("attack", options.seconds);
    // The royal wind-up is longer, so the blow lands later in the clip.
    const at = options.impactAt ?? (this.majestic ? 0.56 : 0.42);
    return { duration, impact: duration * THREE.MathUtils.clamp(at, 0.05, 0.95) };
  }

  /**
   * Runs the reloading drill after a shot. Returns its length, or 0 when this
   * rig never learned one — the caller simply skips the beat.
   */
  playReload(): number {
    return this.playOneShot("reload");
  }

  /**
   * Starts the death clip and returns how long it runs. The figure is marked
   * slain so hover/selection lift, sway and the idle stance stop interfering
   * with the fall — the corpse holds the last frame until it is cleared away.
   */
  playDeath(): number {
    this.slain = true;
    this.marchLoop = null;
    this.hovered = false;
    this.selected = false;
    this.alarm = 0;
    this.collider.visible = false;
    if (this.badge) {
      this.badge.visible = false;
      this.badgeOpacity = 0;
      (this.badge.material as THREE.SpriteMaterial).opacity = 0;
    }
    return this.playOneShot("death");
  }

  /**
   * Lifts the figure off the floor plane: the contact shadow and team glow are
   * discs pinned to the ground, so they have to go while the body is in the air.
   */
  setAirborne(airborne: boolean): void {
    this.glow.visible = !airborne;
    if (this.shadow) this.shadow.visible = !airborne && !this.flat;
  }

  /** Back to a calm stance (used when a fallen figure reaches the tray). */
  resetPose(): void {
    this.slain = false;
    this.setDissolve(0);
    this.strikeTilt = 0;
    this.hit = 0;
    this.aura = 0;
    this.collider.visible = true;
    this.visual.scale.set(1, 1, 1);
    if (this.badge) this.badge.visible = this.badgeWanted;
    this.setAirborne(false);
    this.runtime.position.set(0, 0, 0);
    this.runtime.rotation.set(0, 0, 0);
    this.container.scale.setScalar(1);
    this.visual.quaternion.copy(this.homeFacing);
    if (!this.mixer) return;
    for (const action of this.actions.values()) action.stop();
    this.activeOneShot = null;
    this.idleLooping = false;
    this.marchLoop = null;
    this.aiming = false;
    this.lockRootMotion = true;
    this.container.rotation.set(0, 0, 0);
    this.playIdle(0);
  }

  get object(): THREE.Object3D {
    return this.container;
  }

  /** What the pointer tests against — never the sculpt itself. */
  get hitMeshes(): THREE.Mesh[] {
    return [this.collider];
  }

  setHovered(hovered: boolean): void {
    this.hovered = hovered;
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
  }

  /** 0 = calm, 1 = king in check (red pulse). */
  setAlarm(value: number): void {
    this.alarm = value;
  }

  /** White-hot red flash across the figure at the moment a blow connects. */
  takeHit(): void {
    this.hit = 1;
  }

  /**
   * Vertical squash used by the landing settle: 0 stands the figure up, 1 is
   * fully compressed. Applied to the sculpt only, so the ground discs, crest
   * and board anchor all stay exactly where they belong.
   */
  setSquash(amount: number): void {
    const value = THREE.MathUtils.clamp(amount, -0.6, 1) * 0.15;
    this.visual.scale.set(1 + value * 0.6, 1 - value, 1 + value * 0.6);
  }

  /** Flares the team aura disc under the figure — the moment it takes a square. */
  flareAura(strength = 1): void {
    this.aura = Math.max(this.aura, THREE.MathUtils.clamp(strength, 0, 1.5));
  }

  get isSlain(): boolean {
    return this.slain;
  }

  /** True when this figure carries a staff or sceptre it can cast fire from. */
  get canCast(): boolean {
    return this.arms?.focus != null;
  }

  /** True when this figure has a barrel to fire: pistol, musket or field gun. */
  get canShoot(): boolean {
    return this.arms?.muzzle != null;
  }

  /** True when a gun carriage is hauled along beside this figure. */
  get hasTrain(): boolean {
    return this.arms?.train != null;
  }

  /**
   * World point a shot leaves from: the mouth of the barrel, read out of the
   * live pose so the flash sits on the gun wherever the arms have swung it — or,
   * for the battery, wherever the carriage has been hauled to.
   */
  muzzleOrigin(): THREE.Vector3 {
    const muzzle = this.arms?.muzzle;
    if (muzzle) {
      muzzle.updateWorldMatrix(true, false);
      return muzzle.getWorldPosition(new THREE.Vector3());
    }
    return this.castOrigin();
  }

  /**
   * Rolls the gun carriage back on its wheels and tips its muzzle as the charge
   * lifts the trail. The gun hangs off the sculpt root in body axes, so recoil
   * is a shove along its own -Z with a pitch about the axle (its own X).
   *
   * @param back travel back along the carriage's own line of fire, in figure heights
   * @param lift 0 = level on its wheels, 1 = muzzle thrown up by a full charge
   */
  setTrainRecoil(back: number, lift = 0): void {
    const train = this.arms?.train;
    if (!train) return;
    const jump = Math.max(0, lift);
    train.position.z = -Math.max(0, back);
    // A field gun's wheels really do leave the ground under a full charge.
    train.position.y = jump * 0.045;
    train.rotation.x = -jump * 0.2;
  }

  /**
   * A hauled gun carriage crossing stone: the trail pitches on the axle once per
   * footfall and the whole piece rocks slowly from wheel to wheel. Without it the
   * battery's gun slid along beside a walking crew, which read as the whole rank
   * having lost its animation.
   */
  private rumbleTrain(elapsed: number): void {
    const train = this.arms?.train;
    if (!train) return;
    const jolt = Math.sin(elapsed * this.marchRate * Math.PI * 2 + this.phase);
    train.rotation.x = jolt * 0.022;
    train.rotation.z = Math.sin(elapsed * this.marchRate * Math.PI + this.phase) * 0.014;
    train.position.y = Math.abs(jolt) * 0.008;
  }

  /** Sets the hauled gun back down level once the march is over. */
  private settleTrain(): void {
    const train = this.arms?.train;
    if (!train) return;
    train.rotation.x = 0;
    train.rotation.z = 0;
    train.position.y = 0;
  }

  /** World point the hauled gun carriage stands at, or null if nothing is towed. */
  trainOrigin(): THREE.Vector3 | null {
    const train = this.arms?.train;
    if (!train) return null;
    train.updateWorldMatrix(true, false);
    return train.getWorldPosition(new THREE.Vector3());
  }

  /**
   * World point a spell leaves from: the crystal in the staff's claw or the gem
   * on the sceptre, read out of the pose on the frame it is asked for, so the
   * fire hangs off the prop wherever the casting arm has swung it.
   */
  castOrigin(): THREE.Vector3 {
    const focus = this.arms?.focus;
    if (focus) {
      focus.updateWorldMatrix(true, false);
      return focus.getWorldPosition(new THREE.Vector3());
    }
    // No prop (an unrigged fallback figure): cast from where the hands would be.
    const height = PIECE_HEIGHT[this.kind] * 0.78;
    return this.container.position.clone().setY(this.container.position.y + height);
  }

  /** Snaps the figure round to look at a world position (its killer, a target). */
  faceTowards(point: THREE.Vector3): void {
    const forward = point.clone().sub(this.container.position);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) return;
    this.setFacing(forward.normalize(), false);
  }

  /** Smoothly swings the figure round to face a world position. */
  async turnTowards(point: THREE.Vector3, tweens: TweenManager, duration = 0.22): Promise<void> {
    const forward = point.clone().sub(this.container.position);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) return;
    await this.turnTo(orientationCorrection(forward.normalize()), tweens, duration);
  }

  /** Swings back to the resting orientation once the fighting is over. */
  async turnHome(tweens: TweenManager, duration = 0.28): Promise<void> {
    await this.turnTo(this.homeFacing.clone(), tweens, duration);
  }

  private async turnTo(to: THREE.Quaternion, tweens: TweenManager, duration: number): Promise<void> {
    const from = this.visual.quaternion.clone();
    if (from.angleTo(to) < 0.04) return;
    await tweens.to({
      duration,
      easing: Ease.inOutCubic,
      onUpdate: (t) => {
        this.visual.quaternion.slerpQuaternions(from, to, t);
      },
    });
    this.visual.quaternion.copy(to);
  }

  /**
   * Burn-away amount: 0 leaves the figure solid, 1 scatters it completely. The
   * body erodes from the soles up through a noise field with a glowing rim, so
   * a captured figure comes apart into the air rather than being switched off.
   */
  setDissolve(amount: number): void {
    const value = THREE.MathUtils.clamp(amount, 0, 1);
    if (this.dissolveAmount === value) return;
    const wasSolid = this.dissolveAmount <= 0.02;
    this.dissolveAmount = value;
    this.dissolveUniforms.uDissolve.value = value;
    // A shadow map knows nothing about the burn, so a half-eaten body would
    // keep casting a whole one. Drop the cast the moment it starts to go.
    const solid = value <= 0.02;
    if (solid !== wasSolid) {
      for (const mesh of this.meshes) mesh.castShadow = solid;
    }
  }

  get dissolveLevel(): number {
    return this.dissolveAmount;
  }

  setOpacity(value: number): void {
    this.fade = value;
    for (const material of this.materials) {
      material.transparent = value < 1;
      material.opacity = value;
      material.depthWrite = value > 0.6;
    }
    if (this.arms) {
      for (const material of this.arms.materials) {
        material.transparent = value < 1;
        material.opacity = value;
        material.depthWrite = value > 0.6;
      }
    }
    const glowMaterial = this.glow.material as THREE.MeshBasicMaterial;
    glowMaterial.opacity = RING_REST * value;
    if (this.shadow) (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.55 * value;
    if (this.badge) {
      (this.badge.material as THREE.SpriteMaterial).opacity = this.badgeOpacity * value;
    }
    if (this.tokenMaterial) this.tokenMaterial.opacity = this.tokenFade * value;
  }

  /**
   * Points the figure along `forward`. `remember` stores it as the resting
   * orientation the figure returns to after a combat turn.
   */
  setFacing(forward: THREE.Vector3, remember = true): void {
    const quaternion = orientationCorrection(forward);
    this.visual.quaternion.copy(quaternion);
    if (remember) this.homeFacing.copy(quaternion);
  }

  update(delta: number, elapsed: number): void {
    this.hit = Math.max(0, this.hit - delta * 2.4);
    this.aura = Math.max(0, this.aura - delta * 1.8);

    if (this.slain) {
      this.updateSlain(delta);
      return;
    }

    const breath = Math.sin(elapsed * (this.majestic ? 0.7 : 1.15) + this.phase);
    const sway = Math.sin(elapsed * (this.majestic ? 0.42 : 0.7) + this.phase * 1.7);
    const lift = this.selected
      ? this.majestic
        ? 0.11
        : 0.16
      : this.hovered
        ? this.majestic
          ? 0.05
          : 0.075
        : 0;

    if (this.flat) {
      // Nothing of the sculpt is on screen: skip the skeleton entirely and just
      // let the figure stand back up under its counter.
      this.runtime.position.y += (0 - this.runtime.position.y) * Math.min(1, delta * 9);
    } else if (this.mixer) {
      this.mixer.update(delta);
      if (this.rootBone && this.lockRootMotion) {
        // Keep the figure planted on its square; clips carry their own steps.
        this.rootBone.position.x = this.rootRest.x;
        this.rootBone.position.z = this.rootRest.z;
      }
      // The gun goes where the arms went this frame, not where the stance pose
      // left it: a levelled barrel is the whole point of an aiming clip.
      this.arms?.align();
      // A field gun does not glide: while its crew marches, the carriage jolts
      // over the stone on the same clock as the boots.
      if (this.marchLoop) this.rumbleTrain(elapsed);
      this.runtime.position.y += (lift - this.runtime.position.y) * Math.min(1, delta * 9);
      this.runtime.rotation.z = 0;
      // Re-applied after the mixer, which owns the pose for the rest of the frame.
      this.runtime.rotation.x = this.strikeTilt;
    } else {
      // Fallback figures keep the procedural breath and weight shift.
      const amplitude = this.majestic ? 0.45 : 1;
      this.runtime.position.y +=
        (lift + breath * 0.006 * amplitude - this.runtime.position.y) * Math.min(1, delta * 9);
      this.runtime.rotation.z = sway * 0.012 * amplitude;
      this.runtime.rotation.x = breath * 0.008 * amplitude + this.strikeTilt;
    }

    const target = this.selected ? 0.5 : this.hovered ? 0.32 : 0.06;
    const alarmPulse = this.alarm > 0 ? (Math.sin(elapsed * 7) * 0.5 + 0.5) * this.alarm : 0;
    const hitGlow = this.hit * this.hit * 2.6;
    for (const material of this.materials) {
      const value = this.baseEmissive + target * 0.9 + alarmPulse * 1.5 + hitGlow;
      material.emissiveIntensity += (value - material.emissiveIntensity) * Math.min(1, delta * 8);
      if (this.hit > 0.02) material.emissive.setHex(0xff3418);
      else if (this.alarm > 0) material.emissive.setHex(0xff2a1a);
      else material.emissive.setHex(this.color === "w" ? 0x2a4d94 : 0x711a12);
    }
    if (this.arms) {
      // Steel and gems answer the same highlight, but keep their own hues.
      const boost = target * 0.8 + alarmPulse * 1.2;
      this.arms.materials.forEach((material, index) => {
        const base = this.arms?.baseEmissive[index] ?? 0;
        const value = base + boost * (base > 1 ? 0.6 : 1);
        material.emissiveIntensity += (value - material.emissiveIntensity) * Math.min(1, delta * 8);
      });
    }
    const glowMaterial = this.glow.material as THREE.MeshBasicMaterial;
    const settle = this.aura * this.aura;
    const glowTarget = Math.min(
      1,
      RING_REST + (this.selected ? 0.5 : this.hovered ? 0.3 : 0) + alarmPulse * 0.4 + settle * 0.4,
    );
    glowMaterial.opacity += (glowTarget - glowMaterial.opacity) * Math.min(1, delta * 8);
    this.glow.scale.setScalar(1 + (this.selected ? 0.16 : 0) + alarmPulse * 0.25 + settle * 0.5);

    this.updateBadge(delta, elapsed, alarmPulse);
    this.updateToken(delta, alarmPulse);
  }

  /**
   * A dying figure runs only its skeleton and the fading hit flash: no breath,
   * no hover lift, no team glow — the fall has to read as a fall.
   */
  private updateSlain(delta: number): void {
    if (!this.flat) {
      this.mixer?.update(delta);
      this.arms?.align();
    }
    this.updateToken(delta, 0);
    const hitGlow = this.hit * this.hit * 3;
    for (const material of this.materials) {
      const value = this.baseEmissive + hitGlow;
      material.emissiveIntensity += (value - material.emissiveIntensity) * Math.min(1, delta * 10);
      material.emissive.setHex(this.hit > 0.02 ? 0xff3418 : this.color === "w" ? 0x2a4d94 : 0x711a12);
    }
    if (this.arms) {
      this.arms.materials.forEach((material, index) => {
        const base = this.arms?.baseEmissive[index] ?? 0;
        material.emissiveIntensity += (base - material.emissiveIntensity) * Math.min(1, delta * 10);
      });
    }
    const glowMaterial = this.glow.material as THREE.MeshBasicMaterial;
    glowMaterial.opacity = Math.max(0, glowMaterial.opacity - delta * 0.6);
  }

  dispose(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.mixer.getRoot() as THREE.Object3D);
      this.mixer = null;
    }
    this.actions.clear();
    for (const material of this.materials) material.dispose();
    this.materials = [];
    if (this.arms) {
      // Weapon geometry is shared across the army; only the materials are ours.
      for (const material of this.arms.materials) material.dispose();
      this.arms = null;
    }
    (this.glow.material as THREE.Material).dispose();
    if (this.shadow) (this.shadow.material as THREE.Material).dispose();
    if (this.badge) {
      (this.badge.material as THREE.Material).dispose();
      this.badge = null;
    }
    if (this.tokenMaterial) {
      this.tokenMaterial.dispose();
      this.tokenMaterial = null;
      this.token = null;
    }
    this.container.removeFromParent();
    this.container.clear();
  }
}

function applyFactionLook(
  material: THREE.MeshStandardMaterial,
  color: Faction,
  ownLivery: boolean,
): void {
  if (ownLivery && material.map) {
    // The sculpt was painted for this army — feathers, jade and gold would be
    // destroyed by a flat tint, so only the surface response is touched.
    material.color.setHex(0xffffff);
    material.roughness = Math.min(0.85, material.roughness * 0.9 + 0.18);
    material.metalness = Math.max(0.08, Math.min(0.4, material.metalness));
    material.emissive = new THREE.Color(color === "w" ? 0x2a4d94 : 0x711a12);
    material.emissiveIntensity = 0.05;
    material.envMapIntensity = 1.05;
    material.needsUpdate = true;
    return;
  }
  if (color === "w") {
    material.color.setHex(0xfff2dd);
    material.roughness = 0.34;
    material.metalness = 0.1;
    material.emissive = new THREE.Color(0x2a4d94);
  } else {
    material.color.setHex(0x34363d);
    material.roughness = 0.3;
    material.metalness = 0.55;
    material.emissive = new THREE.Color(0x711a12);
  }
  material.emissiveIntensity = 0.05;
  material.envMapIntensity = 1.15;
  material.needsUpdate = true;
}

const colliderGeometries = new Map<PieceKind, THREE.BoxGeometry>();
function sharedColliderGeometry(kind: PieceKind): THREE.BoxGeometry {
  let geometry = colliderGeometries.get(kind);
  if (!geometry) {
    geometry = new THREE.BoxGeometry(0.86, PIECE_HEIGHT[kind] * 1.1, 0.86);
    colliderGeometries.set(kind, geometry);
  }
  return geometry;
}

let colliderMaterial: THREE.MeshBasicMaterial | null = null;
function sharedColliderMaterial(): THREE.MeshBasicMaterial {
  // `visible: false` keeps the box out of every render pass while the
  // raycaster still hits it.
  if (!colliderMaterial) colliderMaterial = new THREE.MeshBasicMaterial({ visible: false });
  return colliderMaterial;
}

let discGeometry: THREE.PlaneGeometry | null = null;
function sharedDiscGeometry(): THREE.PlaneGeometry {
  if (!discGeometry) discGeometry = new THREE.PlaneGeometry(0.95, 0.95);
  return discGeometry;
}

let tokenGeometry: THREE.PlaneGeometry | null = null;
function sharedTokenGeometry(): THREE.PlaneGeometry {
  if (!tokenGeometry) tokenGeometry = new THREE.PlaneGeometry(1, 1);
  return tokenGeometry;
}

const ringTextures = new Map<Faction, THREE.Texture>();
function sharedRingTexture(faction: Faction): THREE.Texture {
  let texture = ringTextures.get(faction);
  if (!texture) {
    texture = factionRingTexture(FACTION_RING_SHAPE[faction]);
    ringTextures.set(faction, texture);
  }
  return texture;
}

let shadowTexture: THREE.Texture | null = null;
function sharedShadowTexture(): THREE.Texture {
  if (!shadowTexture) shadowTexture = radialTexture("rgba(0,0,0,0.85)", "rgba(0,0,0,0)");
  return shadowTexture;
}

/** One army's roster key — the ivory kingdom or the Sun Empire. */
export type TemplateKey = `${Faction}${PieceKind}`;

/**
 * Told about a clip that finished downloading after the board was already
 * standing, so live figures can be handed their strike/death/stride. `keys` is
 * every roster rendering that sculpt (a faction may borrow the other's).
 */
export type ClipListener = (keys: TemplateKey[], name: ClipName, clip: THREE.AnimationClip) => void;

/**
 * How many times a single clip URL is chased before it is written off. Each
 * request is already five retries deep (see {@link loadGltf}), so two of them
 * survives any transient drop — while a clip the server simply does not have
 * (a drill that was never generated) stops costing every later fight a
 * four-attempt round trip before the beat can start.
 */
const MAX_CLIP_ATTEMPTS = 2;

/**
 * Loads every generated sculpt once, normalises each to its board height and
 * hands out cheap clones.
 *
 * Each side musters an army *skin* — a whole civilisation with its own six
 * sculpts, clips, arms and voices. A kind the chosen skin does not carry (or
 * one whose download fails) falls back to the other side's sculpt and then to a
 * procedural figure, so the board always fills whatever the network does.
 */
export class PieceFactory {
  private templates = new Map<TemplateKey, Template>();
  private loader = new GLTFLoader();
  private loaded = false;
  /** Which army each side is currently mustering. */
  private skins: Record<Faction, ArmySkinId> = { ...DEFAULT_ARMY_SKINS };
  /**
   * The armies the templates on hand were actually built from, or null while
   * nothing has been mustered yet.
   */
  private mustered: Record<Faction, ArmySkinId> | null = null;
  /** True while a muster is downloading. */
  private mustering = false;
  /**
   * Serialises musters. Two of them writing into {@link templates} at once is
   * what used to split an army in half — see {@link muster}.
   */
  private queue: Promise<void> = Promise.resolve();
  /** Clip URLs per roster, so a clip can still be fetched long after start-up. */
  private clipSources = new Map<TemplateKey, PieceAnimationSet>();
  /** In-flight clip downloads, keyed by URL, so nothing is fetched twice. */
  private clipJobs = new Map<string, Promise<THREE.AnimationClip | null>>();
  /** Failed attempts per clip URL, so a missing file is not chased forever. */
  private clipFailures = new Map<string, number>();
  private clipListener: ClipListener | null = null;
  private warming: Promise<void> | null = null;

  get isReady(): boolean {
    return this.loaded;
  }

  /** Registers the sink for clips that land after the board is already up. */
  onClip(listener: ClipListener | null): void {
    this.clipListener = listener;
  }

  /** The army each side is mustering. */
  getSkins(): Record<Faction, ArmySkinId> {
    return { ...this.skins };
  }

  /**
   * Records the armies to muster.
   *
   * @returns whether a {@link reload} is needed to honour them. Before the
   *   first muster the answer is no even when the armies changed: the load that
   *   is about to run reads {@link skins} itself, and a reload racing it is
   *   precisely what used to leave one side of the board without its clips.
   */
  setSkins(next: Record<Faction, ArmySkinId>): boolean {
    const changed = next.w !== this.skins.w || next.b !== this.skins.b;
    this.skins = { w: next.w, b: next.b };
    if (!changed) return false;
    return this.mustered !== null || this.mustering;
  }

  /**
   * Marks the sculpts stale without disposing anything, so the scene can take
   * its figures down *before* {@link reload} frees the geometry they clone.
   */
  markStale(): void {
    this.loaded = false;
  }

  /** Musters the armies {@link setSkins} asked for, unless they are already up. */
  load(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    return this.enqueue(() => this.muster(onProgress));
  }

  /** Drops the current armies and musters the ones {@link setSkins} asked for. */
  reload(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    return this.enqueue(async () => {
      this.dropArmies();
      await this.muster(onProgress);
    });
  }

  /** Runs a job behind every muster already queued, so none of them overlap. */
  private enqueue(job: () => Promise<void>): Promise<void> {
    const run = this.queue.then(job);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Frees the mustered armies and forgets everything keyed to them. */
  private dropArmies(): void {
    this.disposeTemplates();
    this.clipJobs.clear();
    this.clipFailures.clear();
    this.clipSources.clear();
    this.warming = null;
    this.mustered = null;
  }

  /**
   * Downloads the two armies and normalises every roster.
   *
   * Never allowed to run twice over the same map (see {@link enqueue}). The
   * shell records the armies it remembers from last visit and *then* loads,
   * which used to start a swap and the first download at the same time. Both
   * runs wrote into `templates`, so when both sides wore the same army the
   * borrowed roster was left pointing at the *first* run's sculpt while the
   * roster it borrowed from had been replaced by the second run's. The two
   * stopped sharing one `clips` object, and since a borrowed roster carried no
   * clip URLs of its own, that side could never fetch a stride, a strike or a
   * death again: it slid across the board and killed without swinging.
   */
  private async muster(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    if (this.mustered && this.mustered.w === this.skins.w && this.mustered.b === this.skins.b) {
      // Already standing in exactly these armies.
      this.loaded = true;
      onProgress?.(1, 1);
      return;
    }
    if (this.templates.size > 0) this.dropArmies();
    this.mustering = true;
    try {
      await this.download(onProgress);
      this.mustered = { ...this.skins };
      this.loaded = true;
    } finally {
      this.mustering = false;
    }
  }

  private async download(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const kinds: PieceKind[] = ["k", "q", "b", "n", "r", "p"];
    // The side whose skin is loaded first keeps its own painted textures; when
    // both sides wear the same army the other one is re-tinted into livery, so
    // the two forces never become impossible to tell apart.
    const shared = this.skins.w === this.skins.b;
    const primary = shared ? ARMY_SKINS[this.skins.w].native : "w";
    const factions: Faction[] = primary === "b" ? ["b", "w"] : ["w", "b"];
    const jobs: { faction: Faction; kind: PieceKind }[] = [];
    for (const faction of factions) {
      if (shared && faction !== primary) continue;
      const skin = ARMY_SKINS[this.skins[faction]];
      for (const kind of kinds) {
        // Only load a roster where this army really carries a sculpt.
        if (!skin.animated[kind] && !skin.still[kind]) continue;
        jobs.push({ faction, kind });
      }
    }

    // The Grande Armée's weapons are generated meshes rather than primitives, and
    // a figure is armed the instant it is built — so they are downloaded *with*
    // the rosters, not after them, or the board stands up carrying box muskets
    // for the rest of the game.
    const armJobs = armSculptWarmJobs(
      new Set(Object.values(this.skins).map((skin) => ARMY_SKINS[skin].arsenal)),
    );

    let done = 0;
    const total = jobs.length + armJobs.length;
    await Promise.all([
      ...jobs.map(async ({ faction, kind }) => {
        try {
          this.templates.set(`${faction}${kind}`, await this.loadRoster(faction, kind));
        } catch (error) {
          console.warn(`[pieces] no sculpt for "${faction}${kind}"`, error);
        } finally {
          done += 1;
          onProgress?.(done, total);
        }
      }),
      ...armJobs.map(async (job) => {
        // Never throws: a sculpt that cannot be had leaves the figure armed from
        // primitives instead.
        await job();
        done += 1;
        onProgress?.(done, total);
      }),
    ]);

    // Anything still missing borrows the other side's figure.
    for (const kind of kinds) {
      for (const faction of factions) {
        const key: TemplateKey = `${faction}${kind}`;
        if (this.templates.has(key)) continue;
        const lender: TemplateKey = `${faction === "w" ? "b" : "w"}${kind}`;
        const other = this.templates.get(lender);
        const arsenal = ARMY_SKINS[this.skins[faction]].arsenal;
        if (other) {
          this.templates.set(key, { ...other, ownLivery: false, arsenal: other.arsenal });
          // The borrower is handed the lender's clip URLs under its own key too.
          // Both rosters share one `clips` object, so nothing is fetched twice —
          // but a roster that cannot name its own clips has no way back if that
          // sharing is ever lost, and it is the whole army wearing the same skin
          // as the other side that borrows.
          const lent = this.clipSources.get(lender);
          if (lent) this.clipSources.set(key, lent);
        } else {
          this.templates.set(key, this.normalize(buildProceduralFigure(kind), kind, {}, false, arsenal));
        }
      }
    }
  }

  /** Rigged sculpt when the army has one, else its static GLB. */
  private async loadRoster(faction: Faction, kind: PieceKind): Promise<Template> {
    const skin: ArmySkin = ARMY_SKINS[this.skins[faction]];
    const animated = skin.animated[kind];
    const still = skin.still[kind];
    if (animated) {
      try {
        const template = await this.loadAnimated(kind, animated, skin.arsenal);
        // Remembered so the clips left for later can still be found by name.
        this.clipSources.set(`${faction}${kind}`, animated);
        return template;
      } catch (error) {
        console.warn(`[pieces] rig failed for "${faction}${kind}", using the still sculpt`, error);
      }
    }
    if (!still) throw new Error(`no sculpt url for ${faction}${kind}`);
    const gltf = await loadGltf(this.loader, still);
    return this.normalize(gltf.scene, kind, {}, true, skin.arsenal);
  }

  /**
   * Rigged sculpt + the clips the opening needs. The clips share the auto-rig
   * skeleton, so they bind straight onto the rigged scene — no retargeting.
   */
  private async loadAnimated(kind: PieceKind, set: PieceAnimationSet, arsenal: ArsenalId): Promise<Template> {
    const rigged = await loadGltf(this.loader, set.rigged, 5);
    const clips: PieceClips = {};
    await Promise.all(
      OPENING_CLIPS.map(async (name) => {
        const url = set[name];
        if (!url) return;
        const clip = await this.fetchClip(url, name);
        if (clip) clips[name] = clip;
      }),
    );
    return this.normalize(rigged.scene, kind, clips, true, arsenal);
  }

  /** One clip GLB — queued, retried, and never allowed to throw at the caller. */
  private async fetchClip(url: string, name: ClipName): Promise<THREE.AnimationClip | null> {
    try {
      const gltf = await loadGltf(this.loader, url, 5);
      const source = gltf.animations[0];
      if (!source) return null;
      const clip = source.clone();
      clip.name = name;
      return clip;
    } catch (error) {
      console.warn(`[pieces] clip "${name}" unavailable (${url})`, error);
      return null;
    }
  }

  /**
   * Pulls in the clips the opening did not need, a wave at a time and only two
   * downloads wide, in {@link CLIP_ORDER}: strides first (the opening move is
   * made seconds after the board stands up), then the strikes and deaths, then
   * the firing drills. Every clip that lands is pushed straight onto the
   * figures already standing on the board.
   */
  warmClips(): Promise<void> {
    if (!this.warming) this.warming = this.runWarm();
    return this.warming;
  }

  private async runWarm(): Promise<void> {
    const keys = [...this.clipSources.keys()];
    for (const name of CLIP_ORDER) {
      if (OPENING_CLIPS.includes(name)) continue;
      let next = 0;
      const lane = async (): Promise<void> => {
        while (next < keys.length) {
          const key = keys[next];
          next += 1;
          await this.requestClip(key, name);
        }
      };
      await Promise.all(Array.from({ length: Math.min(2, keys.length) }, lane));
    }
  }

  /**
   * Guarantees a roster has a clip before the game needs it. A capture asks for
   * the strike and the death here, so a request dropped during the opening burst
   * costs the fight a moment rather than its animation.
   *
   * @returns whether the clip is now bound to that roster
   */
  async ensureClip(faction: Faction, kind: PieceKind, name: ClipName): Promise<boolean> {
    return (await this.requestClip(`${faction}${kind}`, name)) !== null;
  }

  private requestClip(key: TemplateKey, name: ClipName): Promise<THREE.AnimationClip | null> {
    const template = this.templates.get(key);
    const existing = template?.clips[name];
    if (existing) return Promise.resolve(existing);
    const url = template ? this.clipUrl(template, key, name) : undefined;
    if (!template || !url) return Promise.resolve(null);

    const running = this.clipJobs.get(url);
    // A download started for another roster still has to land on this one: two
    // rosters asking for the same file do not always share one `clips` object.
    if (running) return running.then((clip) => (clip ? this.bindClip(url, name, clip) : null));
    if ((this.clipFailures.get(url) ?? 0) >= MAX_CLIP_ATTEMPTS) return Promise.resolve(null);

    const job = this.fetchClip(url, name).then((clip) => {
      if (!clip) {
        // Not cached as a failure: the next capture gets another attempt, up to
        // MAX_CLIP_ATTEMPTS of them.
        this.clipJobs.delete(url);
        this.clipFailures.set(url, (this.clipFailures.get(url) ?? 0) + 1);
        return null;
      }
      return this.bindClip(url, name, clip);
    });
    this.clipJobs.set(url, job);
    return job;
  }

  /**
   * Binds a downloaded clip onto **every** roster that was waiting for that URL
   * and reports all of them to the listener, so no figure is left without a
   * stride merely because another roster asked for the same file first.
   */
  private bindClip(url: string, name: ClipName, clip: THREE.AnimationClip): THREE.AnimationClip {
    const keys: TemplateKey[] = [];
    for (const [key, entry] of this.templates) {
      // Rosters sharing one `clips` object are filled by a single write.
      if (entry.clips[name] === clip) {
        keys.push(key);
        continue;
      }
      if (entry.clips[name] || this.clipUrl(entry, key, name) !== url) continue;
      entry.clips[name] = clip;
      keys.push(key);
    }
    if (keys.length > 0) this.clipListener?.(keys, name, clip);
    return clip;
  }

  /**
   * Clip URL for a roster. A faction with no sculpt of its own renders the other
   * army's template, so the URL is looked up under whichever roster owns it.
   */
  private clipUrl(template: Template, key: TemplateKey, name: ClipName): string | undefined {
    const own = this.clipSources.get(key)?.[name];
    if (own) return own;
    for (const shared of this.sharingKeys(template)) {
      const url = this.clipSources.get(shared)?.[name];
      if (url) return url;
    }
    return undefined;
  }

  /** Every roster key rendering this template. */
  private sharingKeys(template: Template): TemplateKey[] {
    const keys: TemplateKey[] = [];
    for (const [key, entry] of this.templates) {
      if (entry.clips === template.clips) keys.push(key);
    }
    return keys;
  }

  private normalize(
    scene: THREE.Object3D,
    kind: PieceKind,
    clips: PieceClips,
    ownLivery: boolean,
    arsenal: ArsenalId,
  ): Template {
    const box = measureModel(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const height = Math.max(0.0001, size.y);
    const scale = PIECE_HEIGHT[kind] / height;

    const centre = new THREE.Vector3();
    box.getCenter(centre);
    const offset = new THREE.Vector3(-centre.x * scale, -box.min.y * scale, -centre.z * scale);

    let skinned = false;
    scene.traverse((node) => {
      if ((node as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
    });

    return { scene, scale, offset, skinned, clips, unit: height, baseY: box.min.y, ownLivery, arsenal };
  }

  create(kind: PieceKind, color: Faction, options: PieceVisualOptions): PieceView {
    const template = this.templates.get(`${color}${kind}`);
    if (!template) throw new Error(`piece template "${color}${kind}" not loaded`);

    // Skinned meshes must never share a skeleton between instances.
    const model = template.skinned ? SkeletonUtils.clone(template.scene) : template.scene.clone(true);
    model.scale.setScalar(template.scale);
    model.position.copy(template.offset);

    const view = new PieceView(
      kind,
      color,
      model,
      options,
      template.clips,
      template.unit,
      template.baseY,
      template.ownLivery,
      template.arsenal,
    );
    view.setFacing(new THREE.Vector3(0, 0, color === "w" ? -1 : 1));
    return view;
  }

  dispose(): void {
    this.clipListener = null;
    this.clipJobs.clear();
    this.clipFailures.clear();
    this.clipSources.clear();
    this.mustered = null;
    this.disposeTemplates();
  }

  /**
   * Frees the sculpts. Clones share their template's geometry, so every live
   * figure must be gone before this runs (see {@link markStale}).
   */
  private disposeTemplates(): void {
    this.loaded = false;
    const seen = new Set<THREE.Object3D>();
    for (const template of this.templates.values()) {
      // Both sides may render the same sculpt; free it once.
      if (seen.has(template.scene)) continue;
      seen.add(template.scene);
      template.scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material.dispose();
      });
    }
    this.templates.clear();
  }
}

/**
 * Primitive-built humanoid used only if a generated sculpt fails to download —
 * head, torso, arms and a kind-specific silhouette so the game stays playable.
 */
export function buildProceduralFigure(kind: PieceKind): THREE.Object3D {
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0xe8e0cf, roughness: 0.5, metalness: 0.1 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.12, 20), stone);
  base.position.y = 0.06;
  group.add(base);

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.44, 6, 14), stone);
  body.position.y = 0.48;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 14), stone);
  head.position.y = 0.88;
  group.add(head);

  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.3, 4, 8), stone);
    arm.position.set(side * 0.23, 0.55, 0);
    arm.rotation.z = side * 0.24;
    group.add(arm);
  }

  if (kind === "k" || kind === "q") {
    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.11, kind === "k" ? 0.16 : 0.1, 8, 1, true),
      stone,
    );
    crown.position.y = kind === "k" ? 1.03 : 0.99;
    group.add(crown);
  }
  if (kind === "b") {
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.3, 12), stone);
    hood.position.y = 0.94;
    group.add(hood);
  }
  if (kind === "r") {
    const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.18, 8), stone);
    helm.position.y = 1;
    group.add(helm);
  }
  if (kind === "n") {
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 8), stone);
    plume.position.set(0, 1.04, -0.02);
    group.add(plume);
  }
  return group;
}
