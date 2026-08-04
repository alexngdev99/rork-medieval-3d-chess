/**
 * Hand-held arms for the generated warriors.
 *
 * The Meshy figures are unarmed by design (held props break auto-rigging), so
 * every one of them gets a weapon parented to its hand bone. Two sources feed
 * that fist:
 *
 *  - **Primitives**, authored here once per weapon at "figure height = 1" and
 *   cached. This is the right answer for the medieval and Sun Empire arms, whose
 *   originals nobody can check, and it is the fallback for everything else.
 *  - **Generated sculpts** of the real thing, for the Grande Armée — a
 *   Charleville musket and an An XI cuirassier sword are documented objects, and
 *   a box-and-cylinder version of one reads as a toy. See `scene/armoury.ts`,
 *   which fits each downloaded mesh into the same local frame the primitives are
 *   authored in, so everything downstream (grip, muzzle, pose-driven hold) is
 *   unchanged by the swap.
 *
 * Either way each instance scales the prop by the figure's own height and cancels
 * the bone's accumulated scale/rotation, so it sits in the fist at any pose.
 */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { ArsenalId } from "../assets/generated";
import type { Faction, PieceKind } from "../core/types";
import { armSculpt, hasArmSculpt, instanceArmSculpt, warmArmSculpt } from "./armoury";

type WeaponRole =
  | "steel"
  | "gold"
  | "wood"
  | "leather"
  | "cloth"
  | "gem"
  /** Volcanic glass — the Sun Empire's cutting edge. */
  | "obsidian"
  /** Polished jade and turquoise inlay. */
  | "jade"
  /** Dyed quetzal and macaw plumes. */
  | "feather"
  /** Carved basalt maul heads. */
  | "stone";

interface Part {
  geometry: THREE.BufferGeometry;
  role: WeaponRole;
}

export type WeaponId =
  | "greatsword"
  | "scepter"
  | "crystalStaff"
  | "warhammer"
  | "longsword"
  | "spear"
  | "roundShield"
  | "heaterShield"
  | "towerShield"
  // Sun Empire
  | "royalMacuahuitl"
  | "macuahuitl"
  | "tepoztopilli"
  | "serpentStaff"
  | "sunScepter"
  | "stoneMaul"
  | "chimalli"
  | "greatChimalli"
  // Grande Armée
  | "imperialSabre"
  | "marengoSword"
  | "marksmanRifle"
  | "cavalrySabre"
  | "musketBayonet"
  | "officerPistol"
  | "fieldCannon";

interface WeaponSpec {
  build: () => Part[];
  /** Distance from the prop's own origin up to the fist, in figure heights. */
  grip: number;
  /**
   * Rest direction, in "body" axes: x = away from the spine on the holding
   * side, y = up, z = the figure's front. Mirrored per hand at mount time.
   */
  aim: THREE.Vector3;
  /** Shift from the wrist joint, same axes as `aim`, in figure heights. */
  offset: THREE.Vector3;
  /** Shields orient their face (+Z) along `aim`; shafts orient their length (+Y). */
  shield?: boolean;
  /**
   * Curved and edged: the roll about its own length is read by the eye, so it has
   * to follow the fist instead of being authored once (see {@link EDGED_FLIP}).
   *
   * Only worth setting on a blade with a *belly*. A straight sword rolled half a
   * turn looks identical; a sabre rolled half a turn is a sickle.
   */
  edged?: boolean;
  /** Half-height of a shield, so its rim can be kept off the floor. */
  half?: number;
  /**
   * Height of the business end in the prop's own authored coordinates — the
   * crystal in a staff's claw, the gem on a sceptre. Casters throw their fire
   * from exactly this point, read out of the live pose.
   */
  focus?: number;
  /**
   * Muzzle in the prop's own authored coordinates. Firearms throw their flash,
   * their smoke and their ball from exactly this point, read out of the live
   * pose — so the shot leaves the barrel wherever the arms have swung it.
   */
  muzzle?: THREE.Vector3;
  /**
   * Pose-driven hold, for props that must not keep a fixed rest angle.
   *
   * A firearm's whole point is that the barrel goes wherever the arms put it, so
   * a fixed body-space angle leaves it standing upright through an aiming clip:
   *  - `"longArm"` — laid downrange, with the two fists supplying the cant and
   *    the elevation (see {@link LONG_ARM_CANT}).
   *  - `"sidearm"` — the axis follows the forearm, lifted toward the figure's
   *    front so a hanging arm reads as a pistol carried low, not dropped.
   *
   * Re-solved every frame from the live skeleton — see {@link AttachedArms.align}.
   */
  hold?: "longArm" | "sidearm";
  /**
   * Not held at all: hauled along beside the figure (the battery's gun). Towed
   * props are authored in body axes — front +Z, up +Y, wheels on ±X — and are
   * parented to the sculpt root rather than to a hand bone, so the crew's arms
   * can swing without dragging the carriage around with them.
   */
  towed?: boolean;
  /** Where a towed prop stands, in figure heights: +x is the holding side. */
  park?: THREE.Vector3;
  /**
   * Size of a towed prop against the figure hauling it, 1 = authored size.
   *
   * A gun carriage is a real object with a real size, and the reference it has to
   * look right against is the *crewman standing next to it*. A real Gribeauval
   * 6-pounder rolls on wheels about four fifths of a man's height and is longer
   * than a man is tall; at the old 0.85 this gun's wheels reached barely a third
   * of the guard's height, so the battery read as an officer wheeling a toy.
   */
  bulk?: number;
  /**
   * Lateral squeeze of a towed prop, applied to its own X (the axle) only.
   *
   * The gun cannot simply be scaled up until it looks right: one board square is
   * {@link TILE} wide, and a uniformly grown carriage puts a wheel down on the
   * neighbouring piece's tile. The axle is the one axis that can be given up
   * without the eye noticing — the wheels stand in the YZ plane, so narrowing the
   * track only thins their tyres, it never turns a wheel into an ellipse. So the
   * gun buys its height and its length back out of its track width.
   */
  track?: number;
}

// ------------------------------------------------------------------ geometry

/**
 * Flat diamond cross-section blade.
 *
 * `base` is where the ricasso starts — always *above* the hilt, otherwise the
 * blade grows down through the grip and the crossguard ends up mid-blade.
 */
function blade(
  length: number,
  width: number,
  thickness: number,
  taper: number,
  base: number,
): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(0.5 * taper, 0.5, length, 4, 1);
  geometry.rotateY(Math.PI / 4);
  geometry.scale(width, 1, thickness);
  geometry.translate(0, base + length / 2, 0);
  return geometry;
}

/** Leaf-shaped spearhead: a widening shoulder under a tapering point. */
function leafHead(length: number, width: number, thickness: number, base: number): THREE.BufferGeometry {
  const shoulder = new THREE.CylinderGeometry(0.5, 0.14, length * 0.34, 4, 1);
  shoulder.rotateY(Math.PI / 4);
  shoulder.scale(width, 1, thickness);
  shoulder.translate(0, base + length * 0.17, 0);
  const point = new THREE.CylinderGeometry(0.02, 0.5, length * 0.66, 4, 1);
  point.rotateY(Math.PI / 4);
  point.scale(width, 1, thickness);
  point.translate(0, base + length * 0.34 + length * 0.33, 0);
  const merged = mergeGeometries([shoulder.toNonIndexed(), point.toNonIndexed()], false);
  shoulder.dispose();
  point.dispose();
  return merged ?? new THREE.BufferGeometry();
}

function shaft(length: number, radius: number, topRadius = radius * 0.9): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(topRadius, radius, length, 10, 1);
  geometry.translate(0, length / 2, 0);
  return geometry;
}

function box(w: number, h: number, d: number, y: number, x = 0, z = 0): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(x, y, z);
  return geometry;
}

function ball(radius: number, y: number, x = 0, z = 0): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(radius, 14, 10);
  geometry.translate(x, y, z);
  return geometry;
}

function ring(radius: number, tube: number, y: number): THREE.BufferGeometry {
  const geometry = new THREE.TorusGeometry(radius, tube, 8, 18);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, y, 0);
  return geometry;
}

/**
 * One obsidian tooth set into the edge of a macuahuitl or a spear head, apex
 * pointing away from the shaft.
 */
function tooth(size: number, y: number, x: number): THREE.BufferGeometry {
  const geometry = new THREE.ConeGeometry(size * 0.5, size, 3);
  geometry.rotateZ(x > 0 ? -Math.PI / 2 : Math.PI / 2);
  geometry.translate(x + Math.sign(x) * size * 0.5, y, 0);
  return geometry;
}

/** A row of teeth down both edges of a blade of `length`, starting at `base`. */
function toothedEdges(count: number, base: number, length: number, size: number, half: number): THREE.BufferGeometry[] {
  const teeth: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i += 1) {
    const y = base + ((i + 0.5) / count) * length;
    teeth.push(tooth(size, y, half));
    teeth.push(tooth(size, y, -half));
  }
  return teeth;
}

/** Feather plumes hanging from a ring of radius `radius` at height `y`. */
function plumes(count: number, radius: number, y: number, length: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
    const geometry = new THREE.BoxGeometry(0.022, length * (1 - Math.abs(t) * 0.35), 0.009);
    geometry.rotateZ(t * 0.22);
    geometry.translate(t * radius, y - length * 0.5, 0.004);
    out.push(geometry);
  }
  return out;
}

/** Triangular rays fanned around a sun disc lying in the plane of its face. */
function sunRays(count: number, radius: number, y: number, length: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const geometry = new THREE.ConeGeometry(0.016, length, 4);
    geometry.rotateZ(-angle);
    geometry.translate(
      Math.sin(angle) * (radius + length * 0.4),
      y + Math.cos(angle) * (radius + length * 0.4),
      0,
    );
    out.push(geometry);
  }
  return out;
}

/** Round feather-fringed chimalli, built from closed solids only. */
function chimalliParts(radius: number, fringe: number): Part[] {
  const board = new THREE.CylinderGeometry(radius, radius, 0.018, 30);
  board.rotateX(Math.PI / 2);
  const dome = new THREE.ConeGeometry(radius, 0.04, 30);
  dome.rotateX(Math.PI / 2);
  dome.translate(0, 0, 0.028);
  const rim = new THREE.TorusGeometry(radius * 1.02, 0.012, 8, 28);
  const inlay = new THREE.TorusGeometry(radius * 0.66, 0.013, 8, 26);
  inlay.translate(0, 0, 0.018);
  const boss = new THREE.SphereGeometry(radius * 0.2, 14, 10);
  boss.translate(0, 0, 0.042);
  const bars: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI;
    const bar = new THREE.BoxGeometry(radius * 1.25, 0.022, 0.01);
    bar.rotateZ(angle);
    bar.translate(0, 0, 0.022);
    bars.push(bar);
  }
  const fringeParts: THREE.BufferGeometry[] = [];
  const count = 7;
  for (let i = 0; i < count; i += 1) {
    const t = (i / (count - 1)) * 2 - 1;
    const feather = new THREE.BoxGeometry(0.026, fringe * (1 - Math.abs(t) * 0.4), 0.01);
    feather.rotateZ(t * 0.18);
    feather.translate(t * radius * 0.82, -radius - fringe * 0.4, 0.004);
    fringeParts.push(feather);
  }
  return [
    { geometry: board, role: "wood" },
    { geometry: dome, role: "wood" },
    { geometry: rim, role: "gold" },
    { geometry: inlay, role: "jade" },
    { geometry: boss, role: "gold" },
    ...bars.map((geometry) => ({ geometry, role: "jade" as const })),
    ...fringeParts.map((geometry) => ({ geometry, role: "feather" as const })),
  ];
}

/**
 * Macuahuitl: a flat hardwood paddle with obsidian blades set down both edges.
 * `size` scales the whole weapon, `royal` adds the emperor's feather tassels.
 */
function macuahuitlParts(size: number, royal: boolean): Part[] {
  const grip = 0.16 * size;
  const paddle = 0.44 * size;
  const halfWidth = 0.046 * size;
  const parts: Part[] = [
    { geometry: shaft(grip, 0.019 * size, 0.017 * size), role: "wood" },
    { geometry: ball(0.03 * size, -0.014 * size), role: "obsidian" },
    { geometry: ring(0.023 * size, 0.008 * size, grip * 0.45), role: "leather" },
    { geometry: box(halfWidth * 2, paddle, 0.026 * size, grip + paddle / 2), role: "wood" },
    { geometry: box(halfWidth * 2.05, 0.026 * size, 0.03 * size, grip + 0.03 * size), role: "jade" },
    { geometry: box(halfWidth * 1.5, 0.024 * size, 0.03 * size, grip + paddle - 0.03 * size), role: "gold" },
    ...toothedEdges(6, grip + 0.05 * size, paddle - 0.09 * size, 0.058 * size, halfWidth).map(
      (geometry) => ({ geometry, role: "obsidian" as const }),
    ),
    { geometry: spike(0.038 * size, 0.075 * size, grip + paddle), role: "obsidian" },
  ];
  if (royal) {
    parts.push(
      ...plumes(5, 0.05 * size, grip * 0.3, 0.17 * size).map((geometry) => ({
        geometry,
        role: "feather" as const,
      })),
    );
  }
  return parts;
}

/**
 * Sabre blade: a fan of short tapering segments laid along an arc, so the edge
 * sweeps forward the way a cavalry sabre does. Segments overlap slightly so the
 * joints do not show as notches at gameplay scale.
 *
 * @param curve total sweep from ricasso to point, in radians
 */
function curvedBlade(
  length: number,
  width: number,
  thickness: number,
  base: number,
  curve: number,
  segments = 5,
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const step = length / segments;
  let x = 0;
  let y = base;
  for (let i = 0; i < segments; i += 1) {
    const angle = curve * (i / segments);
    const top = 1 - (i + 1) / (segments + 1.4);
    const bottom = 1 - i / (segments + 1.4);
    const segment = new THREE.CylinderGeometry(0.5 * top, 0.5 * bottom, step * 1.1, 4, 1);
    segment.rotateY(Math.PI / 4);
    segment.scale(width, 1, thickness);
    segment.translate(0, step / 2, 0);
    segment.rotateZ(-angle);
    segment.translate(x, y, 0);
    parts.push(segment);
    x += Math.sin(angle) * step;
    y += Math.cos(angle) * step;
  }
  return parts;
}

/** Knuckle bow: a half torus standing in the blade's own plane. */
function knuckleBow(radius: number, tube: number, y: number): THREE.BufferGeometry {
  const geometry = new THREE.TorusGeometry(radius, tube, 6, 14, Math.PI);
  geometry.rotateZ(-Math.PI / 2);
  geometry.translate(0, y, 0);
  return geometry;
}

/** Spread eagle: a body ball flanked by two swept wings, for imperial finials. */
function eagleParts(size: number, y: number, role: WeaponRole): Part[] {
  const body = new THREE.SphereGeometry(size * 0.42, 12, 9);
  body.scale(0.8, 1.15, 0.8);
  body.translate(0, y, 0);
  const head = new THREE.SphereGeometry(size * 0.2, 10, 8);
  head.translate(0, y + size * 0.5, size * 0.1);
  const parts: Part[] = [
    { geometry: body, role },
    { geometry: head, role },
  ];
  for (const side of [-1, 1]) {
    const wing = new THREE.BoxGeometry(size * 1.05, size * 0.5, size * 0.11);
    wing.translate(side * size * 0.62, 0, 0);
    wing.rotateZ(side * -0.42);
    wing.translate(0, y + size * 0.22, 0);
    parts.push({ geometry: wing, role });
  }
  return parts;
}

/** Cylinder lying along the body's front axis (+Z) — gun barrels and axles. */
function tube(
  length: number,
  radius: number,
  frontRadius = radius,
  z = 0,
  y = 0,
  x = 0,
): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(frontRadius, radius, length, 14, 1);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(x, y, z + length / 2);
  return geometry;
}

/**
 * One artillery wheel: a tyred rim on a hub, standing in the plane the gun
 * rolls in (axle along ±X). Spokes are solid boxes — a real spoked wheel reads
 * as a blur at gameplay scale and costs ten times the triangles.
 */
function gunWheel(radius: number, x: number, y: number, z: number): Part[] {
  const parts: Part[] = [];
  const rim = new THREE.TorusGeometry(radius, radius * 0.11, 8, 20);
  rim.rotateY(Math.PI / 2);
  rim.translate(x, y, z);
  parts.push({ geometry: rim, role: "steel" });
  const felloe = new THREE.TorusGeometry(radius * 0.88, radius * 0.075, 6, 18);
  felloe.rotateY(Math.PI / 2);
  felloe.translate(x, y, z);
  parts.push({ geometry: felloe, role: "wood" });
  const hub = new THREE.CylinderGeometry(radius * 0.2, radius * 0.2, radius * 0.36, 10);
  hub.rotateZ(Math.PI / 2);
  hub.translate(x, y, z);
  parts.push({ geometry: hub, role: "wood" });
  const cap = new THREE.SphereGeometry(radius * 0.13, 10, 8);
  cap.translate(x + Math.sign(x) * radius * 0.2, y, z);
  parts.push({ geometry: cap, role: "gold" });
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI;
    const spoke = new THREE.BoxGeometry(radius * 0.13, radius * 1.72, radius * 0.1);
    spoke.rotateX(Math.PI / 2);
    spoke.rotateX(angle);
    spoke.translate(x, y, z);
    parts.push({ geometry: spoke, role: "wood" });
  }
  return parts;
}

function spike(radius: number, height: number, y: number, tilt = 0): THREE.BufferGeometry {
  const geometry = new THREE.ConeGeometry(radius, height, 10);
  geometry.translate(0, height / 2, 0);
  if (tilt !== 0) geometry.rotateX(tilt);
  geometry.translate(0, y, 0);
  return geometry;
}

/** Extruded shield plate whose face normal is +Z and whose up is +Y. */
function shieldPlate(shape: THREE.Shape, depth: number, bevel: number): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 12,
  });
  geometry.center();
  return geometry;
}

function heaterShape(width: number, height: number): THREE.Shape {
  const shape = new THREE.Shape();
  const hw = width / 2;
  shape.moveTo(-hw, height * 0.5);
  shape.lineTo(hw, height * 0.5);
  shape.quadraticCurveTo(hw, -height * 0.1, 0, -height * 0.5);
  shape.quadraticCurveTo(-hw, -height * 0.1, -hw, height * 0.5);
  return shape;
}

function towerShape(width: number, height: number): THREE.Shape {
  const shape = new THREE.Shape();
  const hw = width / 2;
  const hh = height / 2;
  shape.moveTo(-hw, hh * 0.72);
  shape.quadraticCurveTo(0, hh * 1.06, hw, hh * 0.72);
  shape.lineTo(hw, -hh * 0.62);
  shape.quadraticCurveTo(0, -hh * 1.05, -hw, -hh * 0.62);
  shape.closePath();
  return shape;
}

// ------------------------------------------------------------------- weapons

/**
 * Rest angle every *drawn* Napoleonic blade is carried at, in body axes.
 *
 * These used to rest at `(-0.05, 1, 0.14)`: straight up, leaning a shade toward
 * the spine. Both halves of that are wrong for a real sword on a real figure.
 * Straight up means the blade covers the whole torso, and since the fist sits at
 * about half the figure's height, anything longer than half a body reaches past
 * the crown; the inward lean then walks it up the *middle* of the silhouette. A
 * 0.72-long sabre carried that way crosses head height at x = 0.219 — the exact
 * edge of the bicorne — so from the board's camera the Emperor's own blade is
 * drawn across his face. It read as a broken model, and it was only a pose.
 *
 * Raked out (≈27°) and a little forward (≈15°) instead, the blade leaves the fist
 * heading away from the body: it clears the shoulder, tops out at jaw height
 * rather than above the hat, and lands as a diagonal in the open half of the
 * square — which is how a drawn sabre is actually held when nobody is being cut.
 */
const BLADE_AT_REST = new THREE.Vector3(0.5, 1, 0.28);

const WEAPONS: Record<WeaponId, WeaponSpec> = {
  /** King: ceremonial two-handed sword, held blade-up like a standard. */
  greatsword: {
    grip: 0.12,
    aim: new THREE.Vector3(-0.05, 1, 0.14),
    offset: new THREE.Vector3(0.02, 0, 0.03),
    build: () => [
      { geometry: shaft(0.22, 0.019, 0.017), role: "leather" },
      { geometry: ball(0.033, -0.014), role: "gold" },
      { geometry: ring(0.026, 0.008, 0.205), role: "gold" },
      { geometry: box(0.25, 0.026, 0.036, 0.234), role: "gold" },
      { geometry: ball(0.024, 0.234, 0.125), role: "gold" },
      { geometry: ball(0.024, 0.234, -0.125), role: "gold" },
      { geometry: ball(0.021, 0.234, 0, 0.026), role: "gem" },
      { geometry: box(0.05, 0.05, 0.03, 0.262), role: "gold" },
      { geometry: blade(0.5, 0.086, 0.021, 0.16, 0.28), role: "steel" },
    ],
  },
  /** Queen: gold sceptre crowned with a faction-coloured crystal. */
  scepter: {
    grip: 0.16,
    focus: 0.56,
    aim: new THREE.Vector3(-0.04, 1, 0.1),
    offset: new THREE.Vector3(0.02, 0, 0.03),
    build: () => [
      { geometry: shaft(0.5, 0.016, 0.014), role: "gold" },
      { geometry: ball(0.026, 0.0), role: "gold" },
      { geometry: ring(0.024, 0.007, 0.14), role: "gold" },
      { geometry: ring(0.024, 0.007, 0.32), role: "gold" },
      { geometry: ring(0.036, 0.009, 0.5), role: "gold" },
      { geometry: ball(0.045, 0.552), role: "gem" },
      { geometry: spike(0.018, 0.06, 0.585), role: "gold" },
    ],
  },
  /** Bishop: tall cleric staff with a floating crystal in a gold claw. */
  crystalStaff: {
    grip: 0.34,
    focus: 0.775,
    aim: new THREE.Vector3(-0.03, 1, 0.07),
    offset: new THREE.Vector3(0.02, 0, 0.03),
    build: () => [
      { geometry: shaft(0.7, 0.015, 0.013), role: "wood" },
      { geometry: ring(0.019, 0.008, 0.3), role: "leather" },
      { geometry: ring(0.019, 0.008, 0.37), role: "leather" },
      { geometry: ring(0.021, 0.008, 0.685), role: "gold" },
      { geometry: spike(0.028, 0.08, 0.69), role: "gold" },
      { geometry: ball(0.042, 0.775), role: "gem" },
      { geometry: ring(0.048, 0.007, 0.775), role: "gold" },
      { geometry: spike(0.011, 0.028, -0.028, Math.PI), role: "steel" },
    ],
  },
  /** Rook: siege warhammer, heavy enough to sell the hammer-swing clip. */
  warhammer: {
    grip: 0.16,
    aim: new THREE.Vector3(-0.05, 1, 0.14),
    offset: new THREE.Vector3(0.02, 0, 0.03),
    build: () => [
      { geometry: shaft(0.46, 0.019, 0.017), role: "wood" },
      { geometry: shaft(0.15, 0.021), role: "leather" },
      { geometry: box(0.13, 0.12, 0.19, 0.52), role: "steel" },
      { geometry: box(0.145, 0.026, 0.2, 0.575), role: "gold" },
      { geometry: box(0.145, 0.026, 0.2, 0.465), role: "gold" },
      { geometry: spike(0.035, 0.1, 0.58), role: "steel" },
    ],
  },
  /** Knight: arming sword with a winged crossguard. */
  longsword: {
    grip: 0.075,
    aim: new THREE.Vector3(-0.07, 1, 0.18),
    offset: new THREE.Vector3(0.02, 0, 0.03),
    build: () => [
      { geometry: shaft(0.14, 0.017, 0.015), role: "leather" },
      { geometry: ball(0.026, -0.012), role: "gold" },
      { geometry: box(0.19, 0.023, 0.03, 0.153), role: "gold" },
      { geometry: ball(0.019, 0.153, 0.095), role: "gold" },
      { geometry: ball(0.019, 0.153, -0.095), role: "gold" },
      { geometry: box(0.042, 0.04, 0.026, 0.18), role: "gold" },
      { geometry: blade(0.42, 0.072, 0.019, 0.2, 0.196), role: "steel" },
    ],
  },
  /** Pawn: ash spear with a steel leaf head and a rag binding. */
  spear: {
    grip: 0.3,
    aim: new THREE.Vector3(-0.03, 1, 0.06),
    offset: new THREE.Vector3(0.018, 0, 0.028),
    build: () => [
      { geometry: shaft(0.68, 0.013, 0.011), role: "wood" },
      { geometry: ring(0.017, 0.007, 0.26), role: "cloth" },
      { geometry: ring(0.017, 0.007, 0.32), role: "cloth" },
      { geometry: shaft(0.045, 0.019, 0.016).translate(0, 0.655, 0), role: "steel" },
      { geometry: leafHead(0.19, 0.062, 0.016, 0.695), role: "steel" },
      { geometry: spike(0.013, 0.038, -0.036, Math.PI), role: "steel" },
    ],
  },
  /**
   * Pawn off-hand: domed round shield.
   *
   * Built from closed solids only — an open sphere cap reads as a bare hoop the
   * moment the figure turns its back to the camera (back faces are culled).
   */
  roundShield: {
    grip: 0,
    shield: true,
    half: 0.155,
    aim: new THREE.Vector3(0.36, 0.05, 1),
    offset: new THREE.Vector3(0.045, 0.015, 0.055),
    build: () => {
      const board = new THREE.CylinderGeometry(0.142, 0.142, 0.018, 30);
      board.rotateX(Math.PI / 2);
      const dome = new THREE.ConeGeometry(0.142, 0.055, 30);
      dome.rotateX(Math.PI / 2);
      dome.translate(0, 0, 0.036);
      const rim = new THREE.TorusGeometry(0.145, 0.012, 8, 28);
      const boss = new THREE.SphereGeometry(0.032, 14, 10);
      boss.translate(0, 0, 0.055);
      const rivets: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2;
        const rivet = new THREE.SphereGeometry(0.0105, 8, 6);
        rivet.translate(Math.cos(angle) * 0.118, Math.sin(angle) * 0.118, 0.019);
        rivets.push(rivet);
      }
      return [
        { geometry: board, role: "cloth" },
        { geometry: dome, role: "cloth" },
        { geometry: rim, role: "steel" },
        { geometry: boss, role: "steel" },
        ...rivets.map((geometry) => ({ geometry, role: "steel" as const })),
      ];
    },
  },
  /** Knight off-hand: heater shield with a metal rim and bronze boss. */
  heaterShield: {
    grip: 0,
    shield: true,
    half: 0.17,
    aim: new THREE.Vector3(0.4, 0.04, 1),
    offset: new THREE.Vector3(0.05, 0.02, 0.055),
    build: () => {
      const plate = shieldPlate(heaterShape(0.24, 0.32), 0.022, 0.008);
      const rim = shieldPlate(heaterShape(0.268, 0.352), 0.012, 0.006);
      rim.translate(0, 0, -0.012);
      const boss = new THREE.SphereGeometry(0.028, 12, 10);
      boss.translate(0, 0, 0.024);
      const band = box(0.19, 0.022, 0.016, 0.052, 0, 0.018);
      return [
        { geometry: plate, role: "cloth" },
        { geometry: rim, role: "steel" },
        { geometry: band, role: "steel" },
        { geometry: boss, role: "gold" },
      ];
    },
  },
  /** Rook off-hand: gate-guardian tower shield. */
  towerShield: {
    grip: 0,
    shield: true,
    half: 0.23,
    aim: new THREE.Vector3(0.34, 0.03, 1),
    offset: new THREE.Vector3(0.055, 0.02, 0.06),
    build: () => {
      const plate = shieldPlate(towerShape(0.3, 0.46), 0.026, 0.01);
      const rim = shieldPlate(towerShape(0.328, 0.494), 0.014, 0.007);
      rim.translate(0, 0, -0.014);
      const bandTop = box(0.28, 0.028, 0.018, 0.13, 0, 0.02);
      const bandLow = box(0.28, 0.028, 0.018, -0.13, 0, 0.02);
      const boss = new THREE.SphereGeometry(0.036, 12, 10);
      boss.translate(0, 0, 0.028);
      return [
        { geometry: plate, role: "cloth" },
        { geometry: rim, role: "steel" },
        { geometry: bandTop, role: "steel" },
        { geometry: bandLow, role: "steel" },
        { geometry: boss, role: "gold" },
      ];
    },
  },

  // ------------------------------------------------------------ Sun Empire

  /** Emperor: an oversized ceremonial macuahuitl hung with feather tassels. */
  royalMacuahuitl: {
    grip: 0.1,
    aim: new THREE.Vector3(-0.05, 1, 0.14),
    offset: new THREE.Vector3(0.02, 0, 0.03),
    build: () => macuahuitlParts(1.2, true),
  },
  /** Jaguar warrior: the standard obsidian-toothed war club. */
  macuahuitl: {
    grip: 0.085,
    aim: new THREE.Vector3(-0.07, 1, 0.18),
    offset: new THREE.Vector3(0.02, 0, 0.03),
    build: () => macuahuitlParts(0.94, false),
  },
  /** Foot warrior: obsidian-edged thrusting spear. */
  tepoztopilli: {
    grip: 0.3,
    aim: new THREE.Vector3(-0.03, 1, 0.06),
    offset: new THREE.Vector3(0.018, 0, 0.028),
    build: () => [
      { geometry: shaft(0.64, 0.013, 0.011), role: "wood" },
      { geometry: ring(0.017, 0.007, 0.26), role: "feather" },
      { geometry: ring(0.017, 0.007, 0.33), role: "jade" },
      { geometry: box(0.072, 0.2, 0.016, 0.735), role: "wood" },
      ...toothedEdges(4, 0.65, 0.16, 0.05, 0.036).map((geometry) => ({
        geometry,
        role: "obsidian" as const,
      })),
      { geometry: spike(0.032, 0.075, 0.833), role: "obsidian" },
      { geometry: spike(0.013, 0.036, -0.034, Math.PI), role: "obsidian" },
      ...plumes(3, 0.026, 0.6, 0.1).map((geometry) => ({ geometry, role: "feather" as const })),
    ],
  },
  /** Serpent priest: feathered-serpent staff with a jade skull orb. */
  serpentStaff: {
    grip: 0.34,
    focus: 0.712,
    aim: new THREE.Vector3(-0.03, 1, 0.07),
    offset: new THREE.Vector3(0.02, 0, 0.03),
    build: () => [
      { geometry: shaft(0.66, 0.015, 0.013), role: "wood" },
      { geometry: ring(0.019, 0.008, 0.27), role: "feather" },
      { geometry: ring(0.019, 0.008, 0.35), role: "jade" },
      { geometry: ring(0.026, 0.009, 0.645), role: "gold" },
      { geometry: ball(0.048, 0.712), role: "jade" },
      { geometry: box(0.052, 0.042, 0.09, 0.706, 0, 0.058), role: "jade" },
      { geometry: box(0.046, 0.016, 0.072, 0.681, 0, 0.05), role: "gold" },
      { geometry: ball(0.013, 0.73, 0.032, 0.028), role: "gem" },
      { geometry: ball(0.013, 0.73, -0.032, 0.028), role: "gem" },
      { geometry: ring(0.058, 0.013, 0.685), role: "feather" },
      { geometry: spike(0.022, 0.11, 0.752), role: "feather" },
      { geometry: spike(0.011, 0.03, -0.03, Math.PI), role: "obsidian" },
    ],
  },
  /** Priestess queen: gold sun disc raised on a jade-banded rod. */
  sunScepter: {
    grip: 0.16,
    focus: 0.54,
    aim: new THREE.Vector3(-0.04, 1, 0.1),
    offset: new THREE.Vector3(0.02, 0, 0.03),
    build: () => {
      const disc = new THREE.CylinderGeometry(0.072, 0.072, 0.018, 22);
      disc.rotateX(Math.PI / 2);
      disc.translate(0, 0.54, 0);
      return [
        { geometry: shaft(0.46, 0.016, 0.014), role: "gold" },
        { geometry: ball(0.026, 0.0), role: "obsidian" },
        { geometry: ring(0.024, 0.007, 0.13), role: "jade" },
        { geometry: ring(0.024, 0.007, 0.31), role: "jade" },
        { geometry: disc, role: "gold" },
        ...sunRays(10, 0.072, 0.54, 0.05).map((geometry) => ({ geometry, role: "gold" as const })),
        { geometry: ball(0.03, 0.54, 0, 0.016), role: "jade" },
        { geometry: ball(0.03, 0.54, 0, -0.016), role: "jade" },
        ...plumes(5, 0.05, 0.45, 0.16).map((geometry) => ({ geometry, role: "feather" as const })),
      ];
    },
  },
  /** Temple guardian: basalt maul faced with obsidian blades. */
  stoneMaul: {
    grip: 0.16,
    aim: new THREE.Vector3(-0.05, 1, 0.14),
    offset: new THREE.Vector3(0.02, 0, 0.03),
    build: () => [
      { geometry: shaft(0.44, 0.02, 0.018), role: "wood" },
      { geometry: shaft(0.15, 0.022), role: "leather" },
      { geometry: ring(0.03, 0.009, 0.42), role: "gold" },
      { geometry: box(0.13, 0.16, 0.18, 0.52), role: "stone" },
      { geometry: box(0.032, 0.17, 0.19, 0.52, 0.079), role: "obsidian" },
      { geometry: box(0.032, 0.17, 0.19, 0.52, -0.079), role: "obsidian" },
      { geometry: box(0.15, 0.024, 0.2, 0.44), role: "jade" },
      { geometry: spike(0.04, 0.1, 0.6), role: "obsidian" },
    ],
  },
  /** Feather-fringed chimalli carried by the empire's line troops. */
  chimalli: {
    grip: 0,
    shield: true,
    half: 0.2,
    aim: new THREE.Vector3(0.36, 0.05, 1),
    offset: new THREE.Vector3(0.045, 0.015, 0.055),
    build: () => chimalliParts(0.14, 0.11),
  },
  /** Guardian's great chimalli, wide enough to bar a temple stair. */
  greatChimalli: {
    grip: 0,
    shield: true,
    half: 0.29,
    aim: new THREE.Vector3(0.34, 0.03, 1),
    offset: new THREE.Vector3(0.055, 0.02, 0.06),
    build: () => chimalliParts(0.185, 0.16),
  },

  // ----------------------------------------------------------- Grande Armée

  /**
   * Napoléon: the Emperor's dress sabre — a gilt knuckle-bow hilt under a
   * lightly curved blade, drawn and held lowered away from the body.
   *
   * Blade shortened from 0.5 while the hilt was left alone, because that is what
   * a shorter sabre is: a hilt is the size of a hand whatever the blade does.
   * Total 0.536, matching the sculpt that replaces it (see `ARM_SCULPTS`).
   */
  imperialSabre: {
    grip: 0.095,
    edged: true,
    aim: BLADE_AT_REST.clone(),
    offset: new THREE.Vector3(0.02, 0, 0.03),
    build: () => [
      { geometry: shaft(0.16, 0.016, 0.014), role: "leather" },
      { geometry: ball(0.03, -0.012), role: "gold" },
      { geometry: ring(0.023, 0.008, 0.152), role: "gold" },
      { geometry: knuckleBow(0.062, 0.009, 0.09), role: "gold" },
      { geometry: box(0.13, 0.022, 0.03, 0.176), role: "gold" },
      { geometry: ball(0.019, 0.176, 0.066), role: "gold" },
      { geometry: box(0.05, 0.038, 0.028, 0.2), role: "gold" },
      ...curvedBlade(0.32, 0.075, 0.02, 0.216, 0.34).map((geometry) => ({
        geometry,
        role: "steel" as const,
      })),
    ],
  },
  /**
   * The Marengo sword: the imperial commander's presentation blade, named for
   * the field it was carried on. Everything about it is a gift rather than an
   * issue weapon — an ivory grip bound with gold wire, a laurelled knuckle bow,
   * a brilliant set in the guard and an eagle's head for a pommel — and its
   * blade is the straightest thing worn at the imperial court. It is carried in
   * the off hand: her right hand is the one that shoots.
   */
  marengoSword: {
    grip: 0.09,
    edged: true,
    aim: BLADE_AT_REST.clone(),
    offset: new THREE.Vector3(0.02, 0, 0.03),
    build: () => [
      // Ivory grip under gold binding wire.
      { geometry: shaft(0.15, 0.017, 0.015), role: "stone" },
      { geometry: ring(0.02, 0.005, 0.036), role: "gold" },
      { geometry: ring(0.02, 0.005, 0.075), role: "gold" },
      { geometry: ring(0.02, 0.005, 0.114), role: "gold" },
      // Eagle's head pommel — the one motif that names the owner from above.
      ...eagleParts(0.05, -0.03, "gold"),
      // Laurelled guard: ferrule, knuckle bow, quillon and a set brilliant.
      { geometry: ring(0.024, 0.009, 0.146), role: "gold" },
      { geometry: knuckleBow(0.058, 0.008, 0.086), role: "gold" },
      { geometry: box(0.115, 0.02, 0.028, 0.168), role: "gold" },
      { geometry: ball(0.017, 0.168, 0.058), role: "gold" },
      { geometry: ball(0.017, 0.168, -0.042), role: "gold" },
      { geometry: ball(0.013, 0.176, 0, 0.026), role: "gem" },
      { geometry: box(0.046, 0.034, 0.026, 0.192), role: "gold" },
      // A barely curved court blade — a sabre in name, a sword in line.
      ...curvedBlade(0.37, 0.07, 0.019, 0.208, 0.22, 6).map((geometry) => ({
        geometry,
        role: "steel" as const,
      })),
    ],
  },
  /**
   * The Empire's marksman: a rifled long arm — a full-stocked piece with a
   * browned barrel half again as long as the line's musket, brass furniture, a
   * cheek piece on the butt and no bayonet at all. Nothing about it is
   * ceremonial: it is the longest barrel on the board and the only weapon here
   * with sights, which is the whole point of the rank from a top-down camera.
   */
  marksmanRifle: {
    grip: 0.26,
    // Barrel mouth, inside the brass nose cap.
    muzzle: new THREE.Vector3(0, 0.835, 0),
    // Held in two fists: the barrel line is read out of the pose, and `aim` is
    // only the fallback for a figure whose skeleton never arrived.
    hold: "longArm",
    aim: new THREE.Vector3(-0.03, 1, 0.06),
    offset: new THREE.Vector3(0.014, -0.005, 0.02),
    build: () => [
      // Full walnut stock, butt on the ground end, wrist under the lock.
      { geometry: box(0.032, 0.34, 0.058, 0.175), role: "wood" },
      { geometry: box(0.036, 0.055, 0.08, 0.026), role: "wood" },
      { geometry: box(0.04, 0.026, 0.084, 0.005), role: "gold" },
      // Cheek piece: what says "rifle" rather than "musket" in silhouette.
      { geometry: box(0.015, 0.055, 0.05, 0.11, 0.022), role: "wood" },
      // Lock, cock and trigger guard.
      { geometry: box(0.031, 0.082, 0.052, 0.27), role: "gold" },
      { geometry: box(0.014, 0.038, 0.02, 0.318, 0, -0.024), role: "steel" },
      { geometry: box(0.014, 0.016, 0.034, 0.238, 0, 0.026), role: "gold" },
      { geometry: ring(0.019, 0.007, 0.216), role: "leather" },
      // Barrel, ramrod in its channel underneath, and the brass bands.
      { geometry: shaft(0.5, 0.0125, 0.011).translate(0, 0.335, 0), role: "steel" },
      { geometry: shaft(0.42, 0.005).translate(0, 0.35, 0).translate(0, 0, 0.02), role: "wood" },
      { geometry: ring(0.017, 0.006, 0.42), role: "gold" },
      { geometry: ring(0.017, 0.006, 0.58), role: "gold" },
      { geometry: ring(0.017, 0.006, 0.74), role: "gold" },
      // Sights, fore and aft — the detail the rank is read by.
      { geometry: box(0.024, 0.016, 0.018, 0.362), role: "steel" },
      { geometry: box(0.009, 0.018, 0.014, 0.8), role: "steel" },
      { geometry: ring(0.016, 0.005, 0.825), role: "gold" },
      // Sling: a strap slung from the butt swivel up to the middle band.
      { geometry: box(0.012, 0.4, 0.011, 0.4, 0, -0.03), role: "leather" },
      { geometry: ring(0.015, 0.005, 0.19), role: "leather" },
    ],
  },
  /**
   * Cuirassier: the heavy straight-backed cavalry sabre, brass bowl guard.
   *
   * The An XI is 111cm overall on a 1.75m trooper, so 0.63 is the true length
   * and it stays — only the carry is raked out of his own silhouette.
   */
  cavalrySabre: {
    grip: 0.08,
    edged: true,
    aim: BLADE_AT_REST.clone(),
    offset: new THREE.Vector3(0.02, 0, 0.03),
    build: () => {
      const bowl = new THREE.SphereGeometry(0.058, 14, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5);
      bowl.scale(1, 0.6, 1);
      bowl.translate(0, 0.158, 0.012);
      const bowlFace = new THREE.CylinderGeometry(0.058, 0.058, 0.008, 16);
      bowlFace.translate(0, 0.157, 0.012);
      return [
        { geometry: shaft(0.14, 0.017, 0.015), role: "leather" },
        { geometry: ring(0.019, 0.006, 0.04), role: "gold" },
        { geometry: ring(0.019, 0.006, 0.1), role: "gold" },
        { geometry: ball(0.026, -0.01), role: "gold" },
        { geometry: bowl, role: "gold" },
        { geometry: bowlFace, role: "gold" },
        { geometry: box(0.044, 0.03, 0.028, 0.178), role: "gold" },
        ...curvedBlade(0.44, 0.08, 0.021, 0.192, 0.52).map((geometry) => ({
          geometry,
          role: "steel" as const,
        })),
      ];
    },
  },
  /**
   * Line infantry: the Charleville musket with the bayonet fixed — the longest
   * silhouette on the board and the pawn's whole identity from above.
   */
  musketBayonet: {
    grip: 0.26,
    // The flame leaves the barrel mouth, under the bayonet socket.
    muzzle: new THREE.Vector3(0, 0.665, 0),
    hold: "longArm",
    aim: new THREE.Vector3(-0.03, 1, 0.06),
    offset: new THREE.Vector3(0.014, -0.005, 0.02),
    build: () => [
      { geometry: box(0.032, 0.3, 0.056, 0.15), role: "wood" },
      { geometry: box(0.036, 0.05, 0.075, 0.022), role: "wood" },
      { geometry: box(0.038, 0.026, 0.078, 0.005), role: "steel" },
      { geometry: box(0.03, 0.075, 0.05, 0.235), role: "gold" },
      { geometry: shaft(0.4, 0.012, 0.013).translate(0, 0.29, 0), role: "steel" },
      { geometry: ring(0.017, 0.006, 0.36), role: "gold" },
      { geometry: ring(0.017, 0.006, 0.52), role: "gold" },
      { geometry: box(0.024, 0.06, 0.03, 0.66), role: "steel" },
      { geometry: blade(0.17, 0.028, 0.014, 0.14, 0.69), role: "steel" },
    ],
  },
  /**
   * Napoléon's off-hand: a gilt-mounted flintlock officer's pistol, carried
   * levelled at the hip rather than upright — the Emperor decides a fight
   * before anyone is close enough to be cut.
   */
  officerPistol: {
    grip: 0.055,
    muzzle: new THREE.Vector3(0, 0.262, 0),
    // One fist, so the barrel continues the forearm rather than the spine.
    hold: "sidearm",
    // Barrel forward and a shade up: the arm reads as levelled, not shouldered.
    aim: new THREE.Vector3(-0.2, 0.46, 0.87),
    offset: new THREE.Vector3(0.022, 0.004, 0.022),
    build: () => [
      { geometry: box(0.028, 0.1, 0.052, 0.05), role: "wood" },
      { geometry: box(0.032, 0.022, 0.058, 0.008), role: "gold" },
      { geometry: box(0.03, 0.056, 0.078, 0.12), role: "wood" },
      { geometry: box(0.034, 0.03, 0.05, 0.126, 0, -0.026), role: "steel" },
      { geometry: box(0.014, 0.032, 0.016, 0.148, 0, -0.03), role: "gold" },
      { geometry: box(0.014, 0.014, 0.03, 0.098, 0, 0.018), role: "gold" },
      { geometry: shaft(0.14, 0.0135, 0.0115).translate(0, 0.12, 0), role: "steel" },
      { geometry: shaft(0.115, 0.0045).translate(0, 0.13, 0).translate(0, 0, 0.019), role: "wood" },
      { geometry: ring(0.0165, 0.0045, 0.255), role: "gold" },
      { geometry: ball(0.008, 0.155, 0, 0.03), role: "gem" },
    ],
  },
  /**
   * The battery's gun: a light Gribeauval field piece hauled along beside the
   * artillery guard, muzzle forward so it can be laid on a target without ever
   * being turned round. Authored in body axes (front +Z, up +Y) and towed, not
   * held — see {@link WeaponSpec.towed}.
   */
  fieldCannon: {
    grip: 0,
    towed: true,
    // Sized against the guard who hauls it, not against the sculpt it was authored
    // at: 1.22 puts the wheels at roughly half his height and the trail-to-muzzle
    // run just under a square, which is the smallest gun that still reads as the
    // tower rank's weapon. The track pays for it (see {@link WeaponSpec.track}).
    bulk: 1.22,
    track: 0.8,
    // Pulled in and squared up on the tile now that the carriage is half again as
    // long: the old (0.42, -0.1) park was set around a gun two thirds this size.
    park: new THREE.Vector3(0.2, 0, -0.04),
    muzzle: new THREE.Vector3(0, 0.28, 0.36),
    aim: new THREE.Vector3(0, 1, 0),
    offset: new THREE.Vector3(0, 0, 0),
    build: () => {
      const parts: Part[] = [
        // Tube: breech at the back, swelling muzzle at the front.
        { geometry: tube(0.44, 0.05, 0.042, -0.08, 0.27), role: "gold" },
        { geometry: ball(0.05, 0.27, 0, -0.095), role: "gold" },
        { geometry: ball(0.026, 0.27, 0, -0.14), role: "gold" },
        { geometry: tube(0.035, 0.058, 0.058, 0.33, 0.27), role: "gold" },
        { geometry: tube(0.02, 0.056, 0.056, 0.02, 0.27), role: "steel" },
        // Trunnions: the tube sitting in the carriage cheeks.
        { geometry: box(0.19, 0.024, 0.024, 0.27, 0, 0.12), role: "steel" },
        // Carriage cheeks and the trail dropped to the ground behind.
        { geometry: box(0.028, 0.14, 0.38, 0.2, 0.075, 0.02), role: "wood" },
        { geometry: box(0.028, 0.14, 0.38, 0.2, -0.075, 0.02), role: "wood" },
        { geometry: box(0.18, 0.03, 0.16, 0.145, 0, 0.06), role: "wood" },
        { geometry: box(0.155, 0.05, 0.2, 0.07, 0, -0.2), role: "wood" },
        { geometry: box(0.13, 0.028, 0.06, 0.045, 0, -0.3), role: "gold" },
        // Lunette at the end of the trail — what the gun is hauled by.
        { geometry: ring(0.028, 0.008, 0).rotateX(Math.PI / 2).translate(0, 0.05, -0.34), role: "steel" },
        // Axle and the elevating screw under the breech.
        { geometry: box(0.4, 0.028, 0.028, 0.2, 0, 0.02), role: "wood" },
        { geometry: shaft(0.07, 0.011).translate(0, 0.19, 0).translate(0, 0, -0.09), role: "steel" },
        ...gunWheel(0.19, 0.215, 0.19, 0.02),
        ...gunWheel(0.19, -0.215, 0.19, 0.02),
      ];
      // Imperial eagle on the trail, so the gun is read as French from above.
      for (const part of eagleParts(0.07, 0, "gold")) {
        part.geometry.translate(0, 0.098, -0.21);
        parts.push(part);
      }
      return parts;
    },
  },
};

interface Loadout {
  /**
   * Right-hand arm. Omitted for a figure whose weapon is the thing it hauls:
   * the battery serves a field gun, so its hands stay free.
   */
  main?: WeaponId;
  off?: WeaponId;
  /** Hauled along rather than held — the artillery's gun. */
  train?: WeaponId;
}

/** Right-hand arm and off-hand shield per weapon family and piece kind. */
const LOADOUT: Record<ArsenalId, Record<PieceKind, Loadout>> = {
  kingdom: {
    k: { main: "greatsword" },
    q: { main: "scepter" },
    b: { main: "crystalStaff" },
    n: { main: "longsword", off: "heaterShield" },
    r: { main: "warhammer", off: "towerShield" },
    p: { main: "spear", off: "roundShield" },
  },
  sun: {
    k: { main: "royalMacuahuitl" },
    q: { main: "sunScepter" },
    b: { main: "serpentStaff" },
    n: { main: "macuahuitl", off: "chimalli" },
    r: { main: "stoneMaul", off: "greatChimalli" },
    p: { main: "tepoztopilli", off: "chimalli" },
  },
  // No shields anywhere except the battery's mantlet: the Grande Armée fights
  // with sabre, musket and gun, and a shield would read as medieval.
  empire: {
    // The pistol goes in the firing hand, the dress sabre to the off hand: the
    // Emperor's clip draws and shoots with the right, so a sabre there would
    // leave him aiming a blade with the gun forgotten at his hip.
    k: { main: "officerPistol", off: "imperialSabre" },
    // The commander answers the Emperor's example: a flintlock in the firing
    // hand and the Marengo sword worn on the other. No staff, no sorcery.
    q: { main: "officerPistol", off: "marengoSword" },
    // The marshal is the army's marksman: a rifled long arm and no staff of
    // office at all. His whole beat is fought from one knee, at range.
    b: { main: "marksmanRifle" },
    n: { main: "cavalrySabre" },
    // Nothing in either fist: the gun is the weapon, and a rammer held like a
    // maul made the crew read as a brawler standing next to its own artillery.
    r: { train: "fieldCannon" },
    p: { main: "musketBayonet" },
  },
};

// ------------------------------------------------------------------ materials

const PALETTE: Record<Faction, Record<WeaponRole, { color: number; roughness: number; metalness: number; emissive: number; emissiveIntensity: number }>> = {
  w: {
    steel: { color: 0xd8dee8, roughness: 0.21, metalness: 0.98, emissive: 0x101821, emissiveIntensity: 0.2 },
    gold: { color: 0xe0ab48, roughness: 0.28, metalness: 1, emissive: 0x2a1a04, emissiveIntensity: 0.25 },
    wood: { color: 0x8a6440, roughness: 0.82, metalness: 0.05, emissive: 0x000000, emissiveIntensity: 0 },
    leather: { color: 0x2f4a86, roughness: 0.72, metalness: 0.1, emissive: 0x081226, emissiveIntensity: 0.2 },
    cloth: { color: 0x2b4f9c, roughness: 0.78, metalness: 0.08, emissive: 0x0a1738, emissiveIntensity: 0.3 },
    gem: { color: 0xbcd8ff, roughness: 0.08, metalness: 0.05, emissive: 0x6ea8ff, emissiveIntensity: 2.4 },
    obsidian: { color: 0x23262e, roughness: 0.14, metalness: 0.4, emissive: 0x0a0f1a, emissiveIntensity: 0.2 },
    jade: { color: 0x4f9e86, roughness: 0.32, metalness: 0.12, emissive: 0x0d2a24, emissiveIntensity: 0.35 },
    feather: { color: 0xc4d3f0, roughness: 0.86, metalness: 0.02, emissive: 0x101c34, emissiveIntensity: 0.3 },
    stone: { color: 0x9d9482, roughness: 0.92, metalness: 0.03, emissive: 0x000000, emissiveIntensity: 0 },
  },
  b: {
    steel: { color: 0x5a5e66, roughness: 0.3, metalness: 0.96, emissive: 0x140807, emissiveIntensity: 0.2 },
    gold: { color: 0xb0742c, roughness: 0.34, metalness: 1, emissive: 0x2a1204, emissiveIntensity: 0.25 },
    wood: { color: 0x4a3323, roughness: 0.85, metalness: 0.05, emissive: 0x000000, emissiveIntensity: 0 },
    leather: { color: 0x5f1d17, roughness: 0.76, metalness: 0.1, emissive: 0x230605, emissiveIntensity: 0.2 },
    cloth: { color: 0x82201a, roughness: 0.8, metalness: 0.08, emissive: 0x2e0705, emissiveIntensity: 0.3 },
    gem: { color: 0xffc0a4, roughness: 0.08, metalness: 0.05, emissive: 0xff5a3c, emissiveIntensity: 2.4 },
    // Volcanic glass: near black, very smooth, catching the torches in streaks.
    obsidian: { color: 0x0e1015, roughness: 0.08, metalness: 0.42, emissive: 0x1d0705, emissiveIntensity: 0.3 },
    jade: { color: 0x2fb8a2, roughness: 0.3, metalness: 0.14, emissive: 0x0a4a41, emissiveIntensity: 0.55 },
    feather: { color: 0xd8452c, roughness: 0.88, metalness: 0.02, emissive: 0x3d0a04, emissiveIntensity: 0.4 },
    stone: { color: 0x6d6558, roughness: 0.94, metalness: 0.03, emissive: 0x150605, emissiveIntensity: 0.15 },
  },
};

function makeMaterial(role: WeaponRole, color: Faction): THREE.MeshStandardMaterial {
  const spec = PALETTE[color][role];
  const material = new THREE.MeshStandardMaterial({
    color: spec.color,
    roughness: spec.roughness,
    metalness: spec.metalness,
    emissive: new THREE.Color(spec.emissive),
    // Shield faces must never vanish when a figure turns its back to camera.
    side: role === "cloth" || role === "feather" ? THREE.DoubleSide : THREE.FrontSide,
  });
  material.emissiveIntensity = spec.emissiveIntensity;
  material.envMapIntensity = role === "gem" ? 0.6 : 1.3;
  return material;
}

// ------------------------------------------------------------------- caching

const geometryCache = new Map<WeaponId, Map<WeaponRole, THREE.BufferGeometry>>();

/** Merges the parts of a weapon into one geometry per material role, once. */
function weaponGeometries(id: WeaponId): Map<WeaponRole, THREE.BufferGeometry> {
  const cached = geometryCache.get(id);
  if (cached) return cached;

  const byRole = new Map<WeaponRole, THREE.BufferGeometry[]>();
  for (const part of WEAPONS[id].build()) {
    const list = byRole.get(part.role) ?? [];
    list.push(part.geometry);
    byRole.set(part.role, list);
  }

  const merged = new Map<WeaponRole, THREE.BufferGeometry>();
  for (const [role, list] of byRole) {
    // mergeGeometries refuses mixed indexed/non-indexed input (extrusions are
    // non-indexed, primitives are indexed), so flatten everything first.
    const flat = list.map((geometry) => {
      const plain = geometry.index ? geometry.toNonIndexed() : geometry.clone();
      plain.deleteAttribute("uv");
      plain.deleteAttribute("uv1");
      geometry.dispose();
      return plain;
    });
    let result = flat[0];
    if (flat.length > 1) {
      const combined = mergeGeometries(flat, false);
      if (combined) {
        for (const entry of flat) entry.dispose();
        result = combined;
      }
    }
    merged.set(role, result);
  }

  geometryCache.set(id, merged);
  return merged;
}

// ------------------------------------------------------------------ attaching

const WORLD_UP = new THREE.Vector3(0, 1, 0);
/** Sculpt-local front, matching the generator's orientation verdict (+Z). */
const LOCAL_FRONT = new THREE.Vector3(0, 0, 1);

/**
 * Half a turn about a prop's own length, for the blades that need it.
 *
 * {@link restOrientation} projects the *body's* front to find the roll, and the
 * body's front does not mirror with the hand — so the prop's own +X lands on the
 * body's +X whichever fist is holding it (measured: (0.90, ∓0.45, 0) in body
 * axes for the two hands). +X is the figure's left, so on a left-hand blade the
 * prop's +X points away from the spine and on a right-hand blade it points
 * across the chest.
 *
 * That matters because a sabre is fitted belly-on-+X (see `fitArmSculpt`), and
 * with the rest rake a belly bowing *outward* turns the point back inward: on
 * the Emperor's rig his dress sabre came to rest with the point at 0.80 out and
 * 1.68 up on a 1.70 figure — the tangent curling in over the crown of his own
 * bicorne, which is the sickle silhouette rather than a drawn sabre. Bowed the
 * other way the point keeps going outward (0.85) and away from him.
 *
 * So an {@link WeaponSpec.edged} blade is rolled half a turn in the fist where
 * +X is the outward side, and the belly always bows across the body.
 */
const EDGED_FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

/** Rotation placing the prop's own axes onto its rest direction in body space. */
function restOrientation(direction: THREE.Vector3, isShield: boolean): THREE.Quaternion {
  const aim = direction.clone().normalize();
  const matrix = new THREE.Matrix4();
  if (isShield) {
    const z = aim;
    const y = WORLD_UP.clone().sub(z.clone().multiplyScalar(WORLD_UP.dot(z))).normalize();
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    matrix.makeBasis(x, y, z);
  } else {
    const y = aim;
    const z = LOCAL_FRONT.clone().sub(y.clone().multiplyScalar(LOCAL_FRONT.dot(y))).normalize();
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    matrix.makeBasis(x, y, z);
  }
  return new THREE.Quaternion().setFromRotationMatrix(matrix);
}

/**
 * Rotation for a *held firearm*, whose barrel line is `direction` in body axes.
 *
 * The roll reference is the barrel itself pitched a quarter turn about the
 * figure's lateral axis, which is the one rule that reads right at both ends of
 * the swing: carried upright the trigger guard faces the figure's front, and
 * levelled at a target it faces the floor, with no flip in between. Projecting
 * the body's front instead (as {@link restOrientation} does) collapses the
 * moment a gun points where the figure is looking.
 */
function gunOrientation(direction: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  const y = axisY.copy(direction).normalize();
  const reference = axisRef.set(y.x, -y.z, y.y);
  const z = axisZ.copy(reference).addScaledVector(y, -reference.dot(y));
  if (z.lengthSq() < 1e-6) {
    // Barrel exactly across the body: fall back to the front of the sculpt.
    z.copy(LOCAL_FRONT).addScaledVector(y, -LOCAL_FRONT.dot(y));
    if (z.lengthSq() < 1e-6) z.copy(LOCAL_FRONT);
  }
  z.normalize();
  const x = axisX.crossVectors(y, z).normalize();
  return out.setFromRotationMatrix(basisMatrix.makeBasis(x, y, z));
}

/**
 * How much of the fists' lateral spread a long arm's barrel inherits.
 *
 * The barrel *was* taken straight from the line between the two fists, on the
 * assumption that a shouldered clip puts the support hand out on the forestock.
 * Measured on the rigs that actually shoot, that assumption is false: the
 * Grande Armée's aim takes are archery clips, and in them the fists sit side by
 * side **across the chest** — the hand line runs 0.90–1.00 along the figure's
 * lateral axis, leaving almost nothing along its front. Which is bad enough on
 * its own (the musket lay across the man rather than pointing anywhere), but the
 * residue that was being used as the barrel's *direction* also changes sign
 * several times per loop: the line infantry's aim reads front = −0.24, −0.23,
 * +0.27, +0.54, +0.40, −0.22, +0.02, −0.28 across one scan, and its firing clip
 * is at −0.26 on the authored ignition frame. So the musket swung between
 * pointing downrange and pointing back over its owner's shoulder, and the shot
 * was taken from the reversed half.
 *
 * The fists are therefore read for *cant and elevation only*, and the barrel is
 * laid downrange — the shooter has already turned to face what he is shooting
 * at (`PieceView.faceTowards`), so his own front is where the muzzle belongs.
 * This is the guarantee the `sidearm` hold has always had through its front
 * bias, and the one the long arm was missing.
 *
 * At 0.4 a levelled musket lies about 20° across the body — butt in the firing
 * shoulder, muzzle crossing toward the support hand — which is what a shouldered
 * long arm looks like from the board's camera. Much higher and it goes back to
 * lying across the chest.
 */
const LONG_ARM_CANT = 0.4;

/** How much of the fists' height difference becomes barrel elevation. */
const LONG_ARM_PITCH = 0.8;

/**
 * Elevation the pose may ask for, either way. A clip that throws one fist high
 * (a reload, a body dropping through a death) must not stand the barrel up.
 */
const LONG_ARM_PITCH_LIMIT = 0.6;

const axisX = new THREE.Vector3();
const axisY = new THREE.Vector3();
const axisZ = new THREE.Vector3();
const axisRef = new THREE.Vector3();
const basisMatrix = new THREE.Matrix4();
const boneLocal = new THREE.Matrix4();
const rootWorldInverse = new THREE.Matrix4();
const fistPosition = new THREE.Vector3();
const fistQuaternion = new THREE.Quaternion();
const fistScale = new THREE.Vector3();
const partnerPosition = new THREE.Vector3();
const barrelAxis = new THREE.Vector3();
const handLine = new THREE.Vector3();
const propRotation = new THREE.Quaternion();
const boneInverse = new THREE.Quaternion();

/** A held prop whose angle is re-solved from the live pose every frame. */
interface HeldRig {
  mode: "longArm" | "sidearm";
  /** Hand the prop hangs off — the trigger fist. */
  bone: THREE.Bone;
  /** The other fist (`longArm`) or the forearm the barrel follows (`sidearm`). */
  partner: THREE.Bone | null;
  group: THREE.Group;
  /** Wrist shift in body axes, already mirrored for the holding side. */
  offset: THREE.Vector3;
  /** Body-axis angle to fall back on when the pose says nothing usable. */
  fallback: THREE.Vector3;
}

function findBone(root: THREE.Object3D, pattern: RegExp): THREE.Bone | null {
  let found: THREE.Bone | null = null;
  root.traverse((node) => {
    if (found) return;
    const bone = node as THREE.Bone;
    if (bone.isBone && pattern.test(bone.name)) found = bone;
  });
  return found;
}

const RIGHT_HAND = /^(mixamorig)?(right ?hand|hand[_.]?r|r[_.]?hand)$/i;
const LEFT_HAND = /^(mixamorig)?(left ?hand|hand[_.]?l|l[_.]?hand)$/i;

/** The bone a wrist hangs off (its forearm), or null at the top of the chain. */
function boneParent(bone: THREE.Bone): THREE.Bone | null {
  const parent = bone.parent as THREE.Bone | null;
  return parent?.isBone ? parent : null;
}

/**
 * Re-solves every pose-driven prop against the skeleton as it stands.
 *
 * Bone world matrices are read as the last frame left them, which is a frame of
 * lag on the barrel and invisible at 60fps — forcing a second world-matrix pass
 * over thirty-two skeletons per frame is not.
 */
function alignHeld(root: THREE.Object3D, held: HeldRig[], unit: number): void {
  rootWorldInverse.copy(root.matrixWorld).invert();
  for (const rig of held) {
    boneLocal.multiplyMatrices(rootWorldInverse, rig.bone.matrixWorld);
    boneLocal.decompose(fistPosition, fistQuaternion, fistScale);
    const boneScale = Math.max(1e-6, (fistScale.x + fistScale.y + fistScale.z) / 3);

    let solved = false;
    if (rig.partner) {
      boneLocal.multiplyMatrices(rootWorldInverse, rig.partner.matrixWorld);
      partnerPosition.setFromMatrixPosition(boneLocal);
      if (rig.mode === "longArm") {
        // Downrange, canted and pitched by how the two fists are holding it —
        // never *aimed* by them, because they do not straddle the barrel in the
        // clips this army fires from (see {@link LONG_ARM_CANT}).
        handLine.copy(partnerPosition).sub(fistPosition);
        if (handLine.lengthSq() > (0.06 * unit) ** 2) {
          handLine.normalize();
          barrelAxis.set(
            handLine.x * LONG_ARM_CANT,
            THREE.MathUtils.clamp(handLine.y, -LONG_ARM_PITCH_LIMIT, LONG_ARM_PITCH_LIMIT) *
              LONG_ARM_PITCH,
            1,
          );
          solved = true;
        }
      } else {
        // Forearm through the wrist, lifted toward the figure's front: an arm
        // hanging at rest then carries the pistol low instead of at its own boot.
        barrelAxis.copy(fistPosition).sub(partnerPosition);
        if (barrelAxis.lengthSq() > (0.02 * unit) ** 2) {
          barrelAxis.normalize().addScaledVector(LOCAL_FRONT, 0.5).addScaledVector(WORLD_UP, 0.3);
          solved = true;
        }
      }
    }
    if (!solved) barrelAxis.copy(rig.fallback);

    gunOrientation(barrelAxis, propRotation);
    boneInverse.copy(fistQuaternion).invert();
    rig.group.scale.setScalar(unit / boneScale);
    rig.group.quaternion.copy(boneInverse).multiply(propRotation);
    rig.group.position
      .copy(rig.offset)
      .multiplyScalar(unit)
      .applyQuaternion(boneInverse)
      .divideScalar(boneScale);
  }
}

export interface AttachedArms {
  meshes: THREE.Mesh[];
  materials: THREE.MeshStandardMaterial[];
  /** Emissive strength each material was authored with, for highlight blending. */
  baseEmissive: number[];
  /**
   * Empty marker parented at the head of the main weapon, where a caster's fire
   * gathers. Null for arms with no focus (a sword has nothing to cast from).
   */
  focus: THREE.Object3D | null;
  /**
   * Empty marker parented at the muzzle of the figure's firearm — the pistol in
   * the Emperor's fist, the musket's barrel mouth, the field gun's bore. Null
   * for a figure that carries no gun.
   */
  muzzle: THREE.Object3D | null;
  /**
   * The towed prop's own group (the gun carriage), so the fight can roll it
   * back on its wheels when it fires. Null for everyone but the battery.
   */
  train: THREE.Object3D | null;
  /**
   * Re-solves the angle of every pose-driven prop (see {@link WeaponSpec.hold})
   * against the skeleton as it stands this frame. Cheap and a no-op for a figure
   * carrying nothing but blades; call it right after the mixer.
   */
  align: () => void;
}

/**
 * Builds and parents the figure's arms.
 *
 * @param root    the (already posed) sculpt root — bone matrices must be current
 * @param unit    the figure's height in the root's own units
 * @param baseY   the sole line in the root's own units, so props clear the floor
 * @param arsenal which army's weapon family to build from
 */
export function attachWeapons(
  root: THREE.Object3D,
  kind: PieceKind,
  color: Faction,
  unit: number,
  baseY = 0,
  arsenal: ArsenalId = "kingdom",
): AttachedArms {
  const arms: AttachedArms = {
    meshes: [],
    materials: [],
    baseEmissive: [],
    focus: null,
    muzzle: null,
    train: null,
    align: () => undefined,
  };
  const loadout = LOADOUT[arsenal][kind];
  /** Props whose angle is re-solved against the live pose every frame. */
  const held: HeldRig[] = [];

  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();

  /**
   * Adds a prop's body under `parent`: the generated sculpt when the army has one
   * and it has landed, otherwise the primitives in the figure's livery.
   *
   * Geometry and textures are shared across the army either way; only the
   * materials belong to this figure, because the selection highlight, the fade
   * and the dissolve all write into them.
   */
  const dress = (id: WeaponId, parent: THREE.Object3D): void => {
    const sculpted = instanceArmSculpt(id, color);
    if (sculpted) {
      parent.add(sculpted.group);
      arms.meshes.push(...sculpted.meshes);
      arms.materials.push(...sculpted.materials);
      for (const material of sculpted.materials) arms.baseEmissive.push(material.emissiveIntensity);
      return;
    }
    for (const [role, geometry] of weaponGeometries(id)) {
      const material = makeMaterial(role, color);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = role !== "gem";
      mesh.frustumCulled = false;
      parent.add(mesh);
      arms.meshes.push(mesh);
      arms.materials.push(material);
      arms.baseEmissive.push(material.emissiveIntensity);
    }
  };

  /**
   * Parks a towed prop beside the figure. It hangs off the sculpt root in body
   * axes, so it travels and turns with the figure but is untouched by the
   * skeleton — a gun carriage must not crouch when its crew does.
   */
  const haul = (id: WeaponId): void => {
    const spec = WEAPONS[id];
    const park = spec.park ?? new THREE.Vector3(0.4, 0, -0.1);
    // The gun keeps its own size, and parks that many gun-lengths out from the
    // crew rather than that many figure-heights (see {@link WeaponSpec.bulk}).
    const size = unit * (spec.bulk ?? 1);
    // Squeezed on its own axle only, so the wheels stay round while the carriage
    // keeps the height and length it needs (see {@link WeaponSpec.track}). Scale
    // is applied inside the group's own rotation, so this is the gun's X, not the
    // board's.
    const track = spec.track ?? 1;
    const group = new THREE.Group();
    group.name = `train_${id}`;
    group.scale.set(size * track, size, size);
    group.position.set(park.x * size, baseY + park.y * size, park.z * size);
    // Hauled at a slight angle, so the gun reads as being dragged rather than
    // parked in a battery line. Kept shallow: yaw trades length for width, and a
    // carriage this long turns every degree into overhang on the next tile.
    group.rotation.y = -0.07;
    root.add(group);

    const inner = new THREE.Group();
    group.add(inner);
    arms.train = inner;

    if (spec.muzzle) {
      const muzzle = new THREE.Object3D();
      muzzle.name = `muzzle_${id}`;
      muzzle.position.copy(spec.muzzle);
      inner.add(muzzle);
      arms.muzzle = muzzle;
    }
    dress(id, inner);
  };

  const mount = (id: WeaponId, hand: "right" | "left"): void => {
    const spec = WEAPONS[id];
    // A landed sculpt overrides the two numbers that are about the weapon's own
    // proportions rather than about how it is carried: a generated Charleville is
    // not the same shape as the primitive one, so its fist and its bore sit
    // elsewhere along the stock. Everything else — rest angle, wrist offset, the
    // pose-driven hold — belongs to the *loadout* and is unchanged by the swap.
    const sculpt = armSculpt(id);
    const gripLength = sculpt?.grip ?? spec.grip;
    const muzzleAt = sculpt
      ? sculpt.muzzle === null
        ? null
        : new THREE.Vector3(0, sculpt.muzzle, 0)
      : (spec.muzzle ?? null);
    const bone = findBone(root, hand === "right" ? RIGHT_HAND : LEFT_HAND);
    const otherHand = spec.hold ? findBone(root, hand === "right" ? LEFT_HAND : RIGHT_HAND) : null;

    // Read the fist out of the pose: which side of the spine it sits on (the
    // rig may be mirrored) and how high it is above the soles.
    let lateral = hand === "right" ? -1 : 1;
    let handHeight = 0.52;
    let boneScale = 1;
    const inverse = new THREE.Quaternion();

    if (bone) {
      const local = new THREE.Matrix4().multiplyMatrices(rootInverse, bone.matrixWorld);
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      local.decompose(position, quaternion, scale);
      boneScale = Math.max(1e-6, (scale.x + scale.y + scale.z) / 3);
      inverse.copy(quaternion).invert();
      if (Math.abs(position.x) > 0.03 * unit) lateral = position.x > 0 ? 1 : -1;
      handHeight = THREE.MathUtils.clamp((position.y - baseY) / unit, 0.15, 0.95);
    }

    const aim = new THREE.Vector3(spec.aim.x * lateral, spec.aim.y, spec.aim.z);
    const offset = new THREE.Vector3(spec.offset.x * lateral, spec.offset.y, spec.offset.z);

    // Keep butt spikes and shield rims from sinking through the board: the
    // fighting stances crouch, which drops the fist far below a standing pose.
    // A carried firearm is exempt — it is never grounded, and sliding it up
    // through the fist to clear the floor is what made the crouching marksman
    // hold his rifle by the butt plate.
    let grip = gripLength;
    if (spec.shield) {
      const bottom = handHeight + offset.y - (spec.half ?? 0.18);
      if (bottom < 0.07) offset.y += 0.07 - bottom;
    } else if (!spec.hold) {
      grip = Math.min(gripLength, Math.max(0.03, handHeight + offset.y - 0.07));
    }

    const rest = restOrientation(aim, spec.shield === true);
    // A curved blade's belly bows across the body, not out of it, so the point
    // sweeps away from the figure instead of hooking back over its own head.
    if (spec.edged === true && lateral > 0) rest.multiply(EDGED_FLIP);
    const group = new THREE.Group();
    group.name = `weapon_${id}`;

    if (bone) {
      group.scale.setScalar(unit / boneScale);
      group.quaternion.copy(inverse.clone().multiply(rest));
      group.position.copy(
        offset.multiplyScalar(unit).applyQuaternion(inverse).divideScalar(boneScale),
      );
      bone.add(group);
    } else {
      // Static / procedural fallback figures: hang the arm off the body.
      group.scale.setScalar(unit);
      group.quaternion.copy(rest);
      group.position.set(lateral * 0.24 * unit, 0.52 * unit, 0.05 * unit);
      root.add(group);
    }

    if (spec.hold && bone) {
      held.push({
        mode: spec.hold,
        bone,
        // A long arm is steered by the other fist; a sidearm by its own forearm.
        partner: spec.hold === "longArm" ? otherHand : boneParent(bone),
        group,
        offset: new THREE.Vector3(spec.offset.x * lateral, spec.offset.y, spec.offset.z),
        fallback: aim.clone(),
      });
    }

    const inner = new THREE.Group();
    inner.position.y = -grip;
    group.add(inner);

    // The casting point travels with the prop, so a spell always leaves the
    // crystal itself however the arm is swinging that frame.
    if (hand === "right" && spec.focus !== undefined) {
      const focus = new THREE.Object3D();
      focus.name = `focus_${id}`;
      focus.position.y = spec.focus;
      inner.add(focus);
      arms.focus = focus;
    }

    // Same trick for a barrel mouth: the flash, the smoke and the ball all
    // leave the gun itself, wherever the firing arm has swung it. A towed gun
    // outranks a hand-held one — the battery fires its piece, not its pistol.
    if (muzzleAt && !arms.muzzle) {
      const muzzle = new THREE.Object3D();
      muzzle.name = `muzzle_${id}`;
      muzzle.position.copy(muzzleAt);
      inner.add(muzzle);
      arms.muzzle = muzzle;
    }

    dress(id, inner);
  };

  if (loadout.main) mount(loadout.main, "right");
  if (loadout.off) mount(loadout.off, "left");
  if (loadout.train) haul(loadout.train);

  if (held.length > 0) {
    arms.align = () => alignHeld(root, held, unit);
    // Solve once now, so the figure is never seen for a frame with its gun at
    // the angle the fallback guessed.
    arms.align();
  }
  return arms;
}

/**
 * The sculpts these armies need, as jobs the muster can queue alongside the
 * figures themselves.
 *
 * A figure is armed the instant it is built, from whatever is on hand at that
 * moment — so a sculpt that arrives after the board has stood up is a musket the
 * rest of the game never sees. The muster therefore *waits* for these, in the
 * same download window as the rigs (see `scene/gltfQueue.ts`), and an army with
 * no sculpted arms adds no jobs at all.
 */
export function armSculptWarmJobs(arsenals: Iterable<ArsenalId>): (() => Promise<void>)[] {
  const wanted = new Set<WeaponId>();
  for (const arsenal of arsenals) {
    for (const loadout of Object.values(LOADOUT[arsenal])) {
      for (const id of [loadout.main, loadout.off, loadout.train]) {
        if (id && hasArmSculpt(id)) wanted.add(id);
      }
    }
  }
  return [...wanted].map((id) => () => warmArmSculpt(id));
}
