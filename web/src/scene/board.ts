import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import type { SquareId } from "../core/types";
import type { ArenaLook } from "./arena";
import {
  boardBorderTexture,
  captureMarkerTexture,
  castleMarkerTexture,
  columnTexture,
  marbleTexture,
  moveMarkerTexture,
  promoteMarkerTexture,
  landingRingTexture,
  radialTexture,
  selectMarkerTexture,
  shockwaveTexture,
  tileMaskTexture,
} from "./textures";

export const TILE = 1.02;
export const BOARD_TOP = 0;

const FILES = "abcdefgh";

export type HighlightKind =
  | "select"
  | "move"
  | "capture"
  | "castle"
  | "promote"
  | "last"
  | "check"
  | "hint";

const HIGHLIGHT_COLORS: Record<HighlightKind, number> = {
  select: 0xffc95e,
  move: 0x5cf2a4,
  capture: 0xff5a44,
  castle: 0x63b8ff,
  promote: 0xc784ff,
  last: 0xd9a441,
  check: 0xff3b30,
  hint: 0x6aa9ff,
};

/** How dark an unreachable square goes while a piece is selected. */
const SHROUD_OPACITY = 0.62;

/** Base opacity of the soft glow disc lying flat on the tile. */
const GLOW_OPACITY: Record<HighlightKind, number> = {
  select: 0.5,
  move: 0.46,
  capture: 0.58,
  castle: 0.5,
  promote: 0.54,
  last: 0.22,
  check: 0.6,
  hint: 0.3,
};

/** Base opacity of the crisp reticle drawn on top of the glow. */
const MARKER_OPACITY: Record<HighlightKind, number> = {
  select: 0.85,
  move: 0.9,
  capture: 1,
  castle: 0.95,
  promote: 1,
  last: 0,
  check: 0.8,
  hint: 0.5,
};

/** Base opacity of the vertical light column standing on the square. */
const BEAM_OPACITY: Record<HighlightKind, number> = {
  select: 0.16,
  move: 0.3,
  capture: 0.42,
  castle: 0.34,
  promote: 0.46,
  last: 0,
  check: 0.3,
  hint: 0.12,
};

/**
 * How much of a reticle is drawn *through* whatever stands in front of it.
 *
 * The figures are life-size and the camera is low, so a destination is routinely
 * behind a body rather than beside one: measured on the opening position, a
 * knight's own two squares are 88% hidden on a desktop window and ~64% on a
 * phone. A marker that only exists on the stone is therefore a marker the player
 * cannot see. Each destination is drawn a second time with the depth test off,
 * additively and at a fraction of its strength, so an occluded square reads as
 * light bleeding through the figure instead of vanishing. Deliberately low: this
 * is a whisper saying "the square is behind me", not a decal on the model.
 */
const XRAY_OPACITY: Record<HighlightKind, number> = {
  select: 0,
  move: 0.3,
  capture: 0.38,
  castle: 0.34,
  promote: 0.38,
  last: 0,
  check: 0,
  hint: 0.26,
};

/** Radians per second the reticle spins (capture locks turn the other way). */
const MARKER_SPIN: Record<HighlightKind, number> = {
  select: 0,
  move: 0.35,
  capture: -0.7,
  castle: 0.5,
  promote: 0.9,
  last: 0,
  check: 0.5,
  hint: 0.2,
};

const POP_DURATION = 0.26;

/** Overshooting ease so squares snap into place with a little punch. */
function easeOutBack(t: number): number {
  const c = 1.9;
  const p = t - 1;
  return 1 + (c + 1) * p * p * p + c * p * p;
}

export function squareToWorld(square: SquareId, y = BOARD_TOP): THREE.Vector3 {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  return new THREE.Vector3((file - 3.5) * TILE, y, (3.5 - (rank - 1)) * TILE);
}

export function worldToSquare(x: number, z: number): SquareId | null {
  const file = Math.round(x / TILE + 3.5);
  const rank = Math.round(3.5 - z / TILE) + 1;
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null;
  return `${FILES[file]}${rank}`;
}

export function isLightSquare(square: SquareId): boolean {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  return (file + rank) % 2 === 0;
}

/** A tile knocked out of place by an impact, settling back with damped bounce. */
interface TileJolt {
  tile: THREE.Mesh;
  home: THREE.Vector3;
  /** Seconds elapsed; negative while the shock travels out to this tile. */
  age: number;
  strength: number;
  duration: number;
  seed: number;
}

/** One pooled shockwave ring / flare pair playing on a square. */
interface ImpactWave {
  ring: THREE.Mesh;
  ringMaterial: THREE.MeshBasicMaterial;
  flare: THREE.Mesh;
  flareMaterial: THREE.MeshBasicMaterial;
  age: number;
  duration: number;
  active: boolean;
}

/** Arrival ripple on the square a figure just set down on. */
interface LandingRipple {
  ring: THREE.Mesh;
  ringMaterial: THREE.MeshBasicMaterial;
  glow: THREE.Mesh;
  glowMaterial: THREE.MeshBasicMaterial;
  age: number;
  duration: number;
  strength: number;
  active: boolean;
}

/** A dark veil laid over a square the selected piece cannot reach. */
interface ShroudSlot {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  target: number;
  current: number;
  /** Seconds still to wait before this square starts fading. */
  delay: number;
}

interface HighlightSlot {
  glow: THREE.Mesh;
  glowMaterial: THREE.MeshBasicMaterial;
  marker: THREE.Mesh;
  markerMaterial: THREE.MeshBasicMaterial;
  /** The same reticle again, drawn through anything standing in the way. */
  xray: THREE.Mesh;
  xrayMaterial: THREE.MeshBasicMaterial;
  beam: THREE.Mesh;
  beamMaterial: THREE.MeshBasicMaterial;
  kind: HighlightKind | null;
  pulse: boolean;
  /** Seconds since the highlight was set; negative while waiting on its stagger. */
  age: number;
  phase: number;
}

/**
 * The playing surface: 64 bevelled marble/basalt tiles on a carved base with a
 * bronze-trimmed, engraved border, plus the pooled highlight overlays.
 */
export class BoardView {
  readonly group = new THREE.Group();
  readonly tiles: THREE.Mesh[] = [];

  private slots = new Map<SquareId, HighlightSlot>();
  /** Held down while a modal panel owns the screen (the promotion picker). */
  private overlaysMuted = false;
  private shrouds = new Map<SquareId, ShroudSlot>();
  private markerMaps: Record<HighlightKind, THREE.Texture | null> = {
    select: null,
    move: null,
    capture: null,
    castle: null,
    promote: null,
    last: null,
    check: null,
    hint: null,
  };
  private hoverRing: THREE.Mesh;
  /** Materials the arena theme repaints (tile contrast, base stone, trim). */
  private lightTileMaterial: THREE.MeshPhysicalMaterial;
  private darkTileMaterial: THREE.MeshPhysicalMaterial;
  private baseMaterial: THREE.MeshStandardMaterial | null = null;
  private borderMaterial: THREE.MeshStandardMaterial | null = null;
  private trimMaterial: THREE.MeshStandardMaterial | null = null;
  private disposables: { dispose: () => void }[] = [];
  private elapsed = 0;
  private tileBySquare = new Map<SquareId, THREE.Mesh>();
  private jolts: TileJolt[] = [];
  private waves: ImpactWave[] = [];
  private waveCursor = 0;
  private landings: LandingRipple[] = [];
  private landingCursor = 0;

  constructor() {
    this.group.name = "board";

    const lightMap = this.track(marbleTexture(false));
    const darkMap = this.track(marbleTexture(true));
    const lightMaterial = this.track(
      new THREE.MeshPhysicalMaterial({
        map: lightMap,
        color: 0xf6efe0,
        roughness: 0.22,
        metalness: 0.02,
        clearcoat: 0.7,
        clearcoatRoughness: 0.18,
        envMapIntensity: 0.9,
      }),
    );
    const darkMaterial = this.track(
      new THREE.MeshPhysicalMaterial({
        map: darkMap,
        color: 0x23252c,
        roughness: 0.3,
        metalness: 0.12,
        clearcoat: 0.6,
        clearcoatRoughness: 0.25,
        envMapIntensity: 0.8,
      }),
    );

    this.lightTileMaterial = lightMaterial;
    this.darkTileMaterial = darkMaterial;

    const tileGeometry = this.track(new RoundedBoxGeometry(TILE * 0.97, 0.18, TILE * 0.97, 3, 0.035));

    for (let rank = 1; rank <= 8; rank += 1) {
      for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
        const square = `${FILES[fileIndex]}${rank}`;
        const light = isLightSquare(square);
        const tile = new THREE.Mesh(tileGeometry, light ? lightMaterial : darkMaterial);
        const position = squareToWorld(square, -0.09);
        tile.position.copy(position);
        tile.receiveShadow = true;
        tile.castShadow = false;
        tile.userData.square = square;
        tile.userData.home = position.clone();
        this.tileBySquare.set(square, tile);
        this.tiles.push(tile);
        this.group.add(tile);
      }
    }

    this.buildBase();
    this.buildShroud();
    this.buildHighlights();
    this.buildImpactWaves();
    this.buildLandingRipples();

    const ringGeometry = this.track(new THREE.RingGeometry(TILE * 0.42, TILE * 0.48, 32));
    const ringMaterial = this.track(
      new THREE.MeshBasicMaterial({
        color: 0xffd88a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.hoverRing = new THREE.Mesh(ringGeometry, ringMaterial);
    this.hoverRing.rotation.x = -Math.PI / 2;
    this.hoverRing.position.y = BOARD_TOP + 0.012;
    this.hoverRing.renderOrder = 5;
    this.group.add(this.hoverRing);
  }

  private track<T extends { dispose: () => void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  private buildBase(): void {
    const size = TILE * 8 + 1.5;
    const geometry = this.track(new RoundedBoxGeometry(size, 0.62, size, 4, 0.09));
    const stone = this.track(
      new THREE.MeshStandardMaterial({ color: 0x3b342b, roughness: 0.72, metalness: 0.25 }),
    );
    this.baseMaterial = stone;
    const top = this.track(
      new THREE.MeshStandardMaterial({
        map: this.track(boardBorderTexture()),
        color: 0xbfae8e,
        roughness: 0.55,
        metalness: 0.45,
        envMapIntensity: 1.1,
      }),
    );
    this.borderMaterial = top;
    const materials = [stone, stone, top, stone, stone, stone];
    const base = new THREE.Mesh(geometry, materials);
    base.position.y = -0.42;
    base.castShadow = true;
    base.receiveShadow = true;
    this.group.add(base);

    // Bronze trim: a thin torus-like frame catching bloom at grazing angles.
    const trimGeometry = this.track(new RoundedBoxGeometry(size + 0.18, 0.14, size + 0.18, 3, 0.06));
    const trim = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x8a6a33,
        roughness: 0.28,
        metalness: 0.95,
        emissive: 0x2a1a06,
        emissiveIntensity: 0.4,
        envMapIntensity: 1.4,
      }),
    );
    this.trimMaterial = trim;
    const trimMesh = new THREE.Mesh(trimGeometry, trim);
    trimMesh.position.y = -0.7;
    trimMesh.castShadow = true;
    this.group.add(trimMesh);
  }

  private buildHighlights(): void {
    const glowGeometry = this.track(new THREE.PlaneGeometry(TILE * 0.98, TILE * 0.98));
    const markerGeometry = this.track(new THREE.PlaneGeometry(TILE * 0.92, TILE * 0.92));
    const beamGeometry = this.track(
      new THREE.CylinderGeometry(TILE * 0.4, TILE * 0.44, 0.55, 20, 1, true),
    );
    const glowMap = this.track(radialTexture("rgba(255,255,255,0.95)", "rgba(255,255,255,0)"));
    const beamMap = this.track(columnTexture());
    this.markerMaps = {
      select: this.track(selectMarkerTexture()),
      move: this.track(moveMarkerTexture()),
      capture: this.track(captureMarkerTexture()),
      castle: this.track(castleMarkerTexture()),
      promote: this.track(promoteMarkerTexture()),
      check: this.track(captureMarkerTexture()),
      hint: this.track(moveMarkerTexture()),
      last: null,
    };

    let index = 0;
    for (let rank = 1; rank <= 8; rank += 1) {
      for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
        const square = `${FILES[fileIndex]}${rank}`;

        const glowMaterial = this.track(
          new THREE.MeshBasicMaterial({
            map: glowMap,
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.rotation.x = -Math.PI / 2;
        glow.position.copy(squareToWorld(square, BOARD_TOP + 0.008));
        glow.visible = false;
        glow.renderOrder = 2;
        this.group.add(glow);

        const markerMaterial = this.track(
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.rotation.x = -Math.PI / 2;
        marker.position.copy(squareToWorld(square, BOARD_TOP + 0.016));
        marker.visible = false;
        marker.renderOrder = 4;
        this.group.add(marker);

        const xrayMaterial = this.track(
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const xray = new THREE.Mesh(markerGeometry, xrayMaterial);
        xray.rotation.x = -Math.PI / 2;
        xray.position.copy(squareToWorld(square, BOARD_TOP + 0.017));
        xray.visible = false;
        // Above every board overlay: with no depth test to sort it, render order
        // is the only thing keeping it on top of the glow it belongs to.
        xray.renderOrder = 9;
        this.group.add(xray);

        const beamMaterial = this.track(
          new THREE.MeshBasicMaterial({
            map: beamMap,
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
          }),
        );
        const beam = new THREE.Mesh(beamGeometry, beamMaterial);
        beam.position.copy(squareToWorld(square, BOARD_TOP + 0.275));
        beam.visible = false;
        beam.renderOrder = 3;
        this.group.add(beam);

        this.slots.set(square, {
          glow,
          glowMaterial,
          marker,
          markerMaterial,
          xray,
          xrayMaterial,
          beam,
          beamMaterial,
          kind: null,
          pulse: false,
          age: 0,
          phase: (index % 7) * 0.42,
        });
        index += 1;
      }
    }
  }

  /**
   * One dark veil per square, sitting just above the stone. While a piece is
   * selected every square it cannot reach is dimmed, so the lit destinations
   * read instantly instead of competing with 64 evenly-lit tiles.
   */
  private buildShroud(): void {
    const geometry = this.track(new THREE.PlaneGeometry(TILE * 1.01, TILE * 1.01));
    const map = this.track(tileMaskTexture());

    for (let rank = 1; rank <= 8; rank += 1) {
      for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
        const square = `${FILES[fileIndex]}${rank}`;
        const material = this.track(
          new THREE.MeshBasicMaterial({
            map,
            color: 0x05070e,
            transparent: true,
            opacity: 0,
            depthWrite: false,
          }),
        );
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.copy(squareToWorld(square, BOARD_TOP + 0.004));
        mesh.visible = false;
        mesh.renderOrder = 1;
        this.group.add(mesh);
        this.shrouds.set(square, { mesh, material, target: 0, current: 0, delay: 0 });
      }
    }
  }

  /**
   * Veils every square except `reachable`. Pass `null` to lift the veil.
   * `origin` staggers the fade so the shadow closes in from the chosen piece.
   */
  setShroud(reachable: Iterable<SquareId> | null, origin?: SquareId): void {
    if (!reachable) {
      for (const slot of this.shrouds.values()) {
        slot.target = 0;
        slot.delay = 0;
      }
      return;
    }
    const lit = new Set<SquareId>(reachable);
    const originPosition = origin ? squareToWorld(origin) : null;
    for (const [square, slot] of this.shrouds) {
      const clear = lit.has(square);
      slot.target = clear ? 0 : SHROUD_OPACITY;
      slot.delay =
        clear || !originPosition
          ? 0
          : Math.min((squareToWorld(square).distanceTo(originPosition) / TILE) * 0.016, 0.12);
    }
  }

  private updateShroud(delta: number): void {
    for (const slot of this.shrouds.values()) {
      if (slot.delay > 0) {
        slot.delay -= delta;
        if (slot.delay > 0) continue;
      }
      if (Math.abs(slot.target - slot.current) < 0.002) {
        if (slot.current !== slot.target) {
          slot.current = slot.target;
          slot.material.opacity = slot.current;
          slot.mesh.visible = slot.current > 0.004;
        }
        continue;
      }
      // Closes in a touch slower than it lifts, so releasing feels snappy.
      const speed = slot.target > slot.current ? 8 : 13;
      slot.current += (slot.target - slot.current) * Math.min(1, delta * speed);
      slot.material.opacity = slot.current;
      slot.mesh.visible = slot.current > 0.004;
    }
  }

  /** Pool of reusable shockwave rings + flares for capture impacts. */
  private buildImpactWaves(): void {
    const ringGeometry = this.track(new THREE.PlaneGeometry(TILE * 2.4, TILE * 2.4));
    const flareGeometry = this.track(new THREE.PlaneGeometry(TILE * 1.5, TILE * 1.5));
    const ringMap = this.track(shockwaveTexture());
    const flareMap = this.track(radialTexture("rgba(255,255,255,1)", "rgba(255,255,255,0)"));

    for (let i = 0; i < 4; i += 1) {
      const ringMaterial = this.track(
        new THREE.MeshBasicMaterial({
          map: ringMap,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      ring.renderOrder = 6;
      this.group.add(ring);

      const flareMaterial = this.track(
        new THREE.MeshBasicMaterial({
          map: flareMap,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const flare = new THREE.Mesh(flareGeometry, flareMaterial);
      flare.rotation.x = -Math.PI / 2;
      flare.visible = false;
      flare.renderOrder = 7;
      this.group.add(flare);

      this.waves.push({ ring, ringMaterial, flare, flareMaterial, age: 0, duration: 0.5, active: false });
    }
  }

  /** Pool of reusable arrival ripples: a dust ring plus a soft ground glow. */
  private buildLandingRipples(): void {
    const ringGeometry = this.track(new THREE.PlaneGeometry(TILE * 2.1, TILE * 2.1));
    const glowGeometry = this.track(new THREE.PlaneGeometry(TILE * 1.35, TILE * 1.35));
    const ringMap = this.track(landingRingTexture());
    const glowMap = this.track(radialTexture("rgba(255,255,255,0.9)", "rgba(255,255,255,0)"));

    for (let i = 0; i < 5; i += 1) {
      const ringMaterial = this.track(
        new THREE.MeshBasicMaterial({
          map: ringMap,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      ring.renderOrder = 6;
      this.group.add(ring);

      const glowMaterial = this.track(
        new THREE.MeshBasicMaterial({
          map: glowMap,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      glow.rotation.x = -Math.PI / 2;
      glow.visible = false;
      glow.renderOrder = 5;
      this.group.add(glow);

      this.landings.push({
        ring,
        ringMaterial,
        glow,
        glowMaterial,
        age: 0,
        duration: 0.7,
        strength: 1,
        active: false,
      });
    }
  }

  /**
   * Arrival on a square: a dust ring rolls outward from under the figure's feet
   * over a short bloom of faction light, and the tile takes a small dip. Softer
   * and slower than {@link impact} — this is weight settling, not a blow.
   */
  land(square: SquareId, color = 0xffd6a0, strength = 1): void {
    const centre = squareToWorld(square, BOARD_TOP + 0.018);

    const ripple = this.landings[this.landingCursor % this.landings.length];
    this.landingCursor += 1;
    ripple.age = 0;
    ripple.duration = 0.62 + strength * 0.16;
    ripple.strength = strength;
    ripple.active = true;
    ripple.ring.position.copy(centre);
    ripple.ring.rotation.z = Math.random() * Math.PI * 2;
    ripple.ring.scale.setScalar(0.2);
    ripple.ring.visible = true;
    ripple.ringMaterial.color.setHex(color);
    ripple.glow.position.copy(centre).setY(BOARD_TOP + 0.014);
    ripple.glow.scale.setScalar(0.6);
    ripple.glow.visible = true;
    ripple.glowMaterial.color.setHex(color);

    this.joltTiles(square, strength * 0.42, 1.4);
  }

  /**
   * Capture impact on a square: a white-hot flash that decays into a coloured
   * shockwave ring, while the struck tile and its neighbours are jolted out of
   * the board and bounce back into place.
   */
  impact(square: SquareId, color = 0xff6a3c, strength = 1): void {
    const centre = squareToWorld(square, BOARD_TOP + 0.02);

    const wave = this.waves[this.waveCursor % this.waves.length];
    this.waveCursor += 1;
    wave.age = 0;
    wave.duration = 0.6;
    wave.active = true;
    wave.ring.position.copy(centre);
    wave.ring.rotation.z = Math.random() * Math.PI;
    wave.ring.visible = true;
    wave.ringMaterial.color.setHex(color);
    wave.flare.position.copy(centre).setY(BOARD_TOP + 0.03);
    wave.flare.visible = true;
    wave.flareMaterial.color.setHex(0xfff3d2);

    this.joltTiles(square, strength, 2.2);
  }

  /** Shock spreads outward: neighbours kick later and weaker than the centre. */
  private joltTiles(square: SquareId, strength: number, reach: number): void {
    if (strength <= 0) return;
    const origin = squareToWorld(square);
    for (const [target, tile] of this.tileBySquare) {
      const distance = squareToWorld(target).distanceTo(origin) / TILE;
      if (distance > reach) continue;
      const falloff = Math.max(0, 1 - distance / (reach + 0.2));
      const amount = strength * falloff * falloff;
      if (amount < 0.04) continue;
      this.jolts = this.jolts.filter((entry) => entry.tile !== tile);
      this.jolts.push({
        tile,
        home: (tile.userData.home as THREE.Vector3).clone(),
        age: -distance * 0.035,
        strength: amount,
        duration: 0.5 + distance * 0.06,
        seed: Math.random() * Math.PI * 2,
      });
    }
  }

  private updateImpacts(delta: number): void {
    for (let i = this.jolts.length - 1; i >= 0; i -= 1) {
      const jolt = this.jolts[i];
      jolt.age += delta;
      if (jolt.age < 0) continue;
      const t = jolt.age / jolt.duration;
      if (t >= 1) {
        jolt.tile.position.copy(jolt.home);
        jolt.tile.rotation.set(0, 0, 0);
        this.jolts.splice(i, 1);
        continue;
      }
      // Damped oscillation: punched down first, then settling.
      const decay = Math.exp(-t * 6.5) * (1 - t);
      const swing = Math.sin(jolt.age * 34 + jolt.seed) * decay * jolt.strength;
      jolt.tile.position.set(
        jolt.home.x + Math.sin(jolt.age * 41 + jolt.seed) * decay * jolt.strength * 0.035,
        jolt.home.y - swing * 0.13,
        jolt.home.z + Math.cos(jolt.age * 38 + jolt.seed) * decay * jolt.strength * 0.035,
      );
      jolt.tile.rotation.set(swing * 0.05, 0, Math.cos(jolt.age * 30 + jolt.seed) * decay * jolt.strength * 0.05);
    }

    for (const wave of this.waves) {
      if (!wave.active) continue;
      wave.age += delta;
      const t = wave.age / wave.duration;
      if (t >= 1) {
        wave.active = false;
        wave.ring.visible = false;
        wave.flare.visible = false;
        wave.ringMaterial.opacity = 0;
        wave.flareMaterial.opacity = 0;
        continue;
      }
      const eased = 1 - Math.pow(1 - t, 2.6);
      wave.ring.scale.setScalar(0.25 + eased * 1.35);
      wave.ringMaterial.opacity = Math.pow(1 - t, 1.7) * 0.95;
      wave.ring.rotation.z += delta * 0.6;

      // The flare is a two-frame blowout: peaks instantly, gone in ~0.18s.
      const flareT = Math.min(1, wave.age / 0.18);
      wave.flare.scale.setScalar(0.5 + flareT * 1.1);
      wave.flareMaterial.opacity = Math.pow(1 - flareT, 2) * 1.1;
      wave.flare.visible = flareT < 1;
    }

    for (const ripple of this.landings) {
      if (!ripple.active) continue;
      ripple.age += delta;
      const t = ripple.age / ripple.duration;
      if (t >= 1) {
        ripple.active = false;
        ripple.ring.visible = false;
        ripple.glow.visible = false;
        ripple.ringMaterial.opacity = 0;
        ripple.glowMaterial.opacity = 0;
        continue;
      }
      // The dust rolls out fast then coasts; the light under it dies quicker.
      const eased = 1 - Math.pow(1 - t, 3);
      ripple.ring.scale.setScalar(0.2 + eased * (0.85 + ripple.strength * 0.5));
      ripple.ringMaterial.opacity = Math.sin(Math.PI * Math.pow(t, 0.55)) * 0.55 * ripple.strength;
      ripple.ring.rotation.z += delta * 0.35;

      const glowT = Math.min(1, ripple.age / (ripple.duration * 0.45));
      ripple.glow.scale.setScalar(0.6 + glowT * 0.75);
      ripple.glowMaterial.opacity = Math.pow(1 - glowT, 2.1) * 0.5 * ripple.strength;
      ripple.glow.visible = glowT < 1;
    }
  }

  clearHighlights(kinds?: HighlightKind[]): void {
    if (!kinds) this.setShroud(null);
    for (const slot of this.slots.values()) {
      if (kinds && slot.kind && !kinds.includes(slot.kind)) continue;
      slot.kind = null;
      slot.pulse = false;
      slot.age = 0;
      slot.glow.visible = false;
      slot.marker.visible = false;
      slot.xray.visible = false;
      slot.beam.visible = false;
      slot.glowMaterial.opacity = 0;
      slot.markerMaterial.opacity = 0;
      slot.xrayMaterial.opacity = 0;
      slot.beamMaterial.opacity = 0;
    }
  }

  /**
   * Lights a square up. `delay` staggers the pop-in so a fan of legal moves
   * ripples outward from the selected piece instead of appearing all at once.
   */
  setHighlight(square: SquareId, kind: HighlightKind, pulse = false, delay = 0): void {
    const slot = this.slots.get(square);
    if (!slot) return;
    const restart = slot.kind !== kind;
    slot.kind = kind;
    slot.pulse = pulse;
    if (restart) slot.age = -delay;

    const color = HIGHLIGHT_COLORS[kind];
    slot.glowMaterial.color.setHex(color);
    slot.markerMaterial.color.setHex(color);
    slot.xrayMaterial.color.setHex(color);
    slot.beamMaterial.color.setHex(color);

    const markerMap = this.markerMaps[kind];
    slot.markerMaterial.map = markerMap;
    slot.markerMaterial.needsUpdate = true;
    slot.marker.rotation.z = 0;
    slot.xrayMaterial.map = markerMap;
    slot.xrayMaterial.needsUpdate = true;
    slot.xray.rotation.z = 0;

    const visible = slot.age >= 0;
    slot.glow.visible = visible;
    slot.marker.visible = visible && markerMap !== null;
    slot.xray.visible = visible && markerMap !== null && XRAY_OPACITY[kind] > 0;
    slot.beam.visible = visible && BEAM_OPACITY[kind] > 0;
  }

  /**
   * Silences the overlays that deliberately ignore the depth buffer — the x-ray
   * reticles. They are drawn through everything in the way, a modal panel
   * included, so they have to stand down while one is up.
   */
  setOverlaysMuted(muted: boolean): void {
    if (this.overlaysMuted === muted) return;
    this.overlaysMuted = muted;
    if (!muted) return;
    for (const slot of this.slots.values()) {
      slot.xray.visible = false;
      slot.xrayMaterial.opacity = 0;
    }
  }

  setHover(square: SquareId | null): void {
    const material = this.hoverRing.material as THREE.MeshBasicMaterial;
    if (!square) {
      material.opacity = 0;
      return;
    }
    this.hoverRing.position.copy(squareToWorld(square, BOARD_TOP + 0.014));
    material.opacity = 0.5;
  }

  update(delta: number): void {
    this.elapsed += delta;
    this.updateImpacts(delta);
    this.updateShroud(delta);
    for (const slot of this.slots.values()) {
      const kind = slot.kind;
      if (!kind) continue;

      slot.age += delta;
      if (slot.age < 0) {
        slot.glow.visible = false;
        slot.marker.visible = false;
        slot.xray.visible = false;
        slot.beam.visible = false;
        continue;
      }

      const hasMarker = this.markerMaps[kind] !== null;
      const hasXray = hasMarker && XRAY_OPACITY[kind] > 0 && !this.overlaysMuted;
      const hasBeam = BEAM_OPACITY[kind] > 0;
      slot.glow.visible = true;
      slot.marker.visible = hasMarker;
      slot.xray.visible = hasXray;
      slot.beam.visible = hasBeam;

      // Pop-in: overshoot the scale, then breathe.
      const t = Math.min(slot.age / POP_DURATION, 1);
      const pop = easeOutBack(t);
      const wave = (Math.sin(this.elapsed * (slot.pulse ? 5.6 : 3.4) + slot.phase) + 1) * 0.5;
      const breath = slot.pulse ? 0.45 + wave * 0.85 : 0.8 + wave * 0.25;
      const fade = t;

      slot.glowMaterial.opacity = GLOW_OPACITY[kind] * breath * fade;
      slot.glow.scale.setScalar(0.55 + pop * 0.45);

      if (hasMarker) {
        slot.markerMaterial.opacity = MARKER_OPACITY[kind] * (0.72 + breath * 0.34) * fade;
        slot.marker.scale.setScalar(0.35 + pop * 0.65 + (slot.pulse ? wave * 0.05 : wave * 0.02));
        slot.marker.rotation.z += delta * MARKER_SPIN[kind];
      }

      if (hasXray) {
        // Locked to the reticle it shadows, a touch smaller so the two read as
        // one mark rather than a double exposure when nothing is in the way.
        slot.xrayMaterial.opacity = XRAY_OPACITY[kind] * (0.66 + breath * 0.34) * fade;
        slot.xray.scale.setScalar(slot.marker.scale.x * 0.9);
        slot.xray.rotation.z = slot.marker.rotation.z;
      }

      if (hasBeam) {
        slot.beamMaterial.opacity = BEAM_OPACITY[kind] * breath * fade;
        slot.beam.scale.set(1, 0.4 + pop * 0.6, 1);
        slot.beam.position.y = BOARD_TOP + 0.275 * (0.4 + pop * 0.6);
      }
    }
  }

  /**
   * Retunes the playing surface for an arena theme. The dark squares carry the
   * most weight here: near-black basalt swallows the obsidian army under low
   * light, so daylight themes lift them to a readable slate.
   */
  applyArena(look: ArenaLook): void {
    this.lightTileMaterial.color.setHex(look.board.light);
    this.darkTileMaterial.color.setHex(look.board.dark);
    this.baseMaterial?.color.setHex(look.board.base);
    this.borderMaterial?.color.setHex(look.board.border);
    this.trimMaterial?.color.setHex(look.board.trim);
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose();
    this.disposables = [];
    this.slots.clear();
    this.shrouds.clear();
    this.group.clear();
  }
}
