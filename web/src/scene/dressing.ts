import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { ArenaLook, SceneryLook } from "./arena";
import { ARENA_LOOKS, DEFAULT_ARENA } from "./arena";
import { terrainHeight } from "./battlefield";
import { QUALITY_SETTINGS, type QualityPreset } from "./quality";
import { streakTexture } from "./textures";

/**
 * The scenery every non-jungle map is dressed with: a grove, a scatter of rock,
 * standing stones, standing water and falling weather.
 *
 * A relight alone was never enough. Sky colour, fog and torch strength can make
 * the *same* ruined field feel like morning or midnight, but they cannot make it
 * a desert or a snowfield: those are different *things standing on the ground*,
 * and without them every new theme was the siege at a new hour.
 *
 * Everything is built once at boot and then shown, hidden and repainted per
 * theme — the same rule the rainforest overlay follows — so switching maps never
 * allocates geometry mid-frame. All of it is instanced and stays out of the
 * shadow camera (which only covers the board), so a fully dressed map costs a
 * handful of draw calls.
 */

/** Instance pools. Themes draw a fraction of these via `density`. */
const MAX_TREES = 96;
const MAX_ROCKS = 132;
const MAX_MONOLITHS = 5;
const MAX_PUDDLES = 30;
const MAX_WEATHER = 720;

/** Nothing is staged inside this radius — the board and its walkway. */
const CLEAR_RADIUS = 23;
/** Weather falls inside this cylinder, centred on the board. */
const WEATHER_RADIUS = 42;
const WEATHER_CEILING = 26;

type GroveKind = SceneryLook["grove"]["kind"];
type RockKind = SceneryLook["rocks"]["kind"];
type MonolithKind = SceneryLook["monoliths"]["kind"];
type WeatherKind = SceneryLook["weather"]["kind"];

/**
 * How a weather field behaves. Rain, snow and driven sand are deliberately one
 * system: the difference between them is the angle it falls at, how fast, and
 * how long each streak is drawn — not three separate particle engines.
 */
interface WeatherProfile {
  /** Radians off vertical. Rain leans, sand is almost horizontal. */
  tilt: number;
  /** Metres per second along the streak's own axis. */
  speed: number;
  /** Streak size in metres: across, then along. */
  width: number;
  length: number;
  /** Sideways wander, in metres of amplitude. */
  wander: number;
  /** Ceiling of the falling volume. Sand hugs the dunes. */
  ceiling: number;
  /** Fraction of the pool this kind uses at full quality. */
  share: number;
}

const WEATHER_PROFILES: Record<Exclude<WeatherKind, "none">, WeatherProfile> = {
  /** Driving and hard: long thin streaks, leaning with the wind. */
  rain: { tilt: 0.26, speed: 19, width: 0.035, length: 1.5, wander: 0, ceiling: WEATHER_CEILING, share: 1 },
  /** Barely falling: short, fat, tumbling flakes. */
  snow: { tilt: 0.1, speed: 1.7, width: 0.14, length: 0.2, wander: 0.9, ceiling: 18, share: 0.75 },
  /** Not falling at all so much as being *carried*: near-horizontal and fast. */
  sand: { tilt: 1.31, speed: 24, width: 0.05, length: 2.4, wander: 0.35, ceiling: 7, share: 0.85 },
};

/**
 * Merges the parts of a prop into one geometry and disposes the offcuts. The
 * offcuts are released only once the merge has actually produced something, so
 * a failed merge hands back a usable piece instead of a disposed one.
 */
function weld(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  if (!merged) return parts[0];
  for (const part of parts) part.dispose();
  return merged;
}

/** A slot no one has placed yet. Scale zero draws nothing at all. */
const PARKED = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Parks every slot of a fresh instanced mesh.
 *
 * An unwritten instance matrix is the identity, which is not "nowhere" — it is a
 * full-size prop standing at the origin, and the origin is the middle of the
 * board. Every pool is therefore emptied before it is filled, so a slot that is
 * never placed (or not placed yet, like a weather streak before its first
 * frame) is invisible instead of sitting on the centre four squares.
 */
function park(mesh: THREE.InstancedMesh): THREE.InstancedMesh {
  for (let i = 0; i < mesh.count; i += 1) mesh.setMatrixAt(i, PARKED);
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A conifer's foliage: three stacked cones, unit height, base at the origin. */
function pineFoliage(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tiers: [number, number, number][] = [
    [0.42, 0.44, 0.2],
    [0.32, 0.38, 0.48],
    [0.2, 0.3, 0.74],
  ];
  for (const [radius, height, lift] of tiers) {
    const cone = new THREE.ConeGeometry(radius, height, 7, 1);
    cone.translate(0, lift + height / 2, 0);
    parts.push(cone);
  }
  return weld(parts);
}

/** A date palm's crown: seven drooping fronds around the top of a unit trunk. */
function palmCrown(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i += 1) {
    const spin = (i / 7) * Math.PI * 2;
    // One frond is a long tapered blade, bent down by rotating it about X.
    const blade = new THREE.PlaneGeometry(0.16, 0.62, 1, 3);
    blade.translate(0, 0.31, 0);
    blade.rotateX(Math.PI / 2 + 0.75);
    blade.rotateY(spin);
    blade.translate(Math.sin(spin) * 0.05, 0.97, Math.cos(spin) * 0.05);
    parts.push(blade);
  }
  return weld(parts);
}

/** A stripped trunk with a few bare branches — dead, burnt or wind-flayed. */
function bareTree(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.045, 0.11, 1, 5, 1);
  trunk.translate(0, 0.5, 0);
  parts.push(trunk);

  const branches: [number, number, number][] = [
    [0.52, 0.5, 0.9],
    [0.64, 2.4, 1.1],
    [0.74, 4.1, 0.75],
    [0.83, 5.6, 1.25],
    [0.9, 1.5, 0.6],
  ];
  for (const [lift, spin, lean] of branches) {
    const branch = new THREE.CylinderGeometry(0.018, 0.04, 0.42, 4, 1);
    branch.translate(0, 0.21, 0);
    branch.rotateZ(lean);
    branch.rotateY(spin);
    branch.translate(0, lift, 0);
    parts.push(branch);
  }
  return weld(parts);
}

/** A tapering obelisk with a pyramidion cap, unit height. */
function obeliskGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const shaft = new THREE.CylinderGeometry(0.055, 0.085, 0.88, 4, 1);
  shaft.rotateY(Math.PI / 4);
  shaft.translate(0, 0.44, 0);
  parts.push(shaft);
  const cap = new THREE.ConeGeometry(0.078, 0.13, 4, 1);
  cap.rotateY(Math.PI / 4);
  cap.translate(0, 0.94, 0);
  parts.push(cap);
  const plinth = new THREE.BoxGeometry(0.26, 0.07, 0.26);
  plinth.translate(0, 0.035, 0);
  parts.push(plinth);
  return weld(parts);
}

export class Dressing {
  readonly group = new THREE.Group();

  private rng = mulberry32(0x2b91d5);
  private disposables: { dispose: () => void }[] = [];
  private look: ArenaLook = ARENA_LOOKS[DEFAULT_ARENA];
  private elapsed = 0;
  private density = 1;
  private propsAllowed = true;

  // -------------------------------------------------------------- groves
  private groveTrunks = new Map<GroveKind, THREE.InstancedMesh>();
  private groveCrowns = new Map<GroveKind, THREE.InstancedMesh>();
  private trunkMaterials = new Map<GroveKind, THREE.MeshStandardMaterial>();
  private crownMaterials = new Map<GroveKind, THREE.MeshStandardMaterial>();

  // --------------------------------------------------------------- rocks
  private rockMeshes = new Map<RockKind, THREE.InstancedMesh>();
  private rockMaterials = new Map<RockKind, THREE.MeshStandardMaterial>();

  // ----------------------------------------------------------- monoliths
  private monolithMeshes = new Map<MonolithKind, THREE.InstancedMesh>();
  private monolithMaterials = new Map<MonolithKind, THREE.MeshStandardMaterial>();
  private monolithCaps: THREE.InstancedMesh | null = null;
  private monolithCapMaterial: THREE.MeshStandardMaterial | null = null;

  // ------------------------------------------------------- ground detail
  private puddles: THREE.InstancedMesh | null = null;
  private puddleMaterial: THREE.MeshStandardMaterial | null = null;

  // ------------------------------------------------------------- weather
  private weather: THREE.InstancedMesh | null = null;
  private weatherMaterial: THREE.MeshBasicMaterial | null = null;
  private weatherGroup = new THREE.Group();
  private weatherPositions: Float32Array = new Float32Array(0);
  private weatherScales: Float32Array = new Float32Array(0);
  private weatherPhase: Float32Array = new Float32Array(0);
  private weatherProfile: WeatherProfile | null = null;
  private weatherDummy = new THREE.Object3D();

  constructor(quality: QualityPreset, look: ArenaLook = ARENA_LOOKS[DEFAULT_ARENA]) {
    this.group.name = "dressing";
    this.group.visible = false;

    this.buildGroves();
    this.buildRocks();
    this.buildMonoliths();
    this.buildPuddles();
    this.buildWeather();

    this.applyQuality(quality);
    this.applyArena(look);
  }

  private track<T extends { dispose: () => void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  /**
   * One scatter of positions on the plain, reused by every kind so a theme's
   * dunes and its palms agree about where the ground is. Sorted outward, so
   * lowering the graphics preset thins the far field first and always keeps the
   * ring that frames the board.
   */
  private scatter(count: number, inner: number, outer: number): { x: number; z: number; y: number }[] {
    const spots: { x: number; z: number; y: number; radius: number }[] = [];
    for (let i = 0; i < count; i += 1) {
      const angle = this.rng() * Math.PI * 2;
      const radius = inner + Math.pow(this.rng(), 0.75) * (outer - inner);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      spots.push({ x, z, y: terrainHeight(x, z) - 0.7, radius });
    }
    spots.sort((a, b) => a.radius - b.radius);
    return spots;
  }

  // ---------------------------------------------------------------- groves

  private buildGroves(): void {
    const trunkGeo = this.track(new THREE.CylinderGeometry(0.07, 0.15, 1, 6, 1));
    trunkGeo.translate(0, 0.5, 0);
    // A palm's trunk is slimmer and leans; the lean comes from the instance.
    const palmTrunkGeo = this.track(new THREE.CylinderGeometry(0.05, 0.09, 1, 6, 1));
    palmTrunkGeo.translate(0, 0.5, 0);

    this.buildGrove("pine", trunkGeo, this.track(pineFoliage()), 0x4a3a2c, 0x3f5a3e, false);
    this.buildGrove("palm", palmTrunkGeo, this.track(palmCrown()), 0x7d6a48, 0x7f8a45, true);
    this.buildGrove("bare", this.track(bareTree()), null, 0x3b3a36, 0x3b3a36, false);
  }

  private buildGrove(
    kind: GroveKind,
    trunkGeometry: THREE.BufferGeometry,
    crownGeometry: THREE.BufferGeometry | null,
    trunkColor: number,
    crownColor: number,
    doubleSided: boolean,
  ): void {
    const trunkMaterial = this.track(
      new THREE.MeshStandardMaterial({ color: trunkColor, roughness: 1, metalness: 0, flatShading: true }),
    );
    this.trunkMaterials.set(kind, trunkMaterial);
    const trunks = park(new THREE.InstancedMesh(trunkGeometry, trunkMaterial, MAX_TREES));
    trunks.frustumCulled = false;
    trunks.visible = false;
    this.groveTrunks.set(kind, trunks);
    this.group.add(trunks);

    let crowns: THREE.InstancedMesh | null = null;
    if (crownGeometry) {
      const crownMaterial = this.track(
        new THREE.MeshStandardMaterial({
          color: crownColor,
          roughness: 0.92,
          metalness: 0,
          flatShading: true,
          side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
        }),
      );
      this.crownMaterials.set(kind, crownMaterial);
      crowns = park(new THREE.InstancedMesh(crownGeometry, crownMaterial, MAX_TREES));
      crowns.frustumCulled = false;
      crowns.visible = false;
      this.groveCrowns.set(kind, crowns);
      this.group.add(crowns);
    }

    // Palms cluster (an oasis is a clump, not a lawn); conifers spread.
    const spots = this.scatter(MAX_TREES, kind === "palm" ? 26 : CLEAR_RADIUS + 3, kind === "pine" ? 96 : 62);
    const dummy = new THREE.Object3D();
    spots.forEach((spot, index) => {
      const height =
        kind === "pine" ? 6 + this.rng() * 7 : kind === "palm" ? 5.5 + this.rng() * 3.4 : 4.4 + this.rng() * 4.2;
      const lean = kind === "palm" ? 0.12 + this.rng() * 0.16 : kind === "bare" ? (this.rng() - 0.5) * 0.34 : (this.rng() - 0.5) * 0.08;
      const spin = this.rng() * Math.PI * 2;
      dummy.position.set(spot.x, spot.y, spot.z);
      dummy.rotation.set(0, spin, lean);
      dummy.scale.set(height * (kind === "pine" ? 0.62 : 0.5), height, height * (kind === "pine" ? 0.62 : 0.5));
      dummy.updateMatrix();
      trunks.setMatrixAt(index, dummy.matrix);
      crowns?.setMatrixAt(index, dummy.matrix);
    });
    trunks.instanceMatrix.needsUpdate = true;
    if (crowns) crowns.instanceMatrix.needsUpdate = true;
  }

  // ----------------------------------------------------------------- rocks

  private buildRocks(): void {
    // A dune back and a snow drift are the same shape at different densities: a
    // squashed blob. A boulder is the same blob unsquashed. All three are one
    // icosahedron away from free.
    const blob = this.track(new THREE.IcosahedronGeometry(1, 0));

    this.buildRockKind("dune", blob, 0xc4a973, { flat: 0.16, size: [6, 13], sink: 0.45 });
    this.buildRockKind("drift", blob, 0xdfe8f3, { flat: 0.13, size: [3.4, 7], sink: 0.5 });
    this.buildRockKind("boulder", blob, 0x7a746a, { flat: 0.62, size: [0.9, 2.6], sink: 0.28 });
  }

  private buildRockKind(
    kind: RockKind,
    geometry: THREE.BufferGeometry,
    color: number,
    shape: { flat: number; size: [number, number]; sink: number },
  ): void {
    const material = this.track(
      new THREE.MeshStandardMaterial({ color, roughness: 0.98, metalness: 0, flatShading: true }),
    );
    this.rockMaterials.set(kind, material);
    const mesh = park(new THREE.InstancedMesh(geometry, material, MAX_ROCKS));
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.rockMeshes.set(kind, mesh);
    this.group.add(mesh);

    const spots = this.scatter(MAX_ROCKS, CLEAR_RADIUS, kind === "boulder" ? 70 : 88);
    const dummy = new THREE.Object3D();
    spots.forEach((spot, index) => {
      const size = shape.size[0] + this.rng() * (shape.size[1] - shape.size[0]);
      dummy.position.set(spot.x, spot.y - size * shape.flat * shape.sink, spot.z);
      dummy.rotation.set(this.rng() * Math.PI, this.rng() * Math.PI, this.rng() * Math.PI);
      dummy.scale.set(size, size * shape.flat, size * (0.8 + this.rng() * 0.5));
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------- monoliths

  private buildMonoliths(): void {
    // The caps are built first because the obelisk pass places them as it goes:
    // built afterwards, every cap kept the identity matrix and the whole set
    // stood at full size on the middle of the board.
    const capMaterial = this.track(
      new THREE.MeshStandardMaterial({ color: 0xe0c069, roughness: 0.35, metalness: 0.7 }),
    );
    this.monolithCapMaterial = capMaterial;
    const capGeometry = this.track(new THREE.OctahedronGeometry(0.5, 0));
    const caps = park(new THREE.InstancedMesh(capGeometry, capMaterial, MAX_MONOLITHS));
    caps.frustumCulled = false;
    caps.visible = false;
    this.monolithCaps = caps;
    this.group.add(caps);

    this.buildMonolithKind("obelisk", this.track(obeliskGeometry()), 0xbda87a, [11, 17]);
    const menhir = this.track(new THREE.BoxGeometry(0.34, 1, 0.19));
    menhir.translate(0, 0.5, 0);
    this.buildMonolithKind("menhir", menhir, 0x8e8676, [4.5, 8]);
  }

  private buildMonolithKind(
    kind: MonolithKind,
    geometry: THREE.BufferGeometry,
    color: number,
    height: [number, number],
  ): void {
    const material = this.track(new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.04 }));
    this.monolithMaterials.set(kind, material);
    const mesh = park(new THREE.InstancedMesh(geometry, material, MAX_MONOLITHS));
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.monolithMeshes.set(kind, mesh);
    this.group.add(mesh);

    const dummy = new THREE.Object3D();
    const caps = this.monolithCaps;
    for (let i = 0; i < MAX_MONOLITHS; i += 1) {
      // Spread around the board rather than scattered, so they read as placed.
      const angle = (i / MAX_MONOLITHS) * Math.PI * 2 + 0.7;
      const radius = 34 + this.rng() * 26;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const tall = height[0] + this.rng() * (height[1] - height[0]);
      dummy.position.set(x, terrainHeight(x, z) - 0.75, z);
      dummy.rotation.set(0, this.rng() * Math.PI, kind === "menhir" ? (this.rng() - 0.5) * 0.16 : 0);
      dummy.scale.set(tall, tall, tall);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      if (kind === "obelisk" && caps) {
        dummy.position.y += tall * 1.02;
        dummy.scale.setScalar(tall * 0.09);
        dummy.updateMatrix();
        caps.setMatrixAt(i, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (caps) caps.instanceMatrix.needsUpdate = true;
  }

  // --------------------------------------------------------- ground detail

  /** Standing water: rain pools on the rampart, meltwater on the snowfield. */
  private buildPuddles(): void {
    const geometry = this.track(new THREE.CircleGeometry(1, 14));
    geometry.rotateX(-Math.PI / 2);
    const material = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x76889c,
        roughness: 0.06,
        metalness: 0.4,
        transparent: true,
        opacity: 0.7,
      }),
    );
    this.puddleMaterial = material;
    const mesh = park(new THREE.InstancedMesh(geometry, material, MAX_PUDDLES));
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.puddles = mesh;
    this.group.add(mesh);

    const spots = this.scatter(MAX_PUDDLES, CLEAR_RADIUS, 58);
    const dummy = new THREE.Object3D();
    spots.forEach((spot, index) => {
      const size = 1.4 + this.rng() * 4.6;
      dummy.position.set(spot.x, spot.y + 0.05, spot.z);
      dummy.rotation.set(0, this.rng() * Math.PI, 0);
      dummy.scale.set(size, 1, size * (0.5 + this.rng() * 0.7));
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  // --------------------------------------------------------------- weather

  /**
   * One streak field for rain, snow and sand.
   *
   * The streaks are flat quads, so seen edge-on they would vanish. Rather than
   * billboarding 700 instances every frame, the whole field is a cylinder
   * centred on the board and the *group* is turned to face the camera: rotating
   * a cylinder of uniformly-scattered points about its own axis leaves an
   * identical distribution, so this is free and exact rather than an
   * approximation.
   */
  private buildWeather(): void {
    const map = this.track(streakTexture());
    const geometry = this.track(new THREE.PlaneGeometry(1, 1));
    const material = this.track(
      new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        depthWrite: false,
        opacity: 0,
        fog: true,
      }),
    );
    this.weatherMaterial = material;

    // Parked until the first `update` writes real matrices — otherwise the whole
    // field spends its first frame stacked at the centre of the board.
    const mesh = park(new THREE.InstancedMesh(geometry, material, MAX_WEATHER));
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = 3;
    this.weather = mesh;
    this.weatherGroup.add(mesh);
    this.group.add(this.weatherGroup);

    this.weatherPositions = new Float32Array(MAX_WEATHER * 3);
    this.weatherScales = new Float32Array(MAX_WEATHER);
    this.weatherPhase = new Float32Array(MAX_WEATHER);
    for (let i = 0; i < MAX_WEATHER; i += 1) {
      this.seedStreak(i, true);
      this.weatherScales[i] = 0.7 + this.rng() * 0.6;
      this.weatherPhase[i] = this.rng() * Math.PI * 2;
    }
  }

  /** Places one streak: anywhere in the volume on boot, at the ceiling after. */
  private seedStreak(index: number, anywhere: boolean): void {
    const ceiling = this.weatherProfile?.ceiling ?? WEATHER_CEILING;
    // Square-rooted radius keeps the scatter even across the disc instead of
    // crowding the middle.
    const radius = Math.sqrt(this.rng()) * WEATHER_RADIUS;
    const angle = this.rng() * Math.PI * 2;
    this.weatherPositions[index * 3] = Math.cos(angle) * radius;
    this.weatherPositions[index * 3 + 1] = anywhere ? this.rng() * ceiling : ceiling * (0.85 + this.rng() * 0.15);
    this.weatherPositions[index * 3 + 2] = Math.sin(angle) * radius;
  }

  // ---------------------------------------------------------------- runtime

  /** Stages exactly the scenery this map asks for, and repaints it. */
  applyArena(look: ArenaLook): void {
    this.look = look;
    const scenery = look.scenery;
    const dressed =
      scenery.grove.kind !== "none" ||
      scenery.rocks.kind !== "none" ||
      scenery.monoliths.kind !== "none" ||
      scenery.puddles.enabled ||
      scenery.weather.kind !== "none";
    this.group.visible = dressed;
    if (!dressed) return;

    this.stageGrove(scenery);
    this.stageRocks(scenery);
    this.stageMonoliths(scenery);
    this.stagePuddles(scenery);
    this.stageWeather(scenery);
  }

  private stageGrove(scenery: SceneryLook): void {
    const { kind, density, trunk, foliage } = scenery.grove;
    for (const [name, mesh] of this.groveTrunks) {
      const on = name === kind && this.propsAllowed;
      mesh.visible = on;
      if (on) mesh.count = Math.round(MAX_TREES * density * this.density);
    }
    for (const [name, mesh] of this.groveCrowns) {
      const on = name === kind && this.propsAllowed;
      mesh.visible = on;
      if (on) mesh.count = Math.round(MAX_TREES * density * this.density);
    }
    if (kind === "none") return;
    this.trunkMaterials.get(kind)?.color.setHex(trunk);
    this.crownMaterials.get(kind)?.color.setHex(foliage);
  }

  private stageRocks(scenery: SceneryLook): void {
    const { kind, density, color } = scenery.rocks;
    for (const [name, mesh] of this.rockMeshes) {
      const on = name === kind;
      mesh.visible = on;
      if (on) mesh.count = Math.round(MAX_ROCKS * density * this.density);
    }
    if (kind === "none") return;
    this.rockMaterials.get(kind)?.color.setHex(color);
  }

  private stageMonoliths(scenery: SceneryLook): void {
    const { kind, stone, accent } = scenery.monoliths;
    for (const [name, mesh] of this.monolithMeshes) mesh.visible = name === kind && this.propsAllowed;
    if (this.monolithCaps) this.monolithCaps.visible = kind === "obelisk" && this.propsAllowed;
    if (kind === "none") return;
    this.monolithMaterials.get(kind)?.color.setHex(stone);
    this.monolithCapMaterial?.color.setHex(accent);
  }

  private stagePuddles(scenery: SceneryLook): void {
    const { enabled, color, opacity } = scenery.puddles;
    if (!this.puddles || !this.puddleMaterial) return;
    this.puddles.visible = enabled && this.propsAllowed;
    this.puddleMaterial.color.setHex(color);
    this.puddleMaterial.opacity = opacity;
  }

  private stageWeather(scenery: SceneryLook): void {
    const { kind, density, color, opacity } = scenery.weather;
    if (!this.weather || !this.weatherMaterial) return;
    if (kind === "none") {
      this.weather.visible = false;
      this.weatherProfile = null;
      return;
    }
    const profile = WEATHER_PROFILES[kind];
    this.weatherProfile = profile;
    this.weatherMaterial.color.setHex(color);
    this.weatherMaterial.opacity = opacity;
    this.weather.visible = true;
    this.weather.count = Math.max(0, Math.round(MAX_WEATHER * profile.share * density * this.density));
    // A field that changed ceiling must not leave streaks stranded above it.
    for (let i = 0; i < this.weather.count; i += 1) {
      if (this.weatherPositions[i * 3 + 1] > profile.ceiling) this.seedStreak(i, true);
    }
  }

  applyQuality(preset: QualityPreset): void {
    const settings = QUALITY_SETTINGS[preset];
    this.density = preset === "low" ? 0.42 : preset === "medium" ? 0.7 : preset === "high" ? 0.9 : 1;
    this.propsAllowed = settings.battleProps;
    // Re-stage so every count and visibility flag is derived in one place.
    this.applyArena(this.look);
  }

  update(delta: number, camera: THREE.Camera): void {
    if (!this.group.visible) return;
    this.elapsed += delta;
    this.updateWeather(delta, camera);
  }

  private updateWeather(delta: number, camera: THREE.Camera): void {
    const mesh = this.weather;
    const profile = this.weatherProfile;
    if (!mesh?.visible || !profile) return;

    // Turn the whole field to the camera — see `buildWeather`.
    this.weatherGroup.rotation.y = Math.atan2(camera.position.x, camera.position.z);

    // Fall along the streak's own axis, so a leaning drop travels the way it
    // is drawn instead of sliding sideways through itself.
    const fall = Math.cos(profile.tilt) * profile.speed * delta;
    const drift = Math.sin(profile.tilt) * profile.speed * delta;
    const dummy = this.weatherDummy;

    for (let i = 0; i < mesh.count; i += 1) {
      const base = i * 3;
      this.weatherPositions[base] += drift;
      this.weatherPositions[base + 1] -= fall;

      if (this.weatherPositions[base + 1] < -1.2 || this.weatherPositions[base] > WEATHER_RADIUS) {
        this.seedStreak(i, false);
      }

      const wander =
        profile.wander > 0 ? Math.sin(this.elapsed * 1.3 + this.weatherPhase[i]) * profile.wander : 0;
      const scale = this.weatherScales[i];
      dummy.position.set(
        this.weatherPositions[base] + wander,
        this.weatherPositions[base + 1],
        this.weatherPositions[base + 2] + wander * 0.6,
      );
      dummy.rotation.set(0, 0, profile.tilt);
      dummy.scale.set(profile.width * scale, profile.length * scale, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  /** Whether this map has any dressing of its own. */
  get staged(): boolean {
    return this.group.visible;
  }

  dispose(): void {
    for (const mesh of [
      ...this.groveTrunks.values(),
      ...this.groveCrowns.values(),
      ...this.rockMeshes.values(),
      ...this.monolithMeshes.values(),
    ]) {
      mesh.dispose();
    }
    this.monolithCaps?.dispose();
    this.puddles?.dispose();
    this.weather?.dispose();
    for (const item of this.disposables) item.dispose();
    this.disposables = [];
    this.groveTrunks.clear();
    this.groveCrowns.clear();
    this.rockMeshes.clear();
    this.monolithMeshes.clear();
    this.group.clear();
  }
}
