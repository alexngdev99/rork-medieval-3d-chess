import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import type { ArenaLook, ArenaTheme } from "./arena";
import { ARENA_LOOKS, DEFAULT_ARENA } from "./arena";
import { ARENA_LANDMARKS, type LandmarkSource } from "../assets/generated";
import { terrainHeight } from "./battlefield";
import { loadGltf } from "./gltfQueue";
import { QUALITY_SETTINGS, type QualityPreset } from "./quality";

/**
 * One sculpted landmark per map, standing out on the plain.
 *
 * `Dressing` gives every map its own *ground cover* — a grove, rock, standing
 * stones, weather — and that is what stops a relight from being the only
 * difference between two maps. What it cannot do is give a map a **place**: a
 * scatter of instanced blobs reads as terrain, and terrain has no landmark to
 * recognise. Frostfall and Stormwatch are both "trees and rock in bad weather"
 * until one of them has a longship frozen into the drifts.
 *
 * So each theme also names one generated sculpt — a ruin, a wreck, a colossus —
 * cloned two or three times onto a ring around the board. It is deliberately a
 * *silhouette* system: the models are far enough out to be read as a shape
 * against the sky rather than inspected, which is also why one 6k-triangle
 * sculpt is enough for a whole map.
 */

/** Nothing may stand nearer the board than the dressing's own clear radius. */
const MIN_DISTANCE = 34;
const MAX_DISTANCE = 118;

/**
 * How much of a landmark the haze is allowed to eat.
 *
 * Every map runs its own `FogExp2` density, and they are not close: Dawn Court
 * sits at 0.0085 and the dusk siege at 0.019, so a single hard-coded ring would
 * put the same sculpt in clear air on one map and behind a wall of murk on
 * another. `FogExp2` transmittance is `exp(-(distance * density)^2)`, so the
 * distance at which a fixed fraction survives is `sqrt(-ln(T)) / density` —
 * solved per map instead of guessed once. At `T = 0.45` a landmark keeps just
 * under half its colour: still clearly a thing, already part of the weather.
 */
const LANDMARK_TRANSMITTANCE = 0.45;

/** Where the ring sits on this map, in metres from the board centre. */
export function landmarkDistance(density: number): number {
  if (density <= 0) return MAX_DISTANCE;
  const distance = Math.sqrt(-Math.log(LANDMARK_TRANSMITTANCE)) / density;
  return Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, distance));
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

/** Stable per-theme seed, so a map's skyline is the same every session. */
function seedFor(theme: ArenaTheme): number {
  let hash = 0x9e3779b9;
  for (let i = 0; i < theme.length; i += 1) hash = Math.imul(hash ^ theme.charCodeAt(i), 0x85ebca6b);
  return hash >>> 0;
}

export class Landmarks {
  readonly group = new THREE.Group();

  private loader = new GLTFLoader();
  /** Built rings, one per theme. Shown and hidden, never rebuilt. */
  private rings = new Map<ArenaTheme, THREE.Group>();
  private jobs = new Map<ArenaTheme, Promise<void>>();
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();

  private look: ArenaLook = ARENA_LOOKS[DEFAULT_ARENA];
  private allowed = true;
  private disposed = false;

  constructor(quality: QualityPreset, look: ArenaLook = ARENA_LOOKS[DEFAULT_ARENA]) {
    this.group.name = "landmarks";
    this.allowed = QUALITY_SETTINGS[quality].battleProps;
    this.applyArena(look);
  }

  /**
   * Shows this map's landmark, downloading it the first time it is asked for.
   *
   * The sculpts are *not* all fetched at boot: only one map is on screen at a
   * time and each is its own GLB, so warming all six would cost five downloads
   * nobody is looking at, on top of the twelve rigs the armies already pull.
   * A map switch that arrives before the download lands simply stages nothing —
   * the ring appears when it appears, and the map is already dressed without it.
   */
  applyArena(look: ArenaLook): void {
    this.look = look;
    for (const [theme, ring] of this.rings) ring.visible = this.allowed && theme === look.id;
    if (!this.allowed) return;

    const source = ARENA_LANDMARKS[look.id];
    if (!source || this.rings.has(look.id)) return;
    void this.warm(look.id, source);
  }

  private warm(theme: ArenaTheme, source: LandmarkSource): Promise<void> {
    const running = this.jobs.get(theme);
    if (running) return running;

    const job = (async () => {
      try {
        const gltf = await loadGltf(this.loader, source.url, 3);
        if (this.disposed) return;
        const ring = this.buildRing(theme, source, gltf.scene);
        this.rings.set(theme, ring);
        // The player may have moved on while this was in the air.
        ring.visible = this.allowed && this.look.id === theme;
        this.group.add(ring);
      } catch (error) {
        console.warn(`[landmarks] no sculpt for "${theme}"`, error);
      }
    })();
    this.jobs.set(theme, job);
    return job;
  }

  /**
   * Fits the sculpt to a real height and clones it around the board.
   *
   * A generated GLB arrives at whatever scale and offset Meshy chose, so the
   * model is measured rather than trusted: scaled by its own bounding height,
   * centred on X/Z and stood on its own lowest point, so `height` in the source
   * is metres on the field and the base sits on the ground instead of hovering
   * or sinking.
   */
  private buildRing(theme: ArenaTheme, source: LandmarkSource, scene: THREE.Object3D): THREE.Group {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const scale = source.height / Math.max(size.y, 1e-3);

    const fitted = new THREE.Group();
    scene.scale.setScalar(scale);
    scene.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);
    fitted.add(scene);

    scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      // The shadow camera only covers the board; a landmark 60 m out would cost
      // a shadow pass to cast nothing anyone can see.
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.geometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const standard = material as THREE.MeshStandardMaterial;
        standard.fog = true;
        standard.envMapIntensity = 0.9;
        this.materials.add(standard);
      }
    });

    const ring = new THREE.Group();
    ring.name = `landmark-${theme}`;
    ring.visible = false;

    const rng = mulberry32(seedFor(theme));
    const distance = landmarkDistance(ARENA_LOOKS[theme].fog.density);
    // Golden-angle spread, so no two copies line up behind each other from the
    // camera's own orbit and none of them lands square on a cardinal axis.
    const step = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < source.count; i += 1) {
      const clone = fitted.clone(true);
      const angle = source.bearing + i * step + (rng() - 0.5) * 0.4;
      const radius = distance * (0.82 + rng() * 0.36);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      clone.position.set(x, terrainHeight(x, z) - 0.7, z);
      // Turn its face toward the board, then apply the sculpt's own front-axis
      // correction — a generated model's forward is whatever Meshy made it.
      clone.rotation.y = Math.atan2(-x, -z) + source.yaw + (rng() - 0.5) * 0.5;
      const jitter = 0.82 + rng() * 0.4;
      clone.scale.setScalar(jitter);
      ring.add(clone);
    }
    return ring;
  }

  applyQuality(preset: QualityPreset): void {
    this.allowed = QUALITY_SETTINGS[preset].battleProps;
    this.applyArena(this.look);
  }

  dispose(): void {
    this.disposed = true;
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.geometries.clear();
    this.materials.clear();
    this.rings.clear();
    this.jobs.clear();
    this.group.clear();
  }
}
